// Ingest-only run: fetch + dedupe + store, no LLM calls (zero tokens).
// Use it to verify feeds and see what a digest run would work with.
import { newsRepo, pipeline } from '../container.js';
import { clusterItems } from '../core/cluster.js';

try {
  const result = await pipeline.ingest();

  const pending = await newsRepo.selectPending(1000);
  const clusters = clusterItems(pending);

  console.log(`Fetched: ${result.itemsFetched}, new: ${result.itemsNew}, pending total: ${pending.length}`);
  console.log(`Story clusters: ${clusters.length}`);
  for (const c of clusters) {
    const extra = c.duplicates.length > 0 ? ` (+${c.duplicates.map((d) => d.source).join(', ')})` : '';
    console.log(`  - ${c.primary.title} [${c.primary.source}]${extra}`);
  }
  process.exit(0);
} catch (err) {
  console.error('Ingest failed:', err);
  process.exit(1);
}
