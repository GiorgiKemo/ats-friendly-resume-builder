# Local verification — 2026-09-09

## Scope checked

- Workspace: `ats-friendly-resume-builder`, branch `main`, local working tree only.
- Public browser smoke check: `http://127.0.0.1:5175/contact` rendered the existing contact page and the support widget. The widget opened with an accessible dialog, subject/message fields, close control, start-conversation action, and server-backed availability status; the current light customer theme exposed the `Switch to dark mode` control; Escape restored focus to the trigger.
- Authenticated local admin visual check: passed with a disposable local Auth owner and real local Supabase/RLS requests. The dashboard stayed on `/admin`, all captured `admin-api` requests returned HTTP 200, the default admin theme was Light, Dark mode persisted after reload, the 390px mobile menu opened and closed on Escape, and no horizontal overflow was detected. The disposable Auth/admin fixture was deleted after the run. Screenshots: `evidence/20260909-admin-local.png` and `evidence/20260909-admin-local-mobile-dark.png`.
- Authenticated local feedback/backlog browser check: passed with a disposable local Auth owner and real local Supabase/RLS requests. Auth returned HTTP 200, the feedback and improvement-list support API reads returned HTTP 200, the operator-tag summary and sanitized improvement form rendered, and no alert, console error, page error, or horizontal overflow was detected. The disposable Auth/admin fixture was deleted after the run. Screenshot: `evidence/20260909-admin-feedback-local.png`.
- Authenticated local end-to-end support browser QA: passed with disposable local guest and Auth-owner contexts and real local Supabase/RLS requests. Guest session recovery after reload, cross-session isolation, handoff, operator takeover, customer reply, internal-note privacy, resolution, customer-visible follow-up, and post-resolution CSAT all passed; every support API response was HTTP 200, with no console/page errors or horizontal overflow. The disposable conversation/Auth/admin fixtures were deleted after the run. Screenshots: `evidence/20260909-support-guest-resolved-local.png` and `evidence/20260909-support-inbox-local.png`.
- Hosted/production authenticated admin visual check: still not claimed; the available browser session is signed out and no hosted credentials were entered or retained for this local verification.

## Automated evidence

