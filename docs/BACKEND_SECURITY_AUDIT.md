# Backend, authentication and privacy audit — 2026-09-04

Scope: local Edge Functions, database migration history, authentication context,
Gmail/Stripe integrations and extension data boundaries. This is a code audit,
not a penetration test of production or a statement that the deployed database
matches the repository. No live data, payments, email or infrastructure was changed.

## Locally remediated

| Severity | Finding | Change and verification |
| --- | --- | --- |
| High | Revoked administrators could regain access through stale `app_metadata`; email OR filters were constructed as raw filter strings. | Database membership is authoritative; database failures deny access, linked user IDs win, and only verified email can atomically claim an unlinked invitation. Behavioral tests cover revoked/missing/stale/concurrent states. |
| High | Arbitrary job/company URLs were fetched with automatic redirects. | Public web URL validation, DNS address preflight, per-hop redirect validation, bounded redirects, five-second request budget and 1 MiB HTML limit. Tests cover IP encodings, private/mixed DNS answers and malicious redirects. DNS rebinding still requires egress enforcement below. |
| High | External email recipients and attachment names could inject raw Gmail MIME headers; generated cover letters were interpolated into HTML. | Reject non-single email recipients/header injection and unsafe attachment filenames before token refresh/send; escape generated HTML and validate contact links. |
| High | Stripe failed-event retry claims were non-atomic, and fresh or abandoned processing rows were acknowledged as successfully handled duplicates. | Compare-and-set retry claims; in-flight requests return retryable failures; abandoned claims recover after 15 minutes; only the worker owning a claim can mark it failed. Behavioral tests exercise the actual handler with mocked services. |
| High | AI renewal never replenished quota reliably; annual subscribers could exhaust a monthly allowance for the whole year. | Private persisted monthly periods, locked atomic reservation/reset, verified billing-anchor synchronization and database-issued period identity for refunds. Concurrent, duplicate, reordered, annual, expired and old-period cases pass in PostgreSQL. |
| High | Auto-apply had no durable run lock or cost budget; its client-writable history and read-before-write count were bypassable. | Server-owned per-user lease, cooldown, UTC daily run/job budgets, atomic job-slot admission and bounded discovery/scoring. Real concurrent database tests prove one run and bounded attempts. |
| High | Core table RLS and several application tables/RPCs were missing from migration history; the resume bucket was not explicitly private. | Generated ownership and recovered-baseline migrations enforce private PDFs, row ownership, restricted column grants and private privileged implementations. All 37 application migrations replay from an empty local database with platform-only scaffolding. |
| High | An AI-generated recruiter address could be accepted without appearing in the posting; domain screening was described as proof a mailbox exists. | Accept only an exact case-insensitive source email token; reject fabricated, partial and prose responses. Rename domain screening and remove misleading mailbox-verification claims. |
| Medium | Auto-apply reported fabricated queued counts when discovery providers were absent and fake successful message IDs when Brevo was absent. | Explicit configuration failures, no mock production jobs or successful dry-run IDs, no sending empty cover letters, invalid JSON/boolean input rejected, incomplete saved preferences fail closed instead of inventing a default job query, and the client rejects legacy HTTP-200 error bodies. |
| Medium | Gmail disconnect put access tokens in URLs and ignored database deletion errors. | Token revocation uses POST body and prefers refresh token, bounded external request, checked deletion result, truthful remote-revocation status. |
| Medium | Gmail reply scanner skipped new replies in the original outbound thread and matched spoofable sender substrings. | Match exact sender and thread, deduplicate by message ID, avoid ambiguous matches, preserve UTF-8, count only successful applied-to-replied transitions. |
| Medium | Gmail scanning could silently return partial success after database/provider failures and had unbounded per-request provider work/body decoding. | Check connection/job/token-update failures, return non-success for failed connections, cap applied jobs, recruiter addresses, message fetches and decoded body size, and keep production errors generic. A durable per-user lease and daily message/AI work budget now gate every scan; focused handler, security and UTF-8 regressions plus PostgreSQL concurrency proof pass. Retention/deletion policy remains an owner gate. |
| Medium | Public engagement and client-error admission used count-then-insert limiter checks that could overshoot under concurrent anonymous requests. | `20260905100000_atomic_public_engagement_rate_limits.sql` adds a transaction-level advisory-lock claim and reservation/finalization RPCs; direct service-role table writes are revoked. Eight concurrent PostgreSQL claims produce one allowed reservation and seven denials; handler and static security regressions pass. |
| Medium | Authentication telemetry could delay login/logout, and logout retained extension applicant data and queued work. | Best-effort nonblocking telemetry; signed-out events lazily request extension profile/queue clearing without blocking authentication. Tests include hung telemetry and missing extension. |
| Low | Dynamic CORS responses lacked cache variation. | Added `Vary: Origin`. |
| Medium | An absent `NODE_ENV` enabled debug output, and request headers, inbound email bodies, profile objects and token-bearing database errors could be logged. | Debug output requires explicit development mode; removed raw sensitive payload logging, sanitized Gmail failure logs, and replaced metadata-logging Auth triggers. Behavioral tests cover unset environment and token-bearing errors. |
| Medium | Checkout and Stripe-webhook diagnostics logged raw provider/database errors and payment or identity identifiers; webhook failures could echo internal messages. | Summarize only safe error metadata, remove request/customer/user/payment payloads from diagnostics, and return generic production webhook failures. Static security regressions cover both billing functions. |
| High | Stripe entitlement paths invented a 30-day premium period when `current_period_end` was missing. | `getSubscriptionPeriodEnd` now requires a finite positive Stripe billing boundary across checkout, renewal, invoice and update paths; missing periods fail closed. Runtime and static regressions cover the helper. |
| High | The subscription page's cancellation button rejected every production request, while account navigation linked users directly to it. | Use the existing Stripe portal service, remove local entitlement mutations and false cancellation success, show accessible loading/error/retry, reject same-page fallback loops and ignore stale account responses. Five component-behavior tests pass without calling Stripe. |
| High | A password change could use a different account's mutable SDK session after an asynchronous wait; recovery bootstrap and stale results could race account changes. | `passwordRecoveryService.js` captures a JWT, verifies that exact token with `getUser(token)` against the expected user, rechecks the active request and sends a token-bound password PUT only to the configured project. `UpdatePassword.jsx` leaves URL session establishment to the app bridge, prevents duplicate submissions, handles retry/errors and ignores stale results without signing out a different account. Independent review and ten local tests pass. |
| High | During recovery bootstrap, client error telemetry could transmit the raw token-bearing page URL and repeat it in nested error context; the error-report handler persisted those URLs unchanged. | `monitoringService.js` sanitizes top-level and nested HTTP(S) URLs, message/stack/reason copies and development logging before transmission. `report-client-error/index.ts` independently sanitizes before persistence and truncation. Credentials, query strings and arbitrary hash parameters are removed; origin/path and safe hash-router route paths remain. Four actual client/handler tests pass. This is URL-token protection, not arbitrary secret redaction. |
| High | Pending Auto-Apply actions could use a newly signed-in account for an old account's form or provider action; stale callbacks could continue the setup wizard, extension launch or Gmail redirect. | `AutoApply.jsx` captures owner/abort context and suppresses late state, toast, navigation and delayed follow-ups. `autoApplyService.js` requires the captured owner for mutations, rechecks after authentication waits and binds provider calls to a same-owner verified session. Fixed the extension-state boolean return that prevented queue reconciliation, stabilized reconciliation callbacks, and made scan/run failures truthful. Fourteen service/component lifecycle tests pass without provider calls. |
| High | Two clients could silently overwrite each other's complete resume snapshots. | `20260904141918_versioned_resume_saves.sql` adds a positive integer revision and uniquely named versioned save/load RPCs. Parent-row locking and expected-revision comparison protect metadata and content in one transaction. Historical table/column write grants and old public/private unversioned updates cannot bypass the check. Sixteen real PostgreSQL callers using one revision produce one winner and fifteen typed conflicts; stale and failed content writes leave the full snapshot unchanged. |
| High | Profile saves were serialized but still replaced every section with the last caller's potentially stale snapshot. | `20260904144841_versioned_user_profile_saves.sql` adds profile identity/revision CAS, typed conflicts and versioned reads. Same-version updates and competing absent-profile creates each produce one winner and fifteen conflicts in real PostgreSQL. Old public/private updates and client table/column writes fail closed; malformed service acknowledgments cannot report success. |

