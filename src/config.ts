// Load .env if present (Node >= 20.12)
try {
  process.loadEnvFile();
} catch {
  // no .env file — rely on the real environment
}

/**
 * Strict integer env parsing: a present-but-invalid value is a config error, not
 * a silent default. Rejects non-integers and anything below `min` (default 0) —
 * every numeric knob here is a non-negative count/limit/port.
 */
export function int(name: string, value: string | undefined, fallback: number, min = 0): number {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isInteger(n)) {
    throw new Error(`Invalid ${name}: "${value}" is not an integer`);
  }
  if (n < min) {
    throw new Error(`Invalid ${name}: ${n} is below the minimum ${min}`);
  }
  return n;
}

const TRUE_VALUES = new Set(['true', '1', 'yes', 'on']);
const FALSE_VALUES = new Set(['false', '0', 'no', 'off']);

/**
 * Strict boolean env parsing: recognized truthy/falsy spellings only (case-
 * insensitive). An unrecognized value (e.g. "TRUE" once was, "maybe") is a config
 * error rather than a silent `false` that disables a feature the operator meant on.
 */
export function bool(name: string, value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  const v = value.trim().toLowerCase();
  if (TRUE_VALUES.has(v)) return true;
  if (FALSE_VALUES.has(v)) return false;
  throw new Error(`Invalid ${name}: "${value}" is not a boolean (use true/false/1/0/yes/no/on/off)`);
}

/**
 * Strict enum env parsing: the value must be one of `allowed`, else a config
 * error at boot rather than a confusing failure later (e.g. an invalid log level
 * reaching pino, or an effort the model API rejects mid-run).
 */
export function oneOf<T extends string>(
  name: string,
  value: string | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  if (value === undefined || value === '') return fallback;
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(`Invalid ${name}: "${value}" — expected one of: ${allowed.join(', ')}`);
}

export type Effort = 'low' | 'medium' | 'high' | 'max';

const EFFORTS = ['low', 'medium', 'high', 'max'] as const;
const effort = oneOf('LLM_EFFORT', process.env.LLM_EFFORT, EFFORTS, 'high');

const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'] as const;

const baseLanguage = process.env.POSTS_LANGUAGE ?? 'en';

export const config = {
  port: int('PORT', process.env.PORT, 3000, 1),
  dbPath: process.env.DB_PATH ?? './data/kiko.db',
  logLevel: oneOf('LOG_LEVEL', process.env.LOG_LEVEL, LOG_LEVELS, 'info'),

  /** When set, mutating endpoints require "Authorization: Bearer <token>". */
  apiToken: process.env.API_TOKEN || null,

  /** Comma-separated allowed origins for CORS; unset = allow any origin. */
  corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim()) : true,

  /** Max requests per minute per client IP. */
  rateLimitMax: int('RATE_LIMIT_MAX', process.env.RATE_LIMIT_MAX, 120),

  /** Trust X-Forwarded-* — enable only when actually behind a reverse proxy. */
  trustProxy: bool('TRUST_PROXY', process.env.TRUST_PROXY, false),

  /** When set, run failures and published posts are POSTed here as JSON events. */
  webhookUrl: process.env.WEBHOOK_URL || null,

  /** Public site base URL — used for links in /feed.xml. */
  publicSiteUrl: (process.env.PUBLIC_SITE_URL ?? '').replace(/\/$/, '') || null,

  pipeline: {
    cron: process.env.PIPELINE_CRON ?? '0 7 * * *',
    /** IANA timezone for the cron schedule; defaults to server-local time. */
    timezone: process.env.PIPELINE_TZ || null,
    scheduleEnabled: bool('PIPELINE_SCHEDULE_ENABLED', process.env.PIPELINE_SCHEDULE_ENABLED, true),
    /** Run on boot if the last run is older than this (hours). 0 disables catch-up. */
    catchUpHours: int('CATCH_UP_HOURS', process.env.CATCH_UP_HOURS, 26),
    maxItemAgeDays: int('MAX_ITEM_AGE_DAYS', process.env.MAX_ITEM_AGE_DAYS, 3, 1),
    maxItemsPerDigest: int('MAX_ITEMS_PER_DIGEST', process.env.MAX_ITEMS_PER_DIGEST, 15, 1),
    minItemsPerDigest: int('MIN_ITEMS_PER_DIGEST', process.env.MIN_ITEMS_PER_DIGEST, 3, 1),
    itemSummaryMaxChars: int('ITEM_SUMMARY_MAX_CHARS', process.env.ITEM_SUMMARY_MAX_CHARS, 400, 1),
  },

  llm: {
    model: process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-8',
    effort,
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

// A digest needs at least min stories before it's worth synthesizing, so the
// min must not exceed the max — otherwise every run silently skips.
if (config.pipeline.minItemsPerDigest > config.pipeline.maxItemsPerDigest) {
  throw new Error(
    `Invalid config: MIN_ITEMS_PER_DIGEST (${config.pipeline.minItemsPerDigest}) > MAX_ITEMS_PER_DIGEST (${config.pipeline.maxItemsPerDigest})`,
  );
}
