# ResumeATS implementation evidence manifest

Refreshed 2026-09-24 (Asia/Tbilisi) against the current checkout and linked production services. This manifest separates source/local evidence from staging and production evidence; an in-progress or blocked row is not a completion claim. The dated entries below remain historical where indicated.

## Current production release — analytics backend and website follow-up deployed (2026-09-24)

- Production has 93/93 migrations with zero history drift. Migration 92 adds privacy-minimized daily event aggregates; migration 93 adds a currency-separated, explicitly incomplete subscription run-rate preview. Thirteen coupled functions remain active with their existing JWT modes, including `admin-api` v24. The exact prior function inventory and boundaries are in [`20260924-production-release-final.md`](20260924-production-release-final.md).
- Website commit `f75d1dc` was pushed to `origin/main`; Vercel deployment `dpl_DxCd5g7ik84BXFSF31HH8ANmii5b` reached `READY` on both canonical aliases. The post-deploy HTTP/asset audit at `2026-09-24T14:16:47.148Z` passed with zero failures. GitHub CI `36011391293` and CodeQL `36011390355` passed for the release commit.
- Current local checks: 1,347 unit tests, lint, build, repository hygiene, Edge Function type-check, and all 93 local PostgreSQL 17 migration replays pass. The 18-step customer fixture flow, support/admin browser suites, 200% zoom, and responsive builder checks pass within their documented synthetic-data boundaries; the latest Chromium run verifies AAL1 aggregate-rebuild denial, AAL2 owner rebuild success, the Product retention D7/D30 cards, and the subscription run-rate panel, with no console/page errors, contrast findings, or overflow. The panel and AAL2 rebuild guard are now deployed; authenticated production owner behavior remains unverified.
- Owner/operations gates remain: 15 missing worker/config values, no scheduler jobs, no verified production owner TOTP factor, no full authenticated production role/session matrix, provider sandbox reconciliation, monitoring, and backup/restore drills. The authorized token was used in process memory for deployment and was not displayed, persisted elsewhere, or added to Function secrets. Vault and unrelated production secrets/Auth settings were not changed.

## Earlier production snapshot — before the follow-up release

- Commits through `14c6a20` are pushed to `origin/main`. Vercel deployment `dpl_M4uShkZDEH9R31Bm2yXAYh74Mspm` is `READY` on both canonical aliases.
- Production migration history remains 86/86; `admin-api` v20 and `support-api` v2 are active. The latest production HTTP audit at `2026-09-24T09:43:44.994Z` returned zero failures across 8 public routes, 21 private-route response checks, 55 referenced assets, and 3 Edge Function GET/CORS checks. Three pending local-only migrations (paid-cohort analytics, QA exclusions, and support queue read-before-assignment) bring the working tree to 89 migration files; none is deployed. The deployed migration `20260924010401` remains unchanged, with its queue-read correction isolated in additive migration `20260924090331`. The PAT-based CLI migration dry-run and Supabase MCP project reads both returned permission errors; the signed-in Dashboard can view project inventories, but no production change was made.
- Current local verification: 1,331 tests, lint, build, Edge Function typecheck, and the previously recorded 89-migration PostgreSQL 17 replay passed; synthetic paid-cohort/QA-exclusion/Storage-RLS fixtures, support AAL1-denial/AAL2-allow behavior, and the `postgres` migration-owner regression guard passed. Replay details and boundaries: [`20260924-local-migration-replay.md`](20260924-local-migration-replay.md). A separate `npm run test:storage:http` proves loopback Storage HTTP, authenticated and guest signed attachment upload, path scoping, quarantine/size-mismatch behavior, and denied direct support-object access; it does not prove scanner execution or production parity. Fresh Chromium, Firefox, and WebKit `support-local-qa` runs pass customer/guest isolation, handoff, resolution, CSAT, AAL1 denial/AAL2 access, QA exclude/re-include, and support read-before-assignment (494 / 496 / 496 keyboard targets respectively; 22 text, 22 non-text, and 110 status-tone audits; zero browser/page errors). A fresh Chromium support/admin run passed all 22 actual 200% zoom checks with zero findings. The 18-step builder/customer fixture flow passes the compact-consent 390px height guard, 32-route smoke test, and 17-route accessibility DOM audit. The tablet-width builder overflow is fixed locally and has not been deployed. The public Home and Learn heading clicks have no pointer focus frame; keyboard focus remains visible. Support and zoom screenshots are in `docs/admin-dashboard-plan/evidence/`; public-site and compact-consent screenshots are in `../product-audit/2026-09-24/` and `../../output/playwright/consent-layout-20260924/`.
- Post-release 200% browser geometry passed all 22 section/theme checks; the overview screenshot at DPR 2 was visually inconsistent with the measured text bounds and is explicitly rejected as evidence.
- GitHub CI `35956959516` and CodeQL `35956959221` passed for `14c6a20`. The CI workflow maps PostgreSQL to a dynamically assigned host port to avoid runner port collisions. Local support/analytics API/UI and migration changes were not part of that release.
- The earlier configured Supabase analytics-function deployment attempt and current CLI migration dry-run were rejected with HTTP 403; Supabase MCP project operations are also denied. No Supabase production change was made.
- Production owner TOTP enrollment, authenticated owner/revoked-session matrix, 15 missing worker/config secrets, scheduler, provider sandbox, monitoring, and backup/restore evidence remain open. Full release detail: [`20260924-production-release-final.md`](20260924-production-release-final.md).

