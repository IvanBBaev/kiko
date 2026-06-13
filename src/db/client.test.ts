process.env.DB_PATH = ':memory:';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { db, sweepInterruptedRuns } = await import('./client.js');
const { runs } = await import('./schema.js');

describe('sweepInterruptedRuns', () => {
  it('flips orphaned running rows to error and leaves finished rows untouched', async () => {
    await db.delete(runs);
    await db.insert(runs).values([
      { startedAt: new Date().toISOString(), status: 'running' },
      { startedAt: new Date().toISOString(), status: 'ok' },
    ]);

    sweepInterruptedRuns();

    const rows = await db.select().from(runs);
    assert.deepEqual(rows.map((r) => r.status).sort(), ['error', 'ok']);
    const errored = rows.find((r) => r.status === 'error');
    assert.match(errored!.error ?? '', /interrupted by restart/);
    assert.ok(errored!.finishedAt, 'sets finished_at on the swept run');
  });
});
