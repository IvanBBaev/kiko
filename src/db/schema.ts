import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/** Raw news items collected from sources, deduplicated by URL and content hash. */
export const newsItems = sqliteTable(
  'news_items',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    source: text('source').notNull(),
    title: text('title').notNull(),
    url: text('url').notNull().unique(),
    summary: text('summary'),
    contentHash: text('content_hash').notNull(),
    publishedAt: text('published_at'),
    fetchedAt: text('fetched_at').notNull(),
    /** new | digested | skipped */
    status: text('status').notNull().default('new'),
  },
  (t) => [index('idx_news_items_status').on(t.status), index('idx_news_items_hash').on(t.contentHash)],
);

/** Generated posts (site digest posts and LinkedIn posts) with per-post token usage. */
export const posts = sqliteTable(
  'posts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    /** site | linkedin */
    kind: text('kind').notNull(),
    title: text('title'),
    slug: text('slug'),
    summary: text('summary'),
    body: text('body').notNull(),
    /** JSON array of news_items ids used as sources */
    itemIds: text('item_ids').notNull(),
    /** JSON array of PostSourceRef — maps inline [n] citations to URLs */
    sources: text('sources'),
    /** For linkedin posts: suggested first comment (holds external links) */
    firstComment: text('first_comment'),
    /** JSON array of hashtags (linkedin) */
    hashtags: text('hashtags'),
    model: text('model').notNull(),
    /** Hash of the system prompt that produced this post */
    promptVersion: text('prompt_version'),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
    cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
    /** draft | published */
    status: text('status').notNull().default('draft'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('idx_posts_kind').on(t.kind),
    index('idx_posts_status').on(t.status),
    uniqueIndex('idx_posts_slug_unique')
      .on(t.slug)
      .where(sql`slug IS NOT NULL`),
  ],
);

/** Pipeline run log. */
export const runs = sqliteTable('runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  startedAt: text('started_at').notNull(),
  finishedAt: text('finished_at'),
  itemsFetched: integer('items_fetched').notNull().default(0),
  itemsNew: integer('items_new').notNull().default(0),
  postsCreated: integer('posts_created').notNull().default(0),
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  /** running | ok | partial | skipped | error */
  status: text('status').notNull().default('running'),
  error: text('error'),
});

/** HTTP conditional-GET validators per feed (survives restarts). */
export const feedValidators = sqliteTable('feed_validators', {
  feedUrl: text('feed_url').primaryKey(),
  etag: text('etag'),
  lastModified: text('last_modified'),
  updatedAt: text('updated_at').notNull(),
});

/**
 * Per-post engagement events reported by the consuming site — the raw data
 * behind the analytics feedback loop. No PII is stored: only the event type, an
 * optional channel/referrer, and a timestamp. Cascade-deletes with its post.
 */
export const postEvents = sqliteTable(
  'post_events',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    postId: integer('post_id')
      .notNull()
      .references(() => posts.id, { onDelete: 'cascade' }),
    /** view | click | impression | share */
    type: text('type').notNull(),
    /** Optional channel/referrer the event came from (e.g. 'linkedin', 'rss'). */
    source: text('source'),
    createdAt: text('created_at').notNull(),
  },
  (t) => [index('idx_post_events_post').on(t.postId), index('idx_post_events_type').on(t.type)],
);

export type NewsItem = typeof newsItems.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type Run = typeof runs.$inferSelect;
export type PostEvent = typeof postEvents.$inferSelect;
