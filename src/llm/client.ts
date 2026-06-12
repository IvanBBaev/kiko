import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

let client: Anthropic | null = null;

/**
 * Lazy singleton — the server must be able to boot (health checks, reading
 * stored posts) without ANTHROPIC_API_KEY; only LLM calls require it.
 * Timeout/retries are explicit: synthesis with adaptive thinking can run
 * minutes, and an unattended cron pipeline should retry transient failures.
 */
export function getAnthropicClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ timeout: config.llm.timeoutMs, maxRetries: config.llm.maxRetries });
  }
  return client;
}

export function hasAnthropicCredentials(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export function extractUsage(usage: Anthropic.Usage): UsageTotals {
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
  };
}
