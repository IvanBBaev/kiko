import { findInvalidCitations } from '../core/citations.js';
import { clusterItemIds, clusterItems } from '../core/cluster.js';
import type { DigestSynthesizer, NewsSource, PostGenerator } from '../core/ports.js';
import type { FetchedItem, PostSourceRef, StoryCluster, SynthesisOutcome, UsageTotals } from '../core/types.js';
import type { NewsRepository } from '../db/news-repository.js';
import type { PostsRepository } from '../db/posts-repository.js';
import type { RunsRepository } from '../db/runs-repository.js';
import { log } from '../log.js';
import { notify } from '../notify.js';

const ZERO_USAGE: UsageTotals = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

export interface PipelineOptions {
  maxItemAgeDays: number;
  maxItemsPerDigest: number;
  minItemsPerDigest: number;
  itemSummaryMaxChars: number;
  model: string;
}

export interface PipelineDeps {
  sources: NewsSource[];
  synthesizer: DigestSynthesizer;
  generators: PostGenerator[];
  newsRepo: NewsRepository;
  postsRepo: PostsRepository;
  runsRepo: RunsRepository;
  options: PipelineOptions;
}

export interface PipelineResult {
  runId: number;
  /** ok = all generators succeeded; partial = at least one did; skipped = not enough new stories */
  status: 'ok' | 'partial' | 'skipped';
  itemsFetched: number;
  itemsNew: number;
  postsCreated: number;
}

/**
 * Orchestrates: ingest → cluster → synthesize → generate posts → mark digested.
 * All collaborators are injected ports — swap sources, the synthesizer, or
 * output channels without touching this class.
 */
export class Pipeline {
  private running = false;

  constructor(private readonly deps: PipelineDeps) {}

  isRunning(): boolean {
    return this.running;
  }

