# Earlier production release snapshot — 2026-09-24

This section records the release state before the follow-up coordinated release below. It is local audit evidence, not a production-readiness claim.

## Released

- Commits through `14c6a20` are pushed to `origin/main`, including the three-engine support QA, routed customer-response assertion, and admin/support usability fixes.
- Vercel deployment `dpl_M4uShkZDEH9R31Bm2yXAYh74Mspm` is `READY` for `14c6a20` and owns `https://www.resumeats.cv` and `https://resumeats.cv`.
- Production has 86 applied migrations, with 86/86 linked history parity. One uncommitted local analytics cohort migration is number 87 and is not applied in production.
- `admin-api` v20 and `support-api` v2 are `ACTIVE`. Both retain `verify_jwt=false` because their handlers verify bearer credentials and enforce the new live-session/AAL2 boundaries themselves.
- Vault/secrets were skipped during migration deployment. No production secrets, Auth settings, TOTP factors, or provider configuration were changed.

## Verification

- `npm test`: 1,310 passed, 0 failed on the current working tree.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npm run check:supabase:functions`: passed Deno typecheck for all 29 current Edge Function entry points.
- `npm run test:migration-replay`: all 87 current local migrations replayed on a loopback-only PostgreSQL 17 container. A separate synthetic fixture verified mature-cohort numerator/denominator, day-29 inclusion, exact-day-30 exclusion, active-staff exclusion, and the QA/reconciliation quality gate. These local-only analytics tests do not establish production data quality or readiness.
- `SUPPORT_QA_BROWSER_ZOOM=1 npm run test:website:support`: passed the current Chromium support/admin flow, including 22 rendered text-contrast checks, 110 shared-status-tone checks, 22 control-boundary checks, 468 keyboard targets, and 22 actual 200% zoom checks with zero findings, console errors, or page errors.
- `SUPPORT_QA_BROWSER_ZOOM=1 npm run test:website:support`: passed guest recovery/isolation/handoff/resolution/feedback and AAL1-denial/AAL2-acceptance; 468 keyboard targets, 22 real 200% zoom checks (11 sections × Light/Dark), 22 rendered text-contrast audits and 22 control-boundary audits with zero findings, no overflow, zero console or page errors.
- A post-release Chromium rerun also passed all 22 zoom checks. At 200%, measured viewport/document/body widths were 632/624/625 CSS px, the main content ended at x=624.5, and the H1 text range ended at x=379.4; all fit inside the viewport. The 632×402 DPR-2 screenshot artifact did not visually agree with these measurements, so it is rejected as visual proof and is not used to claim clipping or its absence.
- Local QA harness follow-ups (DOM-ready waits and keyboard activation in the mobile drawer) made the long zoom flow complete reliably. The current pushed source commit is `14c6a20`; separate analytics UI/API work and its cohort migration are uncommitted and not deployed.
- Firefox and WebKit support-flow QA also passed with 22 text-contrast and 22 non-text audits each, zero findings/incomplete scans, 468 keyboard targets, and zero console/page errors. The additional routed-customer API-response assertion passed in Chromium.
- `npm run audit:production:http` at `2026-09-24T05:06:15.745Z`: zero failures; all 8 checked public routes and 8 deployed JS/CSS assets returned HTTP 200. Canonical home URL is `https://www.resumeats.cv/`.
- An isolated public-browser screenshot after clicking the home hero heading showed no pointer focus frame. The evaluated heading was not focused and computed `outline-style` was `none`; screenshot: [`../../product-audit/2026-09-24/production-home-hero-after-text-click-final.png`](../../product-audit/2026-09-24/production-home-hero-after-text-click-final.png). Public signup screenshot: [`../../product-audit/2026-09-24/production-signup-after-release.png`](../../product-audit/2026-09-24/production-signup-after-release.png).
- GitHub CI run `35956959516` and CodeQL run `35956959221` both completed successfully for `14c6a20`. PostgreSQL used a dynamically assigned port; lint, repository hygiene, migration/authorization replay, unit tests, dependency audit, Deno function typecheck, build, route/accessibility/fixture browser QA, and extension jobs all passed.
- A local analytics API/function deployment attempt returned HTTP 403 because the active Supabase token lacks `deploy_edge_function` permission. No production analytics migration, API update, secret, or Auth configuration was changed. The analytics UI/API contract and cohort migration remain local-only so the production frontend is not left incompatible with the active function.

## Remaining release gates

