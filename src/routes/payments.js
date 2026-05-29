import express from 'express';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { ApiError } from '../lib/apiError.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { initiateStkPush } from '../services/mpesa.js';

const router = express.Router();
router.use(authenticate);

const topupSchema = z.object({
  phone: z.string().min(9),
  amount: z.number().int().positive().max(150000),
});

/** Start an M-Pesa STK push to buy SMS credits. */
router.post(
  '/mpesa/stk',
  asyncHandler(async (req, res) => {
    const body = topupSchema.parse(req.body);
    const result = await initiateStkPush({
      tenantId: req.auth.tenantId,
      phone: body.phone,
      amount: body.amount,
      accountReference: 'SMS',
    });
    res.status(202).json(result);
  }),
);

/** Poll the status of a top-up transaction. */
router.get(
  '/mpesa/:checkoutRequestId',
  asyncHandler(async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from('mobile_money_transactions')
      .select('checkout_request_id, amount, status, result_desc, mpesa_receipt_number, created_at, updated_at')
      .eq('tenant_id', req.auth.tenantId)
      .eq('checkout_request_id', String(req.params.checkoutRequestId))
      .maybeSingle();
    if (error) throw new ApiError(500, 'txn_read_failed', error.message);
    if (!data) throw new ApiError(404, 'txn_not_found', 'Transaction not found');
    res.json({ transaction: data });
  }),
);

export { router as paymentsRouter };
