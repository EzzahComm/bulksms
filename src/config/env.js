import dotenv from 'dotenv';

dotenv.config();

function required(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

function optional(name, fallback = '') {
  return process.env[name] ?? fallback;
}

function bool(name, fallback = false) {
  const v = process.env[name];
  if (v === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

function num(name, fallback) {
  const v = process.env[name];
  if (v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

const nodeEnv = optional('NODE_ENV', 'development');
const mpesaEnv = optional('MPESA_ENV', 'sandbox');

// Service-role key: optional at boot. A leftover placeholder counts as missing.
const rawServiceKey = optional('SUPABASE_SERVICE_ROLE_KEY');
const hasServiceKey = !!rawServiceKey && !rawServiceKey.includes('PASTE');
const serviceKey = hasServiceKey ? rawServiceKey : optional('SUPABASE_KEY');

export const env = {
  nodeEnv,
  isProd: nodeEnv === 'production',
  port: num('PORT', 3003),
  serviceName: optional('SERVICE_NAME', 'ezzahcomm-bulk-sms'),
  logLevel: optional('LOG_LEVEL', 'info'),
  allowedOrigins: optional('ALLOWED_ORIGINS', 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  // Supabase
  supabaseUrl: required('SUPABASE_URL'),
  supabaseAnonKey: required('SUPABASE_KEY'),
  // Service-role key is required for real operation, but treated as optional at
  // boot so the app can deploy and serve /health before it's configured. When
  // absent, the admin client falls back to the anon key and DB-backed routes
  // will fail (surfaced via /health/ready -> service_role: "MISSING").
  supabaseServiceKey: serviceKey,
  hasServiceKey,

  // Tenant (this Nexus tenant)
  tenantId: optional('EZZAHCOMM_TENANT_ID', 'e2200000-0000-4000-8000-000000000001'),

  // Credit economics
  creditPriceKes: num('CREDIT_PRICE_KES', 1), // KES per 1 SMS credit
  creditsPerSegment: num('CREDITS_PER_SEGMENT', 1), // credits charged per 160-char segment

  // TextSMS provider (sms.textsms.co.ke)
  sms: {
    dryRun: bool('SMS_DRY_RUN', false),
    baseUrl: optional('TEXTSMS_BASE_URL', 'https://sms.textsms.co.ke'),
    apiKey: optional('TEXTSMS_API_KEY'),
    partnerId: optional('TEXTSMS_PARTNER_ID'),
    defaultShortcode: optional('TEXTSMS_SHORTCODE', 'EZZAH'),
  },

  // M-Pesa Daraja
  mpesa: {
    env: mpesaEnv,
    dryRun: bool('MPESA_DRY_RUN', false),
    baseUrl:
      optional('MPESA_BASE_URL') ||
      (mpesaEnv === 'production'
        ? 'https://api.safaricom.co.ke'
        : 'https://sandbox.safaricom.co.ke'),
    consumerKey: optional('MPESA_CONSUMER_KEY'),
    consumerSecret: optional('MPESA_CONSUMER_SECRET'),
    shortcode: optional('MPESA_SHORTCODE'),
    passkey: optional('MPESA_PASSKEY'),
    transactionType: optional('MPESA_TRANSACTION_TYPE', 'CustomerPayBillOnline'),
    callbackUrl: optional('MPESA_CALLBACK_URL'),
  },

  // Auth
  apiKeyPrefix: optional('API_KEY_PREFIX', 'ezk_live_'),

  // Rate limiting
  rateLimitWindowMs: num('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
  rateLimitMax: num('RATE_LIMIT_MAX_REQUESTS', 300),
};