## Release gates and remaining findings

1. **High — DNS preflight does not eliminate DNS rebinding.** The external-fetch
   helper verifies DNS before `fetch`, but the actual HTTP client can resolve
   again. Enforce private/reserved-address egress denial at the proxy/network
   layer or use an approved address-pinning transport. Test actual Supabase DNS
   availability and redirects in staging before enabling discovery/outreach.
2. **High — validate managed-platform and existing-deployment compatibility.**
   PostgreSQL 17 now passes the whole application migration chain and actual
   anon/user-A/user-B/service/Auth-role tests. The fixture provides only the
   Supabase-managed `auth.users`, `auth.uid`, roles and Storage catalog surface;
   it does not run GoTrue, PostgREST, Storage HTTP, signed URLs, or PostgreSQL 15
   configured in `supabase/config.toml`. Replay on a staging Supabase instance and
   verify a representative existing database upgrade before release. Existing
   duplicate profile/content rows are deliberately not deleted by this repair.
3. **Medium — billing event order and multi-subscription ownership need integration
   tests.** Customer-level updates can be reordered; deletion of an older
   subscription must not downgrade a different active one. Customer creation also
   lacks durable idempotency and can replace customers on transient retrieval
   failures. Validate checkout, portal, renewal, cancellation and retry journeys
   with Stripe test fixtures before production release.
