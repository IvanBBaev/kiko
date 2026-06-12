import { timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, desc, eq, sql } from 'drizzle-orm';
import { config } from '../config.js';
import { pipeline, runsRepo } from '../container.js';
import { db } from '../db/client.js';
import { newsItems, posts, runs, type Post } from '../db/schema.js';
import { nextScheduledRun } from '../scheduler.js';
import { notify } from '../notify.js';

/** DB rows store JSON columns as strings — clients get them parsed. */
function serializePost(row: Post): Record<string, unknown> {
  return {
    ...row,
    itemIds: JSON.parse(row.itemIds) as number[],
    sources: row.sources ? (JSON.parse(row.sources) as unknown[]) : null,
    hashtags: row.hashtags ? (JSON.parse(row.hashtags) as string[]) : null,
  };
}

function xmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function tokensEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/** No-op unless API_TOKEN is configured — then mutating endpoints require it. */
async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!config.apiToken) return;
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || !tokensEqual(token, config.apiToken)) {
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
    kind: { type: 'string', default: 'linkedin' },
  },
} as const;

interface ListPostsQuery {
  kind?: 'site' | 'linkedin';
  status?: 'draft' | 'published';
  limit: number;
  offset: number;
}

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async (_req, reply) => {
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

      const filters = [];
      if (kind) filters.push(eq(posts.kind, kind));
      if (status) filters.push(eq(posts.status, status));
      const where = filters.length > 0 ? and(...filters) : undefined;

      const [rows, [counted]] = await Promise.all([
        db.select().from(posts).where(where).orderBy(desc(posts.createdAt)).limit(limit).offset(offset),
        db
          .select({ total: sql<number>`count(*)` })
          .from(posts)
          .where(where),
      ]);

      // Posts change twice a day — let the site and CDNs cache reads briefly.
      void reply.header('Cache-Control', 'public, max-age=300');
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

      const rows = await db
        .select()
        .from(posts)
        .where(sql`${posts.id} IN (SELECT rowid FROM posts_fts WHERE posts_fts MATCH ${match})`)
        .orderBy(desc(posts.createdAt))
        .limit(req.query.limit);

      void reply.header('Cache-Control', 'public, max-age=300');
      return { posts: rows.map(serializePost), q: req.query.q };
    },
  );

  app.get<{ Params: { id: number } }>('/api/posts/:id', { schema: { params: idParamsSchema } }, async (req, reply) => {
    const [row] = await db.select().from(posts).where(eq(posts.id, req.params.id));
    if (!row) return reply.code(404).send({ error: 'post not found' });
    void reply.header('Cache-Control', 'public, max-age=300');
    return serializePost(row);
  });

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

  // --- Own RSS feed (published site posts) ---
  app.get('/feed.xml', async (_req, reply) => {
    const rows = await db
      .select()
      .from(posts)
      .where(and(eq(posts.kind, 'site'), eq(posts.status, 'published')))
      .orderBy(desc(posts.createdAt))
      .limit(20);

    const base = config.publicSiteUrl;
    const items = rows
      .map((p) => {
        const link = base && p.slug ? `${base}/posts/${p.slug}` : `${base ?? ''}/api/posts/${p.id}`;
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
    <link>${xmlEscape(base ?? 'http://localhost')}</link>
    <description>Synthesized AI news digests</description>
    <language>${xmlEscape(config.languages.site)}</language>
${items}
  </channel>
</rss>`;

    return reply
      .header('Content-Type', 'application/rss+xml; charset=utf-8')
      .header('Cache-Control', 'public, max-age=300')
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
}
