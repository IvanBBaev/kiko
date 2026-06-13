process.env.DB_PATH = ':memory:';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { GeneratedPost } from '../core/types.js';

const { db } = await import('./client.js');
const { posts, newsItems } = await import('./schema.js');
const { PostsRepository } = await import('./posts-repository.js');

function sitePost(slug: string | null): GeneratedPost {
  return {
    kind: 'site',
    title: 'Title',
    slug,
    summary: 'sum',
    body: 'body',
    firstComment: null,
    hashtags: null,
    usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
    promptVersion: 'v1',
  };
}
const meta = (itemIds: number[] = []) => ({ itemIds, sources: [], model: 'm' });

describe('PostsRepository.commitDigest', () => {
  it('inserts the post and marks its items digested atomically', async () => {
    await db.delete(posts);
    await db.delete(newsItems);
    await db.insert(newsItems).values([
      { source: 's', title: 'a', url: 'u1', contentHash: 'h1', fetchedAt: '', status: 'new' },
      { source: 's', title: 'b', url: 'u2', contentHash: 'h2', fetchedAt: '', status: 'new' },
    ]);
    const ids = (await db.select().from(newsItems)).map((r) => r.id);

    const id = await new PostsRepository().commitDigest(sitePost('digest'), meta(ids));
    assert.ok(id > 0);
    const stillNew = (await db.select().from(newsItems)).filter((r) => r.status === 'new');
    assert.equal(stillNew.length, 0, 'all items marked digested in the same transaction');
  });

  it('suffixes a colliding slug', async () => {
    await db.delete(posts);
    const repo = new PostsRepository();
    await repo.commitDigest(sitePost('daily'), meta());
    await repo.commitDigest(sitePost('daily'), meta());
    const slugs = (await db.select().from(posts)).map((r) => r.slug).sort();
    assert.deepEqual(slugs, ['daily', 'daily-2']);
  });

  it('stores a null slug without collision-checking', async () => {
    await db.delete(posts);
    await new PostsRepository().commitDigest(sitePost(null), meta());
    const [row] = await db.select().from(posts);
    assert.equal(row!.slug, null);
  });
});
