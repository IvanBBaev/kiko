import { desc, eq, inArray, sql } from 'drizzle-orm';
import type { FetchedItem } from '../core/types.js';
import { log } from '../log.js';
import { db } from './client.js';
import { newsItems, type NewsItem } from './schema.js';

/** Persistence for raw news items: batch dedupe + insert, selection, status. */
export class NewsRepository {
  constructor(private readonly database = db) {}

  /**
   * Dedupes in-batch and against the DB, inserts the rest in one atomic batch
   * INSERT. Only the current batch's keys are checked — the table grows for
   * years, never load it whole into memory.
   *
   * Dedupe keys on BOTH contentHash (title+url) and url: the DB UNIQUE is on url
   * (with onConflictDoNothing), so two same-url items whose titles differ get
   * different hashes, both survive a hash-only dedupe, then SQLite silently
   * drops the second on the url conflict — letting feed order decide which
   * title/summary wins. Collapsing by url here makes that choice explicit.
   */
  async insertNew(fetched: FetchedItem[]): Promise<number> {
    const byHash = new Map<string, FetchedItem>();
    const seenUrls = new Set<string>();
    let urlCollisions = 0;
    for (const item of fetched) {
      if (byHash.has(item.contentHash) || seenUrls.has(item.url)) {
        if (seenUrls.has(item.url) && !byHash.has(item.contentHash)) urlCollisions++;
        continue;
      }
      byHash.set(item.contentHash, item);
      seenUrls.add(item.url);
    }
    if (urlCollisions > 0) {
      log.warn({ urlCollisions }, 'dropped same-url items with differing titles during ingest dedupe');
    }
    const candidates = [...byHash.values()];
    if (candidates.length === 0) return 0;

    const existing = await this.database
      .select({ hash: newsItems.contentHash })
      .from(newsItems)
      .where(
        inArray(
          newsItems.contentHash,
          candidates.map((c) => c.contentHash),
        ),
      );
    const existingHashes = new Set(existing.map((r) => r.hash));

    const fresh = candidates.filter((c) => !existingHashes.has(c.contentHash));
    if (fresh.length === 0) return 0;

    const fetchedAt = new Date().toISOString();
    const inserted = await this.database
      .insert(newsItems)
      .values(fresh.map((item) => ({ ...item, fetchedAt })))
      .onConflictDoNothing({ target: newsItems.url })
      .returning({ id: newsItems.id });

    return inserted.length;
  }

  /**
   * Freshest items not yet consumed by a digest. Orders by published date, but
   * falls back to fetch time when an item is undated — otherwise SQLite sorts
   * NULL dates last and the LIMIT cuts undated stories first, permanently
   * starving feeds that omit dates.
   */
  async selectPending(limit: number): Promise<NewsItem[]> {
    return this.database
      .select()
      .from(newsItems)
      .where(eq(newsItems.status, 'new'))
      .orderBy(desc(sql`coalesce(${newsItems.publishedAt}, ${newsItems.fetchedAt})`))
      .limit(limit);
  }
}