## 2026-09-24 admin Auth-session guard follow-up

- Added local migration `20260923220527_admin_auth_session_guard.sql` and an `admin-api` active-session check. The service-only RPC returns only a boolean, binds `session_id` to the Auth-verified user, and rejects sessions past `not_after`; the API fails closed if the RPC is unavailable.
- Focused backend tests passed 17/17; the isolated PostgreSQL 17 migration replay passed all 81 local migrations and tested role grants, active/matching, expired, missing, and mismatched sessions. The latest `npm test` passed 1,282/1,282; lint, repo hygiene, Supabase function checks, and production build passed. Three consecutive local PostgreSQL 17 replays passed. GitHub CI for commit `484c672` replayed all 81 migrations and the session guard, then failed at a separate 16-way resume-save conflict-count assertion (14 of 15 expected conflicts matched); diagnostic context is being added and hosted CI is not green yet.
- Historical pre-deployment snapshot: production was at 80 migrations when this entry was written. The six reviewed migrations and targeted admin/support functions have since deployed; production session revocation, Data API/Storage behavior, and role matrix remain unverified. Details: [`20260924-admin-session-guard.md`](20260924-admin-session-guard.md) and [`20260924-production-release-final.md`](20260924-production-release-final.md).

## 2026-09-24 default public-object grants follow-up

- Added migration `20260923204601_revoke_automatic_public_object_grants.sql`. For future objects created by migration owner `postgres`, it revokes all default table privileges, all sequence privileges, and function execution from `anon`, `authenticated`, and `service_role`. PostgreSQL adds global `PUBLIC` function defaults to schema defaults, so the migration also revokes global default function execution for that owner. Existing objects and grants are unchanged.
- The isolated SQL replay passed all 80 application migrations, including checks for every table privilege, all sequence privileges, and function execution for each API role. The existing local Supabase database was not reset; the migration was applied with `supabase migration up --local`, and its strengthened ACL statements were re-applied idempotently for a transaction-scoped local probe. The probe passed, and local schema lint reported no errors.
- The full unit suite (1,281 tests), lint, function checks, and production build passed in this work cycle. These validate source/local behavior only.
- After finding the ignored local Supabase CLI credential without displaying it, the linked database query succeeded as `postgres`; the dry-run showed only this migration pending. It was applied without changing Vault secrets. `supabase migration list --linked` and the read-only capability audit now confirm 80 local / 80 remote migrations. The post-deployment default ACLs contain only owner grants. Details are in `20260924-production-capability-audit.md`.

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
- Fresh visual renders of all five text-PDF template mappings are recorded in
  [template-export-comparison-20260910.md](../../audit-2026-09-04/template-export-comparison-20260910.md).
  The first-page outputs were nonblank and retained the synthetic multilingual
  content; exact CSS-preview parity remains an explicit limitation.
- A local synthetic browser completed both the PDF and DOCX quick-preview
  downloads; filesystem and extracted-content checks are recorded in
  [browser-export-delivery-20260910.md](../../audit-2026-09-04/browser-export-delivery-20260910.md).

### 2026-09-10 desktop-controls verified deployment

- Vercel deployment `dpl_EmwWpNWK99dVmJWRq8mmTqn9PTgj` reached `READY` for
  Production and owns the canonical `www.resumeats.cv` and `resumeats.cv`
  aliases. It includes source commit `748383f` and the evidence commit
  `d77196f`.
- The deployed `ResumeBuilder-DEk10LMQ.js` bundle contains both
  `desktopExportFormat` and the persistent export-feedback path. The deployed
  `ResumePreview-2z_LQwU9.js` bundle contains the persistent export-feedback
  path as well.