4. **Medium — extension privacy needs real-browser validation.** The extension
   caches a full applicant profile and can operate on broadly permitted web
   pages. Logout clearing is best effort; an unavailable/disabled extension cannot
   acknowledge it. Browser forms already filled cannot be recalled. Review
   permissions, stale-cache expiry, account switching and automatic submission
   consent across Chrome/Firefox before publishing.
5. **Medium — Gmail access and retention need a product policy.** Review least-
   privilege OAuth scopes, refresh-token encryption/rotation, retention/deletion,
   classification disclosure and user-visible handling when Google revocation
   fails. The app disconnect response now distinguishes local removal from remote
   revocation, but the UI should make any required Google-account cleanup clear.
   The scanner now has per-request bounds and truthful failure responses, but it
   now uses a durable per-user lease and daily message/AI work budget; the
   auto-apply budgets remain separate. Retention/deletion policy and least-
   privilege OAuth review still require owner approval. Public engagement and
   client-error admission now use serialized database claims, so concurrent
   limiter overshoot is no longer an open local finding.
6. **Medium — secrets and log retention remain operational checks.** No local
   environment secret values were read. Tracked-file checks found only the
   `.env.example` template and no matching private-key/Stripe-secret/Supabase-secret
   literals in the scoped pattern scan. This is not a full git-history secret scan
   or verification of deployed log access, retention, or key rotation.
   Historical logs were neither inspected nor purged. The repaired recovery-URL
   exposure establishes a possible logging path, not proof that live tokens were
   stored or accessed. An authorized owner must assess historical exposure,
   retention/access controls and any necessary session revocation or cleanup.
7. **Bounded account-flow verification, not whole-application certification.**
   The password recovery and Auto-Apply checks use synthetic accounts and stubbed
   SDK/provider/extension responses. They prove the tested local request ownership
   and lifecycle behavior, not every application action, deployed GoTrue recovery
   semantics, Google OAuth, or real Chrome/Firefox cross-tab timing. React account
   remounts complement but do not replace expected-user checks on pending writes.
   Aborting a browser request cannot recall a sent email, a password change or
   another server/provider mutation already accepted. The existing bridge's
   read-only `getJobPreferences` compatibility path retains its independent
   identity checks; it is not newly certified by the Auto-Apply page tests.
   URL sanitization retains paths and useful error context; it does not anonymize
   all personal data or scrub arbitrary secrets from free-form text.

## Final privacy and release-readiness review

