// Online backup of the SQLite database (uses SQLite's backup API — safe while
// the DB is in use). Run from cron for a basic backup strategy; for continuous
// replication graduate to Litestream.
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config } from '../config.js';
import { sqlite } from '../db/client.js';

const backupDir = join(dirname(config.dbPath), 'backups');
mkdirSync(backupDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const dest = join(backupDir, `kiko-${stamp}.db`);

try {
  await sqlite.backup(dest);
  console.log(`Backup written: ${dest}`);
  process.exit(0);
} catch (err) {
  console.error('Backup failed:', err);
  process.exit(1);
}
