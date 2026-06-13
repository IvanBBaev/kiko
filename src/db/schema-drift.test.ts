// The schema lives in two places — the drizzle definitions in schema.ts and the
// bootstrap DDL (+ ensureColumn migrations) in client.ts. Until they collapse
// into one source (drizzle-kit migrations, see TODO/backlog), this guards the
// drift: every drizzle column must exist in the actually-created table, and
// vice versa, so a column added to one place but not the other fails CI.
process.env.DB_PATH = ':memory:';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getTableColumns, getTableName, type Table } from 'drizzle-orm';

const { sqlite } = await import('./client.js');
const schema = await import('./schema.js');

const tables: Table[] = [schema.newsItems, schema.posts, schema.runs, schema.feedValidators, schema.postEvents];

describe('schema.ts <-> bootstrap DDL drift', () => {
  for (const table of tables) {
    const name = getTableName(table);
    it(`${name}: drizzle columns and the live table match exactly`, () => {
      const expected = new Set(Object.values(getTableColumns(table)).map((c) => c.name));
      const actual = new Set(
        (sqlite.prepare(`PRAGMA table_info(${name})`).all() as Array<{ name: string }>).map((r) => r.name),
      );
      const missingInDb = [...expected].filter((c) => !actual.has(c));
      const missingInSchema = [...actual].filter((c) => !expected.has(c));
      assert.deepEqual(missingInDb, [], `in schema.ts but not created by the DDL: ${missingInDb.join(', ')}`);
      assert.deepEqual(missingInSchema, [], `in the DDL but not in schema.ts: ${missingInSchema.join(', ')}`);
    });
  }
});
