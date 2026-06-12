import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import { config } from '../config.js';
import { log } from '../log.js';
import { registerRoutes } from './routes.js';

export async function buildApp(options: { logger?: boolean } = {}): Promise<FastifyInstance> {
  // One root pino instance for the whole process — HTTP gets a child of it
  // (silenced in tests). Cast: fastify's logger generic specializes the
  // instance type, but downstream code only needs the base FastifyInstance.
  const loggerInstance = log.child({ module: 'http' }, options.logger === false ? { level: 'silent' } : {});
  const app = Fastify({ loggerInstance }) as unknown as FastifyInstance;

  // Unified error shape: { error, statusCode } for validation errors,
  // uncaught handler errors, and 404s alike.
  app.setErrorHandler((err: FastifyError, req, reply) => {
    const statusCode = err.statusCode ?? 500;
    if (statusCode >= 500) req.log.error({ err }, 'request failed');
    void reply.code(statusCode).send({ error: err.message || 'internal server error', statusCode });
  });
  app.setNotFoundHandler((_req, reply) => {
    void reply.code(404).send({ error: 'not found', statusCode: 404 });
  });

  await app.register(helmet, { global: true });
  await app.register(rateLimit, { max: config.rateLimitMax, timeWindow: '1 minute' });
  await app.register(cors, { origin: config.corsOrigins });

  // OpenAPI spec generated from the route schemas — the site team's contract.
  await app.register(swagger, {
    openapi: {
      info: { title: 'kiko API', description: 'AI news digests and channel posts', version: '0.1.0' },
    },
  });

  await registerRoutes(app);

  app.get('/openapi.json', { schema: { hide: true } }, async () => app.swagger());

  return app;
}