- `npm test -- --test-concurrency=1 --test-reporter=dot --test-timeout=60000` — passed, 1,194 tests after customer-360 reads, privacy lifecycle guards, provider-cancellation review guards, private support-attachment controls, scanner-worker guards, export-worker guards, analytics funnel instrumentation and consent boundary, entitlement, PayPal event-inbox, bounded PayPal reconciliation pagination, configured keyword-provider ordering, support-session, owner-safeguard, theme, support-dialog accessibility, support-notification delivery, support-feedback, knowledge-review, support-AI worker guards, billing-action worker guards, schema-backed auto-apply job/run status reporting, audited safe auto-apply retry/cancel/reconcile controls, template-aware PDF styling coverage, deterministic checklist-score coverage, admin feedback surface, private-route prerender metadata coverage, route-smoke service identity coverage, CSP-compatible theme bootstrap coverage, the production HTTP audit contract, truthful repository-facing product copy coverage, public-engagement client contract coverage, local Auth redirect-origin parity coverage, default Vite-origin parity coverage, semantic auth-field coverage, security-contact documentation coverage, shared route-manifest coverage, deployment-gate coverage, React-route/manifest parity coverage, malformed Stripe session-id fail-fast coverage, exact Home active-state coverage, animated-link keyboard-stop coverage, runtime not-found metadata coverage, admin landmark coverage, keyboard Tooltip coverage, and explicit native button type coverage.
- Docker Desktop `4.90.0` with Docker Engine `29.7.2` — healthy after disabling the stale Docker AI inference integration and rotating the unrecoverable runtime reparse directories into recoverable backups. The local Supabase stack starts successfully; the optional Vector log collector is explicitly disabled because Docker Desktop does not expose insecure TCP port `2375`, while database-backed application analytics remains enabled.
- Supabase CLI maintenance — upgraded the project-pinned CLI from `2.116.0` to `2.117.0`, migrated the local email-test config from deprecated `[inbucket]` to `[local_smtp]`, refreshed the local Supabase images, and verified all 10 core containers healthy with HTTP 200 probes on API, Studio, and Inbucket.
- `npx --no-install supabase db reset --local --yes` — passed through all 76 application migrations, including billing reconciliation, invitation-email delivery, privacy deletion execution, support presence/SLA/inbox-operations, the disabled billing-action intent boundary, the audited auto-apply action ledger, the operator-scoped feedback-improvement backlog, and operator support read-cursor access.
- `npx --no-install supabase db lint --local --level error --fail-on error` — passed with no schema errors.
- `npm run build` — passed.
- `npm run check:supabase:functions` — passed, including `support-api`, and reran successfully after provider-ID and PayPal inbox changes.
- Admin AI/job summary — separates `auto_apply_jobs` states from `auto_apply_runs` states; the dashboard no longer queries run-only statuses from the job table.
- Admin AI/job operations — owner/admin-only retry, cancel, and reconcile controls now write an idempotent service-only action ledger; retry requires a failed job with no outbound receipt, cancel is limited to discovered/queued work, and reconcile remains a `pending_reconciliation` review request without claiming an external result.
- Billing action worker contract — passed static checks for secret authorization, leased claim/receipt RPCs, stable Stripe idempotency keys, PayPal refund/cancel/revise paths, customer-approval status, unsupported-operation handling, and pending-reconciliation receipts; no provider call was made.
- Local runtime check: `POST http://127.0.0.1:54321/functions/v1/support-api` with `{ "action": "routing" }` returned HTTP 200 and the database-backed timezone, business-hours, queue, and live-presence fields; no customer identity or agent details were returned.
- Browser support-widget check on `http://127.0.0.1:5175/contact` passed with the local Supabase target: the dialog rendered the truthful offline-hours status and privacy notice with no browser console errors.
- `npm run test:website:support` — passed the disposable guest/operator end-to-end support journey on the dedicated local Vite port 5176; this also caught and verified the support resolve analytics non-blocking regression fix and rendered the schema-backed AI & Jobs status panels. The existing same-workspace dev server on 5175 was left untouched.
- Local Auth configuration parity: `supabase/config.toml` no longer points at the stale `127.0.0.1:3000` origin. The active 5175 preview is the site URL, with explicit 5174/5175/5176 localhost and loopback redirect coverage for the Vite and dedicated QA workflows; a security regression test enforces this contract.
- Local development parity: `vite.config.js` now defaults `npm run dev` to port 5175, the same origin used by the active browser and responsive audit; dedicated QA scripts continue to select isolated ports explicitly.
- Dependency parity: non-major versions within the existing semver ranges were refreshed with `npm update`; the refreshed lockfile passes `npm ls --depth=0`, 1,194 tests, lint, production build, Supabase function check, route smoke, and `npm audit --audit-level=high` with zero findings. Major framework upgrades remain intentionally unmerged pending a dedicated compatibility migration.
- Extension parity: `npm run test:extension:chromium` passes the packaged Chromium workflow, and `npm run test:extension:firefox` now audits the Firefox-targeted package by default and reports `firefoxReady: true` with no blockers.
- CI parity: `.github/workflows/ci.yml` now uses the canonical 5175 placeholder origin and runs both Chromium extension smoke and Firefox compatibility checks; the QA contract suite enforces both steps.
- Auth/security documentation parity: sign-in and recovery controls now expose semantic `name` fields alongside their autocomplete hints; the security disclosure address is the verified `contact@giorgi.codes` channel, and a regression test prevents the stale mailbox from returning.
- CSP hosting parity: `public/_headers` now permits the same Stripe hosted-checkout frame origin as `vercel.json`; the security regression suite enforces both policies.
- SEO runtime parity: public routes retain canonical/OG URL/structured-data nodes while private and unknown SPA routes remove all three after hydration; the single `src/routeManifest.js` source and route-parity coverage pass for every concrete React route family.
- Sitemap parity: regression coverage compares `public/sitemap.xml` with the manifest's eight indexable public routes, rejects duplicates, and excludes all private route families.
- Stripe return safety: malformed parameterized session IDs are rejected before provider verification, with a contract test and browser smoke coverage for the visible payment-verification error state.
- Header navigation semantics: the Home link uses exact-root matching, preventing false active styling and `aria-current="page"` on other public routes.
- Animated-link semantics: Button, TouchLink, TouchExternalLink, and direct interactive wrappers across auth, marketing, 404, dashboard, auto-apply, and preview keep native controls as the only sequential keyboard stops; Framer Motion wrappers are explicitly `tabIndex={-1}` and the shared UI test plus the 30-route preview smoke report no `div[tabindex="0"]` wrappers.
- Unknown-route semantics: the built preview renders the 404 state with `Page Not Found - ResumeATS`, `The ResumeATS page you requested could not be found.`, `noindex,follow`, and no canonical/OG URL/structured-data nodes.
- Landmark semantics: the 30-route built preview smoke reports exactly one `main` landmark and one `h1` per public state, including the PayPal return page after removing its nested main.
- Payment-error contrast: the malformed Stripe-session state renders its alert in `rgb(185, 28, 28)` (`text-red-700`) on the light theme; the previous `text-red-500` contrast failure is no longer present.
- Admin landmark semantics: admin mode now leaves the app frame as a non-landmark layout wrapper and gives the inner admin shell the sole `main#main-content` skip target.
- Tooltip semantics: the legacy Tooltip role-button now has a stable accessible name, keyboard Enter/Space toggling, Escape dismissal, and an `aria-describedby` link to the tooltip content.
- QA target reporting: the legacy staging browser audit now records its configured `BASE_URL` in reports instead of a hard-coded localhost origin; its contract test passes.
- `npm run check:repo` — passed.
- `npm run lint` — passed with no warnings after PayPal response/type hardening.
- `npm run test:website:smoke` on isolated preview port `4199` — passed all 30 routes, including the parameterized Stripe return path, analytics decline, Privacy-page withdrawal, re-acceptance, and safe missing-payment-return states.
- Hosted release check — the signed-in Supabase dashboard shows the production project as Healthy, but its migration list currently ends at `first_party_analytics_events` / `add_paypal_billing` and its Functions page shows 22 older functions; the local 76-migration/new-worker implementation has not been applied to production. The workspace CLI token receives a 403 for linked migration access, so this remains a release blocker rather than a passed production gate.
- `git diff --check` — passed; only LF/CRLF normalization warnings were reported.
- `npm run test:website:smoke` — passed for all 30 public and protected routes on the isolated preview port `4199`.
- `npm run test:website:full` — passed all 15 disposable-fixture profile, resume,
  application, analytics, and mobile steps with no page or console errors.
