-- ============================================================================
-- EZZAHCOMM BULK SMS — SMS SaaS layer (Nexus tenant)
-- ----------------------------------------------------------------------------
-- This migration EXTENDS the shared NEXUS public schema. It does NOT recreate
-- platform tables (tenants, profiles, sms_logs, payments,
-- mobile_money_transactions, webhook_events, audit_logs) — those already exist
-- and are reused as-is.
--
-- All EZZAHCOMM-specific tables are namespaced with the `sms_` prefix to avoid
-- collisions with other Nexus apps sharing this database.
--
-- Conventions matched from the existing platform:
--   * text columns + CHECK constraints (no custom enums)
--   * RLS helpers: current_tenant_id(), is_tenant_staff(), is_tenant_admin()
--   * set_updated_at() trigger for updated_at maintenance
--   * roles: 'admin' | 'staff' | 'client'
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SENDER IDS — registration + approval workflow
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sms_sender_ids (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sender_name     text NOT NULL,
  description     text,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','suspended')),
  provider        text NOT NULL DEFAULT 'textsms',
  provider_id     text,
  provider_status text,
  rejection_reason text,
  approved_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, sender_name)
);
CREATE INDEX IF NOT EXISTS idx_sms_sender_ids_tenant ON public.sms_sender_ids(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sms_sender_ids_status ON public.sms_sender_ids(status);

-- ----------------------------------------------------------------------------
-- 2. WALLETS — credit balance per tenant (one wallet per tenant)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sms_wallets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  balance_credits numeric(18,2) NOT NULL DEFAULT 0,
  total_topup     numeric(18,2) NOT NULL DEFAULT 0,
  total_spent     numeric(18,2) NOT NULL DEFAULT 0,
  currency        text NOT NULL DEFAULT 'KES',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sms_wallets_tenant ON public.sms_wallets(tenant_id);

-- ----------------------------------------------------------------------------
-- 3. CAMPAIGNS — bulk SMS jobs (sms_logs.campaign_id points here)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sms_campaigns (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name              text NOT NULL,
  message           text NOT NULL,
  sender_id         uuid REFERENCES public.sms_sender_ids(id) ON DELETE RESTRICT,
  status            text NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','queued','sending','sent','failed','cancelled')),
  recipient_count   integer NOT NULL DEFAULT 0,
  sent_count        integer NOT NULL DEFAULT 0,
  failed_count      integer NOT NULL DEFAULT 0,
  delivered_count   integer NOT NULL DEFAULT 0,
  credits_estimated numeric(18,2) NOT NULL DEFAULT 0,
  credits_used      numeric(18,2) NOT NULL DEFAULT 0,
  scheduled_at      timestamptz,
  created_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  started_at        timestamptz,
  completed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sms_campaigns_tenant ON public.sms_campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sms_campaigns_status ON public.sms_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_sms_campaigns_scheduled ON public.sms_campaigns(scheduled_at);

-- Wire the existing sms_logs.campaign_id to the new campaigns table.
-- (Additive, safe: sms_logs has no rows yet.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sms_logs_campaign_id_fkey'
  ) THEN
    ALTER TABLE public.sms_logs
      ADD CONSTRAINT sms_logs_campaign_id_fkey
      FOREIGN KEY (campaign_id) REFERENCES public.sms_campaigns(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4. RECIPIENTS — per-recipient delivery tracking within a campaign
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sms_recipients (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         uuid NOT NULL REFERENCES public.sms_campaigns(id) ON DELETE CASCADE,
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  phone               text NOT NULL,
  status              text NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','sent','failed','delivered','bounced')),
  provider_message_id text,
  credits_charged     numeric(18,2) NOT NULL DEFAULT 0,
  error_code          text,
  error_message       text,
  delivered_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sms_recipients_campaign ON public.sms_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_sms_recipients_tenant ON public.sms_recipients(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sms_recipients_status ON public.sms_recipients(status);
CREATE INDEX IF NOT EXISTS idx_sms_recipients_provider_msg ON public.sms_recipients(provider_message_id);

-- ----------------------------------------------------------------------------
-- 5. CREDIT TRANSACTIONS — append-only wallet ledger
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sms_credit_transactions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  type           text NOT NULL
                   CHECK (type IN ('topup','sms_debit','refund','adjustment')),
  credits_delta  numeric(18,2) NOT NULL,          -- signed: + for topup/refund, - for debit
  balance_before numeric(18,2) NOT NULL,
  balance_after  numeric(18,2) NOT NULL,
  amount         numeric(18,2),                    -- money value (KES) where applicable
  reference      text,                             -- M-Pesa receipt, campaign id, etc.
  description    text,
  payment_id     uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  campaign_id    uuid REFERENCES public.sms_campaigns(id) ON DELETE SET NULL,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sms_credit_tx_tenant ON public.sms_credit_transactions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sms_credit_tx_type ON public.sms_credit_transactions(type);
CREATE INDEX IF NOT EXISTS idx_sms_credit_tx_created ON public.sms_credit_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_sms_credit_tx_reference ON public.sms_credit_transactions(reference);

-- ----------------------------------------------------------------------------
-- 6. API KEYS — developer-tier programmatic access
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sms_api_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  key_hash     text NOT NULL UNIQUE,   -- sha256 of the raw key; raw key shown once
  key_preview  text NOT NULL,          -- e.g. "ezk_live_…a1b2"
  name         text NOT NULL,
  is_active    boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_by   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_sms_api_keys_tenant ON public.sms_api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sms_api_keys_hash ON public.sms_api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_sms_api_keys_active ON public.sms_api_keys(is_active);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- updated_at maintenance (reuse platform helper)
CREATE TRIGGER trg_sms_sender_ids_updated  BEFORE UPDATE ON public.sms_sender_ids  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_sms_wallets_updated      BEFORE UPDATE ON public.sms_wallets      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_sms_campaigns_updated    BEFORE UPDATE ON public.sms_campaigns    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_sms_recipients_updated   BEFORE UPDATE ON public.sms_recipients   FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Keep wallet balance in sync with the append-only ledger.
CREATE OR REPLACE FUNCTION public.sms_apply_credit_transaction()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  UPDATE public.sms_wallets
     SET balance_credits = NEW.balance_after,
         total_topup = total_topup + (CASE WHEN NEW.credits_delta > 0 THEN NEW.credits_delta ELSE 0 END),
         total_spent = total_spent + (CASE WHEN NEW.credits_delta < 0 THEN -NEW.credits_delta ELSE 0 END),
         updated_at = now()
   WHERE tenant_id = NEW.tenant_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sms_credit_tx_apply
AFTER INSERT ON public.sms_credit_transactions
FOR EACH ROW EXECUTE FUNCTION public.sms_apply_credit_transaction();

-- ============================================================================
-- ATOMIC WALLET DEBIT — used by the SMS send path
-- Returns the resulting ledger row id, or raises 'INSUFFICIENT_CREDITS'.
-- Runs as SECURITY DEFINER so the API can call it without broad table grants.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sms_debit_wallet(
  p_tenant_id   uuid,
  p_credits     numeric,
  p_type        text,
  p_reference   text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_campaign_id uuid DEFAULT NULL,
  p_payment_id  uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_balance numeric(18,2);
  v_delta   numeric(18,2);
  v_after   numeric(18,2);
  v_tx_id   uuid;
BEGIN
  IF p_type NOT IN ('topup','sms_debit','refund','adjustment') THEN
    RAISE EXCEPTION 'INVALID_TX_TYPE';
  END IF;

  -- Lock the wallet row to serialize concurrent debits/topups.
  SELECT balance_credits INTO v_balance
    FROM public.sms_wallets
   WHERE tenant_id = p_tenant_id
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.sms_wallets (tenant_id, balance_credits)
    VALUES (p_tenant_id, 0)
    RETURNING balance_credits INTO v_balance;
  END IF;

  -- Debits supply a positive p_credits; topups/refunds/positive adjustments too.
  IF p_type = 'sms_debit' THEN
    v_delta := -abs(p_credits);
  ELSIF p_type = 'adjustment' THEN
    v_delta := p_credits;            -- caller controls sign for adjustments
  ELSE
    v_delta := abs(p_credits);       -- topup / refund add credits
  END IF;

  v_after := v_balance + v_delta;

  IF v_after < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_CREDITS';
  END IF;

  INSERT INTO public.sms_credit_transactions
    (tenant_id, type, credits_delta, balance_before, balance_after,
     reference, description, campaign_id, payment_id)
  VALUES
    (p_tenant_id, p_type, v_delta, v_balance, v_after,
     p_reference, p_description, p_campaign_id, p_payment_id)
  RETURNING id INTO v_tx_id;

  RETURN v_tx_id;
END;
$$;

-- ============================================================================
-- ROW-LEVEL SECURITY
-- (Backend uses the service_role key and bypasses RLS; these policies protect
--  the future authenticated SPA dashboard.)
-- ============================================================================
ALTER TABLE public.sms_sender_ids          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_wallets             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_campaigns           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_recipients          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_api_keys            ENABLE ROW LEVEL SECURITY;

-- sender IDs: tenant members read; staff manage
CREATE POLICY sms_sender_ids_select ON public.sms_sender_ids
  FOR SELECT USING (tenant_id = (SELECT public.current_tenant_id()));
CREATE POLICY sms_sender_ids_insert ON public.sms_sender_ids
  FOR INSERT WITH CHECK (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.is_tenant_staff()));
CREATE POLICY sms_sender_ids_update ON public.sms_sender_ids
  FOR UPDATE USING (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.is_tenant_staff()))
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.is_tenant_staff()));

-- wallets: tenant members read only (writes go through service_role / SECURITY DEFINER fn)
CREATE POLICY sms_wallets_select ON public.sms_wallets
  FOR SELECT USING (tenant_id = (SELECT public.current_tenant_id()));

-- campaigns: tenant members read; staff manage
CREATE POLICY sms_campaigns_select ON public.sms_campaigns
  FOR SELECT USING (tenant_id = (SELECT public.current_tenant_id()));
CREATE POLICY sms_campaigns_insert ON public.sms_campaigns
  FOR INSERT WITH CHECK (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.is_tenant_staff()));
CREATE POLICY sms_campaigns_update ON public.sms_campaigns
  FOR UPDATE USING (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.is_tenant_staff()))
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.is_tenant_staff()));

