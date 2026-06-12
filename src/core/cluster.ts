import type { NewsItem } from '../db/schema.js';
import type { StoryCluster } from './types.js';

function titleTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      // Keep numbers of any length — version markers like "GPT-6" → "6" are
      // strong same-story signals.
      .filter((t) => t.length > 2 || /^\d+$/.test(t)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection++;
  return intersection / (a.size + b.size - intersection);
}

/**
 * Greedy single-pass clustering by title similarity. Items arrive sorted by
 * recency, so the freshest coverage of a story becomes the cluster primary.
 *
 * Clustering same-story items before the LLM call cuts prompt size and stops
 * the model from over-weighting a story just because five feeds covered it.
 *
 * Threshold 0.4: same-story headlines from different outlets share the entity
 * tokens but differ in verbs/framing, landing around 0.40-0.50 Jaccard.
 * A false merge only costs an extra "also covered by" label, so erring toward
 * merging is the cheaper mistake.
 */
export function clusterItems(items: NewsItem[], threshold = 0.4): StoryCluster[] {
  const clusters: Array<StoryCluster & { tokens: Set<string> }> = [];

  for (const item of items) {
    const tokens = titleTokens(item.title);
    const match = clusters.find((c) => jaccard(tokens, c.tokens) >= threshold);
    if (match) {
      match.duplicates.push(item);
    } else {
      clusters.push({ primary: item, duplicates: [], tokens });
    }
  }

  return clusters.map(({ primary, duplicates }) => ({ primary, duplicates }));
}

export function clusterItemIds(clusters: StoryCluster[]): number[] {
  return clusters.flatMap((c) => [c.primary.id, ...c.duplicates.map((d) => d.id)]);
}
