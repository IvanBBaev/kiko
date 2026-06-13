import { config } from './config.js';
import { pipeline, runsRepo } from './container.js';
import { sqlite, sweepInterruptedRuns } from './db/client.js';
import { hasAnthropicCredentials } from './llm/client.js';
import { shouldCatchUp } from './pipeline/catch-up.js';
import { buildApp } from './server/app.js';
import { startScheduler } from './scheduler.js';

const app = await buildApp();

// Server boot: repair any run a crashed process left 'running'. Done here (not
// at db module load) so CLIs that share the database don't touch a live run.
sweepInterruptedRuns();

const job = startScheduler(app.log);

if (config.pipeline.scheduleEnabled && !hasAnthropicCredentials()) {
  app.log.warn(
    'Scheduler is enabled but no ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN is set — scheduled runs will fail at synthesis',
  );
}

// Mutating endpoints (publish/unpublish, draft edit, regenerate, pipeline run)
// are unauthenticated unless API_TOKEN is set. Fine for local/trusted use, but a
// public deploy without it lets anyone rewrite or publish content.
if (!config.apiToken) {
  app.log.warn(
    'API_TOKEN is not set — publish/unpublish/edit/regenerate/pipeline endpoints are UNAUTHENTICATED. Set API_TOKEN before exposing kiko publicly.',
  );
}

// Catch-up: if the server was down (or crashed) when cron should have fired, run
// now instead of waiting up to a full day. Fire when the latest run is overdue
// OR errored — a recent crashed run (just swept above) still owes us a digest.
// Dedupe + the min-stories guard make a redundant catch-up cost zero tokens.
if (config.pipeline.scheduleEnabled && hasAnthropicCredentials()) {
  const latest = await runsRepo.latest();
  if (shouldCatchUp(latest, config.pipeline.catchUpHours, Date.now())) {
    app.log.info({ lastRunStatus: latest?.status ?? null }, 'starting catch-up pipeline run');
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

  // Only checkpoint+close the DB if no run is mid-write — closing under an
  // in-flight write would fail that write. If still running past the deadline,
  // leave the DB open and let the process exit; the run is swept next boot.
  if (pipeline.isRunning()) {
    app.log.warn('Pipeline still running at shutdown deadline — leaving DB open, exiting (run swept next boot)');
  } else {
    sqlite.close(); // clean WAL checkpoint
  }
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
