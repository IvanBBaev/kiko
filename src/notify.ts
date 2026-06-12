import { config } from './config.js';
import { log } from './log.js';

/**
 * Fire-and-forget webhook notification (run failures, published posts).
 * No-op unless WEBHOOK_URL is configured. Failures are logged, never thrown —
 * a dead webhook must not break the pipeline.
 */
export function notify(event: string, data: Record<string, unknown>): void {
  if (!config.webhookUrl) return;
  void fetch(config.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, timestamp: new Date().toISOString(), data }),
    signal: AbortSignal.timeout(5_000),
  }).catch((err) => log.warn({ err, event }, 'webhook notification failed'));
}
