import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { AuthedRequest } from '../middleware/types';
import { env } from '../config/env';
import { createAndSendCampaign, getCampaign } from '../services/campaign';
import { getWallet } from '../services/wallet';
import { textSms } from '../services/textsms';

const router = Router();
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
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = sendSchema.parse(req.body);
    const recipients =
      body.recipients ?? (Array.isArray(body.to) ? body.to : body.to ? [body.to] : []);

    const result = await createAndSendCampaign({
      tenantId: req.auth!.tenantId,
      name: body.campaign_name ?? '',
      message: body.message,
      sender: body.sender ?? body.sender_id ?? env.sms.defaultShortcode,
      recipients,
      scheduledAt: body.scheduled_at ?? null,
      createdBy: req.auth!.userId,
    });
    res.status(201).json(result);
  }),
);

router.get(
  '/status/:campaignId',
  asyncHandler(async (req: AuthedRequest, res) => {
    const campaign = await getCampaign(req.auth!.tenantId, String(req.params.campaignId));
    res.json({ campaign });
  }),
);

router.get(
  '/balance',
  asyncHandler(async (req: AuthedRequest, res) => {
    const wallet = await getWallet(req.auth!.tenantId);
    const provider = await textSms.getBalance();
    res.json({ wallet, provider });
  }),
);

export { router as smsRouter };
