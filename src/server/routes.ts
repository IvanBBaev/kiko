import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, desc, eq, sql } from 'drizzle-orm';
import { config } from '../config.js';
import { eventsRepo, ogRenderer, pipeline, runsRepo } from '../container.js';
import { db } from '../db/client.js';
import { newsItems, posts, runs, type Post } from '../db/schema.js';
import { postToCardData } from '../og/card.js';
import { nextScheduledRun } from '../scheduler.js';
import { notify } from '../notify.js';

/** Canonical relative path of a post's OG card image — the one place this shape
 *  is defined (the route below uses Fastify's `:id.png` param form of it). */
function ogImagePath(id: number): string {
  return `/og/posts/${id}.png`;
}

/** DB rows store JSON columns as strings — clients get them parsed. */
function serializePost(row: Post): Record<string, unknown> {
  return {
    ...row,
    itemIds: JSON.parse(row.itemIds) as number[],
    sources: row.sources ? (JSON.parse(row.sources) as unknown[]) : null,
    hashtags: row.hashtags ? (JSON.parse(row.hashtags) as string[]) : null,
    // Relative — the frontend builds the absolute og:image URL from its origin.
    ogImageUrl: ogImagePath(row.id),
  };
}

function xmlEscape(value: string): string {
  return (
    value
      // Strip control characters illegal in XML 1.0 (everything below 0x20
      // except tab/LF/CR) — one stray char makes the whole feed not well-formed.
      // eslint-disable-next-line no-control-regex -- intentionally stripping XML-1.0-illegal control chars
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;')
  );
}

function tokensEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/** A valid Bearer token — only possible when API_TOKEN is configured. */
function isTrusted(req: FastifyRequest): boolean {
  if (!config.apiToken) return false;
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  return token.length > 0 && tokensEqual(token, config.apiToken);
}

/** No-op unless API_TOKEN is configured — then mutating endpoints require it. */
async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!config.apiToken) return;
  if (!isTrusted(req)) {
    return reply.code(401).send({ error: 'unauthorized' });
  }
}

// --- Route schemas (validation + fast serialization of inputs) ---

const idParamsSchema = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'integer', minimum: 1 } },
} as const;

const listPostsQuerySchema = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['site', 'linkedin'] },
    status: { type: 'string', enum: ['draft', 'published'] },
    limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    offset: { type: 'integer', minimum: 0, default: 0 },
  },
} as const;

const searchQuerySchema = {
  type: 'object',
  required: ['q'],
  properties: {
    q: { type: 'string', minLength: 1, maxLength: 200 },
    limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
  },
} as const;

const newsQuerySchema = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['new', 'digested', 'skipped'] },
    limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
  },
} as const;

const regenerateQuerySchema = {
  type: 'object',
  properties: {
    // Only secondary channels can be regenerated — never 'site', which would
    // duplicate the canonical digest (and race the unique slug index).
    kind: { type: 'string', enum: ['linkedin'], default: 'linkedin' },
  },
} as const;

const postEventBodySchema = {
  type: 'object',
  required: ['type'],
  properties: {
    type: { type: 'string', enum: ['view', 'click', 'impression', 'share'] },
    // Optional free-form channel/referrer; bounded so an event row can't bloat.
    source: { type: 'string', maxLength: 80 },
  },
} as const;

interface ListPostsQuery {
  kind?: 'site' | 'linkedin';
  status?: 'draft' | 'published';
  limit: number;
  offset: number;
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // Liveness must answer even under a traffic spike, so it is exempt from the
  // rate limiter — otherwise the Docker HEALTHCHECK can 429 and the container
  // is marked unhealthy.
  app.get('/health', { config: { rateLimit: false } }, async (_req, reply) => {
    try {
      const lastRun = await runsRepo.latest();
      return {
        status: 'ok',
        db: 'ok',
        lastRun: lastRun
          ? {
              id: lastRun.id,
              status: lastRun.status,
              startedAt: lastRun.startedAt,
              ageHours: Math.round(((Date.now() - new Date(lastRun.startedAt).getTime()) / 3_600_000) * 10) / 10,
            }
          : null,
        nextScheduledRun: nextScheduledRun(),
        pipelineRunning: pipeline.isRunning(),
      };
    } catch {
      return reply.code(503).send({ status: 'degraded', db: 'error' });
    }
  });

  // --- Posts (consumed by the future site) ---
  app.get<{ Querystring: ListPostsQuery }>(
    '/api/posts',
    { schema: { querystring: listPostsQuerySchema } },
    async (req, reply) => {
      const { kind, status, limit, offset } = req.query;
      const trusted = isTrusted(req);

      const filters = [];
      if (kind) filters.push(eq(posts.kind, kind));
      // Untrusted callers only ever see published posts; drafts are unreviewed
      // LLM output. A trusted (Bearer) caller may filter by status for review.
      if (!trusted) filters.push(eq(posts.status, 'published'));
      else if (status) filters.push(eq(posts.status, status));
      const where = filters.length > 0 ? and(...filters) : undefined;

      const [rows, [counted]] = await Promise.all([
        db.select().from(posts).where(where).orderBy(desc(posts.createdAt)).limit(limit).offset(offset),
        db
          .select({ total: sql<number>`count(*)` })
          .from(posts)
          .where(where),
      ]);

      // Cache only public (published) responses, and briefly — a CDN keeps a
      // post for up to max-age after it's unpublished, so keep the window small.
      if (!trusted) void reply.header('Cache-Control', 'public, max-age=60');
      const total = counted?.total ?? 0;
      return { posts: rows.map(serializePost), total, limit, offset, hasMore: offset + rows.length < total };
    },
  );

