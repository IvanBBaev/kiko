process.env.DB_PATH = ':memory:';

import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

const { SourcesRepository } = await import('./sources-repository.js');
const repo = new SourcesRepository();

before(async () => {
  await repo.add({ name: 'Alpha', url: 'https://alpha.example/feed' });
  await repo.add({ name: 'Beta', url: 'https://beta.example/feed' });
});

describe('SourcesRepository', () => {
  it('adds a source and dedupes by url (idempotent import)', async () => {
    assert.equal(await repo.add({ name: 'New', url: 'https://new.example/feed' }), true);
    assert.equal(await repo.add({ name: 'New again', url: 'https://new.example/feed' }), false);
  });

  it('lists only enabled sources', async () => {
    const enabled = await repo.listEnabled();
    assert.ok(enabled.length >= 2);
    assert.ok(enabled.every((s) => s.enabled === true));
  });

  it('counts total and enabled', async () => {
    const c = await repo.count();
    assert.ok(c.total >= 3);
    assert.equal(c.enabled, c.total, 'all are enabled before any disable');
  });

  it('recordOk clears the failure state', async () => {
    const s = (await repo.listEnabled()).find((x) => x.url === 'https://alpha.example/feed')!;
    await repo.recordError(s.id, 'boom', 5);
    await repo.recordOk(s.id);
    const after = (await repo.listEnabled()).find((x) => x.id === s.id)!;
    assert.equal(after.errorCount, 0);
    assert.equal(after.lastError, null);
    assert.ok(after.lastOkAt);
  });

  it('auto-disables a source once it hits the error threshold', async () => {
    await repo.add({ name: 'Flaky', url: 'https://flaky.example/feed' });
    const s = (await repo.listEnabled()).find((x) => x.url === 'https://flaky.example/feed')!;
    await repo.recordError(s.id, 'down', 3); // 1
    await repo.recordError(s.id, 'down', 3); // 2 — still enabled
    assert.ok(
      (await repo.listEnabled()).some((x) => x.id === s.id),
      'enabled below threshold',
    );
    await repo.recordError(s.id, 'down', 3); // 3 — disabled
    assert.equal(
      (await repo.listEnabled()).find((x) => x.id === s.id),
      undefined,
      'disabled at threshold',
    );
    assert.equal((await repo.count()).enabled, (await repo.count()).total - 1);
  });
});
