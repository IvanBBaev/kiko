import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type Anthropic from '@anthropic-ai/sdk';
import type { NewsItem } from '../db/schema.js';
import type { StoryCluster } from '../core/types.js';
import { ClaudeSynthesizer, formatClustersForPrompt, SYNTHESIS_PROMPT_VERSION } from './synthesizer.js';

function cluster(title: string, source: string, dups: string[] = []): StoryCluster {
  const item = (t: string, s: string): NewsItem => ({
    id: 1,
    title: t,
    source: s,
    url: 'https://example.com/x',
    summary: 'A summary',
    contentHash: '',
    publishedAt: '2026-06-12T07:00:00.000Z',
    fetchedAt: '',
    status: 'new',
  });
  return { primary: item(title, source), duplicates: dups.map((s) => item(title, s)) };
}

function fakeClient(response: Record<string, unknown>): () => Anthropic {
  const client = { messages: { parse: async () => response } } as unknown as Anthropic;
  return () => client;
}

const okUsage = { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const parsedPost = { title: 'T', slug: 't', summary: 's', body: 'Body [1]' };

describe('formatClustersForPrompt', () => {
  it('numbers stories, includes date and multi-source coverage, omits URLs', () => {
    const prompt = formatClustersForPrompt([cluster('Big story', 'OpenAI', ['The Verge'])]);
    assert.match(prompt, /\[1\] Big story \(OpenAI; also covered by: The Verge, 2026-06-12\)/);
    assert.match(prompt, /Today is \d{4}-\d{2}-\d{2}\./);
    assert.doesNotMatch(prompt, /https:\/\//);
  });
});

describe('ClaudeSynthesizer', () => {
  it('returns post, usage and prompt version on success', async () => {
    const synth = new ClaudeSynthesizer(
      fakeClient({ stop_reason: 'end_turn', parsed_output: parsedPost, usage: okUsage }),
    );
    const result = await synth.synthesize([cluster('A story', 'OpenAI')]);
    assert.equal(result.post.title, 'T');
    assert.equal(result.usage.inputTokens, 100);
    assert.equal(result.promptVersion, SYNTHESIS_PROMPT_VERSION);
  });

  it('throws on refusal', async () => {
    const synth = new ClaudeSynthesizer(fakeClient({ stop_reason: 'refusal', parsed_output: null, usage: okUsage }));
    await assert.rejects(() => synth.synthesize([cluster('A', 'B')]), /refused/);
  });

  it('throws on max_tokens truncation', async () => {
    const synth = new ClaudeSynthesizer(fakeClient({ stop_reason: 'max_tokens', parsed_output: null, usage: okUsage }));
    await assert.rejects(() => synth.synthesize([cluster('A', 'B')]), /max_tokens/);
  });

  it('throws when output is unparseable', async () => {
    const synth = new ClaudeSynthesizer(fakeClient({ stop_reason: 'end_turn', parsed_output: null, usage: okUsage }));
    await assert.rejects(() => synth.synthesize([cluster('A', 'B')]), /no parseable output/);
  });
});
