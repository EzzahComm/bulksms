import express, { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import rateLimit from 'express-rate-limit';

import { env } from './config/env';
import { logger } from './lib/logger';
import { notFound, errorHandler } from './middleware/error';

import { healthRouter } from './routes/health';
import { walletRouter } from './routes/wallet';
import { sendersRouter } from './routes/senders';
import { campaignsRouter } from './routes/campaigns';
import { smsRouter } from './routes/sms';
import { paymentsRouter } from './routes/payments';
import { webhooksRouter } from './routes/webhooks';

export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin: env.allowedOrigins.length ? env.allowedOrigins : true,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(pinoHttp({ logger }));

  // Public
  app.use('/health', healthRouter);
  // Provider callbacks (unauthenticated, signature/idempotency handled inside)
  app.use('/webhooks', webhooksRouter);

  // Authenticated API (rate limited)
  const apiLimiter = rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 300,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use('/api', apiLimiter);
  app.use('/api/wallet', walletRouter);
  app.use('/api/sender-ids', sendersRouter);
  app.use('/api/campaigns', campaignsRouter);
  app.use('/api/sms', smsRouter);
  app.use('/api/payments', paymentsRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

if (require.main === module) {
  const app = createApp();
  app.listen(env.port, () => {
    logger.info(
      {
        port: env.port,
        env: env.nodeEnv,
        sms: env.sms.dryRun || !env.sms.apiKey ? 'dry_run' : 'live',
        mpesa: env.mpesa.dryRun || !env.mpesa.consumerKey ? 'dry_run' : env.mpesa.env,
      },
      `${env.serviceName} started`,
    );
  });
}

export default createApp;
