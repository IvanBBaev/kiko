process.env.DB_PATH = ':memory:';

import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

const { db } = await import('./client.js');
const { posts } = await import('./schema.js');
const { EventsRepository } = await import('./events-repository.js');

const repo = new EventsRepository();

before(async () => {
  await db.insert(posts).values([
    { kind: 'site', title: 'Alpha', body: 'b', itemIds: '[1]', model: 'm', status: 'published', createdAt: 'x' },
    { kind: 'linkedin', title: 'Beta', body: 'b', itemIds: '[2]', model: 'm', status: 'published', createdAt: 'x' },
  ]);
  // post 1: 3 events (2 view, 1 click); post 2: 1 view.
  await repo.record(1, 'view', 'linkedin');
  await repo.record(1, 'view', 'rss');
  await repo.record(1, 'click', 'linkedin');
  await repo.record(2, 'view', null);
});

describe('EventsRepository', () => {
  it('counts total events', async () => {
    assert.equal(await repo.total(), 4);
  });

  it('aggregates by type', async () => {
    const map = new Map((await repo.byType()).map((r) => [r.type, r.count]));
    assert.equal(map.get('view'), 3);
    assert.equal(map.get('click'), 1);
  });

  it('aggregates by source, keeping nulls', async () => {
    const map = new Map((await repo.bySource()).map((r) => [r.source, r.count]));
    assert.equal(map.get('linkedin'), 2);
    assert.equal(map.get('rss'), 1);
    assert.equal(map.get(null), 1);
  });

  it('ranks posts by event count, highest first, with title and kind', async () => {
    const top = await repo.topPosts(10);
    assert.equal(top[0]!.id, 1);
    assert.equal(top[0]!.events, 3);
    assert.equal(top[0]!.title, 'Alpha');
    assert.equal(top[0]!.kind, 'site');
    assert.equal(top[1]!.id, 2);
    assert.equal(top[1]!.events, 1);
  });

  it('respects the topPosts limit', async () => {
    assert.equal((await repo.topPosts(1)).length, 1);
  });
});