  /** Fetch every source (failures are skipped, not fatal) and store new items. */
  async ingest(): Promise<{ itemsFetched: number; itemsNew: number }> {
    const { sources, newsRepo, options } = this.deps;
    const results = await Promise.allSettled(
      sources.map((s) => s.fetch({ maxAgeDays: options.maxItemAgeDays, summaryMaxChars: options.itemSummaryMaxChars })),
    );

    const fetched: FetchedItem[] = [];
    results.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        fetched.push(...result.value);
      } else {
        log.warn({ source: sources[i]?.name, reason: String(result.reason) }, 'news source failed');
      }
    });

    const itemsNew = await newsRepo.insertNew(fetched);
    return { itemsFetched: fetched.length, itemsNew };
  }

  /**
   * Full run. Concurrency-guarded so the cron trigger and the manual API
   * trigger can't overlap.
   *
   * Failure semantics: the synthesis call is the expensive artifact. After the
   * first post is persisted, items are marked digested — a later generator
   * failure yields a 'partial' run instead of re-running synthesis (and paying
   * for it twice) on the next cycle.
   */
  async run(): Promise<PipelineResult> {
    if (this.running) {
      throw new Error('Pipeline is already running');
    }
    this.running = true;

    const { synthesizer, generators, newsRepo, postsRepo, runsRepo, options } = this.deps;
    const runId = await runsRepo.start();
    log.info({ runId }, 'pipeline run started');

    try {
      // 1. Ingest
      const { itemsFetched, itemsNew } = await this.ingest();

      // 2. Select 2x the digest cap — clustering compresses multi-source
      // coverage, so more stories fit the same budget. Stories cut by the cap
      // stay 'new' and roll over to the next run.
      const pending = await newsRepo.selectPending(options.maxItemsPerDigest * 2);
      const clusters = clusterItems(pending).slice(0, options.maxItemsPerDigest);

      // Token guard: a digest from 1-2 stories isn't worth an Opus call.
      if (clusters.length < options.minItemsPerDigest) {
        await runsRepo.finish(runId, { status: 'skipped', itemsFetched, itemsNew });
        log.info({ runId, clusters: clusters.length }, 'pipeline run skipped — not enough new stories');
        return { runId, status: 'skipped', itemsFetched, itemsNew, postsCreated: 0 };
      }

      // 3. Synthesize the digest (the expensive call)
      const synthesis = await synthesizer.synthesize(clusters);

      // Deterministic citation check — every [n] must point at a real story.
      const invalidRefs = findInvalidCitations(synthesis.post.body, clusters.length);
      if (invalidRefs.length > 0) {
        log.warn({ runId, invalidRefs }, 'digest body references nonexistent sources');
      }

      const itemIds = clusterItemIds(clusters);
      const sourceRefs: PostSourceRef[] = clusters.map((c, i) => ({
        n: i + 1,
        title: c.primary.title,
        url: c.primary.url,
        source: c.primary.source,
        alsoCoveredBy: c.duplicates.map((d) => d.source),
      }));

      // 4. Run every registered output channel; independent failures.
      let postsCreated = 0;
      let firstError: string | null = null;
      let inputTokens = 0;
      let outputTokens = 0;

      for (const generator of generators) {
        try {
          const post = await generator.generate(synthesis, clusters);
          await postsRepo.insert(post, { itemIds, sources: sourceRefs, model: options.model });
          postsCreated++;
          inputTokens += post.usage.inputTokens;
          outputTokens += post.usage.outputTokens;
          // Synthesis is paid for — once one post exists, these items must
          // not re-enter the next run.
          if (postsCreated === 1) await newsRepo.markDigested(itemIds);
        } catch (err) {
          firstError ??= `${generator.kind}: ${err instanceof Error ? err.message : String(err)}`;
          log.error({ err, generator: generator.kind }, 'post generator failed');
        }
      }

      if (postsCreated === 0) {
        throw new Error(firstError ?? 'all post generators failed');
      }

      const status = firstError ? 'partial' : 'ok';
      await runsRepo.finish(runId, {
        status,
        itemsFetched,
        itemsNew,
        postsCreated,
        inputTokens,
        outputTokens,
        error: firstError,
      });
      log.info({ runId, status, postsCreated, inputTokens, outputTokens }, 'pipeline run finished');
      if (status === 'partial') notify('run.partial', { runId, error: firstError });
      return { runId, status, itemsFetched, itemsNew, postsCreated };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await runsRepo.finish(runId, { status: 'error', error: message });
      notify('run.error', { runId, error: message });
      throw err;
    } finally {
      this.running = false;
    }
  }

  /**
   * Re-run a single output channel from an already-synthesized site post —
   * cheap call, no new synthesis. Returns the new post id, or null when the
   * source post doesn't exist or isn't a site digest.
   */
  async regenerate(sitePostId: number, kind = 'linkedin'): Promise<number | null> {
    const { postsRepo, generators, options } = this.deps;

    const source = await postsRepo.findById(sitePostId);
    if (!source || source.kind !== 'site') return null;

    const generator = generators.find((g) => g.kind === kind);
    if (!generator) {
      throw new Error(`No generator registered for kind "${kind}"`);
    }

    const sourceRefs: PostSourceRef[] = source.sources ? JSON.parse(source.sources) : [];
    // Reconstruct minimal clusters from the stored citation refs — generators
    // only need title/url/source of each story's primary item.
    const clusters: StoryCluster[] = sourceRefs.map((ref) => ({
      primary: {
        id: 0,
        source: ref.source,
        title: ref.title,
        url: ref.url,
        summary: null,
        contentHash: '',
        publishedAt: null,
        fetchedAt: '',
        status: 'digested',
      },
      duplicates: [],
    }));

    const synthesis: SynthesisOutcome = {
      post: {
        title: source.title ?? '',
        slug: source.slug ?? '',
        summary: source.summary ?? '',
        body: source.body,
      },
      usage: ZERO_USAGE,
      promptVersion: source.promptVersion,
    };

    const post = await generator.generate(synthesis, clusters);
    const newId = await postsRepo.insert(post, {
      itemIds: JSON.parse(source.itemIds) as number[],
      sources: sourceRefs,
      model: options.model,
    });
    log.info({ sitePostId, kind, newId }, 'post regenerated');
    return newId;
  }
}
