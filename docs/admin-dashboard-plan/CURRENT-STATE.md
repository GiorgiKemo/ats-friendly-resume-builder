# Verified source baseline

Checked against commit `1ae6f4795a7dc6f6429989bb17542c1b9e6d21e3` on 9 September 2026. Paths below are relative to the repository. This is not a production configuration audit: Supabase project and table metadata calls were denied by the connector during planning.

## Reuse, then extend

| Existing source | Observed behavior | Required change or preservation |
| --- | --- | --- |
| `src/pages/AdminDashboard.jsx` | Users, Client Errors, Admin Access and Audit tabs; browser prompt/confirm forms; client-side filtering/pagination | Replace with routed components, accessible forms, server-side queries and bounded responses |
| `src/services/adminService.js` | One `admin-api` action dispatcher; mutations usually return the whole overview | Keep a compatible adapter while splitting typed action modules; return just mutation receipt and invalidation keys |
| `supabase/functions/admin-api/index.ts` | Fresh token/user lookup and active `admin_members` check; owner/admin/support roles | Preserve database membership authorization; add capability-scoped responses and per-operation checks |
| Same, membership claiming | Pending email invitation can be claimed only against verified identity with a conditional update | Preserve the verified-email and compare-and-set protections; do not trust arbitrary form email or user metadata |
| Same, `listAuthUsers` / `buildOverview` | Scans Auth users in pages, combines profile rows, then sends a large overview | Maintain a bounded admin directory projection with reconciliation; never rescan all Auth users per page or mutation |
| Same, errors/audit fetches | Loads up to 80 rows; unresolved error count is derived from loaded rows | Compute totals separately; paginated feed is not a complete aggregate |
| Same, AI summary | Sums mutable per-user usage counters | Label current-period counters; create request-level usage ledger for historical consumption/cost |
| Same, `auditEvent` | Inserts an audit row but does not fail on returned insert error | Bind local mutation and audit to one transaction; external actions need durable intents and reconciled outcomes |
| Same, `setPremium` | Directly writes `users` Premium/expiry/plan/AI limit fields | Replace with entitlement grant/revoke transaction; eliminate two competing writers |
| Same, ban/delete/access operations | Basic self-protection and role checks; soft delete via Auth | Add session invalidation checks, last-owner concurrency guard, durable deletion workflow and external subscription handling |
| `supabase/migrations/20260424130413_add_admin_dashboard.sql` | Membership, audit and app error tables; RLS and revoked general access | Extend protections and indexes; keep service secrets out of browsers |
| `supabase/migrations/20260425213530_allow_manual_admin_premium_grants.sql` | Removes legacy Stripe-only enforcement for manual grants | Preserve legitimate complimentary access while moving it into the unified ledger |
| `supabase/migrations/20260908202730_add_paypal_billing.sql` | Provider-scoped entitlement ledger, owner-read RLS, PayPal checkout records and atomic provider projection | Preserve ownership and locking; support manual grant records and expiry recomputation without paid-access loss |
| Same, entitlement RPC | Table permits `manual`, but RPC accepts Stripe/PayPal only; legacy backfill infers provider from Stripe customer ID | Explicit migration/reconciliation decisions for ambiguous old grants; do not silently label them purchases |
| Stripe/PayPal functions and billing tests | Existing provider/webhook and checkout verification paths | Extend these integrations, not a parallel payment system; keep explicit checkout ownership and idempotency |
| `src/components/GoogleAnalytics.jsx` | Configures Google tag and route page views with query-free URLs; no implemented signup/purchase calls here | Add consent-aware event contracts and verified outcomes; a configured key-event metric alone is not instrumentation |
| `src/services/monitoringService.js` | Event constants exist, but `logEvent` routes through error reporting | Keep operational errors separate from high-volume product events; constants do not prove events are emitted |
| `supabase/functions/report-client-error/index.ts` | Rate-limited error intake | Do not reuse as an activity firehose or store private content in errors |
| `src/services/publicEngagementService.js` | Contact inquiries and newsletter intake | Inquiry records are not threaded chat; migrate/link them explicitly, preserving original timestamps/source |
| `src/config/supportInfo.js` | Current support channels and “Usually within 1 business day” expectation | Reuse centralized public contacts; do not claim 24/7 human availability without staffing |
| `supabase/functions/email-webhook/index.ts` | Brevo delivery events are mapped to auto-apply jobs | Add a separate support delivery mapping; this endpoint is not inbound support conversation processing |
| `src/context/ThemeContext.jsx` | Light/dark toggling, system detection; first visit defaults to system; setter is not exposed | Reuse theme mechanics, add scoped admin preference and explicit three-way selection; avoid changing the entire public site's default |
| `src/App.jsx` and `src/context/AuthContext.jsx` | `/admin` exists; frontend admin visibility uses metadata | Client metadata is presentation only; fetch authoritative capabilities and enforce everything server-side |

## High-risk gaps to fix before enabling new admin mutations

1. Manual access and paid entitlements can diverge because they have different writers. Expiring or revoking a manual grant must not cancel a paid subscription, and a delayed provider event must not erase a valid grant.
2. A successful mutation can lack an audit record; a subsequent overview failure can look like the mutation failed. Retrying must not repeat external actions or duplicate grants.
3. A support role currently receives the broad overview payload. Hiding columns in the UI does not prevent disclosure of the data already delivered.
4. Account deletion alone is not proof of token invalidation, provider cancellation, complete data removal, or preservation of required financial records.
5. Existing telemetry is not a trustworthy product event stream. No historical conversion/retention backfill can be promised from page views and error logs alone.
6. There is no demonstrated durable conversation model, private agent-note separation, or AI/human concurrency contract in these inspected paths.

## Implementation entry points

Reuse the repository's React 18, React Router, Tailwind, Supabase, Node tests and Playwright patterns. Prefer JSX for frontend consistency and TypeScript for Edge Functions. Split the existing admin page incrementally behind flags; do not rewrite the public website.

Current validation entry points in `package.json`:

```text
npm test
npm run lint
npm run check:supabase:functions
npm run check:repo
npm run build
npm run test:website:full
```

Read each script and environment prerequisites before running it. The full website fixture path is distinct from the live website test path. Never run fixtures against production. New admin/chat database and browser scenarios must be added; these existing command names alone do not prove coverage.

## Production facts still to verify

- Deployed migrations, columns, RPC signatures, function revisions, RLS policies, role grants and Auth configuration.
- Active owner and support memberships, service secret names, function JWT verification configuration and allowed origins.
- Actual Stripe/PayPal live account mapping, products/prices, webhook registrations, event delivery and outstanding entitlements.
- GA property/stream mapping, existing key events, consent behavior, hostname filters, API access and report freshness.
- Realtime private-channel settings, Storage buckets, email delivery configuration, scheduled-job availability and backup/restore capability.

Use read-only discovery first. If a required source remains inaccessible, record that specific integration as blocked and continue independent local tasks. Do not report source-only tests as live-service verification.