  app.get<{ Querystring: { q: string; limit: number } }>(
    '/api/posts/search',
    { schema: { querystring: searchQuerySchema } },
    async (req, reply) => {
      // Each whitespace-separated term becomes a quoted prefix query — immune
      // to FTS5 syntax errors from user input.
      const match = req.query.q
        .trim()
        .split(/\s+/)
        .map((term) => `"${term.replaceAll('"', '""')}"*`)
        .join(' ');

      const trusted = isTrusted(req);
      const ftsMatch = sql`${posts.id} IN (SELECT rowid FROM posts_fts WHERE posts_fts MATCH ${match})`;
      // Untrusted search must not leak draft bodies through the index.
      const where = trusted ? ftsMatch : and(ftsMatch, eq(posts.status, 'published'));

      const rows = await db.select().from(posts).where(where).orderBy(desc(posts.createdAt)).limit(req.query.limit);

      if (!trusted) void reply.header('Cache-Control', 'public, max-age=60');
      return { posts: rows.map(serializePost), q: req.query.q };
    },
  );

  app.get<{ Params: { id: number } }>('/api/posts/:id', { schema: { params: idParamsSchema } }, async (req, reply) => {
    const [row] = await db.select().from(posts).where(eq(posts.id, req.params.id));
    if (!row) return reply.code(404).send({ error: 'post not found' });
    const trusted = isTrusted(req);
    // A draft is visible only to a trusted caller; to everyone else it doesn't exist.
    if (!trusted && row.status !== 'published') return reply.code(404).send({ error: 'post not found' });
    if (!trusted) void reply.header('Cache-Control', 'public, max-age=60');
    return serializePost(row);
  });

  // Open Graph card image (1200x630 PNG) for social/link previews. Same draft
  // visibility as GET /api/posts/:id. A render failure propagates to the global
  // error handler as a generic 500 (no detail leak), which is the honest status.
  // hide:true keeps this binary endpoint out of the JSON OpenAPI contract, which
  // could only mis-describe it as a JSON response.
  app.get<{ Params: { id: number } }>(
    '/og/posts/:id.png',
    { schema: { params: idParamsSchema, hide: true } },
    async (req, reply) => {
      const [row] = await db.select().from(posts).where(eq(posts.id, req.params.id));
      if (!row) return reply.code(404).send({ error: 'post not found' });
      const trusted = isTrusted(req);
      if (!trusted && row.status !== 'published') return reply.code(404).send({ error: 'post not found' });

      const png = await ogRenderer.render(postToCardData(row));
      // helmet defaults Cross-Origin-Resource-Policy to same-origin, which would
      // block a browser on the frontend's origin from embedding this <img>.
      void reply.header('Content-Type', 'image/png').header('Cross-Origin-Resource-Policy', 'cross-origin');
      // Only published cards (all an untrusted caller can reach) are publicly
      // cacheable; a draft rendered for a trusted reviewer must not be cached.
      if (!trusted) void reply.header('Cache-Control', 'public, max-age=60');
      return reply.send(png);
    },
  );

  app.post<{ Params: { id: number } }>(
    '/api/posts/:id/publish',
    { schema: { params: idParamsSchema }, preHandler: requireAuth },
    async (req, reply) => {
      const updated = await db
        .update(posts)
        .set({ status: 'published' })
        .where(eq(posts.id, req.params.id))
        .returning({ id: posts.id, status: posts.status, kind: posts.kind });
      if (updated.length === 0) return reply.code(404).send({ error: 'post not found' });
      notify('post.published', { id: updated[0]!.id, kind: updated[0]!.kind });
      return updated[0];
    },
  );

  app.post<{ Params: { id: number } }>(
    '/api/posts/:id/unpublish',
    { schema: { params: idParamsSchema }, preHandler: requireAuth },
    async (req, reply) => {
      const updated = await db
        .update(posts)
        .set({ status: 'draft' })
        .where(eq(posts.id, req.params.id))
        .returning({ id: posts.id, status: posts.status });
      if (updated.length === 0) return reply.code(404).send({ error: 'post not found' });
      return updated[0];
    },
  );