This section is a repository review, not a legal-compliance opinion. Business
policy has not been invented or changed. The following gates require an owner
decision or operational evidence before making the corresponding public promise.

| Classification | Evidence and remaining gate |
| --- | --- |
| High — privacy release gate | `src/pages/PrivacyPolicy.jsx:64` now discloses that job-description text, tailoring options and needed profile details are sent to the configured AI providers, and that provider processing, retention and model-training controls depend on current configuration/terms. The provider payload at `supabase/functions/openrouter-proxy/index.ts:131` does not itself establish a contractual guarantee; `supabase/functions/gmail-scan/index.ts:133` also sends company, subject and up to 1,500 characters of reply email to AI. Obtain owner-approved provider/data-use settings and contractual evidence, and approve an accurate notice for Gmail, resume/profile, extension and outreach processing. Do not promise a universal no-training policy without that evidence. |
| High — offboarding/retention release gate | `src/pages/PrivacyPolicy.jsx:92` offers support-requested account and associated-data deletion. The sole in-repository admin path calls `deleteUser(targetUserId, true)` at `supabase/functions/admin-api/index.ts:417` (Auth soft deletion), then records completion including the email at line 420. It contains no coordinated application-data/Storage purge, Google-token revocation, Stripe subscription handling or retention schedule. An owner-approved, tested erasure runbook is required; soft deletion must not be treated as proof of complete erasure. Define retained billing/audit records, backup expiry, provider cleanup, support verification and completion criteria explicitly. |
| High — CSP persistence enablement gate; unsafe default repaired locally | `api/csp-report.js:85` now discards reports unless the server-only `CSP_REPORT_PERSISTENCE_ENABLED` is exactly `true`. Payload handling checks actual raw/re-serialized UTF-8 bytes (32 KiB), validates legacy/Reporting API envelopes, caps batches at ten, removes URL credentials/query/fragment and excludes raw policy/script samples. A distributed perimeter request-rate/volume limit, platform wire-body cap, log access and retention approval remain required **before opting in**. This flag does not install a rate limiter; no process-local counter is claimed as one. Parsed bodies cannot expose wire whitespace already discarded upstream; stored paths/user agents are not guaranteed anonymous. |
| Medium — configuration/documentation defect repaired locally | `VERCEL_DEPLOYMENT.md` and `docs/ENVIRONMENT_MATRIX.md` now agree on the optional server-only Vercel CSP credentials and default-discard behavior. `deploy-env-to-vercel.sh` still excludes all server credentials and the persistence flag, and now stops on login/upload failure instead of announcing success. `.env.example` documents the disabled default. No actual server variables, ingress controls or provider policy were changed. HTTP 204 intentionally does not prove ingestion. |
| Medium — owner-verification gate | `src/pages/AboutUs.jsx:11`, `:16` and `:21` publish named team members; lines 13, 18 and 23 assert credentials/experience. Obtain owner confirmation and permission for these biographies. Their truth was not verified in this audit; they must not be labeled fabricated without evidence. |
| Medium — release-evidence documentation repaired locally | `README.md` now has unchecked, evidence-backed release gates and links to this audit/runbook instead of blanket completed production-readiness claims. Staging/platform/provider evidence and an accountable release owner are still required. |

Product gaps, rather than independently proven release-blocking bugs: there is
no self-service account-erasure flow or full machine-readable account export.
The current privacy notice offers manual deletion requests and PDF/DOCX resume
export, so absence of those additional features alone is not proof of a broken
promise. A manual process can work only if its ownership, retention rules and
end-to-end completion are approved and tested.