-- recipients: tenant members read
CREATE POLICY sms_recipients_select ON public.sms_recipients
  FOR SELECT USING (tenant_id = (SELECT public.current_tenant_id()));

-- credit ledger: tenant members read only
CREATE POLICY sms_credit_tx_select ON public.sms_credit_transactions
  FOR SELECT USING (tenant_id = (SELECT public.current_tenant_id()));

-- api keys: tenant admins read; manage
CREATE POLICY sms_api_keys_select ON public.sms_api_keys
  FOR SELECT USING (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.is_tenant_admin()));
CREATE POLICY sms_api_keys_insert ON public.sms_api_keys
  FOR INSERT WITH CHECK (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.is_tenant_admin()));
CREATE POLICY sms_api_keys_update ON public.sms_api_keys
  FOR UPDATE USING (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.is_tenant_admin()))
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()) AND (SELECT public.is_tenant_admin()));

-- ============================================================================
-- GRANTS (RLS still applies; service_role bypasses RLS)
-- ============================================================================
GRANT SELECT ON public.sms_sender_ids, public.sms_wallets, public.sms_campaigns,
               public.sms_recipients, public.sms_credit_transactions, public.sms_api_keys
  TO authenticated;
GRANT INSERT, UPDATE ON public.sms_sender_ids, public.sms_campaigns, public.sms_api_keys
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.sms_debit_wallet(uuid, numeric, text, text, text, uuid, uuid) TO authenticated;
