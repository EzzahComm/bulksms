import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../middleware/asyncHandler';
import { AuthedRequest } from '../middleware/types';
import { getWallet, listTransactions } from '../services/wallet';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const wallet = await getWallet(req.auth!.tenantId);
    res.json({ wallet });
  }),
);

const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

router.get(
  '/transactions',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { limit, offset } = pageSchema.parse(req.query);
    const transactions = await listTransactions(req.auth!.tenantId, limit, offset);
    res.json({ transactions });
  }),
);

export { router as walletRouter };
