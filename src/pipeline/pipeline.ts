import { findInvalidCitations } from '../core/citations.js';
import { clusterItemIds, clusterItems } from '../core/cluster.js';
import { pool } from '../core/pool.js';
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
  /** Max feeds fetched concurrently — bounds load when there are many sources. */
  fetchConcurrency: number;
  /** Candidate pool = maxItemsPerDigest × this; a wider recency window so the
   *  cluster/LLM editorial pick sees more of the day across many sources. */
  candidatePoolMultiplier: number;
  model: string;
}

/** A source to fetch plus the registry id used to record its health. */
export interface SourceHandle {
  id: number;
  source: NewsSource;
}

export interface PipelineDeps {
  /** Resolve the current enabled sources at run time (data-driven, not static). */
  listSources: () => Promise<SourceHandle[]>;
  /** Report a source's fetch outcome so the registry can track health/auto-disable. */
  onSourceResult: (id: number, ok: boolean, error?: string) => Promise<void>;
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

  /**
   * Fetch every enabled source (failures are skipped, not fatal) and store new
   * items. Sources are resolved at run time from the registry and fetched with
   * bounded concurrency; each source's outcome is reported back so the registry
   * can track health and auto-disable dead feeds.
   */
  async ingest(): Promise<{ itemsFetched: number; itemsNew: number }> {
    const { listSources, onSourceResult, newsRepo, options } = this.deps;
    const handles = await listSources();
    const fetched: FetchedItem[] = [];

    await pool(handles, options.fetchConcurrency, async ({ id, source }) => {
      try {
        const items = await source.fetch({
          maxAgeDays: options.maxItemAgeDays,
          summaryMaxChars: options.itemSummaryMaxChars,
        });
        fetched.push(...items);
        await onSourceResult(id, true);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log.warn({ source: source.name, reason: message }, 'news source failed');
        await onSourceResult(id, false, message);
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

    // Hoisted so the error path can record what the run already did/paid.
    let itemsFetched = 0;
    let itemsNew = 0;
    let synthesisUsage: UsageTotals | null = null;

    try {
      // 1. Ingest
      ({ itemsFetched, itemsNew } = await this.ingest());

      // 2. Select 2x the digest cap — clustering compresses multi-source
      // coverage, so more stories fit the same budget. Stories cut by the cap
      // stay 'new' and roll over to the next run.
      const pending = await newsRepo.selectPending(options.maxItemsPerDigest * options.candidatePoolMultiplier);
      const clusters = clusterItems(pending).slice(0, options.maxItemsPerDigest);

      // Token guard: a digest from 1-2 stories isn't worth an Opus call.
      if (clusters.length < options.minItemsPerDigest) {
        await runsRepo.finish(runId, { status: 'skipped', itemsFetched, itemsNew });
        log.info({ runId, clusters: clusters.length }, 'pipeline run skipped — not enough new stories');
        return { runId, status: 'skipped', itemsFetched, itemsNew, postsCreated: 0 };
      }

      // 3. Synthesize the digest (the expensive call)
      const synthesis = await synthesizer.synthesize(clusters);
      synthesisUsage = synthesis.usage;

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

      // The 'site' post IS the canonical digest; the synthesis usage is attributed
      // to it. Secondary channels (LinkedIn, …) derive from it. The synthesis is
      // already paid, so its cost is the run's baseline regardless of what fails.
      const primary = generators.find((g) => g.kind === 'site') ?? generators[0];
      if (!primary) throw new Error('no post generators registered');

      let inputTokens = synthesis.usage.inputTokens;
      let outputTokens = synthesis.usage.outputTokens;

      // 4a. Persist the canonical digest AND mark items digested atomically. If
      // it fails, items stay 'new' and the whole digest is retried next run —
      // we never mark digested without the digest itself durably stored.
      try {
        const sitePost = await primary.generate(synthesis, clusters);
        await postsRepo.commitDigest(sitePost, { itemIds, sources: sourceRefs, model: options.model });
      } catch (err) {
        throw new Error(`${primary.kind}: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
      }

      // 4b. Secondary output channels — best-effort; a failure yields 'partial'
      // but never re-runs synthesis (the digest is already committed).
      let postsCreated = 1;
      let firstError: string | null = null;
      for (const generator of generators) {
        if (generator === primary) continue;
        try {
          const post = await generator.generate(synthesis, clusters);
          await postsRepo.insert(post, { itemIds, sources: sourceRefs, model: options.model });
          postsCreated++;
          inputTokens += post.usage.inputTokens;
          outputTokens += post.usage.outputTokens;
        } catch (err) {
          firstError ??= `${generator.kind}: ${err instanceof Error ? err.message : String(err)}`;
          log.error({ err, generator: generator.kind }, 'post generator failed');
        }
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
      // Record what the run already did and paid (a successful-but-unpersisted
      // synthesis is real spend that must stay visible), so the error row isn't
      // a bare 0/0 that hides a billed Opus call.
      await runsRepo.finish(runId, {
        status: 'error',
        itemsFetched,
        itemsNew,
        error: message,
        ...(synthesisUsage
          ? { inputTokens: synthesisUsage.inputTokens, outputTokens: synthesisUsage.outputTokens }
          : {}),
      });
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

    // Regeneration derives a secondary channel FROM the digest; regenerating the
    // 'site' digest itself would just duplicate it (and race the unique slug).
    if (kind === 'site') {
      throw new Error('Cannot regenerate kind "site" — it is the canonical digest, not a derived channel');
    }

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
        topics: source.topics ? (JSON.parse(source.topics) as string[]) : [],
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