Supabase documents that [user deletion does not immediately invalidate JWTs and
can be blocked by owned Storage objects](https://supabase.com/docs/guides/auth/managing-user-data),
and that [objects must be removed through the Storage API, not by deleting SQL
rows](https://supabase.com/docs/guides/storage/management/delete-objects). These
are explicit offboarding test cases, not authorization to delete live data.

## Migration provenance and rollout

- New files: `20260904125121_atomic_ai_period_and_auto_apply_budgets.sql`,
  `20260904131330_enforce_core_data_ownership.sql`,
  `20260904131924_restore_missing_core_baseline.sql`, and
  `20260904141918_versioned_resume_saves.sql` were created by the Supabase CLI.
- The omitted tables and RPC signatures were recovered locally from
  `7c2bc0cad0f6123b53d7ced4f1da16dc56787402:supabase/schema.sql`. The repair preserves
  caller shapes but replaces NULL-unsafe authorization, public definer bodies,
  race-prone first-profile insertion and PII-logging triggers. It does not seed
  obsolete prices/templates or restore the removed schema snapshot.
- Two historical grant-only migrations (`20260430020000` and `20260430030000`)
  now skip functions absent on a fresh install. Their operations for existing
  functions are unchanged; the new baseline supplies the missing definitions
  and final grants later in the chain. Already-applied migration history must
  not be reset or marked unapplied in production.
- Apply and verify the new migrations before releasing dependent Edge Functions.
  Old reservation RPC compatibility is retained; old deployed functions do not
  gain the new auto-apply admission logic until updated. Legacy one-argument
  refunds remain service-only for compatibility and are not period-aware.
- Both monthly and annual subscriptions replenish each calendar-month anniversary
  in UTC, anchored to verified Stripe subscription periods. For preexisting users,
  reconcile the first anchor against Stripe in staging: a provisional activation
  date cannot reconstruct unknown historical usage. Duplicate/reordered anchors
  do not replenish an already-accounted period twice.
- Auto-apply enforces one active 15-minute lease, a 60-second start cooldown,
  ten runs per UTC day, and a user-selected job-attempt limit clamped to 1–100.
  Each run allows at most 15 discovery calls and 50 scored jobs. Failed accepted
  attempts consume job budget, intentionally bounding cost rather than counting
  only successful emails. Product copy/settings must reflect these limits.
- Resume revision rollout must coordinate the migration with the version-aware
  frontend. Existing/new rows start at revision 1. `save_resume_versioned` keeps
  the old save arguments and adds `p_expected_revision integer`; creates require
  null resume ID/revision and updates require the loaded positive revision. It
  returns one JSON object `{resume_id, revision, updated_at}`. Stale saves raise
  SQLSTATE `PT409` / `RESUME_CONFLICT`; missing/invalid expected versions raise
  `22023` / `RESUME_VERSION_REQUIRED`; invalid ownership raises `42501`.
  `get_resume_versioned` returns one flattened row with content and revision from
  one SQL snapshot, without changing last-access time or revision.
- Old `save_resume` creates retain their UUID return, but all old existing-ID
  updates deliberately fail closed, including calls to its private implementation.
  Do not deploy a client that falls back to old saves or automatically reads and
  overwrites the latest revision. Old cached clients need to refresh; rolling
  back only the frontend does not restore their ability to update. Keep the
  version guard when planning rollback or fix-forward. No production rollout
  occurred during this audit.
- Existing duplicate content rows are not deleted: the versioned loader chooses
  the most recently updated row deterministically (ID breaks ties), and a
  successful versioned save updates all associated rows together. Missing content
  is inserted in the same transaction. Trusted service-role/administrative direct
  writes remain possible and are outside the client concurrency guarantee; any
  future backend content writer must participate in the revision contract.
- Profile version rollout likewise requires the migration and version-aware
  frontend together. `get_user_profile_versioned(p_user_id)` returns one flat
  owner-scoped row including `id`, `revision` and `updated_at`, or no row. The
  client exposes `{id, revision, updatedAt, ...profileFields}` or `null`.
  `save_user_profile_versioned` keeps the old complete-snapshot arguments and
  adds `p_expected_profile_id uuid` and `p_expected_revision integer`. Both null
  mean create only if no canonical profile exists; an existing profile requires
  its exact ID and positive loaded revision. Success returns
  `{profile_id, revision, updated_at}`; stale IDs/revisions or concurrent creates
  raise `PT409` / `PROFILE_CONFLICT`; incomplete/invalid expected metadata raises
  `22023` / `PROFILE_VERSION_REQUIRED`. The client never pre-reads a newer revision
  or falls back to the legacy save. It rejects unconfirmed/malformed replies.
- Profile writes lock the owner row before the canonical profile row. Legacy
  duplicates retain their original data; the same `(created_at, id)` ordering is
  used for reads and saves. Only the canonical row changes on a successful save.
  Identity comparison also rejects old callers after deletion/recreation, even
  if the new row has the same revision. Old `save_user_profile` calls may create
  once while no profile exists, but subsequent old updates fail closed. Trusted
  service-role/administrative direct writes remain outside the client guarantee.
- This backend change does not add browser profile persistence or set a retention
  policy. Profile content includes contact details, third-party references and
  optional sensitive autofill answers under both `applicationProfile` and
  `personal.applicationProfile` in the normalized client model. Any durable device
  backup needs explicit product/privacy approval, disclosure, removal controls and
  account/writer isolation; it must not silently rebase recovered content. Existing
  historical logs, browser caches and production profile records were not inspected
  or purged. Owner-approved privacy/deletion/retention gates above still apply.

## Verification completed

- 54 behavioral tests pass with
  `node --test tests/backend*.test.js tests/authSideEffects.test.js`.
- Five subscription-page behavior tests pass with
  `node --test tests/subscriptionManagement.test.js`.
- Fourteen Auto-Apply tests pass with
  `node --test tests/autoApplyAccountService.test.js tests/autoApplyLifecycle.test.js`
  (six service tests and eight actual component lifecycle tests), covering owner
  mismatch, cancellation during auth/session waits, fixed mutation ownership,
  reconciliation, stale reads/saves, wizard and extension follow-ups, Gmail
  navigation, delayed discovery callbacks and truthful provider failures.
- Ten password-recovery tests were independently rerun successfully with
  `node --test tests/passwordRecovery.test.js`, covering explicit-token ownership,
  cancellation, duplicate submission, bootstrap retry and stale page results.
- Four telemetry privacy tests pass with
  `node --test tests/telemetryUrlPrivacy.test.js`, covering actual bundled-client
  transmission/development logging and actual Edge-handler persistence with
  nested location/filename/referrer, message/stack/reason and hash-route URLs.
  The changed `report-client-error` entrypoint also passes a direct Deno check
  using `supabase/functions/deno.json` and `supabase/functions/types.d.ts`.
- Seven actual CSP-handler tests pass with `node --test tests/cspReport.test.js`,
  including disabled defaults, malformed envelopes, forged/missing byte headers,
  multibyte/raw/pre-parsed payload limits, URL token removal, bounded fields/batches
  and failed writes. The Supabase client is stubbed; no database is contacted.
- `deploy-env-to-vercel.sh` passes Git Bash syntax validation (`bash -n`); the
  uploader was not executed against Vercel or any actual environment file.
- Three native Deno runtime tests pass with
  `deno test --no-config supabase/tests/budget_runtime_test.ts`.
- `node scripts/test-backend-database.mjs` passes 17 real PostgreSQL concurrency,
  quota, lease, grant, ownership and Storage-policy check groups.
- `node scripts/test-migration-replay.mjs` replays all 37 application migrations
  in order from an empty database and passes Auth-trigger, resume CRUD, concurrent
  profile save, RLS and RPC privilege assertions. Only platform prerequisites
  are fixture-provided; no application schema snapshot is preloaded. Before the
  versioning migrations, it inserts synthetic pre-versioning data and historical
  write grants to test upgrade preservation and grant revocation.
- Seven added real PostgreSQL versioning proof groups cover upgrade preservation,
  create/load/list shape, sixteen competing saves, stale/owner/legacy/direct-write
  rejection, transaction rollback on content failure, missing/duplicate content
  handling, and concurrent snapshot reads with stable bookkeeping revisions.
  The latest successful replay database is `resumeats_replay_1788533676082`; the
  existing 17 budget/RLS groups also passed again in `resumeats_audit_1788533702914`.
- Six profile proof groups additionally cover pre-versioning/duplicate data and
  grant preservation, sixteen competing creates, sixteen same-revision updates,
  auth/legacy/direct-write rejection, rollback and legacy create behavior, and
  concurrent snapshot reads plus deleted/recreated identity rejection.
- The latest replay also runs eight concurrent `public_engagement` limiter claims:
  one reservation is allowed and seven are denied under a transaction-level
  advisory lock; service-role direct inserts into the attempts table are revoked.
- Twelve profile service tests and four real service/Supabase SDK loopback HTTP
  tests pass with `node --test tests/userProfileService.test.js
  tests/userProfileHttpIntegration.test.js`. Eight existing fixture tests also
  pass. HTTP fixtures exercise response/error/owner contracts, not SQL locking;
  the PostgreSQL proof is separate. No external provider or managed Supabase API
  was contacted. Changed files pass ESLint and TypeScript checking.
- Supabase CLI security advisors reported no error-level issues against the
  explicit loopback replay database (`sslmode=disable` for this local test
  cluster). This does not certify deployed policies or waive the Supabase 15,
  PostgREST schema-cache/API transport and representative production-upgrade
  staging gates.
- All 18 Edge Function entrypoints pass `npm run check:supabase:functions`.
- ESLint passes for the changed backend/auth files and new test files.
- PostgreSQL tests use fresh synthetic databases at `127.0.0.1:55432`, never app
  connection settings, and retain their databases for inspection. The owned
  cluster is separate from the installed PostgreSQL service on port 5432.
- Handler tests isolate external services and fail on unmocked outbound calls;
  no live provider integration was exercised. These checks are necessary but
  not sufficient for production release.

## Source-grounded tailoring review boundary (local implementation)

- `generateEnhancedResume` now returns a separate `resume-tailoring-review`
  envelope, not a resume that callers can silently save or export. Its baseline
  comes from allowlisted source career fields, independently of provider output;
  changed prose is presented as suggestions by the shared review helper. Provider
  root metadata such as `isPublic`, `reviewed`, and `tailoringReview` is not trusted.
  A root-level provider summary is handled as a prose proposal, never baseline.
- Profile identity/revision and optional owner/run/resume identifiers are captured
  before the request as minimal review metadata. Mutable prose arrays are copied.
  Metadata is not sent in the prompt; nested application answers, references and
  arbitrary source properties are excluded. This reduces disclosure but does not
  anonymize resume content or establish provider retention/training guarantees.
- `saveResume`, PDF download/upload and its shared text renderer, DOCX document
  construction, and browser-agent profile construction reject review envelopes
  before authentication, persistence, rendering or upload. A candidate's explicit
  original/suggested/edited choices produce the committed text. This is candidate
  review, not verification that a claim is true. Existing saved/manual resumes are
  not retroactively classified, reviewed, purged or certified by this change.
- Extension preparation now stops before a provider call with a review-required
  message: import the latest job into the AI Generator, review/save, then select
  that saved resume in the extension. Existing selected-resume sync remains
  supported. This is a safe handoff limitation, not completion of an extension
  review experience; importing the right job, selecting the intended reviewed
  version and employer-form acceptance remain extension UX acceptance gates.
- The API configuration check uses the same resolved Supabase URL as the client,
  accepting custom HTTPS domains and development-only HTTP loopback URLs. It is
  a configuration check, not proof of a valid subscription/key or reachable API.
- `QA_AI_REVIEW=1` enables only synthetic provider-shaped responses for two
  allowlisted routes in the loopback fixture. All other external actions remain
  blocked, and no fallback connects to a real provider. This verifies frontend
  contracts, not production model quality, quota consumption or provider delivery.
- Seven source-generation tests, three configuration tests, three fixture tests,
  and five shared-sink/extension tests pass. Additional existing bridge, versioned
  save, PDF/DOCX, PDF delivery and fixture regressions pass. These include frozen
  pre-request source/version binding, post-response account cancellation, malformed
  review packets, explicit keep-original saves and extension no-charge preflight.
  Changed production files also pass ESLint and TypeScript checks.
- The semantic adversarial corpus remains a separate diagnostic: review gating
  must not be reported as model factuality improvement or used to relabel
  unsupported claims. A user can approve an inaccurate suggestion. Staging must
  validate all active generation/recovery/export flows and exact final text after
  candidate choices; no historical saved AI output or logs were inspected or purged.
