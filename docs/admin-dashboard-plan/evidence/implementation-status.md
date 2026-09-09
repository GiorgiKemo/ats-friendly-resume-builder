# ResumeATS implementation evidence manifest

Checked 2026-09-10 (Asia/Tbilisi) against the current `main` checkout and the linked production services. This manifest separates source/local evidence from staging and production evidence; an in-progress or blocked row is not a completion claim.

## Release under review

- Commit: current `main` contains the dashboard, support-QA, responsive-audit,
  and admin-modal accessibility evidence on top of the consent and
  production-audit releases.
- GitHub: the validated release is published from the current `main` checkout.
- Vercel: production deployment `dpl_32zF8QsAcQwUmkwUB13G3JWD5y8j` from the verified `main` release reached `Ready`; canonical aliases are `https://www.resumeats.cv` and `https://resumeats.cv`.
- Production HTTP audit: `npm run audit:production:http` passed with `failures: []` at `2026-09-09T22:48:37Z`.
- Full automated suite: `npm test -- --test-concurrency=1 --test-timeout=60000` passed with 1,197 tests; lint and `npm run build` also passed.
- Supabase capability audit: `npm run audit:production:capabilities` is read-only; the latest successful probe at `2026-09-09T22:43:49Z` observed 76 local/remote migration versions, all 29 local functions represented among 31 deployed functions, payment/email credential names present, worker credential groups missing, and no available `pg_cron`/`pg_net` scheduler metadata.
- Linked database metadata is also readable without row access: 59 public
  tables, all 59 with RLS enabled, 46 public policies, and 133 public
  functions; grants, memberships, and row-level production behavior remain
  separate gates.

## Ordered work packages

| Task | Status | Commit / versions | Environment and evidence | Known limitation / next action |
| --- | --- | --- | --- | --- |
| E00 | in_progress | 76 migration versions; read-only capability audit | Local checkout, linked Supabase capability audit, production HTTP audit, and privacy-safe database metadata (59 public tables / 59 RLS-enabled; one active owner member) | Provider ownership, GA reporting access, scheduler, backups and email configuration still need owner-authorized discovery; the linked scheduler probe reports no available `pg_cron`/`pg_net` metadata, while policy predicates and grants are not exposed by this audit. |
| E01 | passed locally | Consent/UI commits through `4ea5f8f` | Local browser screenshots and responsive checks at desktop/mobile; admin light/dark evidence in `evidence/20260909-local-verification.md` | Hosted authenticated admin visual verification remains open. |
| E02 | in_progress | Current admin migrations/functions | Local authorization, AAL2, idempotency and audit tests | Production authenticated role/session matrix has not been exercised. |
| E03 | passed for current schema | 76 migrations; local replay and linked parity | Local reset/lint/replay plus read-only remote migration and database-metadata audits | A full production grants/membership and row-level behavior evidence package is still not available. |
| E04 | in_progress | Entitlement/billing migrations and functions deployed | Local overlap/expiry/provider tests and deployed function inventory | Provider sandbox replay, reconciliation scheduler and unexplained-difference review remain open. |
| E05 | in_progress | Directory/customer-360 implementation | Local cursor/ownership/scale tests | Authenticated production customer-detail and export/deletion checks remain open. |
| E06 | in_progress | Admin UI and team flows | Local owner/browser evidence | Invitation delivery and production role-management verification remain open. |
| E07 | in_progress | Analytics consent/funnel implementation | Local tests plus live GA4 consent-gating/client-delivery check recorded in `20260910-production-capabilities.md`; saved dashboard evidence in `20260910-ga4-dashboard.md` | GA processed-report freshness, property authorization and server-side reporting credentials are not verified. |
| E08 | in_progress | First-party analytics/admin reporting code | Local metric/reconciliation/export tests plus the saved GA4 `ResumeATS Growth & Conversion` dashboard | GA reporting cache, mature cohorts, live freshness and production admin drill-down remain open. |
| E09 | in_progress | Billing projection/reconciliation functions | Local provider-contract tests; functions deployed | Scheduler, provider sandbox replay, webhook/reconciliation evidence and authenticated production UI remain open. |
| E10 | in_progress | Disabled-by-default billing action worker | Local idempotency/worker safety tests | Capability policy review and provider sandbox execution are intentionally not enabled. |
| E11 | in_progress | Support persistence and guest boundaries | Local RLS/API/browser support evidence | Hosted delivery/reconnect and production authenticated support verification remain open. |
| E12 | in_progress | Attachment quarantine/storage contract | Local storage/RLS/worker tests | Scanner endpoint and scanner credential are absent; no upload is claimed clean by default. |
| E13 | in_progress | Inbox, assignment, SLA and human handoff | Local two-context support browser evidence | Named staffing, production presence and alert delivery are not verified. |
| E14 | in_progress | Notifications, knowledge and feedback | Local outbox/knowledge/feedback tests | Invitation/support email provider configuration, inbound threading and production delivery evidence remain open. |
| E15 | blocked | Support AI worker deployed but gated | Local fail-closed/structured-output/handoff tests | Approved provider/model, region/data policy, budget owner, secrets, scheduler and adversarial review are missing. |
| E16 | in_progress | Admin jobs/settings/feedback surfaces | Local browser and contract tests | Production operator verification and configured integrations remain open. |
| E17 | blocked | Privacy workers deployed but gated | Local hold/export/deletion worker tests | Staging backup/restore and destructive deletion drill, provider reconciliation and scheduler are missing. |
| E18 | blocked | Current automated/local gates pass | 1,197 tests, build/lint, local browser evidence, public production smoke | Actual supported-browser staging/provider/performance/accessibility evidence and authenticated production journeys are incomplete. |
| E19 | blocked | No production scheduler/alert mutation made | Read-only capability audit reports no available `pg_cron`/`pg_net` metadata and no jobs | Named operators/recipients, scheduler/alerts, runbooks, backup/restore drill, RPO/RTO evidence, staffing and retention sign-off are missing. |
| E20 | in_progress | `899daad`; Vercel production `Ready` (`dpl_32zF8QsAcQwUmkwUB13G3JWD5y8j`) | GitHub push, Vercel status, live HTTP audit and live GA client check | The full completion gate is not met while any required integration remains unverified, inaccessible or intentionally disabled. |

## Acceptance boundary

Local tests prove implementation contracts and isolation behavior; they do not prove provider delivery, scheduler execution, GA processed reports, real customer/admin authorization, backup restoration, or live financial correctness. No real charge, refund, destructive deletion, AI enablement, scanner verdict, invitation send, or scheduler configuration was performed by this manifest.

## Next required evidence

1. Reconcile hosted Supabase schema/RLS/grants, memberships and Auth configuration with an authorized read-only production check.
2. Create an isolated staging environment with approved operator/provider policies, scheduler identities, alert recipients and runbooks.
3. Exercise provider sandbox webhook/reconciliation/action flows, support email/scanner flows, backup restore, privacy export/deletion, and authenticated admin/customer/guest journeys.
4. Obtain GA reporting access and verify processed events/freshness; then repeat the complete E18–E20 acceptance matrix before claiming the plan complete. The saved dashboard is an operational view, not a substitute for that verification.
