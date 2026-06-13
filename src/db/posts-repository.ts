import { eq, inArray } from 'drizzle-orm';
import { slugify } from '../core/slugify.js';
import type { GeneratedPost, PostSourceRef } from '../core/types.js';
import { db } from './client.js';
import { newsItems, posts } from './schema.js';

/** Slugify the LLM-provided slug; fall back to 'post' if nothing usable remains. */
function baseSlug(raw: string | null): string | null {
  if (!raw) return null;
  return slugify(raw) || 'post';
}

export interface PostMeta {
  itemIds: number[];
  sources: PostSourceRef[];
  model: string;
}

/** Persistence for generated posts (any kind). */
export class PostsRepository {
  constructor(private readonly database = db) {}

  /** Digest posts recur daily — same-topic slugs collide across runs. */
  async ensureUniqueSlug(base: string): Promise<string> {
    let slug = base;
    for (let n = 2; ; n++) {
      const existing = await this.database.select({ id: posts.id }).from(posts).where(eq(posts.slug, slug)).limit(1);
      if (existing.length === 0) return slug;
      slug = `${base}-${n}`;
    }
  }

  async findById(id: number): Promise<typeof posts.$inferSelect | null> {
    const [row] = await this.database.select().from(posts).where(eq(posts.id, id));
    return row ?? null;
  }

  private rowValues(post: GeneratedPost, meta: PostMeta, slug: string | null) {
    return {
      kind: post.kind,
      title: post.title,
      slug,
      summary: post.summary,
      body: post.body,
      firstComment: post.firstComment,
      hashtags: post.hashtags ? JSON.stringify(post.hashtags) : null,
      topics: post.topics ? JSON.stringify(post.topics) : null,
      itemIds: JSON.stringify(meta.itemIds),
      sources: JSON.stringify(meta.sources),
      model: meta.model,
      promptVersion: post.promptVersion,
      inputTokens: post.usage.inputTokens,
      outputTokens: post.usage.outputTokens,
      cacheReadTokens: post.usage.cacheReadTokens,
      cacheWriteTokens: post.usage.cacheWriteTokens,
      createdAt: new Date().toISOString(),
    };
  }

  async insert(post: GeneratedPost, meta: PostMeta): Promise<number> {
    const base = baseSlug(post.slug);
    const slug = base ? await this.ensureUniqueSlug(base) : null;
    const [inserted] = await this.database
      .insert(posts)
      .values(this.rowValues(post, meta, slug))
      .returning({ id: posts.id });
    return inserted!.id;
  }

  /**
   * Atomically persist the canonical digest post AND mark its source items
   * digested, in one transaction. Without this a crash between the two writes
   * could commit the post while items stay 'new' — re-synthesizing and
   * duplicating the digest on the next run. better-sqlite3 transactions are
   * synchronous, so the whole body runs inside one BEGIN/COMMIT.
   */
  async commitDigest(post: GeneratedPost, meta: PostMeta): Promise<number> {
    return this.database.transaction((tx) => {
      const base = baseSlug(post.slug);
      let slug: string | null = null;
      if (base) {
        let current = base;
        for (let n = 2; ; n++) {
          const taken = tx.select({ id: posts.id }).from(posts).where(eq(posts.slug, current)).limit(1).all();
          if (taken.length === 0) break;
          current = `${base}-${n}`;
        }
        slug = current;
      }
      const inserted = tx
        .insert(posts)
        .values(this.rowValues(post, meta, slug))
        .returning({ id: posts.id })
        .all();
      if (meta.itemIds.length > 0) {
        tx.update(newsItems).set({ status: 'digested' }).where(inArray(newsItems.id, meta.itemIds)).run();
      }
      return inserted[0]!.id;
    });
  }
}
