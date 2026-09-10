# ResumeATS implementation evidence manifest

Checked 2026-09-10 (Asia/Tbilisi) against the current `main` checkout and the linked production services. This manifest separates source/local evidence from staging and production evidence; an in-progress or blocked row is not a completion claim.

## Release under review

### 2026-09-10 follow-up

- Source commit `5cd5076` (`Make resume creation failures recoverable`) is pushed
  to `main`. `/new` now keeps failed or slow resume creation visible with an
  accessible persistent recovery message instead of relying on a transient toast;
  the route lifecycle suite covers the failure path.
- Vercel deployment `dpl_Hcy9HA4SxXh37DQdx5d5ocaQNpQk` is `READY`/`PROMOTED`
  and owns `https://www.resumeats.cv` and `https://resumeats.cv`. The live
  `NewResume-Dgbl4Usy.js` bundle contains both the recovery alert and slow-request
  status copy.
- The fresh production HTTP audit passed with `failures: []` at
  `2026-09-10T05:22:13.010Z`; all checked public/private routes, function CORS
  responses, and dynamic assets passed.
- The current full suite passes `1,223/1,223` tests with zero failures; lint,
  build, repository/function checks, accessibility audit, and `npm audit --omit=dev`
  (zero vulnerabilities) also pass.

### 2026-09-10 export follow-up

- Source commit `5646ecc` (`Keep resume export outcomes visible`) is pushed to
  `main`. The `/preview` export journey now keeps a persistent, accessible PDF/DOCX
  success or failure message after the toast disappears; the route lifecycle suite
  covers the success state.
- Local verification is green: `1,224/1,224` tests, lint, production build,
  repository/function checks, and zero production dependency vulnerabilities.
- The current Vercel production deployment remains `dpl_Hcy9HA4SxXh37DQdx5d5ocaQNpQk`
  (the preceding `5cd5076` release). A manual production deployment of `5646ecc`
  was rejected by Vercel's account limit `api-deployments-free-per-day`; the new
  export bundle is therefore not claimed live until Vercel accepts a deployment.
- Fresh production HTTP audit still passes with `failures: []` at
  `2026-09-10T05:31:32.446Z` for the currently promoted release.

### 2026-09-10 quick-preview follow-up

- Source commit `6a435fb` (`Keep quick export feedback visible`) is pushed to
  `main`. Builder desktop and mobile quick previews now keep export success or
  failure feedback visible outside fullscreen as well as inside it; the focused
  preview suite and full lifecycle coverage pass.
- The full suite remains `1,224/1,224`, with lint and production build passing.

### 2026-09-10 desktop export-controls follow-up

- Source commit `748383f` (`Expose desktop export controls in preview`) is pushed
  to `main`. The normal desktop quick preview now exposes the same PDF/DOCX
  format selector and Export action that were previously available only inside
  fullscreen; the focused preview suite, full suite (`1,224/1,224`), lint, and
  production build pass.
- Synthetic in-app-browser QA at desktop width confirmed the normal preview
  accessibility tree exposes `Export format`, a DOCX-valued selector, Export,
  and View fullscreen controls.
- The currently promoted Vercel deployment remains
  `dpl_zJgkDmpy5VWgGm51UxUxdbmDugG8`, which predates `748383f`; a new manual
  deployment is blocked by Vercel's account limit `api-deployments-free-per-day`.
  The desktop-control patch is therefore not claimed live until a deployment
  containing `748383f` reaches `READY` and the canonical HTTP/bundle audits are
  rerun.

### 2026-09-10 verified deployment

- Vercel deployment `dpl_zJgkDmpy5VWgGm51UxUxdbmDugG8` reached `READY` for
  Production and owns the canonical `www.resumeats.cv` and `resumeats.cv`
  aliases. It contains the pushed export-feedback changes.
- The live dynamic bundles now include `ResumeExportFeedback-DVD8TzRk.js`,
  `ResumePreview-B8OG3lNk.js`, and `ResumeBuilder-CNeyAv-C.js`; bundle checks
  confirm the persistent export feedback path is present.
- The production HTTP audit passed with `failures: []` at
  `2026-09-10T05:36:49.921Z` after promotion.

- Source hardening commits `943ad68` (`Make Stripe customer creation retry-safe`)
  and `c08bafd` (`Harden subscription entitlement ordering`) remain pushed to
  `main`, with evidence commit `7ddb0a8`. The promoted frontend release is
  `dbd199c` (`Record HTML injection audit evidence`), following the previously
  shipped privacy-request flow in `e598e59`. The billing source changes and
  profile-policy cleanup are now applied to the linked Supabase project.
