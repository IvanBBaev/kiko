// Load .env if present (Node >= 20.12)
try {
  process.loadEnvFile();
} catch {
  // no .env file — rely on the real environment
}

/** Strict: a present-but-invalid numeric env var is a config error, not a silent default. */
function int(name: string, value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid ${name}: "${value}" is not a number`);
  }
  return n;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value === 'true' || value === '1';
}

export type Effort = 'low' | 'medium' | 'high' | 'max';

const VALID_EFFORTS: readonly string[] = ['low', 'medium', 'high', 'max'];
const effort = process.env.LLM_EFFORT ?? 'high';
if (!VALID_EFFORTS.includes(effort)) {
  throw new Error(`Invalid LLM_EFFORT "${effort}" — expected one of: ${VALID_EFFORTS.join(', ')}`);
}

const baseLanguage = process.env.POSTS_LANGUAGE ?? 'en';

export const config = {
  port: int('PORT', process.env.PORT, 3000),
  dbPath: process.env.DB_PATH ?? './data/kiko.db',
  logLevel: process.env.LOG_LEVEL ?? 'info',

  /** When set, mutating endpoints require "Authorization: Bearer <token>". */
  apiToken: process.env.API_TOKEN || null,

  /** Comma-separated allowed origins for CORS; unset = allow any origin. */
  corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim()) : true,

  /** Max requests per minute per client IP. */
  rateLimitMax: int('RATE_LIMIT_MAX', process.env.RATE_LIMIT_MAX, 120),

  /** When set, run failures and published posts are POSTed here as JSON events. */
  webhookUrl: process.env.WEBHOOK_URL || null,

  /** Public site base URL — used for links in /feed.xml. */
  publicSiteUrl: (process.env.PUBLIC_SITE_URL ?? '').replace(/\/$/, '') || null,

  pipeline: {
    cron: process.env.PIPELINE_CRON ?? '0 7 * * *',
    /** IANA timezone for the cron schedule; defaults to server-local time. */
    timezone: process.env.PIPELINE_TZ || null,
    scheduleEnabled: bool(process.env.PIPELINE_SCHEDULE_ENABLED, true),
    /** Run on boot if the last run is older than this (hours). 0 disables catch-up. */
    catchUpHours: int('CATCH_UP_HOURS', process.env.CATCH_UP_HOURS, 26),
    maxItemAgeDays: int('MAX_ITEM_AGE_DAYS', process.env.MAX_ITEM_AGE_DAYS, 3),
    maxItemsPerDigest: int('MAX_ITEMS_PER_DIGEST', process.env.MAX_ITEMS_PER_DIGEST, 15),
    minItemsPerDigest: int('MIN_ITEMS_PER_DIGEST', process.env.MIN_ITEMS_PER_DIGEST, 3),
    itemSummaryMaxChars: int('ITEM_SUMMARY_MAX_CHARS', process.env.ITEM_SUMMARY_MAX_CHARS, 400),
  },

  llm: {
    model: process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-8',
    effort: effort as Effort,
    // Adaptive-thinking tokens count toward max_tokens — keep generous headroom.
    maxOutputTokens: int('LLM_MAX_OUTPUT_TOKENS', process.env.LLM_MAX_OUTPUT_TOKENS, 16000),
    /** Per-request timeout; synthesis with adaptive thinking can run minutes. */
    timeoutMs: int('LLM_TIMEOUT_MS', process.env.LLM_TIMEOUT_MS, 600_000),
    maxRetries: int('LLM_MAX_RETRIES', process.env.LLM_MAX_RETRIES, 3),
  },

  /** Output language per channel; falls back to POSTS_LANGUAGE, then English. */
  languages: {
    site: process.env.SITE_LANGUAGE ?? baseLanguage,
    linkedin: process.env.LINKEDIN_LANGUAGE ?? baseLanguage,
  },
} as const;