- Shared confirmation-dialog coverage — passed UI/lifecycle/profile tests after
  replacing every native browser confirmation with labelled, focus-trapped,
  Escape-safe dialogs; no `window.confirm` calls remain in `src`.
- Extension confirmation-dialog coverage — passed the shared popup, side-panel,
  and injected-widget contract tests; all four profile-sharing prompts now use
  the keyboard-safe shadow-DOM dialog with a single-flight consent guard.
- Admin shell regression checks — passed canonical section navigation, mobile
  Escape/outside-click dismissal, body-scroll restoration, and scoped theme
  ownership without mutating the customer document theme. Route-level admin
  isolation also suppresses customer global theme classes and customer chrome
  while `/admin` is active.
- Authenticated local admin browser QA — passed the disposable owner flow with
  ten HTTP 200 `admin-api` responses, one HTTP 200 client-error telemetry
  response, no console/page errors, Light as the default theme, persisted Dark
  mode, mobile drawer behavior, Escape scroll restoration, and no horizontal
  overflow.
- Admin directory role compatibility — passed both service-role and
  authenticated-owner directory RPC checks using the verified JWT role
  accessor (`auth.role()`); the local Auth/RLS fixture was removed afterward.
- `node scripts/responsive-audit.mjs --label=20260909-after` — passed all 60
  public/auth route and viewport combinations with no horizontal overflow or
  rendering errors.
- `node scripts/responsive-audit.mjs --label=20260909-continuation` — passed all
  60 public/auth route and viewport combinations again after the current worker
  and configuration changes, with no horizontal overflow or rendering errors.
- `playwright-audit/20260909-fresh-live/report.json` — current 60-capture
  rerun has zero horizontal-overflow or rendering-error records.
- `playwright-audit/20260909-final-recheck/report.json` — current 60-capture rerun
  after compact workspace consent and application-layout fixes has zero
  horizontal-overflow or rendering-error records; the notice is measured as
  part of the top chrome in heading checks.
- `node scripts/responsive-audit.mjs` — passed all 60 public/auth route and
  viewport combinations again after the latest landmark, focus, and control
  semantics fixes; `playwright-audit/audit/report.json` records zero overflow
  or rendering-error records.
- `npm run build:extension` and Chromium extension QA — passed for the packaged
  Chrome extension; Firefox packaging also completed successfully.

