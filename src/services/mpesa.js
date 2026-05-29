import axios from 'axios';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { ApiError } from '../lib/apiError.js';
import { normalizeKePhone } from '../lib/phone.js';
import { applyLedger } from './wallet.js';

/**
 * M-Pesa Daraja STK Push (Lipa na M-Pesa Online).
 *
 * Top-up flow:
 *   1. initiateStkPush  -> Safaricom prompts the customer; we persist a
 *      `mobile_money_transactions` row keyed by checkout_request_id.
 *   2. handleStkCallback -> on ResultCode 0 we credit the wallet (ledger
 *      'topup'), record the `payments` row, and link everything.
 *
 * Set MPESA_DRY_RUN=true to simulate STK push without contacting Safaricom.
 */

const base = env.mpesa.baseUrl.replace(/\/$/, '');

let cachedToken = null;

function dryRun() {
  return (
    env.mpesa.dryRun ||
    !env.mpesa.consumerKey ||
    !env.mpesa.consumerSecret ||
    !env.mpesa.shortcode ||
    !env.mpesa.passkey
  );
}

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value;

  const auth = Buffer.from(`${env.mpesa.consumerKey}:${env.mpesa.consumerSecret}`).toString('base64');
  const { data } = await axios.get(`${base}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${auth}` },
    timeout: 15000,
  });
  const token = data.access_token;
  const ttl = Number(data.expires_in ?? 3599) * 1000;
  cachedToken = { value: token, expiresAt: Date.now() + ttl };
  return token;
}

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/** KES amount -> SMS credits (whole credits). */
export function amountToCredits(amount) {
  return Math.floor(amount / env.creditPriceKes);
}

/**
 * @param {{ tenantId: string, phone: string, amount: number, accountReference?: string }} opts
 */
export async function initiateStkPush(opts) {
  const phone = normalizeKePhone(opts.phone);
  if (!phone) throw new ApiError(422, 'invalid_phone', 'Invalid M-Pesa phone number');
  const amount = Math.floor(opts.amount);
  if (!Number.isFinite(amount) || amount < 1) {
    throw new ApiError(422, 'invalid_amount', 'Amount must be at least KES 1');
  }

  const credits = amountToCredits(amount);
  const accountReference = (opts.accountReference || 'EZZAHCOMM').slice(0, 12);
  const transactionDesc = 'SMS credits top-up';

  if (dryRun()) {
    const checkout = `ws_CO_DRY_${Date.now()}`;
    const merchant = `DRY_${Date.now()}`;
    await persistTransaction({
      tenantId: opts.tenantId,
      phone,
      amount,
      accountReference,
      transactionDesc,
      checkoutRequestId: checkout,
      merchantRequestId: merchant,
    });
    return {
      checkout_request_id: checkout,
      merchant_request_id: merchant,
      customer_message: 'DRY RUN — no STK prompt sent. Call /webhooks/mpesa to simulate completion.',
      amount,
      credits,
    };
  }

  const token = await getAccessToken();
  const ts = timestamp();
  const password = Buffer.from(`${env.mpesa.shortcode}${env.mpesa.passkey}${ts}`).toString('base64');

  let data;
  try {
    const resp = await axios.post(
      `${base}/mpesa/stkpush/v1/processrequest`,
      {
        BusinessShortCode: env.mpesa.shortcode,
        Password: password,
        Timestamp: ts,
        TransactionType: env.mpesa.transactionType,
        Amount: amount,
        PartyA: phone,
        PartyB: env.mpesa.shortcode,
        PhoneNumber: phone,
        CallBackURL: env.mpesa.callbackUrl,
        AccountReference: accountReference,
        TransactionDesc: transactionDesc,
      },
      { headers: { Authorization: `Bearer ${token}` }, timeout: 20000 },
    );
    data = resp.data;
  } catch (err) {
    logger.error({ err }, 'STK push request failed');
    const respData = axios.isAxiosError(err) ? err.response?.data : undefined;
    throw new ApiError(502, 'stk_push_failed', 'M-Pesa STK push failed', respData);
  }

  if (String(data.ResponseCode) !== '0') {
    throw new ApiError(502, 'stk_push_rejected', String(data.ResponseDescription ?? 'STK push rejected'), data);
  }

  const checkout = String(data.CheckoutRequestID);
  const merchant = String(data.MerchantRequestID);
  await persistTransaction({
    tenantId: opts.tenantId,
    phone,
    amount,
    accountReference,
    transactionDesc,
    checkoutRequestId: checkout,
    merchantRequestId: merchant,
  });

  return {
    checkout_request_id: checkout,
    merchant_request_id: merchant,
    customer_message: String(data.CustomerMessage ?? 'STK push sent'),
    amount,
    credits,
  };
}

