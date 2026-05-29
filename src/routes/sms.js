import express from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { env } from '../config/env.js';
import { createAndSendCampaign, getCampaign } from '../services/campaign.js';
import { getWallet } from '../services/wallet.js';
import { textSms } from '../services/textsms.js';

const router = express.Router();
router.use(authenticate);

const sendSchema = z.object({
  message: z.string().min(1).max(2000),
  // accept `recipients` or single `to`
  recipients: z.array(z.string()).min(1).max(50000).optional(),
  to: z.union([z.string(), z.array(z.string())]).optional(),
  sender: z.string().optional(),
  sender_id: z.string().optional(),
  campaign_name: z.string().max(200).optional(),
  scheduled_at: z.string().datetime().optional().nullable(),
});

/** Quick send — convenience endpoint for the developer API / single messages. */
router.post(
  '/send',
  asyncHandler(async (req, res) => {
    const body = sendSchema.parse(req.body);
    const recipients =
      body.recipients ?? (Array.isArray(body.to) ? body.to : body.to ? [body.to] : []);

    const result = await createAndSendCampaign({
      tenantId: req.auth.tenantId,
      name: body.campaign_name ?? '',
      message: body.message,
      sender: body.sender ?? body.sender_id ?? env.sms.defaultShortcode,
      recipients,
      scheduledAt: body.scheduled_at ?? null,
      createdBy: req.auth.userId,
    });
    res.status(201).json(result);
  }),
);

router.get(
  '/status/:campaignId',
  asyncHandler(async (req, res) => {
    const campaign = await getCampaign(req.auth.tenantId, String(req.params.campaignId));
    res.json({ campaign });
  }),
);

router.get(
  '/balance',
  asyncHandler(async (req, res) => {
    const wallet = await getWallet(req.auth.tenantId);
    const provider = await textSms.getBalance();
    res.json({ wallet, provider });
  }),
);

export { router as smsRouter };
