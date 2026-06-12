import { createHash } from 'node:crypto';

/**
 * Stable content hash for near-duplicate detection across sources.
 * Normalizes the title (case, whitespace, punctuation) so the same story
 * syndicated with cosmetic title differences still collides.
 */
export function contentHash(title: string, url: string): string {
  // Punctuation becomes a space (not ''), so "GPT-6" and "GPT 6" normalize
  // identically — same convention as titleTokens() in cluster.ts.
  const normalizedTitle = title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  let canonicalUrl = url;
  try {
    const u = new URL(url);
    // Strip tracking params and fragments — same article, same hash.
    canonicalUrl = `${u.hostname}${u.pathname}`.replace(/\/$/, '');
  } catch {
    // keep raw url
  }

  return createHash('sha256').update(`${normalizedTitle}|${canonicalUrl}`).digest('hex');
}
