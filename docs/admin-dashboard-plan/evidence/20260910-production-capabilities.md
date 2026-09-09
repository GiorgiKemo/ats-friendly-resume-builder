# Production capability audit — 2026-09-10

## Scope

Read-only inventory of the linked Supabase project, covering named secrets, deployed Edge Functions, migration visibility, privacy-safe database metadata, and scheduler status. Secret values and customer rows are never printed or persisted by the audit.

## Command

`npm run audit:production:capabilities`

Latest successful probe: `2026-09-09T22:43:49.584Z` (UTC).

## Interpretation

- `present` means only that the provider secret name exists in the project; it does not prove the credential is valid, the provider is configured correctly, or that a real transaction/message was delivered.
- `missing` keeps the corresponding worker or provider feature fail-closed.
- `blocked` means the Supabase CLI could not read that category and no production claim is made.
- Scheduler inspection is read-only and reports only extension presence, job names/schedules/active state, and run status/timestamps; SQL commands and secrets are never returned.

The 2026-09-10 run found the Stripe, PayPal, and Brevo secret names; all 29 local Edge Functions were represented among 31 deployed functions; and all 76 local migration versions were visible remotely. Billing-worker, support-worker, privacy-worker, invitation-worker, and support-AI secret groups were still missing their required names, so those paths remain fail-closed.

A read-only `supabase db query --linked` metadata probe now succeeds without
returning production rows or mutating state. It reports 59 public tables, all
59 with RLS enabled, 46 public policies, and 133 public functions. Its
privacy-safe aggregates show one active owner member and zero active admin or
support members; the allowlisted `admin_members`, `admin_audit_events`,
`analytics_events`, `billing_provider_events`, `support_attachments`,
`support_conversations`, `support_messages`, and `users` tables all have RLS
enabled. Grants, policy predicates, provider ownership, and row-level behavior
remain separate verification gates.

The management query endpoint was intermittent during this audit (two
login-role 403 responses followed by the successful run recorded below), so
this metadata is a point-in-time read and should be rechecked before any
release decision.

The same run observed no `anon` table grants in the allowlist, `authenticated`
`SELECT` on `users`, and `service_role` table access for the service-owned
admin, analytics, billing, and support tables. Only `users` returned direct
table policies in the aggregate; the other allowlisted tables appear to be
service-only and still require direct policy/function authorization review.

The audit now records each allowlisted policy's table, command, role set, using
/check presence, and whether its predicate references `auth.uid()`; predicate
text is intentionally not exported. This improves reviewability without
returning policy literals, customer data, or secrets.

The scheduler probe reports `pg_cron` and `pg_net` unavailable, with no
accessible `cron.job` or `cron.job_run_details` metadata. This is stronger
evidence than an unknown scheduler state, but it does not configure a
scheduler or close the operational release gate.

## Current release context

- Application runtime commit: `899daad` (`Record verified production deployment`).
- Vercel production deployment `dpl_2Si3F24vPtEFMe8HiUkqDMELwMGw` reached `Ready`; the canonical aliases are `https://www.resumeats.cv` and `https://resumeats.cv`.
- `npm run audit:production:http` passed with `failures: []` at `2026-09-09T22:38:59Z`.
- The analytics consent banner was verified at desktop and mobile viewport sizes; the actions are centered on desktop and remain stacked without horizontal overflow on mobile.
- Production GA4 client delivery was checked in an isolated browser session: no `googletagmanager.com` or `google-analytics.com` request occurred before consent; after accepting analytics, the page sent a `page_view` to `https://www.google-analytics.com/g/collect` using measurement ID `G-1M08TLZ4CB`. This proves client delivery and consent gating only, not GA processed-report freshness or server-side reporting access.

## Remaining gates

The capability report is evidence for discovery only. It does not close E18–E20. Authenticated production QA, provider sandbox replay/reconciliation, scheduler configuration, scanner/provider selection, support-AI evaluation, invitation delivery, backup/restore drills, alert delivery, and any destructive or financial live test still require their respective owners, policies, staging evidence, and action-time authorization.
