import type { FeedValidatorStore, NewsSource } from '../core/ports.js';
import { RssSource } from './rss-source.js';

/**
 * News source registry — THE plug-in point for inputs.
 * Add a line to plug a source in, remove a line to plug it out.
 * Any class implementing the NewsSource port works (RSS, REST APIs, scrapers…).
 */
const FEEDS: ReadonlyArray<readonly [name: string, feedUrl: string]> = [
  ['OpenAI', 'https://openai.com/news/rss.xml'],
  ['Google AI Blog', 'https://blog.google/technology/ai/rss/'],
  ['Hugging Face', 'https://huggingface.co/blog/feed.xml'],
  ['The Verge — AI', 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml'],
  ['TechCrunch — AI', 'https://techcrunch.com/category/artificial-intelligence/feed/'],
  ['MIT Technology Review — AI', 'https://www.technologyreview.com/topic/artificial-intelligence/feed'],
  ['VentureBeat — AI', 'https://venturebeat.com/category/ai/feed/'],
  ['Simon Willison', 'https://simonwillison.net/atom/everything/'],
];

export function buildNewsSources(validatorStore?: FeedValidatorStore): NewsSource[] {
  return FEEDS.map(([name, url]) => new RssSource(name, url, validatorStore));
}
