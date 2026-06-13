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
  // post 1: 2 impressions, 1 click, 1 view (CTR 0.5); post 2: 1 impression, 1 view.
  await repo.record(1, 'impression', 'linkedin');
  await repo.record(1, 'impression', 'rss');
  await repo.record(1, 'click', 'linkedin');
  await repo.record(1, 'view', 'linkedin');
  await repo.record(2, 'impression', 'rss');
  await repo.record(2, 'view', null);
});

describe('EventsRepository', () => {
  it('counts total events', async () => {
    assert.equal(await repo.total(), 6);
  });

  it('reports the site-wide funnel with CTR', async () => {
    const f = await repo.funnel();
    assert.equal(f.impressions, 3);
    assert.equal(f.clicks, 1);
    assert.equal(f.views, 2);
    assert.equal(f.shares, 0);
    assert.ok(Math.abs(f.ctr - 1 / 3) < 1e-9);
  });

  it('aggregates by type', async () => {
    const map = new Map((await repo.byType()).map((r) => [r.type, r.count]));
    assert.equal(map.get('impression'), 3);
    assert.equal(map.get('click'), 1);
    assert.equal(map.get('view'), 2);
  });

  it('aggregates by source, keeping nulls', async () => {
    const map = new Map((await repo.bySource()).map((r) => [r.source, r.count]));
    assert.equal(map.get('linkedin'), 3);
    assert.equal(map.get('rss'), 2);
    assert.equal(map.get(null), 1);
  });

  it('ranks posts by engagement (clicks+shares) with per-post CTR', async () => {
    const top = await repo.topPosts(10);
    assert.equal(top[0]!.id, 1, 'post 1 has the only click, so it ranks first');
    assert.equal(top[0]!.impressions, 2);
    assert.equal(top[0]!.clicks, 1);
    assert.equal(top[0]!.total, 4);
    assert.equal(top[0]!.ctr, 0.5);
    assert.equal(top[1]!.id, 2);
    assert.equal(top[1]!.ctr, 0, 'no clicks → zero CTR, no division by zero');
  });

  it('respects the topPosts limit', async () => {
    assert.equal((await repo.topPosts(1)).length, 1);
  });
});
