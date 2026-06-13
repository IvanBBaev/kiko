// An invalid cron must not crash boot. Env is set before importing config/scheduler.
process.env.DB_PATH = ':memory:';
process.env.PIPELINE_CRON = '99 not a valid cron';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

const { startScheduler, nextScheduledRun } = await import('./scheduler.js');

describe('startScheduler', () => {
  it('degrades to a disabled scheduler on an invalid cron instead of throwing', () => {
    const errors: string[] = [];
    const job = startScheduler({ info: () => {}, error: (_obj, msg) => errors.push(msg) });
    assert.equal(job, null, 'returns null rather than crashing the server boot');
    assert.equal(nextScheduledRun(), null);
    assert.ok(
      errors.some((m) => m.includes('Invalid PIPELINE_CRON')),
      'logs the invalid-cron error',
    );
  });
});
