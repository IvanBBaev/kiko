import Parser from 'rss-parser';
import { contentHash } from '../core/dedupe.js';
import type { FeedValidators, FeedValidatorStore, FetchOptions, NewsSource } from '../core/ports.js';
import type { FetchedItem } from '../core/types.js';
import { log } from '../log.js';

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-zA-Z#0-9]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Feed dates are untrusted input — an invalid one must not throw mid-run. */
export function safeIsoDate(value: string | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

// Identifiable UA — some publishers throttle or block unknown/default bots.
const USER_AGENT = 'kiko-news-aggregator/0.1 (+https://github.com/ivanbaev)';

const parser = new Parser();

/** Default conditional-GET state: process-lived in-memory map. */
class InMemoryValidatorStore implements FeedValidatorStore {
  private readonly map = new Map<string, FeedValidators>();
  get(feedUrl: string): Promise<FeedValidators | null> {
    return Promise.resolve(this.map.get(feedUrl) ?? null);
  }
  set(feedUrl: string, validators: FeedValidators): Promise<void> {
    this.map.set(feedUrl, validators);
    return Promise.resolve();
  }
}

const defaultStore = new InMemoryValidatorStore();

/** RSS/Atom feed source — the default NewsSource implementation. */
export class RssSource implements NewsSource {
  constructor(
    readonly name: string,
    private readonly feedUrl: string,
    /** Conditional-GET validators (RSS polling etiquette: ETag/If-Modified-Since → 304). */
    private readonly validatorStore: FeedValidatorStore = defaultStore,
  ) {}

  async fetch({ maxAgeDays, summaryMaxChars }: FetchOptions): Promise<FetchedItem[]> {
    const headers: Record<string, string> = {
      'User-Agent': USER_AGENT,
      Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
    };
    const validators = await this.validatorStore.get(this.feedUrl);
    if (validators?.etag) headers['If-None-Match'] = validators.etag;
    if (validators?.lastModified) headers['If-Modified-Since'] = validators.lastModified;

    const response = await fetch(this.feedUrl, {
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });

    if (response.status === 304) {
      log.debug({ source: this.name }, 'feed not modified (304)');
      return [];
    }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${this.feedUrl}`);
    }

    await this.validatorStore.set(this.feedUrl, {
      etag: response.headers.get('etag'),
      lastModified: response.headers.get('last-modified'),
    });

    const feed = await parser.parseString(await response.text());
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    const items: FetchedItem[] = [];

    for (const item of feed.items ?? []) {
      const title = item.title?.trim();
      const url = item.link?.trim();
      if (!title || !url) continue;

      const publishedAt = safeIsoDate(item.isoDate) ?? safeIsoDate(item.pubDate);
      if (publishedAt && new Date(publishedAt).getTime() < cutoff) continue;

      const rawSummary = item.contentSnippet ?? item.content ?? '';
      const summary = stripHtml(rawSummary).slice(0, summaryMaxChars) || null;

      items.push({
        source: this.name,
        title,
        url,
        summary,
        contentHash: contentHash(title, url),
        publishedAt,
      });
    }
    return items;
  }
}
