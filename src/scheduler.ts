import { Cron } from 'croner';
import { config } from './config.js';
import { pipeline } from './container.js';

let job: Cron | null = null;

/** Next scheduled pipeline fire time, for /health introspection. */
export function nextScheduledRun(): string | null {
  return job?.nextRun()?.toISOString() ?? null;
}

export function startScheduler(log: {
  info: (msg: string) => void;
  error: (obj: unknown, msg: string) => void;
}): Cron | null {
  if (!config.pipeline.scheduleEnabled) {
    log.info('Pipeline scheduler disabled (PIPELINE_SCHEDULE_ENABLED=false)');
    return null;
  }

  job = new Cron(
    config.pipeline.cron,
    { protect: true, ...(config.pipeline.timezone ? { timezone: config.pipeline.timezone } : {}) },
    async () => {
      if (pipeline.isRunning()) return;
      try {
        const result = await pipeline.run();
        log.info(`Scheduled pipeline run #${result.runId} finished: ${result.status}`);
      } catch (err) {
        log.error(err, 'Scheduled pipeline run failed');
      }
    },
  );

  log.info(`Pipeline scheduled: "${config.pipeline.cron}" (next: ${job.nextRun()?.toISOString() ?? 'n/a'})`);
  return job;
}
