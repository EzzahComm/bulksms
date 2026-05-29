import express from 'express';
import { z } from 'zod';
import { authenticate, requireStaff } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { listSenderIds, createSenderId, setSenderStatus } from '../services/sender.js';

const router = express.Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const senders = await listSenderIds(req.auth.tenantId);
    res.json({ sender_ids: senders });
  }),
);

const createSchema = z.object({
  sender_name: z.string().min(3).max(11),
  description: z.string().max(500).optional(),
});

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = createSchema.parse(req.body);
    const sender = await createSenderId(req.auth.tenantId, body.sender_name, body.description);
    res.status(201).json({ sender_id: sender });
  }),
);

const statusSchema = z.object({
  status: z.enum(['approved', 'rejected', 'suspended']),
  rejection_reason: z.string().max(500).optional(),
});

// Admin/staff approval workflow
router.patch(
  '/:id/status',
  requireStaff,
  asyncHandler(async (req, res) => {
    const body = statusSchema.parse(req.body);
    const updated = await setSenderStatus(
      req.auth.tenantId,
      String(req.params.id),
      body.status,
      req.auth.userId,
      body.rejection_reason,
    );
    res.json({ sender_id: updated });
  }),
);

export { router as sendersRouter };
