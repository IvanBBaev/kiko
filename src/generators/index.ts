import type { PostGenerator } from '../core/ports.js';
import { LinkedInPostGenerator } from './linkedin.js';
import { SitePostGenerator } from './site.js';

/**
 * Output channel registry — THE plug-in point for outputs.
 * Add an instance to plug a channel in, remove a line to plug it out.
 * Generators run in order; one failing marks the run 'partial', the rest
 * still publish. Any class implementing the PostGenerator port works
 * (X/Twitter, newsletter, Mastodon…).
 */
export const postGenerators: PostGenerator[] = [
  new SitePostGenerator(),
  new LinkedInPostGenerator(),
];
