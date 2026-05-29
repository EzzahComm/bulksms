import express from 'express';
import { z } from 'zod';
import { authenticate, requireStaff } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { createAndSendCampaign, listCampaigns, getCampaign } from '../services/campaign.js';

const router = express.Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const campaigns = await listCampaigns(req.auth.tenantId, limit, offset);
    res.json({ campaigns });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const campaign = await getCampaign(req.auth.tenantId, String(req.params.id));
    res.json({ campaign });
  }),
);

const createSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  message: z.string().min(1).max(2000),
  sender: z.string().min(1),
  recipients: z.array(z.string()).min(1).max(50000),
  scheduled_at: z.string().datetime().optional().nullable(),
});

router.post(
  '/',
  requireStaff,
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const result = await createAndSendCampaign({
      tenantId: req.auth.tenantId,
      name: body.name ?? '',
      message: body.message,
      sender: body.sender,
      recipients: body.recipients,
      scheduledAt: body.scheduled_at ?? null,
      createdBy: req.auth.userId,
    });
    res.status(201).json(result);
  }),
);

export { router as campaignsRouter };
