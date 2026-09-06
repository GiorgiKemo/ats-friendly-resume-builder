# QA and safety

## Fast, offline verification

Run `npm test`, `npm run lint`, `npm run check:repo`, `npm audit`, then `npm run build`.

The unit suite includes actual rendered React form semantics, application-service
HTTP round trips with the Supabase SDK, isolated fixture contracts, metric and
status-transition logic, and QA network/production-target guards. Source-pattern
security tests are regression alarms, not proof that database authorization works.

The suite also builds the actual app without writing artifacts under an isolated
development env fixture. `tests/productionBuild.test.js` verifies that the release
wrapper still emits production React and DEV=false branches, ordinary development
remains development, and export dependencies stay outside the initial import graph
without breaking their lazy preload paths. Use `npm run build` for releases;
direct misconfigured Vite builds fail closed. Local `.env` files are not modified.
See `docs/audit-2026-09-04/production-loading.md` for exact artifact measurements.

`node --test tests/qaFixtures.test.js tests/resumeVersioningIntegration.test.js`
exercises the actual resume service through the installed Supabase SDK and a
disposable loopback HTTP server. It verifies revision metadata, typed stale-save
conflicts, no automatic retry or legacy fallback, intact caller drafts, and an
explicit latest-version retry. The fixture requires full-snapshot save arguments;
it is not a partial-update API or evidence of PostgreSQL locking behavior.

`node --test tests/userProfileService.test.js tests/userProfileHttpIntegration.test.js`
checks the profile identity/revision contract with twelve focused service tests
and four actual service/SDK loopback HTTP cases. Stale updates and competing
creates return typed conflicts; loaded metadata must be valid, and uncertain
acknowledgments never count as successful saves. There is no unversioned fallback
or implicit read-latest/retry. These transport fixtures are separate from the
real PostgreSQL profile-concurrency proof below.

`node --test tests/resumeContextHttpIntegration.test.js` also runs the actual
context and durable draft store against that service/HTTP stack. Its seven cases
cover independent tab drafts, clock-independent reload, changed-revision recovery
and saving a copy, queued saves while an HTTP acknowledgement is held, and stale
autosave cancellation after disabling autosave. React
hook scheduling is deterministic test scaffolding, not browser-rendering evidence.

## Authenticated browser checks

`npm run test:website:full` starts a disposable loopback fixture backend and a fresh
Vite process with every Supabase environment override pointed to that backend.
It signs in a synthetic account, checks profile persistence, DOCX download,
application creation and keyboard dismissal, and mobile dashboard overflow.
Browser HTTP requests outside those two local origins are blocked. It does not
use the user's session, production database, AI credits, email, or payments.

Install the matching Chromium once with `npx playwright install chromium`.
The fixture browser suite is deliberately not a CI gate until its end-to-end run
has been validated on the target runner. Its report and failure screenshots go to
`playwright-artifacts-fixtures`. The existing `test:website:smoke` remains the
production-build public-route and unauthenticated-redirect check, not an
authenticated feature test.

## Manual local fixture workspace

In PowerShell, start the backend:

```powershell
$env:QA_LOCAL_FIXTURES='1'
npm run dev:qa:fixtures
```

Optional startup flags: `QA_PREMIUM=1` enables synthetic premium state;
`QA_EMPTY=1` starts with no resumes or tracked applications;
`QA_AI_REVIEW=1` enables local synthetic responses only for POST requests to
`openrouter-proxy` and `groq-proxy`, so the factual-review UI can be exercised.
It never contacts a provider, and all other external-action routes remain blocked.
All data is in memory
and resets when the process is stopped. The server binds only to `127.0.0.1:54329`.

Start a separate Vite process with these environment values (do not edit .env):

```powershell
$env:VITE_SUPABASE_URL='http://127.0.0.1:54329'
$env:VITE_SUPABASE_URL_DEV='http://127.0.0.1:54329'
$env:VITE_SUPABASE_PUBLISHABLE_KEY='qa-local-anon-key'
$env:VITE_SUPABASE_PUBLISHABLE_KEY_DEV='qa-local-anon-key'
$env:VITE_SUPABASE_ANON_KEY='qa-local-anon-key'
$env:VITE_SUPABASE_ANON_KEY_DEV='qa-local-anon-key'
$env:VITE_DISABLE_SYSTEM_LOGGING='true'
npm run dev -- --host 127.0.0.1
```