/**
 * Process the Daraja callback. Idempotent: a repeated success callback for an
 * already-completed transaction will not double-credit the wallet.
 */
export async function handleStkCallback(body) {
  const cb = body?.Body?.stkCallback;
  if (!cb) throw new ApiError(400, 'invalid_callback', 'Missing stkCallback');

  const checkoutRequestId = String(cb.CheckoutRequestID);
  const resultCode = String(cb.ResultCode);
  const resultDesc = String(cb.ResultDesc ?? '');

  const { data: txn, error } = await supabaseAdmin
    .from('mobile_money_transactions')
    .select('id, tenant_id, amount, status, phone')
    .eq('checkout_request_id', checkoutRequestId)
    .maybeSingle();

  if (error) throw new ApiError(500, 'txn_read_failed', error.message);
  if (!txn) {
    logger.warn({ checkoutRequestId }, 'Callback for unknown checkout request');
    return { ok: true, credited: false };
  }

  // Idempotency guard
  if (txn.status === 'success') return { ok: true, credited: false };

  if (resultCode !== '0') {
    await supabaseAdmin
      .from('mobile_money_transactions')
      .update({ status: 'failed', result_code: resultCode, result_desc: resultDesc })
      .eq('id', txn.id);
    return { ok: true, credited: false };
  }

  // Extract receipt from CallbackMetadata
  const items = cb.CallbackMetadata?.Item ?? [];
  const meta = Object.fromEntries(items.map((i) => [i.Name, i.Value]));
  const receipt = meta.MpesaReceiptNumber ? String(meta.MpesaReceiptNumber) : null;
  const paidAmount = meta.Amount ? Number(meta.Amount) : Number(txn.amount);

  await supabaseAdmin
    .from('mobile_money_transactions')
    .update({
      status: 'success',
      result_code: resultCode,
      result_desc: resultDesc,
      mpesa_receipt_number: receipt,
    })
    .eq('id', txn.id);

  // Record platform payment row, linked to the mobile money txn
  const { data: payment } = await supabaseAdmin
    .from('payments')
    .insert({
      tenant_id: txn.tenant_id,
      amount: paidAmount,
      currency: 'KES',
      payment_method: 'mpesa',
      mobile_money_transaction_id: txn.id,
      reference: receipt,
      status: 'completed',
      paid_at: new Date().toISOString(),
      notes: 'SMS credits top-up',
    })
    .select('id')
    .single();

  // Credit the wallet
  const credits = amountToCredits(paidAmount);
  await applyLedger({
    tenantId: txn.tenant_id,
    credits,
    type: 'topup',
    reference: receipt ?? checkoutRequestId,
    description: `M-Pesa top-up ${receipt ?? ''} (KES ${paidAmount})`.trim(),
    paymentId: payment?.id,
  });

  logger.info({ tenant: txn.tenant_id, receipt, credits }, 'Wallet topped up via M-Pesa');
  return { ok: true, credited: true };
}

async function persistTransaction(opts) {
  const { error } = await supabaseAdmin.from('mobile_money_transactions').insert({
    tenant_id: opts.tenantId,
    phone: opts.phone,
    amount: opts.amount,
    account_reference: opts.accountReference,
    transaction_desc: opts.transactionDesc,
    checkout_request_id: opts.checkoutRequestId,
    merchant_request_id: opts.merchantRequestId,
    status: 'pending',
  });
  if (error) throw new ApiError(500, 'txn_persist_failed', error.message);
}
