import { supabaseAdmin } from '../lib/supabase.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { ApiError } from '../lib/apiError.js';
import { normalizeKePhone, countSegments } from '../lib/phone.js';
import { resolveApprovedSender } from './sender.js';
import { applyLedger } from './wallet.js';
import { textSms } from './textsms.js';

/**
 * @typedef {Object} SendCampaignInput
 * @property {string} tenantId
 * @property {string} name
 * @property {string} message
 * @property {string} sender         sender_id uuid or sender_name
 * @property {string[]} recipients
 * @property {string|null} [scheduledAt]
 * @property {string} [createdBy]
 */

const INSERT_CHUNK = 500;

/**
 * @param {SendCampaignInput} input
 */
export async function createAndSendCampaign(input) {
  const { tenantId, message } = input;
  const name = input.name?.trim() || `Campaign ${new Date().toISOString()}`;

  if (!message?.trim()) throw new ApiError(422, 'empty_message', 'Message is required');
  if (!input.recipients?.length) {
    throw new ApiError(422, 'no_recipients', 'At least one recipient is required');
  }

  // 1. Normalise + dedupe recipients
  const seen = new Set();
  const valid = [];
  const invalid = [];
  for (const raw of input.recipients) {
    const n = normalizeKePhone(raw);
    if (!n) invalid.push(raw);
    else if (!seen.has(n)) {
      seen.add(n);
      valid.push(n);
    }
  }
  if (valid.length === 0) {
    throw new ApiError(422, 'no_valid_recipients', 'No valid Kenyan phone numbers provided', { invalid });
  }

  // 2. Billing maths
  const segments = countSegments(message);
  const creditsPerMessage = segments * env.creditsPerSegment;
  const creditsEstimated = +(valid.length * creditsPerMessage).toFixed(2);

  // 3. Resolve approved sender
  const sender = await resolveApprovedSender(tenantId, input.sender);

  // 4. Create campaign
  const scheduled =
    !!input.scheduledAt && new Date(input.scheduledAt).getTime() > Date.now() + 60_000;

  const { data: campaign, error: cErr } = await supabaseAdmin
    .from('sms_campaigns')
    .insert({
      tenant_id: tenantId,
      name,
      message,
      sender_id: sender.id,
      status: scheduled ? 'queued' : 'sending',
      recipient_count: valid.length,
      credits_estimated: creditsEstimated,
      scheduled_at: scheduled ? input.scheduledAt : null,
      created_by: input.createdBy ?? null,
      started_at: scheduled ? null : new Date().toISOString(),
    })
    .select('id')
    .single();
  if (cErr || !campaign) throw new ApiError(500, 'campaign_create_failed', cErr?.message ?? 'failed');
  const campaignId = campaign.id;

  // 5. Insert recipient rows (pending)
  await insertRecipients(campaignId, tenantId, valid);

  // 6. Scheduled campaigns stop here — a worker dispatches them later.
  if (scheduled) {
    return result(campaignId, 'queued', input.recipients.length, valid.length, invalid, segments, creditsPerMessage, creditsEstimated, 0, 0, 0, true);
  }

  // 7. Reserve (debit) credits up-front for the whole batch
  try {
    await applyLedger({
      tenantId,
      credits: creditsEstimated,
      type: 'sms_debit',
      reference: campaignId,
      description: `Campaign "${name}" (${valid.length} msg × ${creditsPerMessage} cr)`,
      campaignId,
    });
  } catch (err) {
    await supabaseAdmin
      .from('sms_campaigns')
      .update({ status: 'failed', completed_at: new Date().toISOString() })
      .eq('id', campaignId);
    throw err;
  }

  // 8. Dispatch to provider
  const recipientRows = await loadRecipientIds(campaignId);
  const sendItems = recipientRows.map((r) => ({ phone: r.phone, message, clientRef: r.id }));
  const providerResults = await textSms.sendBulk(sendItems, sender.sender_name);

  // 9. Persist per-recipient outcome + sms_logs
  let sent = 0;
  let failed = 0;
  const nowIso = new Date().toISOString();
  const logRows = [];

  for (const r of providerResults) {
    const recipientId = r.clientRef;
    const ok = r.success;
    if (ok) sent++;
    else failed++;

    await supabaseAdmin
      .from('sms_recipients')
      .update({
        status: ok ? 'sent' : 'failed',
        provider_message_id: r.providerMessageId ?? null,
        credits_charged: ok ? creditsPerMessage : 0,
        error_code: ok ? null : String(r.responseCode ?? 'ERR'),
        error_message: ok ? null : (r.error ?? null),
      })
      .eq('id', recipientId);

    logRows.push({
      tenant_id: tenantId,
      campaign_id: campaignId,
      phone: r.phone,
      message,
      status: ok ? 'sent' : 'failed',
      provider: 'textsms',
      provider_ref: r.providerMessageId ?? null,
      error: ok ? null : (r.error ?? null),
      sent_at: ok ? nowIso : null,
    });
  }
  await insertLogs(logRows);

  // 10. Refund credits for failed sends
  const creditsCharged = +(sent * creditsPerMessage).toFixed(2);
  const refund = +(failed * creditsPerMessage).toFixed(2);
  if (refund > 0) {
    try {
      await applyLedger({
        tenantId,
        credits: refund,
        type: 'refund',
        reference: campaignId,
        description: `Refund ${failed} failed message(s) — campaign "${name}"`,
        campaignId,
      });
    } catch (err) {
      logger.error({ err, campaignId }, 'Refund for failed sends did not apply');
    }
  }

  // 11. Finalise campaign
  const finalStatus = sent === 0 ? 'failed' : 'sent';
  await supabaseAdmin
    .from('sms_campaigns')
    .update({
      status: finalStatus,
      sent_count: sent,
      failed_count: failed,
      credits_used: creditsCharged,
      completed_at: nowIso,
    })
    .eq('id', campaignId);

  return result(campaignId, finalStatus, input.recipients.length, valid.length, invalid, segments, creditsPerMessage, creditsEstimated, creditsCharged, sent, failed, false);
}

