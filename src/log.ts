import { pino } from 'pino';
import { config } from './config.js';

/**
 * The single root logger. The HTTP server gets a child of it (see server/app.ts)
 * so pipeline and request logs share one stream, level, and format.
 */
export const log = pino({ name: 'kiko', level: config.logLevel });