- Privacy lifecycle migration and admin API checks: passed static security assertions for private tables, service-only claim execution, durable export/deletion requests, explicit holds, and the absence of immediate Auth deletion.
- Admin assurance checks: passed static security assertions that high-risk mutations require a signed AAL2 claim and do not rely on role metadata alone.
- Team administration checks: passed static assertions for owner-only role changes, valid role allowlisting, self-change protection, last-owner protection, idempotency routing, and role-change audit events.
- Admin MFA checks: passed static security assertions for Supabase TOTP enrollment, challenge, verification, and AAL2 status presentation; real-factor enrollment remains an authenticated browser gate.
- Support attachment checks: passed static security assertions for private bucket configuration, signed upload/download boundaries, MIME/size limits, quarantine status, service-only scan transitions, customer-safe pending-scan UI, scanner leasing, signature checks, explicit scanner configuration, and fail-closed retry handling.
- Team administration checks: passed static assertions for owner-only audited role changes, database-serialized role/revoke transactions, self-change and last-owner safeguards, and the seven-day server-enforced pending invitation lifecycle.
- Support routing checks: passed service-only versioned hours/routing settings, timezone/day/time validation, queue and first-response bounds, revision history, audited updates, operator presence TTL, business-hour deadline, queue SLA status, and no-provider-delivery claim.
- Privacy export checks: passed static security assertions for the private export bucket, leased claim/complete/retry/expiry contract, allowlisted export fields, omitted credentials/tokens/internal notes/raw provider payloads, and expiring admin-signed downloads.
- Provider-cancellation review checks: passed static security assertions for the reviewed Stripe/PayPal evidence boundary, fail-closed `waiting_provider_cancellation` claim state, service-only RPCs, AAL2 admin recording action, and explicit UI language that no provider cancellation is executed by the dashboard.
- Owner deletion approval checks: passed static security assertions for the owner-only AAL2 approval action, durable approval fields, fail-closed `waiting_owner_approval` claim state, idempotent admin routing, and the explicit non-destructive approval copy.
- Destructive privacy-worker checks: passed static security and worker-contract assertions for service-only leased execution, storage cleanup, explicit customer-data deletion, accounting/audit unlinking, Auth deletion after the data step, idempotent missing-Auth handling, and completion confirmation. No real account was processed.
- Analytics consent checks: passed unit and browser assertions for unknown-by-default state, explicit Accept/Decline persistence, GA dispatch gating, Vercel gating, Privacy-page withdrawal, and analytics-cookie teardown. No visitor analytics was enabled during local QA.
- Support notification checks: passed static security assertions for agent-message email enqueueing, service-only lease ownership, retry/dead-letter handling, server-only Brevo credentials, recipient validation, HTML escaping, and stable provider idempotency keys.
- Support feedback checks: passed static security assertions for resolved-conversation gating, one-per-conversation uniqueness, authenticated/guest identity binding, service-only operator reads, and the customer/operator UI paths.
- Support knowledge checks: passed static security assertions for private article/version tables, source references, manager-only draft/publish/rollback operations, service-only published reads, and the admin review panel.
- Support AI checks: passed worker tests for unauthorized access, disabled-by-default behavior, bounded published-knowledge/account context, structured output validation, timeout-boundary wiring, and guarded completion wiring; local database lease/epoch behavior is migration-tested, while hosted deployment and provider evaluation remain blocked gates.
- Admin integration-health/settings checks: passed static assertions for migration-aware settings reads, secret-presence-only reporting, disabled-by-default effective state, AAL2/idempotent settings mutation, transactional audit insertion, and the Settings panel; no secret value is returned to the browser.
- Analytics export checks: passed static assertions for role-scoped, date-bounded aggregate CSV export, formula-injection protection, and the dashboard download control; no customer rows are exported.
- Support-AI safety checks: passed static assertions for database-owned settings revisions/history, bounded circuit opening after terminal provider failure, and AAL2/audited circuit clearing; deployment-time migration and authenticated browser verification remain outstanding.
- Support-AI rollback checks: passed static assertions for older-revision restore, secret-presence gating before re-enabling, database revision advancement, and rollback audit events.
- `node scripts/test-migration-replay.mjs` — passed for all 76 current migrations, including the disabled billing-action capability, idempotent-intent, audited auto-apply action ledger, feedback-tag, aggregate-theme, sanitized-improvement-linkage, and operator support read-cursor checks
- `npm run test:website:support` — passed guest recovery, session isolation, human handoff, operator note isolation, resolution, CSAT, overflow, console-error, and page-error checks.
  in a fresh isolated PostgreSQL 17 cluster, including Auth/Storage scaffolding,
  RLS/RPC assertions, a 10,000-user directory cursor/search replay, free-resume
  limits, concurrency, billing projections, support presence/SLA clocks, queue search/triage/reopen, and an approved synthetic deletion
  execution that removed the synthetic app/Auth data while preserving the
  durable completed job record.