- Production currently has one active owner and no verified TOTP factor. The owner must enroll and verify their own factor through Admin MFA before high-risk owner actions can be exercised in production. Do not send or store the one-time code.
- Fifteen worker/config secret names are absent, and no scheduler jobs are configured. Billing-action/reconciliation, scanner/notification, privacy, invitation, and Support AI workers remain gated; no missing values were invented or uploaded.
- A full authenticated production role/session matrix (including revoked/stale sessions, direct REST/RPC/Storage boundaries), provider sandbox/reconciliation review, operational alerts, and backup/restore drills remain unverified.

## Follow-up backend release — 2026-09-24

- `supabase db push` applied migrations `20260924044734`, `20260924065849`, and `20260924090331` after a fresh dry run showed exactly those three files. A subsequent remote-history read confirms 89 local / 89 remote migrations, zero drift, and zero pending migrations.
- Thirteen Edge Functions were deployed and independently verified `ACTIVE`: `admin-api` v21, `support-api` v3, `analyze-keywords` v36, `auto-apply-run` v37, `gmail-scan` v21, `groq-proxy` v36, `openrouter-proxy` v16, `create-checkout-session` v38, `verify-checkout-session` v37, `stripe-webhook` v34, `paypal-billing` v6, `paypal-webhook` v4, and `billing-reconciliation` v2. All 13 retained their previous `verify_jwt` setting.
- CORS preflight checks for `analyze-keywords`, `auto-apply-run`, `gmail-scan`, `groq-proxy`, and `openrouter-proxy` all accepted `x-analytics-consent` and `x-ai-feature`; `analyze-keywords` returns 200 for OPTIONS while the others return 204, both with valid CORS headers.
- No access token or other new value was written to Supabase Function secrets; no Auth settings or owner TOTP factors were changed. The 15 worker/config values absent from production and the missing scheduler remain separate owner/operations gates.
- Current local verification is 1,328/1,328 tests, lint, repository hygiene, Edge Function type-check, production build, and all 89 local migration replays. The latest public HTTP/asset audit at `2026-09-24T11:09:08.550Z` had zero failures; it preceded the final two AI-function deployments, which were then covered by the CORS preflight check.
- At this snapshot the website source commit has not yet been pushed. Vercel `READY`, canonical asset delivery, and the post-push HTTP audit are still required before calling the website release live.

## Website production promotion — 2026-09-24

- Commit `93b17f1` was pushed to `origin/main`. Vercel deployment `dpl_7dAqfsj1HcjWgfQwW9QUuxAMbjvL` reached `READY` and owns both `www.resumeats.cv` and `resumeats.cv`.
- The post-promotion public HTTP/asset audit at `2026-09-24T11:54:25.558Z` exited 0 with no failures: 8 public routes, 21 private route shells, 55 referenced static/dynamic assets, and 3 function health checks.
- A live pointer click on the homepage headline shows no focus ring; keyboard focus remains visibly indicated on the skip link. Captures are in [`../../product-audit/2026-09-24/`](../../product-audit/2026-09-24/).
- Production readiness is not complete: the 15 missing worker/config values, scheduler setup, owner-verified TOTP, authenticated production role/session matrix, provider sandbox/reconciliation review, monitoring, and backup/restore drills remain owner/operations gates. No paid provider transaction or production user journey was simulated.

## Analytics backend follow-up — 2026-09-24

- Migrations `20260924120000` and `20260924122654` are applied and independently confirmed: local and remote migration history is 91/91, with no drift or pending migrations. They add the observed-only 7-day resume activation metric and timezone-aware exact-day D7/D30 product-retention metric; both expose consent/event-coverage limits.
- `admin-api` v22 is `ACTIVE` and retains `verify_jwt=false`; handler-level authorization is unchanged. Its analytics snapshot and CSV include the activation and retention cohorts. Resume exports emit first-party events only after successful generation/download dispatch and only with analytics consent.
- Local verification passed 1,340 unit tests, all 91 PostgreSQL 17 migrations with exact-day/exclusion/maturity fixtures, lint, repo checks, function type-check, production build, and the 18-step browser fixture. The 1024px builder-toolbar correction is included in the pending website follow-up.
- Production website promotion of the current UI/API bundle remains pending Vercel verification. Fifteen missing worker/config values, scheduler setup, owner-verified TOTP, authenticated role/session tests, provider sandbox/reconciliation review, monitoring, and backup/restore drills remain owner/operations gates.