- GitHub: the validated release is published from the current `main` checkout.
- Current implementation source head: `6dd30c3` (`Make subscription success state truthful`), following
  `69c4f2f` (`Keep dashboard usable while plan status loads`),
  `9f2e928` (`Keep free resume editor available while entitlement loads`),
  `505f975` (`Focus headings for anchored navigation`), `80b0e62` (`Refine route focus treatment`), `a7adc0c` (`Tighten unused CSP origins`) and `8d0f805` (`Include shared resume helper in Vercel bundle`), `1446c49` provider
  redirect hardening, and `665947b` support attachment URL hardening.
- Vercel: current production deployment `dpl_AXjy2btB1ndRieNtUyG7cwrdXYQo` (`ats-friendly-resume-builder-ntbo4iilm-giorgikemos-projects.vercel.app`) is `READY`/`PROMOTED`, and owns the canonical aliases `https://www.resumeats.cv` and `https://resumeats.cv`; the route-focus CSS, heading-focus behavior, entitlement-loading fixes, and truthful subscription result state are verified in the promoted asset bundles.
- Production HTTP audit: `npm run audit:production:http` passed with `failures: []` at `2026-09-10T05:04:21.026Z`; the audit now sends the canonical browser Origin and verifies all checked Edge Functions return `Access-Control-Allow-Origin: https://www.resumeats.cv`.
- Full automated suite: `npm test -- --test-concurrency=1 --test-timeout=60000` passed with 1,222 tests; lint and `npm run build` also passed for the current source. The existing repo/function/accessibility checks remain green from the preceding release evidence.
- Browser regression gates: `npm run test:website:full` passed all 15 fixture journeys with no console/page errors, `npm run test:website:support` passed guest recovery/isolation, handoff, operator resolution, CSAT, and overflow checks, `npm run test:extension:chromium` passed, `npm run test:extension:firefox` passed with `blockers: []` at `2026-09-10T02:35:14Z`, and `npm run test:website:smoke` passed 32 routes.
- Support availability UX: the widget now distinguishes an unavailable routing probe from a still-loading probe and tells customers that messages can still be sent when availability metadata is unavailable; the existing support API remains fail-closed and the fallback is covered by `securityHardening.test.js`.
- Auth navigation hardening: the `/new` route now performs its unauthenticated `/signup` redirect in an effect with history replacement instead of navigating during render; the route lifecycle suite covers the settled unauthenticated state.
- HTML injection audit: the React surface has no `dangerouslySetInnerHTML`, `insertAdjacentHTML`, or unreviewed `innerHTML` path; extension HTML templates consistently escape captured job, queue, insight, and profile values before insertion. The only remaining raw HTML assignments are static templates or DOM text extraction used by the extension.
- CSP hardening: source commit `a7adc0c` removes unused Google Fonts and `via.placeholder.com` origins from `vercel.json` and `public/_headers`, with a regression guard in the security suite. Fresh no-cache requests to both canonical production aliases now confirm those origins are absent from the live CSP.
- Route-focus polish: source commit `80b0e62` reduces the programmatic heading focus outline from a heavy 3px/6px frame to a restrained 2px/4px treatment while preserving a visible keyboard and screen-reader route cue; local build, lint, accessibility checks, and the current live CSS bundle all verify the restrained treatment. Follow-up source commit `505f975` focuses an anchored section's first heading instead of its entire card for a cleaner screen-reader announcement; local checks and live browser AX/screenshot checks pass.
- Entitlement-loading UX: source commit `9f2e928` keeps the free editor and premium route choice available while subscription status is pending, while preserving server-side free-plan enforcement; the focused lifecycle regression and full suite pass. Follow-up source commit `69c4f2f` keeps saved-work actions usable on Dashboard while plan status is pending; both fixes are present in the promoted bundles.
- Payment-result truthfulness: source commit `6dd30c3` prevents `/subscription/success` from claiming a successful upgrade when the account is inactive or payment verification is unresolved; it keeps the dashboard redirect restricted to an authoritative active/trialing result, adds pending/error actions, and is covered by two focused lifecycle tests. The promoted `SubscriptionSuccess-BW9169tE.js` bundle contains the pending/error copy.
- Additional release checks: `npx --no-install tsc --noEmit` passed, `npm audit --omit=dev` reported zero vulnerabilities, and live `www.resumeats.cv` headers include HSTS, CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, strict referrer policy, and a restrictive Permissions Policy.
- Live browser verification: `https://www.resumeats.cv/privacy-policy` links to the deployed prefilled deletion-request flow at `https://www.resumeats.cv/contact?request=privacy-deletion`; the form explicitly states that deletion is support-reviewed and not immediate.
- Live pricing verification: the selected in-app browser switched the production Premium selector from monthly to yearly and exposed `$99.99 /year`, `Save $19.89 compared with paying monthly`, and the matching yearly signup link without a checkout mutation.
- Live auth-boundary verification: the deployed Dashboard and Application Tracker bundles contain effect-based `/signin` redirects with history replacement; unauthenticated navigation no longer calls `navigate` during render. Fresh anonymous in-app-browser navigation to `/new` resolved to `/signin` and exposed the sign-in form without a console/page error; the live `/dashboard` check also resolved to `/signin`.
- Admin privacy export hardening: the deployed `AdminDashboard` bundle now sanitizes provider-returned export URLs through the shared HTTP(S)-only URL policy and uses `noopener noreferrer`; the focused security suite and live bundle inspection both confirm the direct untrusted `download_url` href is gone.
- Support attachment hardening: source commit `665947b` sanitizes signed attachment URLs before `window.open` and fails closed on malformed schemes; the focused security suite and full suite pass, and the fix is included in promoted production commit `dbd199c`.
- Provider redirect hardening: source commit `1446c49` validates Gmail OAuth, Stripe Checkout, and Stripe Billing Portal destinations against exact HTTPS provider origins before navigation; focused security tests pass, and the fix is included in promoted production commit `dbd199c`.
- Release packaging hardening commit `295b528` excludes local QA artifacts from Vercel uploads. A later Vercel build attempt (`dpl_HfqvM7y7feQN4vZhH6GpEYCe2ejV`, source `6329030`) proved that the prior `.vercelignore` exceptions still omitted the browser-imported shared resume helper; the build failed with `UNRESOLVED_IMPORT`. Commits `8d0f805` and `f977725` now explicitly retain `supabase/functions/_shared/resume/*.js`; the corrected source is included in promoted production commit `dbd199c`, and the local production build passes 1,240 modules.
- Supabase capability audit: `npm run audit:production:capabilities` is read-only; the latest probe at `2026-09-10T05:07:19.451Z` observed 77 local and 77 remote migrations, all 29 local functions represented among 31 deployed functions, payment/email credential names present, worker credential groups missing, and no available `pg_cron`/`pg_net` scheduler metadata. The remote metadata has no `public`-role policy on `public.users`; migration `d2a0d14` is applied and the owner-read policy is `authenticated`-only. A live anonymous REST probe for `users?select=id&limit=0` still returned `401/42501 permission denied`.
- Supabase release verification: the initial function/migration attempt received HTTP 403, but retrying with the configured project access token succeeded. `create-checkout-session`, `stripe-webhook`, and `verify-checkout-session` deployed at `2026-09-10T08:07:38+04:00`, and migration `20260910035425_remove_legacy_public_users_select_policy.sql` applied successfully.
- Vercel release verification: deployment `dpl_AXjy2btB1ndRieNtUyG7cwrdXYQo` is `READY`/`PROMOTED` and owns the canonical aliases. Its live `NewResume-CbPptr4N.js`, `Dashboard-DDl1xbwj.js`, and `SubscriptionSuccess-BW9169tE.js` bundles contain the three latest UX fixes from `9f2e928`, `69c4f2f`, and `6dd30c3`.
- Selected-browser provider check: opening the project Edge Functions URL redirected to Supabase sign-in, confirming that no authenticated dashboard session is available for an owner-authorized deployment or production inspection.
- GA4 provider check: the owner browser verified property `552904382` / `ResumeATS`, stream `ResumeATS Website` at `https://resumeats.cv`, measurement ID `G-1M08TLZ4CB`, active data collection, and readable processed reports; the current report has no recent custom conversion events, so the configured purchase conversion rate remains 0% rather than being inferred as missing data. Server-side Reporting API credentials remain unverified.
- Search Console provider check: the authenticated owner browser verified the `sc-domain:resumeats.cv` property and successful eight-URL sitemap submissions. Six canonical `www` URLs were accepted into Google's priority crawl queue; the remaining two requests hit Google's daily manual-request quota. The current Pages report remains asynchronous and stale at 2 indexed / 8 not indexed. Full details are in `evidence/20260910-search-console-indexing.md`.
- Authenticated production admin QA: the owner browser reached `/admin`, `/admin/users`, and a routed `/admin/users/:userId` customer detail, loaded the overview, first-party analytics, and subscriptions sections, verified Light/Dark theme switching, and confirmed that unavailable conversion, provider-projection, and scheduler metrics remain explicitly unavailable. Privacy-safe details are in `evidence/20260910-production-admin-qa.md`.
- Linked database metadata is also readable without row access: 59 public
  tables, all 59 with RLS enabled, 45 public policies, and 133 public
  functions; grants, memberships, and row-level production behavior remain
  separate gates.

