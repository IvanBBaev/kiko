import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type Anthropic from '@anthropic-ai/sdk';
import type { NewsItem } from '../db/schema.js';
import type { StoryCluster, SynthesisOutcome } from '../core/types.js';
import { LinkedInPostGenerator } from './linkedin.js';

const synthesis: SynthesisOutcome = {
  post: { title: 'Digest', slug: 'digest', summary: 'sum', body: 'Body [1]', topics: ['models'] },
  usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  promptVersion: 'synth-v1',
};

const clusters: StoryCluster[] = [
  {
    primary: {
      id: 1,
      title: 'Story',
      source: 'OpenAI',
      url: 'https://example.com/story',
      summary: null,
      contentHash: '',
      publishedAt: null,
      fetchedAt: '',
      status: 'new',
    } satisfies NewsItem,
    duplicates: [],
  },
];

function fakeClient(response: Record<string, unknown>): () => Anthropic {
  const client = { messages: { parse: async () => response } } as unknown as Anthropic;
  return () => client;
}

const okUsage = { input_tokens: 200, output_tokens: 80, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

describe('LinkedInPostGenerator', () => {
  it('maps the parsed output into a GeneratedPost with own usage and prompt version', async () => {
    const generator = new LinkedInPostGenerator(
      fakeClient({
        stop_reason: 'end_turn',
        parsed_output: {
          text: 'Hook\n\nBody #AI',
          hashtags: ['#AI'],
          firstComment: 'Links: [1] https://example.com/story',
        },
        usage: okUsage,
      }),
    );
    const post = await generator.generate(synthesis, clusters);
    assert.equal(post.kind, 'linkedin');
    assert.equal(post.title, 'Digest');
    assert.equal(post.body, 'Hook\n\nBody #AI');
    assert.deepEqual(post.hashtags, ['#AI']);
    assert.equal(post.usage.inputTokens, 200);
    assert.ok(post.promptVersion && post.promptVersion !== 'synth-v1', 'carries its own prompt version');
  });

  it('throws on refusal', async () => {
    const generator = new LinkedInPostGenerator(
      fakeClient({ stop_reason: 'refusal', parsed_output: null, usage: okUsage }),
    );
    await assert.rejects(() => generator.generate(synthesis, clusters), /refused/);
  });

  it('throws on max_tokens truncation', async () => {
    const generator = new LinkedInPostGenerator(
      fakeClient({ stop_reason: 'max_tokens', parsed_output: null, usage: okUsage }),
    );
    await assert.rejects(() => generator.generate(synthesis, clusters), /max_tokens/);
  });
});