- The production HTTP audit passed with `failures: []` at
  `2026-09-10T06:11:26.619Z` after promotion.

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

### 2026-09-10 preview/export geometry follow-up

- Source commit `a9f146f` aligns the standalone, desktop-builder, and mobile-builder
  resume previews with the text-native PDF renderer's US Letter geometry (`8.5in`,
  `8.5 / 11`) through shared page tokens. The route lifecycle regression, full
  1,224-test suite, lint, production build, repository hygiene, and accessibility
  audit passed. Current-run synthetic CUA evidence and the rendered PDF comparison
  are recorded in [preview/export page geometry evidence](../../audit-2026-09-04/preview-export-page-geometry-20260910.md).
- Vercel deployment `dpl_5Ab1L3d9uVnetK1GyRqTtdfw1v3w` is `READY`/production and
  owns `https://www.resumeats.cv` and `https://resumeats.cv`. GitHub reports
  `Deployment has completed`; `npm run audit:production:http` passed with
  `failures: []` at `2026-09-10T06:27:40.582Z`. The live bundle exposes the new
  `resumePageGeometry` asset and the updated ResumeBuilder/ResumePreview chunks.
- Follow-up commits `d944029` (template section-label fidelity), `e5af66e`
  (ATS-friendly text/PDF section order), and `82051cb` (DOCX section order) are
  pushed to `main` and pass the full local suite (1,226 tests), lint, build,
  repository hygiene, accessibility and high-severity dependency audit. The
  first GitHub status for this follow-up group reported Vercel's daily quota
  failure before the queue recovered.
- Vercel subsequently promoted commit `cf38adb` as deployment
  `dpl_CfsUrKpwvXtkNQvRdyaGPR8qbgqK` at
  `2026-09-10T06:45:00Z`. That commit includes the three runtime follow-ups
  above; GitHub reports `Deployment has completed`, and the live HTTP audit at
  `2026-09-10T06:48:39.798Z` passed with `failures: []`. The later `9fbefe3`
  commit is documentation-only and has no runtime delta.
- Live bundle inspection of that deployment found the updated
  `docxService-D49fYkVa.js` template maps and
  `resumePdfDocument-D4CWWNxP.js` PDF maps, including the ATS-friendly labels
  `Core Competencies`, `Certifications & Licenses`, and `Additional Projects`,
  as well as the updated `exportText-Clf27tNQ.js` ordering module.

## Ordered work packages

