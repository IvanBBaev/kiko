// Composition root — the only place where concrete implementations are wired
// together. Everything else depends on the ports in src/core/ports.ts.
import { config } from './config.js';
import { EventsRepository } from './db/events-repository.js';
import { FeedValidatorsRepository } from './db/feed-validators-repository.js';
import { NewsRepository } from './db/news-repository.js';
import { PostsRepository } from './db/posts-repository.js';
import { RunsRepository } from './db/runs-repository.js';
import { SourcesRepository } from './db/sources-repository.js';
import { postGenerators } from './generators/index.js';
import { ClaudeSynthesizer } from './llm/synthesizer.js';
import { SatoriOgRenderer } from './og/satori-renderer.js';
import { Pipeline } from './pipeline/pipeline.js';
import { RssSource } from './sources/rss-source.js';

export const newsRepo = new NewsRepository();
export const postsRepo = new PostsRepository();
export const runsRepo = new RunsRepository();
export const feedValidatorsRepo = new FeedValidatorsRepository();
export const eventsRepo = new EventsRepository();
export const sourcesRepo = new SourcesRepository();
export const ogRenderer = new SatoriOgRenderer();

export const pipeline = new Pipeline({
  // Sources are resolved from the registry at run time (data-driven), so imports
  // and enable/disable take effect without a redeploy.
  listSources: async () =>
    (await sourcesRepo.listEnabled()).map((row) => ({
      id: row.id,
      source: new RssSource(row.name, row.url, feedValidatorsRepo),
    })),
  onSourceResult: (id, ok, error) =>
    ok
      ? sourcesRepo.recordOk(id)
      : sourcesRepo.recordError(id, error ?? 'fetch failed', config.pipeline.sourceDisableThreshold),
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
    fetchConcurrency: config.pipeline.fetchConcurrency,
    candidatePoolMultiplier: config.pipeline.candidatePoolMultiplier,
    synthesisMode: config.pipeline.synthesisMode,
    model: config.llm.model,
  },
});
