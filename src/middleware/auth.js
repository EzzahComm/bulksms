import { createHash } from 'node:crypto';
import { supabaseAnon, supabaseAdmin } from '../lib/supabase.js';
import { ApiError } from '../lib/apiError.js';

/**
 * @param {string} rawKey
 * @returns {string}
 */
export function hashApiKey(rawKey) {
  return createHash('sha256').update(rawKey).digest('hex');
}

/**
 * Authenticates a request via either:
 *   Authorization: Bearer <supabase-jwt>   (dashboard users)
 *   Authorization: ApiKey <raw-key>        (developer / programmatic)
 *
 * Resolves the caller's tenant_id from the server side — never from the body.
 * Populates req.auth = { authType, tenantId, userId?, role?, apiKeyId? }.
 */
export async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization;
    if (!header) throw new ApiError(401, 'unauthorized', 'Missing Authorization header');

    const [scheme, credentials] = header.split(' ');
    if (!credentials) throw new ApiError(401, 'unauthorized', 'Malformed Authorization header');

    if (scheme === 'Bearer') {
      const { data, error } = await supabaseAnon.auth.getUser(credentials);
      if (error || !data.user) throw new ApiError(401, 'unauthorized', 'Invalid or expired token');

      const { data: profile, error: pErr } = await supabaseAdmin
        .from('profiles')
        .select('tenant_id, role')
        .eq('id', data.user.id)
        .single();

      if (pErr || !profile) throw new ApiError(403, 'no_profile', 'No profile for this user');

      req.auth = {
        authType: 'jwt',
        userId: data.user.id,
        tenantId: profile.tenant_id,
        role: profile.role,
      };
      return next();
    }

    if (scheme === 'ApiKey') {
      const { data: key, error } = await supabaseAdmin
        .from('sms_api_keys')
        .select('id, tenant_id, is_active, expires_at')
        .eq('key_hash', hashApiKey(credentials))
        .single();

      if (error || !key || !key.is_active) {
        throw new ApiError(401, 'unauthorized', 'Invalid API key');
      }
      if (key.expires_at && new Date(key.expires_at) < new Date()) {
        throw new ApiError(401, 'unauthorized', 'API key expired');
      }

      // best-effort last-used timestamp
      void supabaseAdmin
        .from('sms_api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', key.id);

      req.auth = { authType: 'api_key', tenantId: key.tenant_id, apiKeyId: key.id };
      return next();
    }

    throw new ApiError(401, 'unauthorized', `Unsupported auth scheme: ${scheme}`);
  } catch (err) {
    next(err);
  }
}

/** Requires the JWT caller to be tenant admin/staff. API keys are tenant-scoped already. */
export function requireStaff(req, _res, next) {
  if (req.auth?.authType === 'api_key') return next();
  if (req.auth?.role && ['admin', 'staff'].includes(req.auth.role)) return next();
  next(new ApiError(403, 'forbidden', 'Staff role required'));
}