| Task | Status | Commit / versions | Environment and evidence | Known limitation / next action |
| --- | --- | --- | --- | --- |
| E00 | in_progress | Production project `ACTIVE_HEALTHY`; 93 local / 93 production migrations; project-local PAT's documented read-only endpoint is `supabase_read_only_user` with transaction read-only enabled; latest account inventory found no ResumeATS staging project | Fresh production catalog inventory confirms 59/59 public tables RLS-enabled, 29 public policies, 134 public functions (106 `SECURITY DEFINER`, all search paths pinned), 8/8 Storage tables RLS-enabled, and 31 active deployed functions; two deployed function slugs have no local source directory; isolated PostgreSQL and loopback Storage HTTP fixtures cover synthetic resume-folder and support attachment behavior. Read-only refresh: `20260924-e00-access-refresh.md`; detailed catalog evidence: `20260924-production-readonly-grants-inventory.md`. The current release adds migration 93 and deploys `admin-api` v24. | Production REST/RPC/Storage HTTP role/session behavior across the full customer/guest/support/billing/admin/owner/revoked/stale matrix remains untested. The separate `supabase_admin` defaults do not apply to current `postgres`-owned objects; preserve this boundary and recheck migration actor/owners on staging. Worker secrets, scheduler, email/scanner configuration, backup/restore, and provider ownership remain outstanding. |
| E01 | in_progress | Light-first shell and independent Light/Dark/System preference implemented; admin shell now has one top-level heading, distinguishes development from production mode, and provides a shared 2px keyboard-focus ring | Local Chromium flow visits all 11 admin sections, audits main/h1 count, named controls and duplicate IDs, checks Light/Dark overflow at 360/720/768/1024/1440/1920 CSS pixels, and verifies actual 200% per-tab browser zoom, no overflow, and focus visibility/contrast across every section/theme (22 zoom checks); 22 rendered text and 22 interactive-control boundary contrast audits report zero findings; all five shared status tones are rendered and text-contrast audited across all 22 section/theme pairs (110 per engine), with zero findings in Chromium, Firefox and WebKit; support also covers System switching, persistence, mobile Escape/focus restoration, closed-drawer exclusion and customer-widget Light/Dark contrast. Latest full-admin keyboard traversal counters: 480 in Chromium and Firefox; latest support-flow counters: 494/496/496 in Chromium/Firefox/WebKit, all passing. | Status indicators outside the shared badge component, graphics, assistive-technology review, and full-admin cross-browser viewport/zoom coverage remain incomplete. |
| E02 | in_progress | Admin API and direct admin/support authorization require a live signed session; sensitive operator/knowledge access additionally requires AAL2; active-admin ban/deletion requests fail closed. `admin-api` v20 and `support-api` v2 are active in production | Local active/revoked/missing-claim/expired-session, AAL1-denial/AAL2-acceptance, attachment, DB-error, owner concurrency, and deletion-after-revoke proofs; see `20260924-admin-session-guard.md`, `20260924-direct-support-session-guard.md`, `20260924-aal2-support-step-up.md`, and `20260924-active-admin-action-guard.md` | Authenticated production owner/revoked-session behavior remains open; hosted provider/Auth effects are not simulated by local replay. |
| E03 | in_progress | 93 local / 93 production migrations; production history has zero drift, including the deployed daily-aggregate and run-rate-preview migrations | 93-migration isolated replay; daily cache grants/timezone/zero-fill/version invalidation; service-only run-rate RPC, normalization, and exclusion assertions; default-ACL and public SECURITY DEFINER role/search-path assertions; private session/AAL2 predicates; synthetic owner/customer support isolation. Production grant summary is in `20260924-production-capability-audit.md`; release details are in `20260924-production-release-final.md`. | Authenticated user/owner/support behavior and the direct API/RPC/Storage matrix still need fresh verification. |
| E04 | in_progress | Entitlement/billing migrations and updated Stripe/PayPal payment functions are deployed and active | Local overlap/expiry/provider tests, payment identity/event-ordering hardening, analytics transaction correlation, and active checkout/webhook/reconciliation functions | Provider sandbox replay, reconciliation scheduler, worker credentials, and unexplained-difference review remain open. |
| E05 | in_progress | Directory/customer-360 implementation plus routed `/admin/users/:userId` detail | Local cursor/ownership/scale tests and authenticated production owner-browser route check | Production export/deletion checks remain open. |
| E06 | in_progress | Admin UI and team flows with URL-backed sections | Local owner/browser evidence plus production `/admin/users` deep-link check | Invitation delivery and production role-management verification remain open. |
| E07 | in_progress | Consent-gated GA4 funnel; server-side paid-conversion and AI lifecycle instrumentation are deployed; browser analytics remains production-host-only, consent-gated, excludes `/admin`, and uses opaque analytics-event UUIDs for purchase IDs | Passing unit/auth tests, live event schema/function deployment, production HTTP/CORS checks, ResumeATS key-event UI confirmation in `20260924-release-verification.md`, and local consent/environment/manifest contract tests | A real consented signup/AI event receipt, authenticated conversion journey, server-side reporting credentials, and production confirmation of GA4 purchase de-duplication remain open. AI model pricing is unavailable and explicitly marked unpriced. |
| E08 | in_progress | First-party analytics/admin reporting backend, owner-only AAL2 QA exclusion API, daily aggregate migration 92, subscription run-rate migration 93 and `admin-api` v24 are deployed; aggregate and currency-separated preview panels are live in website commit `f75d1dc` | 1,347 unit tests; 93-migration disposable PostgreSQL replay proves 4/10 activation, 3/10 D7 and 3/10 D30 observed fixtures, timezone boundaries, deduplication, QA exclusions, maturity, service-only aggregate access, zero-fill/generation invalidation, and incomplete currency-separated run-rate normalization; Chromium browser flow verifies AAL1 server denial, AAL2 owner rebuild and run-rate panel rendering; saved GA4 `ResumeATS Growth & Conversion` report `15836594687` | All activation/retention final rates remain withheld because event coverage is incomplete or consent-limited. Cached GA reporting, server-side API access, real consented event receipts, mature first-party data and authenticated production drill-down remain open. |
| E09 | in_progress | Billing projection/reconciliation functions | Local provider-contract tests; deployed payment functions plus current source timestamp-ordering hardening; hosted Subscriptions view and webhook-reconciliation receipts loaded in `evidence/20260910-production-admin-qa.md` | Scheduler completion, provider sandbox replay, transaction/subscription projections, worker credentials, and unexplained-difference review remain open. |
| E10 | in_progress | Disabled-by-default billing action worker | Local idempotency/worker safety tests | Capability policy review and provider sandbox execution are intentionally not enabled. |
| E11 | in_progress | Support persistence and guest boundaries | Local RLS/API/browser support evidence | Hosted delivery/reconnect and production authenticated support verification remain open. |
| E12 | in_progress | Attachment quarantine/storage contract | Local worker tests, isolated PostgreSQL Storage-RLS fixtures, and `npm run test:storage:http` verify authenticated/guest signed uploads, path scoping, cross-identity denial, quarantine/size-mismatch handling, and direct-object denial; `20260924-production-readonly-grants-inventory.md` | Scanner execution/credential, clean-file download, malformed-file scanner fixtures, production Storage behavior and deployed function parity remain unverified. The helper-error response mapping regression was fixed and verified locally (wrong guest 401, cross-customer 404, oversized prepare 422). |
| E13 | in_progress | Inbox, assignment, SLA and human handoff | Local two-context support browser evidence | Named staffing, production presence and alert delivery are not verified. |
| E14 | in_progress | Notifications, knowledge and feedback | Local outbox/knowledge/feedback tests | Invitation/support email provider configuration, inbound threading and production delivery evidence remain open. |
| E15 | blocked | Support AI worker deployed but gated | Local fail-closed/structured-output/handoff tests | Approved provider/model, region/data policy, budget owner, secrets, scheduler and adversarial review are missing. |
| E16 | in_progress | Admin jobs/settings/feedback surfaces | Local browser and contract tests | Production operator verification and configured integrations remain open. |
| E17 | blocked | Privacy workers deployed but gated | Local hold/export/deletion worker tests | Staging backup/restore and destructive deletion drill, provider reconciliation and scheduler are missing. |
| E18 | blocked | Local code checks pass; production has 93/93 migrations and 13 coupled Edge Functions active, including `admin-api` v24; website release commit `f75d1dc` is deployed | 1,347 tests; lint/build/function/repo checks; 93-migration replay and targeted paid/activation/retention/QA/support/aggregate/run-rate fixtures; schema lint; public/auth accessibility DOM audit; 18-step fixture browser flow; 32-route smoke test; Chromium/Firefox/WebKit support/admin AAL2 browser flows; responsive and 200% zoom checks; contrast audits; latest Chromium AAL1-denial/AAL2-rebuild and retention-card assertions. | Supported-browser staging/provider/performance/accessibility evidence, authenticated production journeys, provider sandbox checks, and backup/restore evidence remain incomplete. |
| E19 | blocked | No production scheduler/alert mutation made | Read-only capability audit reports no available `pg_cron`/`pg_net` metadata and no jobs | Named operators/recipients, scheduler/alerts, runbooks, backup/restore drill, RPO/RTO evidence, staffing and retention sign-off are missing. |
| E20 | in_progress | `origin/main` is at `f75d1dc`; Vercel `dpl_DxCd5g7ik84BXFSF31HH8ANmii5b` is `READY` on canonical aliases | The deployed release has migrations 92–93 and `admin-api` v24; CI `36011391293` and CodeQL `36011390355` passed, and live HTTP/asset verification returned zero failures. The release includes the currency-separated run-rate panel and AAL2-gated rebuild control. No production Auth setting, Vault secret, or unrelated Function secret was changed. | Worker credentials, scheduler/alerts, backup/restore, provider sandbox checks, authenticated production journeys, and separate staging availability remain open. |

## Acceptance boundary

Local tests prove implementation contracts and isolation behavior; they do not prove provider delivery, scheduler execution, GA processed reports, real customer/admin authorization, backup restoration, or live financial correctness. No real charge, refund, destructive deletion, AI enablement, scanner verdict, invitation send, or scheduler configuration was performed by this manifest.

## Next required evidence

1. Confirm the migration actor remains `postgres` in isolated staging and run the production-safe role/session matrix across REST/RPC/Storage there; current catalog/role evidence is not a substitute for row-level tests or HTTP behavior.
2. Create an isolated staging environment with approved operator/provider policies, scheduler identities, alert recipients and runbooks.
3. Exercise provider sandbox webhook/reconciliation/action flows, support email/scanner flows, backup restore, privacy export/deletion, and authenticated admin/customer/guest journeys.
4. Obtain GA reporting access and verify processed events/freshness; then repeat the complete E18–E20 acceptance matrix before claiming the plan complete. The saved dashboard is an operational view, not a substitute for that verification.
5. After Google's manual-request quota refresh, request the remaining canonical privacy and terms URLs and recheck indexing after Google recrawls them.
