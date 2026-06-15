// Manage the news-source registry: seed the curated set, import an OPML/feed
// list (grows the set toward hundreds/thousands), or show counts. Idempotent —
// re-running skips URLs already present.
//   npm run sources:seed
//   npm run sources -- import path/to/feeds.opml
//   npm run sources -- list
import { readFileSync } from 'node:fs';
import type { NewSource } from '../db/sources-repository.js';
import { sourcesRepo } from '../container.js';
import { CURATED_FEEDS } from '../sources/index.js';
import { parseFeedList, parseOpml } from '../sources/opml.js';

async function addAll(entries: NewSource[]): Promise<void> {
  let added = 0;
  for (const entry of entries) {
    if (await sourcesRepo.add(entry)) added++;
  }
  const c = await sourcesRepo.count();
  console.log(`added ${added}/${entries.length} new — registry now ${c.enabled}/${c.total} enabled`);
}

const cmd = process.argv[2];

if (cmd === 'seed') {
  await addAll(CURATED_FEEDS.map(([name, url]) => ({ name, url })));
} else if (cmd === 'import') {
  const file = process.argv[3];
  if (!file) {
    console.error('usage: sources import <file.opml|file.txt>');
    process.exit(1);
  }
  const text = readFileSync(file, 'utf8');
  const entries = /\.(opml|xml)$/i.test(file) ? parseOpml(text) : parseFeedList(text);
  if (entries.length === 0) {
    console.error(`no feeds found in ${file}`);
    process.exit(1);
  }
  await addAll(entries);
} else if (cmd === 'list') {
  const c = await sourcesRepo.count();
  console.log(`${c.enabled}/${c.total} sources enabled`);
} else {
  console.error('usage: sources <seed | import <file> | list>');
  process.exit(1);
}

process.exit(0);
