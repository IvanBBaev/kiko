// End-to-end pipeline test with fake ports and a real in-memory DB.
// Env must be set BEFORE the db modules are imported — hence dynamic imports.
process.env.DB_PATH = ':memory:';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { NewsSource, PostGenerator } from '../core/ports.js';
import type { FetchedItem, SynthesisOutcome, UsageTotals } from '../core/types.js';

const { db } = await import('../db/client.js');
const { newsItems, posts, runs } = await import('../db/schema.js');
const { NewsRepository } = await import('../db/news-repository.js');
const { PostsRepository } = await import('../db/posts-repository.js');
const { RunsRepository } = await import('../db/runs-repository.js');
const { Pipeline } = await import('./pipeline.js');

const usage = (input: number, output: number): UsageTotals => ({
  inputTokens: input,
  outputTokens: output,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
});

// Titles must be genuinely dissimilar — similar fixtures cluster into one story.
const TITLES = [
  'OpenAI launches new reasoning model for developers',
  'EU passes sweeping artificial intelligence regulation framework',
  'Quantum chip breakthrough announced by university research lab',
];

function fetchedItem(n: number): FetchedItem {
  return {
    source: 'fake',
    title: TITLES[n - 1] ?? `Unrelated headline ${n} entirely`,
    url: `https://example.com/story-${n}`,
    summary: `Summary ${n}`,
    contentHash: `hash-${n}`,
    publishedAt: new Date().toISOString(),
  };
}

function fakeSource(items: FetchedItem[]): NewsSource {
  return { name: 'fake', fetch: async () => items };
}

const fakeSynthesizer = {
  async synthesize(): Promise<SynthesisOutcome> {
    return {
      post: { title: 'Digest', slug: 'digest', summary: 'sum', body: 'body [1]', topics: ['models'] },
      usage: usage(1000, 500),
      promptVersion: 'test-v1',
    };
  },
};

function okGenerator(kind: string): PostGenerator {
  return {
    kind,
    generate: async (synthesis) => ({
      kind,
      title: synthesis.post.title,
      slug: kind === 'site' ? synthesis.post.slug : null,
      summary: null,
      body: synthesis.post.body,
      firstComment: null,
      hashtags: null,
      topics: kind === 'site' ? synthesis.post.topics : null,
      usage: kind === 'site' ? synthesis.usage : usage(200, 100),
      promptVersion: synthesis.promptVersion,
    }),
  };
}

const failingGenerator: PostGenerator = {
  kind: 'broken',
  generate: async () => {
    throw new Error('boom');
  },
};

function makePipeline(
  sources: NewsSource[],
  generators: PostGenerator[],
  minItems = 2,
  synthesisMode: 'none' | 'local' | 'anthropic' = 'anthropic',
) {
  return new Pipeline({
    listSources: async () => sources.map((source, i) => ({ id: i + 1, source })),
    onSourceResult: async () => {},
    synthesizer: fakeSynthesizer,
    generators,
    newsRepo: new NewsRepository(),
    postsRepo: new PostsRepository(),
    runsRepo: new RunsRepository(),
    options: {
      maxItemAgeDays: 3,
      maxItemsPerDigest: 10,
      minItemsPerDigest: minItems,
      itemSummaryMaxChars: 400,
      fetchConcurrency: 8,
      candidatePoolMultiplier: 2,
      synthesisMode,
      model: 'fake-model',
    },
  });
}

async function resetDb() {
  await db.delete(posts);
  await db.delete(newsItems);
  await db.delete(runs);
}

