import type { FetchedItem, GeneratedPost, OgCardData, StoryCluster, SynthesisOutcome } from './types.js';

export interface FetchOptions {
  maxAgeDays: number;
  summaryMaxChars: number;
}

export interface FeedValidators {
  etag: string | null;
  lastModified: string | null;
}

/** Storage for HTTP conditional-GET validators (ETag/Last-Modified) per feed. */
export interface FeedValidatorStore {
  get(feedUrl: string): Promise<FeedValidators | null>;
  set(feedUrl: string, validators: FeedValidators): Promise<void>;
}

/**
 * A pluggable news source. Implement this and register the instance in
 * src/sources/index.ts to plug a new source in; remove it from the array
 * to plug it out. A throwing fetch() skips the source, never kills the run.
 */
export interface NewsSource {
  readonly name: string;
  fetch(options: FetchOptions): Promise<FetchedItem[]>;
}

/** Turns the day's story clusters into the digest (the expensive LLM call). */
export interface DigestSynthesizer {
  synthesize(clusters: StoryCluster[]): Promise<SynthesisOutcome>;
}

/**
 * A pluggable output channel (site, LinkedIn, X, newsletter, ...). Implement
 * this and register the instance in src/generators/index.ts. Generators run
 * independently: one failing marks the run 'partial', the rest still publish.
 */
export interface PostGenerator {
  readonly kind: string;
  generate(synthesis: SynthesisOutcome, clusters: StoryCluster[]): Promise<GeneratedPost>;
}

/**
 * Renders a post's Open Graph card to a PNG (1200x630). Pluggable so the
 * rendering stack can be swapped; wired in src/container.ts and served by the
 * /og/posts/:id.png route. render() returns the raw PNG bytes.
 */
export interface OgImageRenderer {
  readonly name: string;
  render(card: OgCardData): Promise<Buffer>;
}
