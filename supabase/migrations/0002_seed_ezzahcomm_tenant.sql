-- ============================================================================
-- Seed the EZZAHCOMM BULK SMS tenant into the shared Nexus platform.
-- Idempotent: safe to re-run.
-- ============================================================================

-- 1. Tenant
INSERT INTO public.tenants (id, name, email, plan, status, settings)
VALUES (
  'e2200000-0000-4000-8000-000000000001',
  'EZZAHCOMM BULK SMS',
  'ezzahcomm@gmail.com',
  'business',
  'active',
  jsonb_build_object('product', 'bulk_sms', 'country', 'KE', 'sms_rate', 1.00)
)
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      email = EXCLUDED.email,
      settings = public.tenants.settings || EXCLUDED.settings;

-- 2. Wallet (created empty; topped up via M-Pesa or admin adjustment)
INSERT INTO public.sms_wallets (tenant_id, balance_credits)
VALUES ('e2200000-0000-4000-8000-000000000001', 0)
ON CONFLICT (tenant_id) DO NOTHING;

-- 3. Default sender ID (approved for immediate testing)
INSERT INTO public.sms_sender_ids (id, tenant_id, sender_name, status, description, provider, approved_at)
VALUES (
  'e2210000-0000-4000-8000-000000000001',
  'e2200000-0000-4000-8000-000000000001',
  'EZZAH',
  'approved',
  'Default sender ID',
  'textsms',
  now()
)
ON CONFLICT (tenant_id, sender_name) DO NOTHING;

-- 4. Development-only starter credits via the ledger (keeps wallet in sync).
--    Comment out for production. Only seeds once (skips if any ledger row exists).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.sms_credit_transactions
    WHERE tenant_id = 'e2200000-0000-4000-8000-000000000001'
  ) THEN
    PERFORM public.sms_debit_wallet(
      'e2200000-0000-4000-8000-000000000001'::uuid,
      1000,
      'adjustment',
      'seed',
      'Initial development credits'
    );
  END IF;
END $$;
