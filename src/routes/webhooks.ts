import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { supabaseAdmin } from '../lib/supabase';
import { logger } from '../lib/logger';
import { handleStkCallback } from '../services/mpesa';

const router = Router();

async function recordEvent(provider: string, eventType: string, payload: unknown) {
  await supabaseAdmin
    .from('webhook_events')
    .insert({ provider, event_type: eventType, payload })
    .then(({ error }) => {
      if (error) logger.warn({ err: error }, 'webhook_events insert failed');
    });
}

/**
 * M-Pesa Daraja STK callback. Always answer 200 with the ResultCode envelope
 * Safaricom expects, so it does not retry indefinitely; processing failures are
 * logged for reconciliation.
 */
router.post(
  '/mpesa',
  asyncHandler(async (req, res) => {
    await recordEvent('mpesa', 'stk_callback', req.body);
    try {
      const out = await handleStkCallback(req.body);
      logger.info({ out }, 'M-Pesa callback processed');
    } catch (err) {
      logger.error({ err }, 'M-Pesa callback processing failed');
    }
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  }),
);

/**
 * TextSMS delivery report callback. Matches by provider message id and updates
 * recipient + log delivery status. Payload field names vary, so we probe.
 */
router.post(
  '/sms-dlr',
  asyncHandler(async (req, res) => {
    const b = req.body ?? {};
    await recordEvent('textsms', 'delivery_report', b);

    const providerMessageId = String(
      b.messageid ?? b.messageId ?? b.message_id ?? b.provider_ref ?? '',
    );
    const rawStatus = String(b.dlrstatus ?? b.status ?? b.deliverystatus ?? '').toLowerCase();
    const delivered = ['1', 'delivered', 'dlvrd', 'success'].includes(rawStatus);
    const failed = ['failed', 'undelivered', 'rejected', 'expired', '5', '16'].includes(rawStatus);

    if (providerMessageId && (delivered || failed)) {
      const status = delivered ? 'delivered' : 'failed';
      const nowIso = new Date().toISOString();

      await supabaseAdmin
        .from('sms_recipients')
        .update({
          status,
          delivered_at: delivered ? nowIso : null,
          error_message: failed ? rawStatus : null,
        })
        .eq('provider_message_id', providerMessageId);

      await supabaseAdmin
        .from('sms_logs')
        .update({ status })
        .eq('provider_ref', providerMessageId);
    }

    res.json({ success: true });
  }),
);

export { router as webhooksRouter };