## Ordered work packages

| Task | Status | Commit / versions | Environment and evidence | Known limitation / next action |
| --- | --- | --- | --- | --- |
| E00 | in_progress | 77 migration versions; read-only capability audit | Local checkout, linked Supabase capability audit, production HTTP audit, and privacy-safe database metadata (59 public tables / 59 RLS-enabled; one active owner member) | Provider ownership, GA reporting access, scheduler, backups and email configuration still need owner-authorized discovery; the linked scheduler probe reports no available `pg_cron`/`pg_net` metadata, while policy predicates and grants are not exposed by this audit. |
| E01 | passed locally | Consent/UI commits through `885b8cd` | Local browser screenshots and responsive checks at desktop/mobile; admin light/dark evidence in `evidence/20260909-local-verification.md`; mobile admin drawer now has focus trap, Escape restoration, and modal semantics | Hosted verification is recorded separately; full supported-browser accessibility evidence remains open. |
| E02 | in_progress | Current admin migrations/functions | Local authorization, AAL2, idempotency and audit tests | Production authenticated role/session matrix has not been exercised. |
| E03 | in_progress | 77 local and remote migrations; legacy public profile policy cleanup applied | Local reset/lint/replay, linked migration push, database-metadata audit, and anonymous REST probe; migration `20260910035425_remove_legacy_public_users_select_policy.sql` is applied and the owner-read policy is `authenticated`-only | A full production grants/membership and row-level behavior evidence package is still not available; authenticated owner/member and service-role behavior require isolated production-safe fixtures. |
| E04 | in_progress | Entitlement/billing migrations and payment functions deployed | Local overlap/expiry/provider tests, source hardening for subscription identity/event ordering/Stripe customer idempotency, and targeted deployment of `create-checkout-session`, `stripe-webhook`, and `verify-checkout-session` | Provider sandbox replay, reconciliation scheduler, worker credentials, and unexplained-difference review remain open. |
| E05 | in_progress | Directory/customer-360 implementation plus routed `/admin/users/:userId` detail | Local cursor/ownership/scale tests and authenticated production owner-browser route check | Production export/deletion checks remain open. |
| E06 | in_progress | Admin UI and team flows with URL-backed sections | Local owner/browser evidence plus production `/admin/users` deep-link check | Invitation delivery and production role-management verification remain open. |
| E07 | in_progress | Analytics consent/funnel implementation | Local tests plus live GA4 consent-gating/client-delivery check; owner-browser property/stream and processed-report evidence in `20260910-ga4-dashboard.md` | No recent `sign_up`, `begin_checkout` or `purchase` events are present in the provider's current event list; real authenticated conversion journeys and server-side reporting credentials remain open. |
| E08 | in_progress | First-party analytics/admin reporting code | Local metric/reconciliation/export tests plus the saved GA4 `ResumeATS Growth & Conversion` dashboard and current processed-report check | GA reporting cache, server-side API access, mature first-party cohorts and production admin drill-down remain open. |
| E09 | in_progress | Billing projection/reconciliation functions | Local provider-contract tests; deployed payment functions plus current source timestamp-ordering hardening; hosted Subscriptions view and webhook-reconciliation receipts loaded in `evidence/20260910-production-admin-qa.md` | Scheduler completion, provider sandbox replay, transaction/subscription projections, worker credentials, and unexplained-difference review remain open. |
| E10 | in_progress | Disabled-by-default billing action worker | Local idempotency/worker safety tests | Capability policy review and provider sandbox execution are intentionally not enabled. |
| E11 | in_progress | Support persistence and guest boundaries | Local RLS/API/browser support evidence | Hosted delivery/reconnect and production authenticated support verification remain open. |
| E12 | in_progress | Attachment quarantine/storage contract | Local storage/RLS/worker tests | Scanner endpoint and scanner credential are absent; no upload is claimed clean by default. |
| E13 | in_progress | Inbox, assignment, SLA and human handoff | Local two-context support browser evidence | Named staffing, production presence and alert delivery are not verified. |
| E14 | in_progress | Notifications, knowledge and feedback | Local outbox/knowledge/feedback tests | Invitation/support email provider configuration, inbound threading and production delivery evidence remain open. |
| E15 | blocked | Support AI worker deployed but gated | Local fail-closed/structured-output/handoff tests | Approved provider/model, region/data policy, budget owner, secrets, scheduler and adversarial review are missing. |
| E16 | in_progress | Admin jobs/settings/feedback surfaces | Local browser and contract tests | Production operator verification and configured integrations remain open. |
| E17 | blocked | Privacy workers deployed but gated | Local hold/export/deletion worker tests | Staging backup/restore and destructive deletion drill, provider reconciliation and scheduler are missing. |
| E18 | blocked | Current automated/local gates pass | 1,222 tests, build/lint, repo/function checks, dedicated accessibility audit, local browser evidence including 15-step fixture QA, support end-to-end QA, Chromium and Firefox extension QA, 32-route smoke, responsive drawer/full-page QA, public production smoke, and routed admin owner-browser check | Actual supported-browser staging/provider/performance/accessibility evidence and authenticated production journeys are incomplete. |
| E19 | blocked | No production scheduler/alert mutation made | Read-only capability audit reports no available `pg_cron`/`pg_net` metadata and no jobs | Named operators/recipients, scheduler/alerts, runbooks, backup/restore drill, RPO/RTO evidence, staffing and retention sign-off are missing. |
| E20 | in_progress | Latest implementation source `6dd30c3`; promoted production `dpl_AXjy2btB1ndRieNtUyG7cwrdXYQo`; prior promoted `dpl_ARpryNMhtDJneUzsnxv6bYDh6j6s`, `dpl_F8M3Q2c4oHLibRQxyAzYyUL9XFpG`, `dpl_9cQow2P8ytqafYdFvWd5N3M2vY7J` (`8d66479`), `dpl_6rwe8XUB1chtRfZpcDu8Tm9e879c` (`0a1e6bc`) and `dpl_mf8N6LwBcoPervofFk7CYiuPsmsd` (`dbd199c`); failed build `dpl_HfqvM7y7feQN4vZhH6GpEYCe2ejV`; evidence source `34efaff`; packaging source `295b528`/`8d0f805`; billing source `943ad68`/`c08bafd`; policy cleanup source `d2a0d14` | GitHub push, Vercel status, fresh live HTTP audit, live privacy-request browser flow, live FAQ/support browser flow, live pricing selector flow, live GA client check, Search Console evidence, live CSP tightening, live route-focus CSS and heading-focus behavior, live NewResume/Dashboard/SubscriptionSuccess bundle inspection, live admin export-link hardening, provider redirect and attachment hardening in promoted production, targeted Supabase function deployment, applied policy migration, and authenticated production admin/deep-link QA in `evidence/20260910-production-admin-qa.md` | The full completion gate is not met while any required integration remains unverified, inaccessible or intentionally disabled; provider/scheduler/backup/restore/worker-credential/authenticated journey evidence remains open. |

## Acceptance boundary

Local tests prove implementation contracts and isolation behavior; they do not prove provider delivery, scheduler execution, GA processed reports, real customer/admin authorization, backup restoration, or live financial correctness. No real charge, refund, destructive deletion, AI enablement, scanner verdict, invitation send, or scheduler configuration was performed by this manifest.

## Next required evidence

1. Reconcile hosted Supabase schema/RLS/grants, memberships and Auth configuration with an authorized read-only production check.
2. Create an isolated staging environment with approved operator/provider policies, scheduler identities, alert recipients and runbooks.
3. Exercise provider sandbox webhook/reconciliation/action flows, support email/scanner flows, backup restore, privacy export/deletion, and authenticated admin/customer/guest journeys.
4. Obtain GA reporting access and verify processed events/freshness; then repeat the complete E18–E20 acceptance matrix before claiming the plan complete. The saved dashboard is an operational view, not a substitute for that verification.
5. After Google's manual-request quota refresh, request the remaining canonical privacy and terms URLs and recheck indexing after Google recrawls them.
