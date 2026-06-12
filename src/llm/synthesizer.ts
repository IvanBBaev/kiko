import { createHash } from 'node:crypto';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { config } from '../config.js';
import type { DigestSynthesizer } from '../core/ports.js';
import { SitePostSchema, type StoryCluster, type SynthesisOutcome } from '../core/types.js';
import { extractUsage, getAnthropicClient } from './client.js';

// Token-budget note: this system prompt is well below the minimum cacheable
// prefix for claude-opus-4-8 (4096 tokens), so cache_control would be a no-op.
// If full article bodies ever enter the context, revisit caching.
const SYNTHESIS_SYSTEM_PROMPT = `You are the editor of an AI-news digest site. You receive a numbered list of recent AI news stories (title, source(s), date, short summary) and write ONE digest post.

Grounding rules (strict):
- Use ONLY information present in the provided items. Do not add facts, numbers, names, or context from your own knowledge, even when you are confident.
- Every factual claim must carry an inline reference like [1] or [3] matching the input numbering.
- If an item's summary is too thin to say something substantive, cover it in one cited sentence or skip it — never pad with invented detail.
- If sources appear to conflict, state the conflict explicitly instead of resolving it yourself.
- Mark second-hand or unconfirmed information as such ("reportedly", "according to [2]").

Editorial rules:
- Synthesize, don't enumerate: group items into themes, lead with the most significant development and say why it matters.
- A story listed with multiple sources was independently covered — that's a signal of significance, cite it once.
- Skip items that are pure marketing or not genuinely newsworthy — fewer, stronger sections beat full coverage.
- Audience: technical professionals who follow AI; assume baseline knowledge, skip 101 explanations.

Write the post in language: ${config.languages.site}.`;

/** Short hash of the prompt — stored per post to correlate quality with prompt edits. */
export const SYNTHESIS_PROMPT_VERSION = createHash('sha256').update(SYNTHESIS_SYSTEM_PROMPT).digest('hex').slice(0, 8);

/**
 * Compact, numbered representation of story clusters. One entry per story
 * (not per feed item); extra sources are listed by name. URLs are omitted —
 * the model references stories by number, URLs would only burn input tokens.
 */
export function formatClustersForPrompt(clusters: StoryCluster[]): string {
  const lines = clusters.map((cluster, i) => {
    const { primary, duplicates } = cluster;
    const date = primary.publishedAt ? primary.publishedAt.slice(0, 10) : 'n/a';
    const sources =
      duplicates.length > 0
        ? `${primary.source}; also covered by: ${duplicates.map((d) => d.source).join(', ')}`
        : primary.source;
    const summary = primary.summary ? `\n${primary.summary}` : '';
    return `[${i + 1}] ${primary.title} (${sources}, ${date})${summary}`;
  });
  const today = new Date().toISOString().slice(0, 10);
  return `Today is ${today}.\n\n<news_items>\n${lines.join('\n\n')}\n</news_items>\n\nWrite today's digest post from these items.`;
}

/**
 * Claude-backed digest synthesis — the "expensive" call of the pipeline.
 * Structured output guarantees a parseable result; adaptive thinking lets the
 * model decide how much to reason about grouping/ranking.
 */
export class ClaudeSynthesizer implements DigestSynthesizer {
  // Factory keeps construction lazy (no API key needed at boot) and injectable in tests.
  constructor(private readonly clientFactory: () => ReturnType<typeof getAnthropicClient> = getAnthropicClient) {}

  async synthesize(clusters: StoryCluster[]): Promise<SynthesisOutcome> {
    const client = this.clientFactory();

    const response = await client.messages.parse({
      model: config.llm.model,
      max_tokens: config.llm.maxOutputTokens,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: config.llm.effort,
        format: zodOutputFormat(SitePostSchema),
      },
      system: SYNTHESIS_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: formatClustersForPrompt(clusters) }],
    });

    if (response.stop_reason === 'refusal') {
      throw new Error('Synthesis request was refused by the model');
    }
    if (response.stop_reason === 'max_tokens') {
      throw new Error(
        `Synthesis hit the max_tokens cap (${config.llm.maxOutputTokens}) — output is truncated; raise LLM_MAX_OUTPUT_TOKENS`,
      );
    }
    if (!response.parsed_output) {
      throw new Error(`Synthesis returned no parseable output (stop_reason: ${response.stop_reason})`);
    }

    return {
      post: response.parsed_output,
      usage: extractUsage(response.usage),
      promptVersion: SYNTHESIS_PROMPT_VERSION,
    };
  }
}
