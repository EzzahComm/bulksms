import { ZodError } from 'zod';
import { ApiError } from '../lib/apiError.js';
import { logger } from '../lib/logger.js';

export function notFound(_req, res) {
  res.status(404).json({ error: { code: 'not_found', message: 'Resource not found' } });
}

export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    res.status(422).json({
      error: { code: 'validation_error', message: 'Invalid request', details: err.flatten() },
    });
    return;
  }

  if (err instanceof ApiError) {
    if (err.status >= 500) logger.error({ err }, err.code);
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: { code: 'internal_error', message: 'Internal server error' } });
}
