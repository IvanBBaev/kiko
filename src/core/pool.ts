/**
 * Run an async `worker` over `items` with bounded concurrency — at most `limit`
 * workers in flight at once. Needed so ingesting hundreds/thousands of feeds
 * doesn't fire that many HTTP requests at once and drown the event loop/network.
 *
 * The worker must handle its own errors: a throw rejects the whole run. Order of
 * completion is not guaranteed.
 */
export async function pool<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<void> {
  const n = items.length;
  let next = 0;
  const runner = async (): Promise<void> => {
    while (next < n) {
      const i = next++;
      await worker(items[i]!, i);
    }
  };
  const concurrency = Math.max(1, Math.min(limit, n));
  await Promise.all(Array.from({ length: concurrency }, () => runner()));
}
