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

export interface PostEventCount {
  id: number;
  title: string | null;
  kind: string;
  events: number;
}

/** Cap on the distinct-source rows returned, so a flood of unique (attacker-
 *  controlled) `source` values can't make the public /api/analytics payload grow
 *  without bound. */
const MAX_SOURCE_ROWS = 50;

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

  /** Published posts ranked by event count (highest first), with title and kind.
   *  A stable secondary sort by id makes the LIMIT truncation deterministic. */
  async topPosts(limit: number): Promise<PostEventCount[]> {
    return this.database
      .select({
        id: posts.id,
        title: posts.title,
        kind: posts.kind,
        events: sql<number>`count(${postEvents.id})`,
      })
      .from(postEvents)
      .innerJoin(posts, eq(postEvents.postId, posts.id))
      .where(eq(posts.status, 'published'))
      .groupBy(posts.id)
      .orderBy(desc(sql`count(${postEvents.id})`), asc(posts.id))
      .limit(limit);
  }
}
