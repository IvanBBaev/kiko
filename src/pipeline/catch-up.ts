import type { Run } from '../db/schema.js';

/**
 * Whether a boot catch-up run should fire. It fires when the latest run is
 * overdue (older than the catch-up window) OR errored — a recently-crashed run
 * (just swept to 'error' on boot) still owes us a digest, and gating only on
 * `startedAt` would skip it. A recent 'ok'/'partial'/'skipped' run needs none.
 */
export function shouldCatchUp(latest: Run | null, catchUpHours: number, now: number): boolean {
  if (catchUpHours <= 0) return false;
  if (!latest) return true;
  const overdue = new Date(latest.startedAt).getTime() < now - catchUpHours * 3_600_000;
  return overdue || latest.status === 'error';
}
