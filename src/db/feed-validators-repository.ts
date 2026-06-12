import { eq } from 'drizzle-orm';
import type { FeedValidators, FeedValidatorStore } from '../core/ports.js';
import { db } from './client.js';
import { feedValidators } from './schema.js';

/** DB-backed conditional-GET validators — survive process restarts. */
export class FeedValidatorsRepository implements FeedValidatorStore {
  constructor(private readonly database = db) {}

  async get(feedUrl: string): Promise<FeedValidators | null> {
    const [row] = await this.database.select().from(feedValidators).where(eq(feedValidators.feedUrl, feedUrl));
    return row ? { etag: row.etag, lastModified: row.lastModified } : null;
  }

  async set(feedUrl: string, validators: FeedValidators): Promise<void> {
    await this.database
      .insert(feedValidators)
      .values({ feedUrl, ...validators, updatedAt: new Date().toISOString() })
      .onConflictDoUpdate({
        target: feedValidators.feedUrl,
        set: { ...validators, updatedAt: new Date().toISOString() },
      });
  }
}
