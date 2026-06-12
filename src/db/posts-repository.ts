import { eq } from 'drizzle-orm';
import type { GeneratedPost, PostSourceRef } from '../core/types.js';
import { db } from './client.js';
import { posts } from './schema.js';

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
      const existing = await this.database
        .select({ id: posts.id })
        .from(posts)
        .where(eq(posts.slug, slug))
        .limit(1);
      if (existing.length === 0) return slug;
      slug = `${base}-${n}`;
    }
  }

  async findById(id: number): Promise<typeof posts.$inferSelect | null> {
    const [row] = await this.database.select().from(posts).where(eq(posts.id, id));
    return row ?? null;
  }

  async insert(post: GeneratedPost, meta: PostMeta): Promise<number> {
    const [inserted] = await this.database
      .insert(posts)
      .values({
        kind: post.kind,
        title: post.title,
        slug: post.slug ? await this.ensureUniqueSlug(post.slug) : null,
        summary: post.summary,
        body: post.body,
        firstComment: post.firstComment,
        hashtags: post.hashtags ? JSON.stringify(post.hashtags) : null,
        itemIds: JSON.stringify(meta.itemIds),
        sources: JSON.stringify(meta.sources),
        model: meta.model,
        promptVersion: post.promptVersion,
        inputTokens: post.usage.inputTokens,
        outputTokens: post.usage.outputTokens,
        cacheReadTokens: post.usage.cacheReadTokens,
        cacheWriteTokens: post.usage.cacheWriteTokens,
        createdAt: new Date().toISOString(),
      })
      .returning({ id: posts.id });
    return inserted!.id;
  }
}
