import pino from 'pino';
import { env } from '../config/env.js';

// pino-pretty runs as a worker-thread transport, which crashes in serverless
// bundles (Vercel) — a common cause of FUNCTION_INVOCATION_FAILED. Only enable
// it for genuine local development; never on Vercel or in production.
const usePretty = !env.isProd && !process.env.VERCEL;

export const logger = pino({
  level: env.logLevel,
  base: { service: env.serviceName },
  ...(usePretty
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : {}),
});
