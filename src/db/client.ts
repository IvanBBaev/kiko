import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { config } from '../config.js';
import * as schema from './schema.js';

mkdirSync(dirname(config.dbPath), { recursive: true });

const sqlite = new Database(config.dbPath);
// Production pragmas: WAL + NORMAL is the standard durability/speed balance
// (atomicity guaranteed; tiny window of data loss only on power failure).
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('synchronous = NORMAL');
sqlite.pragma('busy_timeout = 5000');
sqlite.pragma('cache_size = -20000'); // 20MB page cache
sqlite.pragma('foreign_keys = ON');

// Did the FTS index exist before this boot? If not, and posts already have rows
// (the index was introduced on a populated DB), it must be backfilled once — the
// triggers only index NEW mutations. Checked before the CREATE below.
const ftsExistedBefore =
  sqlite.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'posts_fts'`).get() !== undefined;

// Bootstrap DDL — keep in sync with schema.ts. Good enough until the schema
// stabilizes; switch to drizzle-kit migrations when it does.
sqlite.exec(`
CREATE TABLE IF NOT EXISTS news_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  summary TEXT,
  content_hash TEXT NOT NULL,
  published_at TEXT,
  fetched_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new'
);
CREATE INDEX IF NOT EXISTS idx_news_items_status ON news_items(status);
CREATE INDEX IF NOT EXISTS idx_news_items_hash ON news_items(content_hash);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  title TEXT,
  slug TEXT,
  summary TEXT,
  body TEXT NOT NULL,
  item_ids TEXT NOT NULL,
  sources TEXT,
  first_comment TEXT,
  hashtags TEXT,
  topics TEXT,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_posts_kind ON posts(kind);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_slug_unique ON posts(slug) WHERE slug IS NOT NULL;

CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  items_fetched INTEGER NOT NULL DEFAULT 0,
  items_new INTEGER NOT NULL DEFAULT 0,
  posts_created INTEGER NOT NULL DEFAULT 0,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  error TEXT
);

CREATE TABLE IF NOT EXISTS feed_validators (
  feed_url TEXT PRIMARY KEY,
  etag TEXT,
  last_modified TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'rss',
  enabled INTEGER NOT NULL DEFAULT 1,
  error_count INTEGER NOT NULL DEFAULT 0,
  last_ok_at TEXT,
  last_error_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sources_enabled ON sources(enabled);

CREATE TABLE IF NOT EXISTS post_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  source TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_post_events_post ON post_events(post_id);
CREATE INDEX IF NOT EXISTS idx_post_events_type ON post_events(type);

CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(title, summary, body, content='posts', content_rowid='id');
CREATE TRIGGER IF NOT EXISTS posts_fts_ai AFTER INSERT ON posts BEGIN
  INSERT INTO posts_fts(rowid, title, summary, body) VALUES (new.id, new.title, new.summary, new.body);
END;
CREATE TRIGGER IF NOT EXISTS posts_fts_ad AFTER DELETE ON posts BEGIN
  INSERT INTO posts_fts(posts_fts, rowid, title, summary, body) VALUES('delete', old.id, old.title, old.summary, old.body);
END;
CREATE TRIGGER IF NOT EXISTS posts_fts_au AFTER UPDATE ON posts BEGIN
  INSERT INTO posts_fts(posts_fts, rowid, title, summary, body) VALUES('delete', old.id, old.title, old.summary, old.body);
  INSERT INTO posts_fts(rowid, title, summary, body) VALUES (new.id, new.title, new.summary, new.body);
END;
`);

// Mini-migrations: CREATE TABLE IF NOT EXISTS doesn't evolve existing tables.
// Add columns introduced after the initial schema, idempotently.
function ensureColumn(table: string, column: string, ddl: string): void {
  const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}
ensureColumn('runs', 'input_tokens', 'input_tokens INTEGER NOT NULL DEFAULT 0');
ensureColumn('runs', 'output_tokens', 'output_tokens INTEGER NOT NULL DEFAULT 0');
ensureColumn('posts', 'sources', 'sources TEXT');
ensureColumn('posts', 'prompt_version', 'prompt_version TEXT');
ensureColumn('posts', 'topics', 'topics TEXT');

// Backfill the FTS index once if it was just created on a DB that already had
// posts. (The old count(*) comparison was dead code: an external-content FTS5
// table answers count(*) from the content table, so the two counts are always
// equal even when the index is genuinely empty.)
if (!ftsExistedBefore) {
  const postsCount = (sqlite.prepare('SELECT count(*) AS c FROM posts').get() as { c: number }).c;
  if (postsCount > 0) {
    sqlite.exec(`INSERT INTO posts_fts(posts_fts) VALUES('rebuild')`);
  }
}

/**
 * Repair runs left 'running' by a crashed process (the concurrency guard is
 * in-memory, so a kill leaves the row stuck). **Server-boot only** — this must
 * NOT run at module load, because the backup/ingest CLIs also import this file
 * and would otherwise flip a live server's in-flight run to 'error'.
 */
export function sweepInterruptedRuns(): void {
  sqlite.exec(`UPDATE runs SET status = 'error', error = 'interrupted by restart', finished_at = datetime('now')
    WHERE status = 'running'`);
}

export { sqlite };
export const db = drizzle(sqlite, { schema });