- Supabase local advisor pass — after the RLS init-plan and foreign-key index
  migrations, no `auth_rls_initplan` or `unindexed_foreign_keys` findings
  remain. Unused-index notices are retained as a traffic-dependent baseline.
- Public-schema privilege check — all public tables with RLS enabled and no
  policies have zero `anon`/`authenticated` table privileges; the eight
  remaining no-policy rows are Supabase-managed `storage` internals, not
  application tables.
- `npm run audit:production:http` — read-only canonical-host probe on 9
  September 2026. Public route titles/robots/canonicals and all root-referenced
  JS/CSS asset content types pass; live private routes still return the
  homepage metadata, unknown paths still return HTTP 200, payment-return routes
  lack `X-Robots-Tag`, `/theme-bootstrap.js` returns HTML instead of
  JavaScript, the old inline-theme CSP hash remains deployed, and the deployed
  root plus dynamic route chunks still contain stale outcome-promising copy. The
  command is a release gate and performed no writes.
- The production HTTP gate now probes every configured private route (not only
  sign-in, sign-up, password reset, and payment returns), with an explicit QA
  contract covering builder, preview, account, admin, analytics, and
  subscription paths.
- Build-time prerendering and the production gate now consume one shared route
  manifest, so route metadata and release verification cannot silently drift.
- The interactive Vercel deploy script now runs the read-only production HTTP
  gate after `vercel --prod` and exits without a success claim when that gate
  fails; no deployment was invoked during this audit.
- The Vercel deploy script is now LF-normalized and passes `bash -n`, fixing a
  cross-platform syntax failure caused by mixed CRLF/LF line endings.
- CI now syntax-checks all four deployment shell helpers, and the README's
  manual release flow requires the read-only production HTTP gate.
- Generated build output was rechecked for all 20 private routes: each has
  `noindex,follow` and no canonical link, matching the production privacy gate.

## Blocked gates

- The local Supabase service at `127.0.0.1:54322` is available and migrations lint/reset cleanly. Managed Supabase migration parity, hosted runtime behavior, hosted authenticated browser behavior, and PostgreSQL 15 compatibility remain unverified.
- No staging or production migration, Edge Function deployment, Git push, or live-site claim is included in this evidence.
- Read-only production metadata check: `/return-from-stripe` and
  `/return-from-paypal` currently lack `X-Robots-Tag`; the local Vercel header
  pattern now covers both routes, but deployment remains intentionally gated.
- The same read-only check found the live root/auth HTML still serves the old
  ATS-outcome description and root canonical before JavaScript; the local
  prerendered build corrects both, pending approved deployment.
- Hashed Vite assets currently return a one-hour cache on production; the local
  Vercel config now uses one-year immutable caching for `/assets/*` only,
  while un-hashed image paths remain short-lived.
- Live public JSON-LD also still contains the older ATS/recruiter claims; the
  local build removes those claims and emits route-specific structured data.
- The deployed application bundle still contains the older ATS/recruiter/job-
  outcome strings; the local source and build are clean, and the production
  gate now detects this drift directly.
- Read-only Supabase function health probes show `public-engagement` and
  `report-client-error` deployed with their method guards, while live
  `support-api` returns `404 NOT_FOUND`; the local support browser journey is
  therefore not hosted-runtime proof and support deployment remains open.
- `supabase functions list --project-ref onuxzcectniowxqtmjpg` was also
  attempted read-only and returned Supabase `403` because the current account
  lacks access to that management endpoint; endpoint health probes remain the
  available direct evidence of the deployed function boundary.
- Read-only production routing currently returns HTTP 200 for unknown paths;
  the local Vercel config now selects static/Other mode, uses explicit dynamic
  rewrites, and serves a custom noindex `404.html` instead of relying on a
  catch-all homepage rewrite.
- The privacy migrations and destructive deletion worker are locally linted/applied but still require hosted scheduler configuration, actual provider cancellation/reconciliation policy, a disposable staging deletion drill, and authenticated export/deletion workflow verification before release.
- The support attachment migrations are locally linted/applied but still require a real malware-scanner endpoint/secret, scheduled worker invocation, and authenticated upload/download verification before release.
- The support feedback migration is locally linted/applied and the disposable local guest/operator CSAT journey passed; hosted parity, provider configuration, and staged release verification remain outstanding.
- The support knowledge migration is locally linted/applied but still requires authenticated manager review/publish/rollback verification and a separately evaluated AI consumer before release.
- The support AI migration and worker are locally linted/applied but remain disabled and require an approved provider/model and budget policy, scheduler/secrets, adversarial evaluation, and authenticated browser verification before release.
