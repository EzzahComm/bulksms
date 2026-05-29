# EZZAHCOMM BULK SMS

A billing + provisioning + compliance **control plane** for bulk SMS in Kenya.
EZZAHCOMM is *not* an SMS gateway itself — it sits between users and the TextSMS
data plane, adding multi-tenant identity, a credit wallet/ledger, sender-ID
registration, campaign orchestration, M-Pesa top-ups, and an audit trail.

```
User → EZZAHCOMM API (Node/Express)
        ↓
   NEXUS Supabase (Auth + Postgres + RLS + wallet ledger + logs)
        ↓
   TextSMS provider API   |   M-Pesa Daraja (STK push)
        ↓                          ↓
   Delivery reports → /webhooks/sms-dlr   |   Callback → /webhooks/mpesa
```

## Platform model — a tenant inside NEXUS

This service runs as a **tenant in the shared NEXUS Supabase project**
(`skwgfymxyjtlxmauyidn`). It reuses the platform tables (`tenants`, `profiles`,
`sms_logs`, `payments`, `mobile_money_transactions`, `webhook_events`,
`audit_logs`) and adds its own `sms_*` tables. See
[`supabase/migrations/`](supabase/migrations/) for the source of truth.

EZZAHCOMM tenant id: `e2200000-0000-4000-8000-000000000001`.

### Data model (added by this app)

| Table | Purpose |
|-------|---------|
| `sms_sender_ids` | Sender ID registration + approval workflow |
| `sms_wallets` | One credit balance per tenant |
| `sms_credit_transactions` | Append-only credit ledger (topup / debit / refund / adjustment) |
| `sms_campaigns` | Bulk SMS jobs (`sms_logs.campaign_id` → here) |
| `sms_recipients` | Per-recipient delivery tracking |
| `sms_api_keys` | Developer-tier programmatic access (sha256-hashed) |

`sms_debit_wallet(...)` is a `SECURITY DEFINER` Postgres function that performs
atomic, row-locked, overdraft-protected ledger writes. The wallet balance is
kept in sync by a trigger. RLS isolates every tenant; the backend uses the
service-role key and enforces tenant scope from the authenticated request.

## Backend layout

Plain **Node.js (ES Modules)** — Express, no build step, run with `node`.

```text
src/
  config/env.js          validated environment loader
  lib/                   supabase clients, logger, phone/segment helpers, ApiError
  middleware/            auth (Supabase JWT + API key), errors, async wrapper
  services/
    textsms.js           TextSMS provider client (dry-run capable)
    wallet.js            credit ledger (wraps sms_debit_wallet RPC)
    sender.js            sender-id CRUD + approval
    campaign.js          the send engine (reserve → send → log → refund)
    mpesa.js             Daraja OAuth + STK push + callback handling
  routes/                health, wallet, sender-ids, campaigns, sms, payments, webhooks
  server.js              app wiring (helmet, cors, rate-limit, routers)
```

## Quick start

Requires Node.js ≥ 20.6.

```bash
npm install
cp .env.example .env        # fill in SUPABASE keys (+ provider keys when ready)
npm run dev                  # node --watch, http://localhost:3003
# production: npm start
```

With `SMS_DRY_RUN=true` and `MPESA_DRY_RUN=true` (the defaults) the full flow
works end-to-end without live provider credentials — sends are simulated and
top-ups can be completed by POSTing a fake callback to `/webhooks/mpesa`.

## API

All `/api/*` routes require `Authorization: Bearer <supabase-jwt>` (dashboard)
or `Authorization: ApiKey <key>` (developer). Webhooks are unauthenticated.

| Method | Path | Description |
|--------|------|-------------|
| GET  | `/health`, `/health/ready` | Liveness / readiness + integration modes |
| GET  | `/api/wallet` | Wallet balance |
| GET  | `/api/wallet/transactions` | Credit ledger history |
| GET  | `/api/sender-ids` | List sender IDs |
| POST | `/api/sender-ids` | Register a sender ID (`{ sender_name, description? }`) |
| PATCH| `/api/sender-ids/:id/status` | Approve / reject / suspend (staff) |
| GET  | `/api/campaigns` · `/api/campaigns/:id` | List / fetch campaigns |
| POST | `/api/campaigns` | Create + send (`{ name?, message, sender, recipients[], scheduled_at? }`) |
| POST | `/api/sms/send` | Quick send (`{ message, to \| recipients[], sender? }`) |
| GET  | `/api/sms/status/:campaignId` | Campaign status |
| GET  | `/api/sms/balance` | Wallet + provider balance |
| POST | `/api/payments/mpesa/stk` | Start M-Pesa top-up (`{ phone, amount }`) |
| GET  | `/api/payments/mpesa/:checkoutRequestId` | Top-up status |
| POST | `/webhooks/mpesa` | Daraja STK callback (set as `MPESA_CALLBACK_URL`) |
| POST | `/webhooks/sms-dlr` | TextSMS delivery reports |

### Send example

```bash
curl -X POST http://localhost:3003/api/sms/send \
  -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
  -d '{ "message": "Hello from EZZAHCOMM", "to": ["0712345678","0790000000"], "sender": "EZZAH" }'
```

```json
{
  "campaign_id": "…", "status": "sent",
  "recipients": 2, "valid": 2, "invalid": [],
  "segments": 1, "credits_per_message": 1,
  "credits_estimated": 2, "credits_charged": 2,
  "sent": 2, "failed": 0, "scheduled": false
}
```

## Configuration

See [`.env.example`](.env.example). Key groups: Supabase (URL + anon + service
role), credit economics (`CREDIT_PRICE_KES`, `CREDITS_PER_SEGMENT`), TextSMS
(`TEXTSMS_*`, `SMS_DRY_RUN`), M-Pesa Daraja (`MPESA_*`, `MPESA_DRY_RUN`).

## Roadmap

- Scheduled-campaign dispatch worker (rows are already created as `queued`)
- Sender-ID forwarding to the provider's onboarding API
- Standalone React dashboard SPA (consumes this API; frontend inspired by celcomafrica.com)
- Webhook signature verification for M-Pesa
