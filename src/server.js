import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import pinoHttp from 'pino-http';
import rateLimit from 'express-rate-limit';

import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { notFound, errorHandler } from './middleware/error.js';

import { healthRouter } from './routes/health.js';
import { walletRouter } from './routes/wallet.js';
import { sendersRouter } from './routes/senders.js';
import { campaignsRouter } from './routes/campaigns.js';
import { smsRouter } from './routes/sms.js';
import { paymentsRouter } from './routes/payments.js';
import { webhooksRouter } from './routes/webhooks.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin: env.allowedOrigins.length ? env.allowedOrigins : true,
      credentials: true,
    }),
  );
  // On Vercel the Node runtime already parses req.body; running Express's
  // parsers there would double-read the (already consumed) stream. Off-Vercel
  // (local, Docker, other Node hosts) we parse here as usual.
  if (!process.env.VERCEL) {
    app.use(express.json({ limit: '15mb' }));
    app.use(express.urlencoded({ extended: true }));
  }
  app.use(pinoHttp({ logger }));

  // Root — service banner (avoids an unmatched-root hang on Vercel)
  app.get('/', (_req, res) => {
    res.json({
      service: env.serviceName,
      status: 'ok',
      docs: 'https://github.com/EzzahComm/bulksms#api',
      health: '/health',
    });
  });

  // Public
  app.use('/health', healthRouter);
  // Provider callbacks (unauthenticated, signature/idempotency handled inside)
  app.use('/webhooks', webhooksRouter);

  // Authenticated API (rate limited)
  const apiLimiter = rateLimit({
    windowMs: env.rateLimitWindowMs,
    max: env.rateLimitMax,
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

// Start the server only when run directly (not when imported).
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
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
