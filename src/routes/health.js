import express from 'express';
import { env } from '../config/env.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = express.Router();

router.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: env.serviceName,
    env: env.nodeEnv,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

/** Readiness: verifies DB connectivity and reports integration modes. */
router.get(
  '/ready',
  asyncHandler(async (_req, res) => {
    const { error } = await supabaseAdmin.from('tenants').select('id').limit(1);
    const dbOk = !error;
    res.status(dbOk ? 200 : 503).json({
      status: dbOk ? 'ready' : 'degraded',
      checks: {
        database: dbOk ? 'ok' : 'fail',
        service_role: env.hasServiceKey ? 'configured' : 'MISSING',
        sms_mode: env.sms.dryRun || !env.sms.apiKey ? 'dry_run' : 'live',
        mpesa_mode: env.mpesa.dryRun || !env.mpesa.consumerKey ? 'dry_run' : env.mpesa.env,
      },
      timestamp: new Date().toISOString(),
    });
  }),
);

export { router as healthRouter };
