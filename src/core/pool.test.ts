import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { pool } from './pool.js';

describe('pool', () => {
  it('processes every item exactly once', async () => {
    const seen: number[] = [];
    await pool([1, 2, 3, 4, 5], 2, async (x) => {
      seen.push(x);
    });
    assert.deepEqual(
      seen.sort((a, b) => a - b),
      [1, 2, 3, 4, 5],
    );
  });

  it('never exceeds the concurrency limit', async () => {
    let active = 0;
    let max = 0;
    await pool(
      Array.from({ length: 12 }, (_, i) => i),
      3,
      async () => {
        active++;
        max = Math.max(max, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
      },
    );
    assert.ok(max <= 3, `peak concurrency ${max} must be <= 3`);
    assert.ok(max > 1, 'should actually run concurrently');
  });

  it('passes the index to the worker', async () => {
    const idx: number[] = [];
    await pool(['a', 'b', 'c'], 1, async (_, i) => {
      idx.push(i);
    });
    assert.deepEqual(idx, [0, 1, 2]);
  });

  it('handles empty input without invoking the worker', async () => {
    await pool([], 4, async () => {
      throw new Error('must not run');
    });
  });
});