  app.post<{ Params: { id: number }; Querystring: { kind: string } }>(
    '/api/posts/:id/regenerate',
    { schema: { params: idParamsSchema, querystring: regenerateQuerySchema }, preHandler: requireAuth },
    async (req, reply) => {
      try {
        const newId = await pipeline.regenerate(req.params.id, req.query.kind);
        if (newId === null) return reply.code(404).send({ error: 'site post not found' });
        return reply.code(201).send({ id: newId, kind: req.query.kind, regeneratedFrom: req.params.id });
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('No generator')) {
          return reply.code(400).send({ error: err.message });
        }
        throw err;
      }
    },
  );

  // Engagement telemetry from the consuming site. Public and unauthenticated by
  // design — the frontend has no token — and only bounded telemetry rows are
  // written, throttled by the global rate limiter. Events are accepted only for
  // posts the caller can see (published, or any for a trusted caller), mirroring
  // GET /api/posts/:id so a draft's existence never leaks. No PII is stored.
  app.post<{ Params: { id: number }; Body: { type: string; source?: string } }>(
    '/api/posts/:id/events',
    { schema: { params: idParamsSchema, body: postEventBodySchema } },
    async (req, reply) => {
      const [row] = await db.select({ status: posts.status }).from(posts).where(eq(posts.id, req.params.id));
      if (!row) return reply.code(404).send({ error: 'post not found' });
      if (!isTrusted(req) && row.status !== 'published') return reply.code(404).send({ error: 'post not found' });
      await eventsRepo.record(req.params.id, req.body.type, req.body.source ?? null);
      return reply.code(202).send({ status: 'recorded' });
    },
  );

  // --- Own RSS feed (published site posts) ---
  app.get('/feed.xml', async (req, reply) => {
    const rows = await db
      .select()
      .from(posts)
      .where(and(eq(posts.kind, 'site'), eq(posts.status, 'published')))
      .orderBy(desc(posts.createdAt))
      .limit(20);

    // RSS links must be absolute. Use the configured public site URL, else
    // derive an absolute base from the request (honours trustProxy headers).
    const base = config.publicSiteUrl ?? `${req.protocol}://${req.hostname}`;
    const items = rows
      .map((p) => {
        const link = p.slug ? `${base}/posts/${p.slug}` : `${base}/api/posts/${p.id}`;
        return [
          '    <item>',
          `      <title>${xmlEscape(p.title ?? 'Untitled')}</title>`,
          `      <link>${xmlEscape(link)}</link>`,
          `      <guid isPermaLink="false">kiko-post-${p.id}</guid>`,
          `      <pubDate>${new Date(p.createdAt).toUTCString()}</pubDate>`,
          `      <description>${xmlEscape(p.summary ?? '')}</description>`,
          '    </item>',
        ].join('\n');
      })
      .join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>kiko — AI news digest</title>
    <link>${xmlEscape(base)}</link>
    <description>Synthesized AI news digests</description>
    <language>${xmlEscape(config.languages.site)}</language>
${items}
  </channel>
</rss>`;

    return reply
      .header('Content-Type', 'application/rss+xml; charset=utf-8')
      .header('Cache-Control', 'public, max-age=60')
      .send(xml);
  });

  // --- News items (debugging / curation) ---
  app.get<{ Querystring: { status?: string; limit: number } }>(
    '/api/news',
    { schema: { querystring: newsQuerySchema } },
    async (req) => {
      const where = req.query.status ? eq(newsItems.status, req.query.status) : undefined;
      const rows = await db
        .select()
        .from(newsItems)
        .where(where)
        .orderBy(desc(newsItems.publishedAt))
        .limit(req.query.limit);
      return { items: rows };
    },
  );

  // --- Pipeline control ---
  app.post('/api/pipeline/run', { preHandler: requireAuth }, async (req, reply) => {
    if (pipeline.isRunning()) {
      return reply.code(409).send({ error: 'pipeline already running' });
    }
    // Fire and forget — an Opus synthesis run can take minutes.
    void pipeline.run().catch((err) => app.log.error({ err }, 'pipeline run failed'));
    return reply.code(202).send({ status: 'started' });
  });

  app.get('/api/runs', async () => {
    const rows = await db.select().from(runs).orderBy(desc(runs.id)).limit(20);
    return { runs: rows };
  });

  // --- Token spend observability ---
  app.get('/api/usage', async () => {
    const [totals] = await db
      .select({
        posts: sql<number>`count(*)`,
        inputTokens: sql<number>`coalesce(sum(${posts.inputTokens}), 0)`,
        outputTokens: sql<number>`coalesce(sum(${posts.outputTokens}), 0)`,
        cacheReadTokens: sql<number>`coalesce(sum(${posts.cacheReadTokens}), 0)`,
        cacheWriteTokens: sql<number>`coalesce(sum(${posts.cacheWriteTokens}), 0)`,
      })
      .from(posts);
    return totals;
  });

  // --- Engagement analytics (feedback loop for tuning content) ---
  app.get('/api/analytics', async () => {
    const [totalEvents, byType, bySource, topPosts] = await Promise.all([
      eventsRepo.total(),
      eventsRepo.byType(),
      eventsRepo.bySource(),
      eventsRepo.topPosts(20),
    ]);
    return { totalEvents, byType, bySource, topPosts };
  });
}
