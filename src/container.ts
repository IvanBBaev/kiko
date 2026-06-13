// Composition root — the only place where concrete implementations are wired
// together. Everything else depends on the ports in src/core/ports.ts.
import { config } from './config.js';
import { FeedValidatorsRepository } from './db/feed-validators-repository.js';
import { NewsRepository } from './db/news-repository.js';
import { PostsRepository } from './db/posts-repository.js';
import { RunsRepository } from './db/runs-repository.js';
import { postGenerators } from './generators/index.js';
import { ClaudeSynthesizer } from './llm/synthesizer.js';
import { SatoriOgRenderer } from './og/satori-renderer.js';
import { Pipeline } from './pipeline/pipeline.js';
import { buildNewsSources } from './sources/index.js';

export const newsRepo = new NewsRepository();
export const postsRepo = new PostsRepository();
export const runsRepo = new RunsRepository();
export const feedValidatorsRepo = new FeedValidatorsRepository();
export const ogRenderer = new SatoriOgRenderer();

export const pipeline = new Pipeline({
  sources: buildNewsSources(feedValidatorsRepo),
  synthesizer: new ClaudeSynthesizer(),
  generators: postGenerators,
  newsRepo,
  postsRepo,
  runsRepo,
  options: {
    maxItemAgeDays: config.pipeline.maxItemAgeDays,
    maxItemsPerDigest: config.pipeline.maxItemsPerDigest,
    minItemsPerDigest: config.pipeline.minItemsPerDigest,
    itemSummaryMaxChars: config.pipeline.itemSummaryMaxChars,
    model: config.llm.model,
  },
});
