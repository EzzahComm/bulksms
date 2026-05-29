import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env.js';

/**
 * Service-role client — bypasses RLS. Used for all backend DB writes/reads.
 * Tenant scoping is enforced in application code via the authenticated
 * request's tenant_id, never by trusting client input.
 */
export const supabaseAdmin = createClient(env.supabaseUrl, env.supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Anon client — only used to verify end-user JWTs (auth.getUser).
 */
export const supabaseAnon = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
