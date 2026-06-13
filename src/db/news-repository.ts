import { desc, eq, inArray } from 'drizzle-orm';
import type { FetchedItem } from '../core/types.js';
import { db } from './client.js';
import { newsItems, type NewsItem } from './schema.js';

/** Persistence for raw news items: batch dedupe + insert, selection, status. */
export class NewsRepository {
  constructor(private readonly database = db) {}

  /**
   * Dedupes in-batch and against the DB (by content hash), inserts the rest in
   * one atomic batch INSERT. Only the hashes of the current batch are checked —
   * the table grows for years, never load it whole into memory.
   */
  async insertNew(fetched: FetchedItem[]): Promise<number> {
    const byHash = new Map<string, FetchedItem>();
    for (const item of fetched) {
      if (!byHash.has(item.contentHash)) byHash.set(item.contentHash, item);
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

  /** Freshest items not yet consumed by a digest. */
  async selectPending(limit: number): Promise<NewsItem[]> {
    return this.database
      .select()
      .from(newsItems)
      .where(eq(newsItems.status, 'new'))
      .orderBy(desc(newsItems.publishedAt))
      .limit(limit);
  }
}
