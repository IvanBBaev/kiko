process.env.DB_PATH = ':memory:';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { FetchedItem } from '../core/types.js';

const { db } = await import('./client.js');
const { newsItems } = await import('./schema.js');
const { NewsRepository } = await import('./news-repository.js');

function item(over: Partial<FetchedItem>): FetchedItem {
  return { source: 's', title: 't', url: 'u', summary: null, contentHash: 'h', publishedAt: null, ...over };
}

describe('NewsRepository.insertNew', () => {
  it('collapses same-url items with differing titles to a single insert', async () => {
    await db.delete(newsItems);
    const inserted = await new NewsRepository().insertNew([
      item({ url: 'https://x/1', title: 'Title A', contentHash: 'hA' }),
      item({ url: 'https://x/1', title: 'Title B', contentHash: 'hB' }),
    ]);
    assert.equal(inserted, 1, 'second same-url item is dropped explicitly, not silently by SQLite');
    assert.equal((await db.select().from(newsItems)).length, 1);
  });
});

describe('NewsRepository.selectPending', () => {
  it('does not starve undated items behind old dated ones at the limit', async () => {
    await db.delete(newsItems);
    const fetchedAt = new Date().toISOString();
    await db.insert(newsItems).values([
      {
        source: 's',
        title: 'dated-2020',
        url: 'd1',
        contentHash: 'c1',
        publishedAt: '2020-01-01T00:00:00Z',
        fetchedAt,
        status: 'new',
      },
      { source: 's', title: 'undated', url: 'u1', contentHash: 'c2', publishedAt: null, fetchedAt, status: 'new' },
    ]);
    const top = await new NewsRepository().selectPending(1);
    assert.equal(top.length, 1);
    assert.equal(top[0]!.title, 'undated', 'an undated item fetched now outranks a 2020-dated one');
  });
});
