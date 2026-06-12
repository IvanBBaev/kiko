import { desc, eq } from 'drizzle-orm';
import { db } from './client.js';
import { runs, type Run } from './schema.js';

/** Persistence for pipeline run records. */
export class RunsRepository {
  constructor(private readonly database = db) {}

  async start(): Promise<number> {
    const [run] = await this.database
      .insert(runs)
      .values({ startedAt: new Date().toISOString(), status: 'running' })
      .returning({ id: runs.id });
    return run!.id;
  }

  async finish(id: number, fields: Partial<typeof runs.$inferInsert>): Promise<void> {
    await this.database
      .update(runs)
      .set({ finishedAt: new Date().toISOString(), ...fields })
      .where(eq(runs.id, id));
  }

  async latest(): Promise<Run | null> {
    const [row] = await this.database.select().from(runs).orderBy(desc(runs.id)).limit(1);
    return row ?? null;
  }
}
