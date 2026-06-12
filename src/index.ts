import { config } from './config.js';
import { pipeline, runsRepo } from './container.js';
import { sqlite } from './db/client.js';
import { hasAnthropicCredentials } from './llm/client.js';
import { buildApp } from './server/app.js';
import { startScheduler } from './scheduler.js';

const app = await buildApp();
const job = startScheduler(app.log);

if (config.pipeline.scheduleEnabled && !hasAnthropicCredentials()) {
  app.log.warn(
    'Scheduler is enabled but no ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN is set — scheduled runs will fail at synthesis',
  );
}

// Catch-up: if the server was down when cron should have fired, run now
// instead of waiting up to a full day for the next occurrence. The dedupe and
// min-stories guards make a redundant catch-up run cost zero tokens.
if (config.pipeline.scheduleEnabled && config.pipeline.catchUpHours > 0 && hasAnthropicCredentials()) {
  const latest = await runsRepo.latest();
  const threshold = Date.now() - config.pipeline.catchUpHours * 60 * 60 * 1000;
  if (!latest || new Date(latest.startedAt).getTime() < threshold) {
    app.log.info('Last pipeline run is overdue — starting catch-up run');
    void pipeline.run().catch((err) => app.log.error({ err }, 'catch-up pipeline run failed'));
  }
}

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info(`${signal} received — shutting down`);
  job?.stop();
  await app.close();

  // Give an in-flight pipeline run a grace window to finish persisting
  // (LLM calls themselves can be abandoned, but DB writes should land).
  const deadline = Date.now() + 30_000;
  while (pipeline.isRunning() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (pipeline.isRunning()) {
    app.log.warn('Pipeline still running at shutdown deadline — exiting anyway (run will be swept on next boot)');
  }

  sqlite.close(); // clean WAL checkpoint
  process.exit(0);
}
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