export async function listCampaigns(tenantId, limit = 50, offset = 0) {
  const { data, error } = await supabaseAdmin
    .from('sms_campaigns')
    .select('id, name, status, recipient_count, sent_count, failed_count, delivered_count, credits_used, scheduled_at, created_at, completed_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new ApiError(500, 'campaign_read_failed', error.message);
  return data;
}

export async function getCampaign(tenantId, campaignId) {
  const { data, error } = await supabaseAdmin
    .from('sms_campaigns')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', campaignId)
    .maybeSingle();
  if (error) throw new ApiError(500, 'campaign_read_failed', error.message);
  if (!data) throw new ApiError(404, 'campaign_not_found', 'Campaign not found');
  return data;
}

// ---------- helpers ----------

async function insertRecipients(campaignId, tenantId, phones) {
  for (let i = 0; i < phones.length; i += INSERT_CHUNK) {
    const rows = phones.slice(i, i + INSERT_CHUNK).map((phone) => ({
      campaign_id: campaignId,
      tenant_id: tenantId,
      phone,
      status: 'pending',
    }));
    const { error } = await supabaseAdmin.from('sms_recipients').insert(rows);
    if (error) throw new ApiError(500, 'recipient_insert_failed', error.message);
  }
}

async function loadRecipientIds(campaignId) {
  const out = [];
  let from = 0;
  const page = 1000;
  for (;;) {
    const { data, error } = await supabaseAdmin
      .from('sms_recipients')
      .select('id, phone')
      .eq('campaign_id', campaignId)
      .range(from, from + page - 1);
    if (error) throw new ApiError(500, 'recipient_read_failed', error.message);
    out.push(...data);
    if (!data || data.length < page) break;
    from += page;
  }
  return out;
}

async function insertLogs(rows) {
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    const { error } = await supabaseAdmin.from('sms_logs').insert(rows.slice(i, i + INSERT_CHUNK));
    if (error) logger.error({ err: error }, 'sms_logs insert failed');
  }
}

function result(campaign_id, status, recipients, valid, invalid, segments, credits_per_message, credits_estimated, credits_charged, sent, failed, scheduled) {
  return {
    campaign_id,
    status,
    recipients,
    valid,
    invalid,
    segments,
    credits_per_message,
    credits_estimated,
    credits_charged,
    sent,
    failed,
    scheduled,
  };
}
