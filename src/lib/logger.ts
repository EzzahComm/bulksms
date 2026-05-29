import pino from 'pino';
import { env } from '../config/env';

export const logger = pino({
  level: env.logLevel,
  base: { service: env.serviceName },
  ...(env.isProd
    ? {}
    : { transport: { target: 'pino-pretty', options: { colorize: true } } }),
});

export type Logger = typeof logger;