Synthetic sign-in: `alex.morgan@example.com` / `LocalQaOnly123!`.
`http://127.0.0.1:54329/__qa/state` exposes only synthetic state and request paths
for assertions. AI is disabled unless the synthetic review flag above is enabled;
billing, email, and external job actions always fail.
This fixture checks frontend behavior; it does **not** emulate PostgreSQL, verify
RLS, validate token signatures, test delivery, or certify billing integration.

## Staging integration checks

The legacy `npm run test:website:live` is disabled by default. It requires all of
`QA_ALLOW_LIVE_MUTATIONS=1`, `QA_BASE_URL`, and `QA_SUPABASE_URL`; it refuses known
production targets. It can create staging accounts and data. Use only a disposable
staging project with the intended auth/email configuration, and arrange cleanup.
Checkout-completion automation has been removed. No live run was performed during
this audit. Browser requests are restricted to the explicit app/backend origins.
These legacy selectors need review before reuse; the suite is not a release gate.

Real provider integration and database policy testing require a separately
authorized staging environment, test-mode billing, and multi-user RLS checks.

## Release checklist: evidence, not assumptions

Verified locally during this audit: unit/HTTP/SSR tests, lint, repository hygiene,
dependency audit, production compilation, and manual in-app browser checks recorded
in the main audit. Re-run those commands after combining changes. Fixture tests
must not be described as real provider or database authorization coverage.

The backend audit also executed the full 35-migration chain and real concurrency,
ownership, grant, quota and Storage-policy assertions against an isolated local
PostgreSQL 17 cluster. See `docs/BACKEND_SECURITY_AUDIT.md` for exact commands and
scope. Its platform scaffolding does not run managed Supabase HTTP services.

Still required before a production release:

- Execute the isolated full browser suite and review its screenshots, downloads,
  failed requests, keyboard interactions, and mobile results before making it a CI gate.
- Replay migrations on staging Supabase, including a representative existing
  database upgrade, and exercise managed Auth, PostgREST and Storage HTTP access.
  The passing local PostgreSQL tests do not prove the deployed schema, platform
  configuration or RLS matches the repository.
- Deploy the versioned-resume migration and version-aware frontend together.
  Existing-resume writes from legacy clients deliberately fail closed. Verify
  two-tab and two-device conflict recovery with real managed PostgREST before release.
- Deploy the versioned-profile migration with its version-aware service and page.
  Old profile clients may create an absent profile, but cannot overwrite an
  existing one. Validate representative duplicate legacy rows, competing first
  saves, conflict recovery and deletion/recreation against managed PostgREST.
  Automatic durable profile recovery must not infer the latest revision; device
  retention and sensitive autofill-data disclosure remain owner-approved gates.
- Verify signup confirmation, password recovery, refresh/logout, and email delivery
  using a designated staging account and actual provider configuration.
- Exercise Stripe test-mode purchase, retry, cancellation, and webhook idempotency
  with staging credentials and explicit authority; no real purchase automation.
- Validate real AI output, credit accounting, job discovery, Gmail integration,
  extension permissions, and external application flows without contacting employers
  or sending messages unless specifically authorized.

Application metrics count submitted (non-saved) records. A response is a recorded
response date or screening/interview/offer/rejected status. Interview/offer cards
and pipeline bars describe current state, not historical stage conversion.
Bulk status changes group rows by required timestamp changes; each group is a
separate request. On partial failure the service returns successfully changed rows
alongside the error so callers must not assume the entire batch was rolled back.

Extension account and submission regression tests execute the real background
message handlers and submission function with mocked browser/DOM collaborators.
They cover stale users, logout, legacy cache refresh, privileged sender rejection,
serialized storage races, bridge reinjection, safe entry navigation and
manual-review submission gates. No employer browser form is opened or sent.
The extension browser fixture understands the authenticated identity protocol,
but its browser execution remains a separate, unverified release gate.
