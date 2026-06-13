import { asc, desc, eq, sql } from 'drizzle-orm';
import { db } from './client.js';
import { postEvents, posts } from './schema.js';

export interface TypeCount {
  type: string;
  count: number;
}

export interface SourceCount {
  source: string | null;
  count: number;
}

/** The impression→click funnel across all published-post events. */
export interface Funnel {
  impressions: number;
  clicks: number;
  views: number;
  shares: number;
  /** clicks / impressions, 0 when there are no impressions. */
  ctr: number;
}

export interface PostEngagement {
  id: number;
  title: string | null;
  kind: string;
  impressions: number;
  clicks: number;
  views: number;
  shares: number;
  total: number;
  ctr: number;
}

/** Cap on the distinct-source rows returned, so a flood of unique (attacker-
 *  controlled) `source` values can't make the public /api/analytics payload grow
 *  without bound. */
const MAX_SOURCE_ROWS = 50;

/** coalesced count of events of one type — 0 (not NULL) over an empty set. */
const countOf = (type: string) =>
  sql<number>`coalesce(sum(case when ${postEvents.type} = ${type} then 1 else 0 end), 0)`;

const ctrOf = (impressions: number, clicks: number): number => (impressions > 0 ? clicks / impressions : 0);

/**
 * Persistence and aggregation for per-post engagement events. Every aggregation
 * is scoped to events on **currently-published** posts: analytics reflect public
 * content, and — critically — a draft (or unpublished) post's title can never
 * leak through the public /api/analytics endpoint.
 */
export class EventsRepository {
  constructor(private readonly database = db) {}

  async record(postId: number, type: string, source: string | null): Promise<void> {
    await this.database.insert(postEvents).values({ postId, type, source, createdAt: new Date().toISOString() });
  }

  async total(): Promise<number> {
    const [row] = await this.database
      .select({ c: sql<number>`count(*)` })
      .from(postEvents)
      .innerJoin(posts, eq(postEvents.postId, posts.id))
      .where(eq(posts.status, 'published'));
    return row?.c ?? 0;
  }

  /** Site-wide funnel: raw volumes per type plus the click-through rate, so the
   *  feedback loop measures engagement quality, not just reach. */
  async funnel(): Promise<Funnel> {
    const [row] = await this.database
      .select({
        impressions: countOf('impression'),
        clicks: countOf('click'),
        views: countOf('view'),
        shares: countOf('share'),
      })
      .from(postEvents)
      .innerJoin(posts, eq(postEvents.postId, posts.id))
      .where(eq(posts.status, 'published'));
    const f = row ?? { impressions: 0, clicks: 0, views: 0, shares: 0 };
    return { ...f, ctr: ctrOf(f.impressions, f.clicks) };
  }

  async byType(): Promise<TypeCount[]> {
    return this.database
      .select({ type: postEvents.type, count: sql<number>`count(*)` })
      .from(postEvents)
      .innerJoin(posts, eq(postEvents.postId, posts.id))
      .where(eq(posts.status, 'published'))
      .groupBy(postEvents.type)
      .orderBy(desc(sql`count(*)`), asc(postEvents.type));
  }

  async bySource(): Promise<SourceCount[]> {
    return this.database
      .select({ source: postEvents.source, count: sql<number>`count(*)` })
      .from(postEvents)
      .innerJoin(posts, eq(postEvents.postId, posts.id))
      .where(eq(posts.status, 'published'))
      .groupBy(postEvents.source)
      .orderBy(desc(sql`count(*)`), asc(postEvents.source))
      .limit(MAX_SOURCE_ROWS);
  }

  /**
   * Published posts ranked by ENGAGEMENT (clicks + shares — the high-intent
   * actions), not by raw event volume that a flood of impressions would inflate.
   * Returns per-post type counts and CTR; ties break by impressions then id so
   * the LIMIT truncation is deterministic.
   */
  async topPosts(limit: number): Promise<PostEngagement[]> {
    const engagement = sql`sum(case when ${postEvents.type} in ('click', 'share') then 1 else 0 end)`;
    const impressionsExpr = sql`sum(case when ${postEvents.type} = 'impression' then 1 else 0 end)`;
    const rows = await this.database
      .select({
        id: posts.id,
        title: posts.title,
        kind: posts.kind,
        impressions: countOf('impression'),
        clicks: countOf('click'),
        views: countOf('view'),
        shares: countOf('share'),
        total: sql<number>`count(*)`,
      })
      .from(postEvents)
      .innerJoin(posts, eq(postEvents.postId, posts.id))
      .where(eq(posts.status, 'published'))
      .groupBy(posts.id)
      .orderBy(desc(engagement), desc(impressionsExpr), asc(posts.id))
      .limit(limit);
    return rows.map((r) => ({ ...r, ctr: ctrOf(r.impressions, r.clicks) }));
  }
}
