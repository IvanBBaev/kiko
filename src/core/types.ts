import { z } from 'zod';
import type { NewsItem } from '../db/schema.js';

/** A news item as fetched from a source, before persistence. */
export interface FetchedItem {
  source: string;
  title: string;
  url: string;
  summary: string | null;
  contentHash: string;
  publishedAt: string | null;
}

/**
 * One story, possibly covered by multiple sources. The primary item carries
 * the summary; duplicates only contribute their source names and URLs.
 */
export interface StoryCluster {
  primary: NewsItem;
  duplicates: NewsItem[];
}

export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/**
 * Canonical topic tags. The synthesizer is steered to reuse these so topics stay
 * a groupable dimension (per-topic feeds, topic-level analytics, browse/SEO)
 * instead of free-form sprawl. A new tag is allowed only when none fit.
 */
export const CANONICAL_TOPICS = [
  'models',
  'research',
  'funding',
  'policy',
  'safety',
  'tooling',
  'open-source',
  'hardware',
  'product',
  'agents',
] as const;

// NOTE: keep length constraints in descriptions/prompts, not in zod
// (min/max length is not supported by structured outputs server-side).
export const SitePostSchema = z.object({
  title: z.string().describe('Post title, max ~70 chars, specific and factual, no clickbait'),
  slug: z.string().describe('URL slug: lowercase, ascii, hyphen-separated'),
  summary: z.string().describe('1-2 sentence teaser for list pages and meta description'),
  body: z
    .string()
    .describe(
      'Markdown body. TL;DR bullet list first, then thematic H2 sections. ' +
        'Reference sources inline as [n] matching the numbered input items. 600-900 words.',
    ),
  topics: z
    .array(z.string())
    .describe(
      `2-5 short lowercase topic tags categorizing the digest. Strongly prefer these canonical tags so ` +
        `posts stay groupable: ${CANONICAL_TOPICS.join(', ')}. Add a different tag only when none of these fit.`,
    ),
});
export type SitePost = z.infer<typeof SitePostSchema>;

/** What the synthesizer produced, what it cost, and which prompt version made it. */
export interface SynthesisOutcome {
  post: SitePost;
  usage: UsageTotals;
  promptVersion: string | null;
}

/** The minimal post data an OG-card image is rendered from (channel-agnostic). */
export interface OgCardData {
  title: string | null;
  summary: string | null;
  kind: string;
  sourceCount: number;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
}

/** Maps an inline [n] citation in a post body to its source story. */
export interface PostSourceRef {
  n: number;
  title: string;
  url: string;
  source: string;
  alsoCoveredBy: string[];
}

/** A channel-agnostic generated post, produced by a PostGenerator. */
export interface GeneratedPost {
  kind: string;
  title: string | null;
  slug: string | null;
  summary: string | null;
  body: string;
  firstComment: string | null;
  hashtags: string[] | null;
  /** Topic tags for browse/feeds/analytics; null when a channel doesn't tag. */
  topics: string[] | null;
  usage: UsageTotals;
  /** Hash of the prompt that produced it — correlate quality with prompt edits. */
  promptVersion: string | null;
}
