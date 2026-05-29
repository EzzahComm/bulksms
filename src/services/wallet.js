import { supabaseAdmin } from '../lib/supabase.js';
import { ApiError } from '../lib/apiError.js';

/**
 * @typedef {'topup'|'sms_debit'|'refund'|'adjustment'} LedgerType
 */

/** Returns the tenant wallet, creating an empty one if it doesn't exist yet. */
export async function getWallet(tenantId) {
  const { data, error } = await supabaseAdmin
    .from('sms_wallets')
    .select('tenant_id, balance_credits, total_topup, total_spent, currency')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (error) throw new ApiError(500, 'wallet_read_failed', error.message);

  if (!data) {
    const { data: created, error: cErr } = await supabaseAdmin
      .from('sms_wallets')
      .insert({ tenant_id: tenantId })
      .select('tenant_id, balance_credits, total_topup, total_spent, currency')
      .single();
    if (cErr) throw new ApiError(500, 'wallet_create_failed', cErr.message);
    return normalize(created);
  }
  return normalize(data);
}

/**
 * Applies a credit ledger entry atomically via the SECURITY DEFINER DB function.
 * For 'sms_debit' pass a positive credit amount; the function negates it and
 * rejects the entry if it would overdraw the wallet. Returns the ledger row id.
 *
 * @param {{ tenantId: string, credits: number, type: LedgerType, reference?: string, description?: string, campaignId?: string, paymentId?: string }} opts
 * @returns {Promise<string>}
 */
export async function applyLedger(opts) {
  const { data, error } = await supabaseAdmin.rpc('sms_debit_wallet', {
    p_tenant_id: opts.tenantId,
    p_credits: opts.credits,
    p_type: opts.type,
    p_reference: opts.reference ?? null,
    p_description: opts.description ?? null,
    p_campaign_id: opts.campaignId ?? null,
    p_payment_id: opts.paymentId ?? null,
  });

  if (error) {
    if (error.message.includes('INSUFFICIENT_CREDITS')) {
      throw new ApiError(402, 'insufficient_credits', 'Insufficient SMS credits');
    }
    throw new ApiError(500, 'ledger_failed', error.message);
  }
  return data;
}

export async function listTransactions(tenantId, limit = 50, offset = 0) {
  const { data, error } = await supabaseAdmin
    .from('sms_credit_transactions')
    .select('id, type, credits_delta, balance_after, amount, reference, description, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new ApiError(500, 'tx_read_failed', error.message);
  return data;
}

function normalize(row) {
  return {
    tenant_id: row.tenant_id,
    balance_credits: Number(row.balance_credits),
    total_topup: Number(row.total_topup),
    total_spent: Number(row.total_spent),
    currency: row.currency ?? 'KES',
  };
}
