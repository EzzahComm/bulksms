import { supabaseAdmin } from '../lib/supabase.js';
import { ApiError } from '../lib/apiError.js';

export async function listSenderIds(tenantId) {
  const { data, error } = await supabaseAdmin
    .from('sms_sender_ids')
    .select('id, sender_name, status, description, provider, provider_status, rejection_reason, created_at, approved_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error) throw new ApiError(500, 'sender_read_failed', error.message);
  return data;
}

export async function createSenderId(tenantId, senderName, description) {
  const name = senderName.trim();
  if (!/^[A-Za-z0-9 ]{3,11}$/.test(name)) {
    throw new ApiError(422, 'invalid_sender_name', 'Sender ID must be 3–11 alphanumeric characters');
  }

  const { data, error } = await supabaseAdmin
    .from('sms_sender_ids')
    .insert({ tenant_id: tenantId, sender_name: name, description, status: 'pending' })
    .select('id, tenant_id, sender_name, status, description, provider, created_at')
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new ApiError(409, 'sender_exists', 'Sender ID already registered');
    }
    throw new ApiError(500, 'sender_create_failed', error.message);
  }

  // NOTE: forwarding to the provider's sender-ID registration API happens here
  // once provider onboarding credentials are available. Until then the request
  // stays 'pending' for manual admin approval.
  return data;
}

/** Resolve an approved sender for sending. Accepts sender_id (uuid) or sender_name. */
export async function resolveApprovedSender(tenantId, ref) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref);
  const { data, error } = await supabaseAdmin
    .from('sms_sender_ids')
    .select('id, sender_name, status')
    .eq('tenant_id', tenantId)
    .eq(isUuid ? 'id' : 'sender_name', ref)
    .maybeSingle();

  if (error) throw new ApiError(500, 'sender_read_failed', error.message);
  if (!data) throw new ApiError(404, 'sender_not_found', 'Sender ID not found');
  if (data.status !== 'approved') {
    throw new ApiError(403, 'sender_not_approved', `Sender ID is ${data.status}`);
  }
  return { id: data.id, sender_name: data.sender_name };
}

/** Admin/staff approval workflow. */
export async function setSenderStatus(tenantId, senderId, status, approverId, rejectionReason) {
  const patch = { status };
  if (status === 'approved') {
    patch.approved_at = new Date().toISOString();
    patch.approved_by = approverId ?? null;
    patch.rejection_reason = null;
  }
  if (status === 'rejected') patch.rejection_reason = rejectionReason ?? null;

  const { data, error } = await supabaseAdmin
    .from('sms_sender_ids')
    .update(patch)
    .eq('tenant_id', tenantId)
    .eq('id', senderId)
    .select('id, sender_name, status, rejection_reason, approved_at')
    .single();

  if (error) throw new ApiError(500, 'sender_update_failed', error.message);
  return data;
}
