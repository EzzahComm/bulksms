# Legacy / superseded artifacts

These files described an **earlier, standalone** schema design that assumed
EZZAHCOMM owned a dedicated Supabase project and would create its own
`tenants`, `wallets`, `payments`, `sms_logs`, etc. in `public`.

That assumption is wrong for the current deployment: EZZAHCOMM BULK SMS runs as a
**tenant inside the shared NEXUS Supabase project** (`skwgfymxyjtlxmauyidn`),
which already provides `tenants`, `profiles`, `sms_logs`, `payments`,
`mobile_money_transactions`, `webhook_events`, and `audit_logs`. Re-creating
those tables would collide with the platform and other tenants.

**Source of truth is now:** [`../supabase/migrations/`](../supabase/migrations/)

- `0001_sms_saas.sql` — adds only the missing SMS-SaaS tables, namespaced `sms_*`
  (sender ids, wallets, campaigns, recipients, credit ledger, api keys), wired
  into the existing platform tables, with RLS matching Nexus conventions.
- `0002_seed_ezzahcomm_tenant.sql` — seeds the EZZAHCOMM tenant + wallet +
  default sender id.

Kept for reference only. Do not deploy.