describe('Pipeline', () => {
  it('ingest dedupes across runs', async () => {
    await resetDb();
    const pipeline = makePipeline([fakeSource([fetchedItem(1), fetchedItem(2)])], [okGenerator('site')]);
    const first = await pipeline.ingest();
    assert.equal(first.itemsNew, 2);
    const second = await pipeline.ingest();
    assert.equal(second.itemsNew, 0);
  });

  it('skips the run (no synthesis) below the min-stories guard', async () => {
    await resetDb();
    const pipeline = makePipeline([fakeSource([fetchedItem(1)])], [okGenerator('site')], 3);
    const result = await pipeline.run();
    assert.equal(result.status, 'skipped');
    assert.equal(result.postsCreated, 0);
    const allPosts = await db.select().from(posts);
    assert.equal(allPosts.length, 0);
  });

  it('full ok run: posts persisted, items digested, tokens recorded on the run', async () => {
    await resetDb();
    const pipeline = makePipeline(
      [fakeSource([fetchedItem(1), fetchedItem(2), fetchedItem(3)])],
      [okGenerator('site'), okGenerator('linkedin')],
    );
    const result = await pipeline.run();
    assert.equal(result.status, 'ok');
    assert.equal(result.postsCreated, 2);

    const allPosts = await db.select().from(posts);
    assert.equal(allPosts.length, 2);
    assert.ok(
      allPosts.every((p) => p.sources !== null),
      'posts carry the [n] citation source mapping',
    );

    const pending = await new NewsRepository().selectPending(100);
    assert.equal(pending.length, 0, 'items are marked digested');

    const [run] = await db.select().from(runs);
    assert.equal(run!.status, 'ok');
    assert.equal(run!.inputTokens, 1200);
    assert.equal(run!.outputTokens, 600);
  });

  it('one failing generator yields a partial run, others still publish', async () => {
    await resetDb();
    const pipeline = makePipeline(
      [fakeSource([fetchedItem(1), fetchedItem(2), fetchedItem(3)])],
      [okGenerator('site'), failingGenerator],
    );
    const result = await pipeline.run();
    assert.equal(result.status, 'partial');
    assert.equal(result.postsCreated, 1);

    const [run] = await db.select().from(runs);
    assert.equal(run!.status, 'partial');
    assert.match(run!.error ?? '', /broken: boom/);
  });

  it('a failing source is skipped, not fatal', async () => {
    await resetDb();
    const broken: NewsSource = {
      name: 'broken',
      fetch: async () => {
        throw new Error('feed down');
      },
    };
    const pipeline = makePipeline([broken, fakeSource([fetchedItem(1)])], [okGenerator('site')]);
    const result = await pipeline.ingest();
    assert.equal(result.itemsNew, 1);
  });

  it('regenerate creates a new channel post from an existing site post', async () => {
    await resetDb();
    const pipeline = makePipeline(
      [fakeSource([fetchedItem(1), fetchedItem(2), fetchedItem(3)])],
      [okGenerator('site'), okGenerator('linkedin')],
    );
    await pipeline.run();

    const sitePost = (await db.select().from(posts)).find((p) => p.kind === 'site');
    assert.ok(sitePost);

    const newId = await pipeline.regenerate(sitePost.id, 'linkedin');
    assert.ok(newId !== null && newId > 0);

    const all = await db.select().from(posts);
    assert.equal(all.filter((p) => p.kind === 'linkedin').length, 2);
  });

  it('regenerate returns null for a missing or non-site post', async () => {
    await resetDb();
    const pipeline = makePipeline([fakeSource([])], [okGenerator('site'), okGenerator('linkedin')]);
    assert.equal(await pipeline.regenerate(9999, 'linkedin'), null);
  });

  it('site (primary) generator failure errors the run, keeps items new, records synthesis tokens', async () => {
    await resetDb();
    const failingSite: PostGenerator = {
      kind: 'site',
      generate: async () => {
        throw new Error('boom');
      },
    };
    const pipeline = makePipeline(
      [fakeSource([fetchedItem(1), fetchedItem(2), fetchedItem(3)])],
      [failingSite, okGenerator('linkedin')],
    );
    await assert.rejects(() => pipeline.run(), /site: boom/);

    // The digest never persisted, so items must stay 'new' for a retry.
    const pending = await new NewsRepository().selectPending(100);
    assert.ok(pending.length >= 3, 'items stay new so the digest is retried');
    const allPosts = await db.select().from(posts);
    assert.equal(allPosts.length, 0, 'no post persisted and linkedin never ran');

    // The already-paid synthesis spend is recorded on the error run.
    const [run] = await db.select().from(runs);
    assert.equal(run!.status, 'error');
    assert.equal(run!.inputTokens, 1000);
    assert.equal(run!.outputTokens, 500);
  });

  it('commitDigest is atomic: items are digested exactly when the site post exists', async () => {
    await resetDb();
    const pipeline = makePipeline(
      [fakeSource([fetchedItem(1), fetchedItem(2), fetchedItem(3)])],
      [okGenerator('site')],
    );
    await pipeline.run();
    const sitePosts = (await db.select().from(posts)).filter((p) => p.kind === 'site');
    assert.equal(sitePosts.length, 1);
    const pending = await new NewsRepository().selectPending(100);
    assert.equal(pending.length, 0);
  });

  it('SYNTHESIS_MODE=none ingests but never synthesizes (raw items stay new)', async () => {
    await resetDb();
    const pipeline = makePipeline(
      [fakeSource([fetchedItem(1), fetchedItem(2), fetchedItem(3)])],
      [okGenerator('site')],
      2,
      'none',
    );
    const result = await pipeline.run();
    assert.equal(result.status, 'skipped');
    assert.equal(result.postsCreated, 0);
    assert.equal((await db.select().from(posts)).length, 0, 'no digest produced');
    const pending = await new NewsRepository().selectPending(100);
    assert.ok(pending.length >= 3, 'items stay new — served raw via /api/news');
  });

  it('SYNTHESIS_MODE=local is rejected as not implemented', async () => {
    await resetDb();
    const pipeline = makePipeline([fakeSource([fetchedItem(1)])], [okGenerator('site')], 2, 'local');
    await assert.rejects(() => pipeline.run(), /not implemented/);
  });
});
