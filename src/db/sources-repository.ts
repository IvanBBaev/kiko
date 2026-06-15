import { eq, sql } from 'drizzle-orm';
import { db } from './client.js';
import { sources, type Source } from './schema.js';

export interface NewSource {
  name: string;
  url: string;
  kind?: string;
}

/** Persistence and health tracking for the news-source registry. */
export class SourcesRepository {
  constructor(private readonly database = db) {}

  /** Enabled sources, oldest first (stable ingest order). */
  async listEnabled(): Promise<Source[]> {
    return this.database.select().from(sources).where(eq(sources.enabled, true)).orderBy(sources.id);
  }

  async count(): Promise<{ total: number; enabled: number }> {
    const [row] = await this.database
      .select({
        total: sql<number>`count(*)`,
        enabled: sql<number>`coalesce(sum(case when ${sources.enabled} then 1 else 0 end), 0)`,
      })
      .from(sources);
    return { total: row?.total ?? 0, enabled: row?.enabled ?? 0 };
  }

  /** A successful fetch — clears the failure state. */
  async recordOk(id: number): Promise<void> {
    await this.database
      .update(sources)
      .set({ errorCount: 0, lastError: null, lastOkAt: new Date().toISOString() })
      .where(eq(sources.id, id));
  }

  /**
   * A failed fetch — bump the consecutive-error counter and auto-disable the
   * source once it reaches `disableThreshold`, so a permanently dead feed stops
   * being fetched (and stops wasting a slot) without manual intervention.
   */
  async recordError(id: number, message: string, disableThreshold: number): Promise<void> {
    await this.database
      .update(sources)
      .set({
        errorCount: sql`${sources.errorCount} + 1`,
        lastError: message.slice(0, 500),
        lastErrorAt: new Date().toISOString(),
        enabled: sql`case when ${sources.errorCount} + 1 >= ${disableThreshold} then 0 else ${sources.enabled} end`,
      })
      .where(eq(sources.id, id));
  }

  /**
   * Insert a source if its URL is new; returns true if inserted, false if the
   * URL already existed. Idempotent — safe to re-run an import.
   */
  async add({ name, url, kind = 'rss' }: NewSource): Promise<boolean> {
    const inserted = await this.database
      .insert(sources)
      .values({ name, url, kind, createdAt: new Date().toISOString() })
      .onConflictDoNothing({ target: sources.url })
      .returning({ id: sources.id });
    return inserted.length > 0;
  }
}
