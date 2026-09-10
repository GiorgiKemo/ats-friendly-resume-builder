# ResumeATS implementation evidence manifest

Checked 2026-09-10 (Asia/Tbilisi) against the current `main` checkout and the linked production services. This manifest separates source/local evidence from staging and production evidence; an in-progress or blocked row is not a completion claim.

## Release under review

- Source hardening commits `943ad68` (`Make Stripe customer creation retry-safe`)
  and `c08bafd` (`Harden subscription entitlement ordering`) remain pushed to
  `main`, with evidence commit `7ddb0a8`. The current frontend release is
  `66fea1f` (`Move auth redirects out of render`), following the previously
  shipped privacy-request flow in `e598e59`. The billing source changes remain
  distinct from the previously deployed Edge Function inventory until an
  authorized Supabase deployment succeeds.
- GitHub: the validated release is published from the current `main` checkout.
- Vercel: current production deployment `dpl_Ew9UtJds7bJ4qkdJWNcUZgaDtigb` (`ats-friendly-resume-builder-g0m68x1rh-giorgikemos-projects.vercel.app`) is `Ready`, built from commit `66fea1f`, and owns the canonical aliases `https://www.resumeats.cv` and `https://resumeats.cv`.
- Production HTTP audit: `npm run audit:production:http` passed with `failures: []` at `2026-09-10T02:43:52Z`.
- Full automated suite: `npm test -- --test-concurrency=1 --test-timeout=60000` passed with 1,213 tests; lint, `npm run build`, `npm run check:repo`, `npm run check:supabase:functions`, and `npm run audit:accessibility` also passed.
- Browser regression gates: `npm run test:website:full` passed all 15 fixture journeys with no console/page errors, `npm run test:website:support` passed guest recovery/isolation, handoff, operator resolution, CSAT, and overflow checks, `npm run test:extension:chromium` passed, `npm run test:extension:firefox` passed with `blockers: []` at `2026-09-10T02:35:14Z`, and `npm run test:website:smoke` passed 32 routes.
- Support availability UX: the widget now distinguishes an unavailable routing probe from a still-loading probe and tells customers that messages can still be sent when availability metadata is unavailable; the existing support API remains fail-closed and the fallback is covered by `securityHardening.test.js`.
- Additional release checks: `npx --no-install tsc --noEmit` passed, `npm audit --omit=dev` reported zero vulnerabilities, and live `www.resumeats.cv` headers include HSTS, CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, strict referrer policy, and a restrictive Permissions Policy.
- Live browser verification: `https://www.resumeats.cv/privacy-policy` links to the deployed prefilled deletion-request flow at `https://www.resumeats.cv/contact?request=privacy-deletion`; the form explicitly states that deletion is support-reviewed and not immediate.
- Live pricing verification: the selected in-app browser switched the production Premium selector from monthly to yearly and exposed `$99.99 /year`, `Save $19.89 compared with paying monthly`, and the matching yearly signup link without a checkout mutation.
- Live auth-boundary verification: the deployed Dashboard and Application Tracker bundles contain effect-based `/signin` redirects with history replacement; unauthenticated navigation no longer calls `navigate` during render.
- Release packaging hardening commit `295b528` excludes local QA artifacts from Vercel uploads while retaining the shared browser resume renderer. The local production build passes (1,240 modules); the lean upload was reduced to 1.5 MB / 262 files. The subsequent Git-connected production deployment `dpl_9yJE1sqWYLZmt3HaU7wx92qWjmLm` is `Ready`, so the packaging fix is now live.
- Supabase capability audit: `npm run audit:production:capabilities` is read-only; the latest successful probe at `2026-09-10T02:04:11Z` observed 76 local/remote migration versions, all 29 local functions represented among 31 deployed functions, payment/email credential names present, worker credential groups missing, and no available `pg_cron`/`pg_net` scheduler metadata.
- Targeted Supabase deployment attempt for `create-checkout-session`, `stripe-webhook`, and `verify-checkout-session` used the current CLI/token and reached the deploy endpoint, but all three were rejected with HTTP 403 (`account does not have the necessary privileges`); no backend release is claimed from that attempt.
- Selected-browser provider check: opening the project Edge Functions URL redirected to Supabase sign-in, confirming that no authenticated dashboard session is available for an owner-authorized deployment or production inspection.
- GA4 provider check: the owner browser verified property `552904382` / `ResumeATS`, stream `ResumeATS Website` at `https://resumeats.cv`, measurement ID `G-1M08TLZ4CB`, active data collection, and readable processed reports; the current report has no recent custom conversion events, so the configured purchase conversion rate remains 0% rather than being inferred as missing data. Server-side Reporting API credentials remain unverified.
- Search Console provider check: the authenticated owner browser verified the `sc-domain:resumeats.cv` property and successful eight-URL sitemap submissions. Six canonical `www` URLs were accepted into Google's priority crawl queue; the remaining two requests hit Google's daily manual-request quota. The current Pages report remains asynchronous and stale at 2 indexed / 8 not indexed. Full details are in `evidence/20260910-search-console-indexing.md`.
- Authenticated production admin QA: the owner browser reached `/admin`, `/admin/users`, and a routed `/admin/users/:userId` customer detail, loaded the overview, first-party analytics, and subscriptions sections, verified Light/Dark theme switching, and confirmed that unavailable conversion, provider-projection, and scheduler metrics remain explicitly unavailable. Privacy-safe details are in `evidence/20260910-production-admin-qa.md`.
- Linked database metadata is also readable without row access: 59 public
  tables, all 59 with RLS enabled, 46 public policies, and 133 public
  functions; grants, memberships, and row-level production behavior remain
  separate gates.

