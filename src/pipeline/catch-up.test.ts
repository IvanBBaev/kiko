import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Run } from '../db/schema.js';
import { shouldCatchUp } from './catch-up.js';

const NOW = Date.UTC(2026, 5, 13, 9, 0, 0);
function run(over: Partial<Run>): Run {
  return {
    id: 1,
    startedAt: new Date(NOW).toISOString(),
    finishedAt: null,
    itemsFetched: 0,
    itemsNew: 0,
    postsCreated: 0,
    inputTokens: 0,
    outputTokens: 0,
    status: 'ok',
    error: null,
    ...over,
  };
}

describe('shouldCatchUp', () => {
  it('is disabled when catchUpHours <= 0', () => {
    assert.equal(shouldCatchUp(null, 0, NOW), false);
    assert.equal(shouldCatchUp(run({ status: 'error' }), 0, NOW), false);
  });

  it('fires when there is no prior run', () => {
    assert.equal(shouldCatchUp(null, 26, NOW), true);
  });

  it('skips a recent successful run', () => {
    assert.equal(shouldCatchUp(run({ status: 'ok' }), 26, NOW), false);
    assert.equal(shouldCatchUp(run({ status: 'partial' }), 26, NOW), false);
    assert.equal(shouldCatchUp(run({ status: 'skipped' }), 26, NOW), false);
  });

  it('fires for a recent ERRORED run (the L3 fix — a crash still owes a digest)', () => {
    const justNow = run({ status: 'error', startedAt: new Date(NOW - 2 * 3_600_000).toISOString() });
    assert.equal(shouldCatchUp(justNow, 26, NOW), true);
  });

  it('fires when the last run is older than the window', () => {
    const old = run({ status: 'ok', startedAt: new Date(NOW - 27 * 3_600_000).toISOString() });
    assert.equal(shouldCatchUp(old, 26, NOW), true);
  });
});