## Ordered work packages

| Task | Status | Commit / versions | Environment and evidence | Known limitation / next action |
| --- | --- | --- | --- | --- |
| E00 | in_progress | 76 migration versions; read-only capability audit | Local checkout, linked Supabase capability audit, production HTTP audit, and privacy-safe database metadata (59 public tables / 59 RLS-enabled; one active owner member) | Provider ownership, GA reporting access, scheduler, backups and email configuration still need owner-authorized discovery; the linked scheduler probe reports no available `pg_cron`/`pg_net` metadata, while policy predicates and grants are not exposed by this audit. |
| E01 | passed locally | Consent/UI commits through `885b8cd` | Local browser screenshots and responsive checks at desktop/mobile; admin light/dark evidence in `evidence/20260909-local-verification.md`; mobile admin drawer now has focus trap, Escape restoration, and modal semantics | Hosted verification is recorded separately; full supported-browser accessibility evidence remains open. |
| E02 | in_progress | Current admin migrations/functions | Local authorization, AAL2, idempotency and audit tests | Production authenticated role/session matrix has not been exercised. |
| E03 | passed for current schema | 76 migrations; local replay and linked parity | Local reset/lint/replay plus read-only remote migration and database-metadata audits | A full production grants/membership and row-level behavior evidence package is still not available. |
| E04 | in_progress | Entitlement/billing migrations and billing functions in source; prior deployed inventory | Local overlap/expiry/provider tests plus current source hardening for subscription identity, event ordering and Stripe customer idempotency | The latest billing source changes are pushed but the linked Supabase project rejected Edge Function deployment with HTTP 403; provider sandbox replay, reconciliation scheduler and unexplained-difference review remain open. |
| E05 | in_progress | Directory/customer-360 implementation plus routed `/admin/users/:userId` detail | Local cursor/ownership/scale tests and authenticated production owner-browser route check | Production export/deletion checks remain open. |
| E06 | in_progress | Admin UI and team flows with URL-backed sections | Local owner/browser evidence plus production `/admin/users` deep-link check | Invitation delivery and production role-management verification remain open. |
| E07 | in_progress | Analytics consent/funnel implementation | Local tests plus live GA4 consent-gating/client-delivery check; owner-browser property/stream and processed-report evidence in `20260910-ga4-dashboard.md` | No recent `sign_up`, `begin_checkout` or `purchase` events are present in the provider's current event list; real authenticated conversion journeys and server-side reporting credentials remain open. |
| E08 | in_progress | First-party analytics/admin reporting code | Local metric/reconciliation/export tests plus the saved GA4 `ResumeATS Growth & Conversion` dashboard and current processed-report check | GA reporting cache, server-side API access, mature first-party cohorts and production admin drill-down remain open. |
| E09 | in_progress | Billing projection/reconciliation functions | Local provider-contract tests; prior deployed functions plus current source timestamp-ordering hardening; hosted Subscriptions view and webhook-reconciliation receipts loaded in `evidence/20260910-production-admin-qa.md` | Latest Edge Function source is not claimed live because Supabase deployment returned HTTP 403. Scheduler completion, provider sandbox replay, transaction/subscription projections, and unexplained-difference review remain open. |
| E10 | in_progress | Disabled-by-default billing action worker | Local idempotency/worker safety tests | Capability policy review and provider sandbox execution are intentionally not enabled. |
| E11 | in_progress | Support persistence and guest boundaries | Local RLS/API/browser support evidence | Hosted delivery/reconnect and production authenticated support verification remain open. |
| E12 | in_progress | Attachment quarantine/storage contract | Local storage/RLS/worker tests | Scanner endpoint and scanner credential are absent; no upload is claimed clean by default. |
| E13 | in_progress | Inbox, assignment, SLA and human handoff | Local two-context support browser evidence | Named staffing, production presence and alert delivery are not verified. |
| E14 | in_progress | Notifications, knowledge and feedback | Local outbox/knowledge/feedback tests | Invitation/support email provider configuration, inbound threading and production delivery evidence remain open. |
| E15 | blocked | Support AI worker deployed but gated | Local fail-closed/structured-output/handoff tests | Approved provider/model, region/data policy, budget owner, secrets, scheduler and adversarial review are missing. |
| E16 | in_progress | Admin jobs/settings/feedback surfaces | Local browser and contract tests | Production operator verification and configured integrations remain open. |
| E17 | blocked | Privacy workers deployed but gated | Local hold/export/deletion worker tests | Staging backup/restore and destructive deletion drill, provider reconciliation and scheduler are missing. |
| E18 | blocked | Current automated/local gates pass | 1,212 tests, build/lint, repo/function checks, dedicated accessibility audit, local browser evidence including 15-step fixture QA, support end-to-end QA, Chromium extension QA, 32-route smoke, responsive drawer/full-page QA, public production smoke, and routed admin owner-browser check | Actual supported-browser staging/provider/performance/accessibility evidence and authenticated production journeys are incomplete. |
| E19 | blocked | No production scheduler/alert mutation made | Read-only capability audit reports no available `pg_cron`/`pg_net` metadata and no jobs | Named operators/recipients, scheduler/alerts, runbooks, backup/restore drill, RPO/RTO evidence, staffing and retention sign-off are missing. |
| E20 | in_progress | Frontend source `66fea1f`; current production `dpl_Ew9UtJds7bJ4qkdJWNcUZgaDtigb`; evidence source `34efaff`; packaging source `295b528`; billing source `943ad68`/`c08bafd` | GitHub push, Vercel status, live HTTP audit, live privacy-request browser flow, live FAQ/support browser flow, live pricing selector flow, live GA client check, Search Console evidence, and authenticated production admin/deep-link QA in `evidence/20260910-production-admin-qa.md` | The full completion gate is not met while any required integration remains unverified, inaccessible or intentionally disabled; the latest Supabase Edge Function source is repository-verified but deployment is blocked by project access. |

## Acceptance boundary

Local tests prove implementation contracts and isolation behavior; they do not prove provider delivery, scheduler execution, GA processed reports, real customer/admin authorization, backup restoration, or live financial correctness. No real charge, refund, destructive deletion, AI enablement, scanner verdict, invitation send, or scheduler configuration was performed by this manifest.

## Next required evidence

1. Reconcile hosted Supabase schema/RLS/grants, memberships and Auth configuration with an authorized read-only production check.
2. Create an isolated staging environment with approved operator/provider policies, scheduler identities, alert recipients and runbooks.
3. Exercise provider sandbox webhook/reconciliation/action flows, support email/scanner flows, backup restore, privacy export/deletion, and authenticated admin/customer/guest journeys.
4. Obtain GA reporting access and verify processed events/freshness; then repeat the complete E18–E20 acceptance matrix before claiming the plan complete. The saved dashboard is an operational view, not a substitute for that verification.
5. After Google's manual-request quota refresh, request the remaining canonical privacy and terms URLs and recheck indexing after Google recrawls them.
