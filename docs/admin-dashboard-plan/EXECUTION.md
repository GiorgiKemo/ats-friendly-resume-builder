# AI execution plan and production acceptance

## How to execute this package

Read README, CURRENT-STATE, ARCHITECTURE, MEASUREMENT and DESIGN before changing code. Treat task IDs below as ordered work packages. Each package needs a focused diff, automated tests, manual evidence where applicable, and an explicit pass/fail/blocked record. No unchecked requirement is complete because a screen looks plausible.

Use the existing repository and style. Do not replace billing, Auth, routing or the public website wholesale. Preserve unrelated edits and stashes. Local fixtures and sample values must be visibly marked and impossible to enable on the public production path by accident. Never silently replace an unavailable integration with zeroes or mock success.

Dependencies:

```text
E00 -> E01 -> E02 -> E03
E03 -> E04 -> E05 -> E06
E03 -> E07 -> E08
E04 -> E09 -> E10
E03 -> E11 -> E12 -> E13 -> E14 -> E15
E06 + E08 + E10 + E15 -> E16 -> E17 -> E18 -> E19 -> E20
```

E01 design work may proceed alongside E00 read-only discovery. After E03, independent feature branches can progress in parallel, but coordinate shared migrations/contracts. Never let two implementers independently redesign the entitlement or conversation state machine. E20 requires the entire end-state scope, not just the first branch that works.

## Work packages

### E00 — Baseline, discovery and environment contract

**Inputs:** this package, current repository, authorized production/staging access.

**Implement/record:** inspect git status/HEAD, local instructions, package scripts, environment matrix and existing tests. Inventory actual deployed Auth/profile/RPC/entitlement/admin schema, RLS, grants, migrations, function revisions, provider events, GA configuration and support/email capabilities with read-only discovery. Record discrepancies, source timestamps, secret *names/presence* and access failures, never secret values. Set up isolated local/staging data and source-backed reconciliation queries. Verify actual runtime versions from lockfiles/tool help.

**Touch:** new implementation evidence under `docs/admin-dashboard-plan/evidence/`; environment documentation only as needed.

**Verify/gate:** distinguish local, staging and live; baseline commands captured; no production mutation; existing owner and provider ownership verified. If production access remains denied, local work continues but production migration is blocked. Do not invent migrated schema from source files.

### E01 — Finalize contracts and light/dark shell prototype

**Dependencies:** E00 source inventory; may use fixtures while live reads are pending.

**Implement:** map current roles/actions to proposed capabilities; define versioned request/response schemas, KPI definitions, feature flags and route inventory. Build a development-only shell preview with light sidebar, Light/Dark/System, responsive navigation and all important component states. Reuse theme mechanics with a separate admin preference; preserve customer theme behavior.

**Touch:** `src/components/admin/`, proposed admin theme hook/style tokens, test fixtures; do not expose an unauthenticated mock admin route in production.

**Verify/gate:** 360/768/1024/1440/1920px, 200% zoom, keyboard/focus and contrast checks in both themes; no preference defaults to Light; System updates; saved preference and drafts survive reload/theme changes as specified. Contract fixtures reviewed before backend consumers diverge.

### E02 — Authentication, capabilities and transactional audit foundation

**Dependencies:** E00, E01.

**Implement:** split reusable server auth/capability validation from `admin-api`; fresh session/membership checks, MFA/step-up policy, scoped serializers, strict payload schemas, rate/body limits and standard errors. Create operation idempotency storage and transactional audit helper. Add owner-count serialization and role/invitation safeguards. UI obtains capabilities from the server; metadata alone never enables privileged access.

**Touch:** `supabase/functions/admin-api/index.ts`, shared admin helpers/contracts, `src/services/adminService.js`, access boundary, migrations and admin tests.

**Verify/gate:** anonymous/customer/revoked/stale-token/support/analyst/billing/admin/owner matrix; role escalation payloads denied; missing audit insert rolls back mutation; repeated operation key returns same outcome; different payload conflicts; concurrent removal cannot eliminate the last usable owner. Prove private fields are absent from unauthorized network responses, not just hidden by CSS.

### E03 — Database foundations and migration harness

**Dependencies:** E02.

**Implement:** add the minimal schema/indexes needed by the later contracts, RLS/grants and stable migration test helpers. Create schema incrementally by domain rather than one unreviewable SQL file. Use installed Supabase CLI help to confirm commands and migration creation workflow; never invent migration timestamps or modify production directly to experiment. Build sanitized fixture factories with two ordinary users, a guest, two agents, billing/admin/owner roles and all payment/queue states.

**Touch:** CLI-created `supabase/migrations/` files, SQL/RLS tests, fixture server adapters.

**Verify/gate:** migration from current baseline and blank test database; role grants and direct REST/RPC/Storage access tests; cursor indexes and query plans. Test support note isolation independently. Confirm deployment ordering/backward compatibility before every migration. No secrets or real customer records in fixtures.

### E04 — Unified entitlements and audited manual upgrades

**Dependencies:** E03.

**Implement:** add manual grant records, shared effective-access calculation and grant/revoke/expiry transactions. Update existing `setPremium` and **all** provider/verification writers to use it. Separate quota policy from grants; do not reset usage on provider updates. Implement safe legacy classification/dry-run, expiry/reconciliation workers and a discrepancy report.

**Touch:** admin API, shared billing/quota helpers, Stripe/PayPal webhook and verification handlers, entitlement migrations; preserve current checkout ownership tests.

**Verify/gate:** paid + manual overlap; multiple manual grants; multiple providers; old webhook after grant; grant expiry while paid; revocation of one grant; concurrent expiry/renewal; permanent grant safeguards; rollback on missing audit; no fake purchase/revenue; known legacy rows preserve access. Require explained dry-run differences before production cutover.

### E05 — Bounded directory and customer 360 APIs

**Dependencies:** E04.

**Implement:** indexed directory projection with sync/reconciliation, server search/sort/filter/cursor pagination, scoped detail tabs and bounded timelines. Separate aggregate counts from list limits. Implement safe profile/account operations, session revocation, ban/unban, quota adjustments, background exports and the stateful deletion workflow. No all-Auth-users scan per view or post-mutation overview rebuild.

**Touch:** admin user server modules, directory migrations/jobs, `src/services/adminService.js`, customer detail clients and tests.

**Verify/gate:** 10k synthetic users; stable pagination for equal timestamps and changing data; no cross-role disclosure; failed directory sync visibly stale; mutation revalidates authority at source; deletion with active subscription cannot falsely report completion. Export authorization and expiring downloads tested after role revocation.

### E06 — User/admin UI and team management

**Dependencies:** E05; E01 shell.

**Implement:** route `/admin/users`, customer drawer/full page, safe grant/quota/ban dialogs, role-aware actions, team invitations/MFA state, audit pages, read-only receipts and pending operation status. Remove browser prompt/confirm UX from migrated flows. Wire authoritative capabilities and server errors; retain unsaved state on recoverable failures.

**Verify/gate:** a real fixture owner grants access and sees the updated customer entitlement/audit; unauthorized roles cannot trigger actions via UI or direct API; double click/refresh/network timeout cannot double-apply; account context and search survive navigation. Both themes, dialogs, long content, 200% zoom and mobile pass.

### E07 — First-party event pipeline and GA conversion instrumentation

**Dependencies:** E03.

**Implement:** event schema allowlist/versioning, domain outbox, bounded authenticated/consented client intake, retry/dedupe and environment guards. Instrument actual account, resume, export, AI, application, checkout and support outcomes at their authoritative points. Keep error telemetry separate. Add reviewed GA signup/checkout/purchase bridge, consent handling and key-event configuration; no PII or browser-success-route purchase trigger.

**Touch:** `src/components/GoogleAnalytics.jsx`, event client/consent integration, domain services and relevant functions, outbox/event migrations and tests. Enumerate all emission points in a coverage manifest; constants alone do not count.

**Verify/gate:** one outcome produces one event despite retries/StrictMode/remounts; spoofed client purchase/user ID rejected; test/admin/local host excluded; no analytics consent means no nonessential GA dispatch; real product/payment success still works. GA delivery/processed report evidence is separate from local tests. Inaccessible GA credentials block live GA verification, not first-party events.

### E08 — Metric jobs, analytics APIs and overview

**Dependencies:** E07; metric contracts in MEASUREMENT.

**Implement:** daily/cohort aggregates with versioned components; event replay/rebuild; quality metadata; cached server-side GA reporting; coherent filters/date/timezone; overview and analytics routes; acquisition, activation, conversions, retention, feature adoption and detail drill-downs. Define maturity/exclusions and show components. Add securely scoped CSV exports with formula-injection protection.

**Verify/gate:** exact fixture math including 40% activation/20% paid conversion, annual MRR and separate currencies; timezone boundaries, duplicates, immature/empty cohorts, missing prices, absent credentials and stale source. Card/table/filter totals reconcile. No live connection is shown for fixture data. Cache quota behavior and failure UI tested.

### E09 — Billing read models and reconciliation console

**Dependencies:** E04.

**Implement:** provider/environment-specific subscription and transaction projection, verified durable event inbox, webhook dedupe/retry/dead-letter and scheduled provider reconciliation. Build source-backed history, failed renewals, cancellation schedules, manual-access distinction, disputes/refunds and stale-state indicators.

**Touch:** existing Stripe/PayPal integration functions, new billing query/reconciliation modules and `/admin/subscriptions`.

**Verify/gate:** signed vs forged webhook, duplicates/out-of-order/late events, both providers on one user, partial provider outage, missing ownership and missing secrets. Replay cannot duplicate access or revenue. A paid entitlement cannot disappear merely because a provider API request timed out.

### E10 — Safe billing actions

**Dependencies:** E09.

**Implement:** supported cancel/resume/plan-change/refund operations with provider-state preview, role/MFA checks, amount/currency limits, reason, idempotent operation intent and reconciliation receipt. Include dispute context and supported evidence workflows only after capability review. Unsupported provider operations are explicitly unavailable, not mocked.

**Verify/gate:** provider sandbox flows, partial refund limits, annual/monthly proration preview, canceled/expired states, replay, uncertain network outcome and concurrent changes. No arbitrary live purchase/refund is performed as a test. An owner-authorized low-value production transaction, when required, uses an explicit test identity and documented cleanup; verify payment, webhook, entitlement, receipt and accounting exclusion separately.

### E11 — Conversation persistence, authorization and delivery core

**Dependencies:** E03.

**Implement:** conversations, participants, guest session binding, public messages, separate internal notes, sequence/read cursors and state history. Build support APIs for start/list/read/send/handoff/resolve with role/participant checks, idempotency, body/rate limits and CAS revisions. Persist before notification; implement reconnect/poll catch-up and minimal private Realtime invalidation. Save outbox jobs with durable retries.

**Verify/gate:** two-user/guest isolation via direct API and socket attempts; token expiry/revocation; guessed IDs; spoofed email/sender; duplicates/out-of-order arrival; disconnect during send; gap recovery; notes never serialized to customer; role revoked while socket remains connected. Guest recovery does not grant access based only on email.

### E12 — Customer live-chat widget and attachments

**Dependencies:** E11.

**Implement:** accessible guest/account widget with saved history, delivery states, unread, handoff button, privacy notice, actual hours/offline status and optional secure follow-up. Add private attachments with byte/MIME/ownership checks, quarantine/scanning and authorized expiring downloads. Use customer theme; do not copy agent theme preferences.

**Touch:** proposed `src/components/support/`, support client, private Storage policies/upload handlers; integrate in `src/App.jsx` without obstructing existing flows.

**Verify/gate:** mobile keyboard/safe area, focus, connection loss/reload/history, same guest session/account link, cross-customer attachments denied, executable/polyglot/oversize files blocked, scanner failure safe, unknown delivery shown honestly. Text chat must function without optional attachments or AI.

### E13 — Human inbox, assignment and operations

**Dependencies:** E12.

**Implement:** routed inbox with queue, conversation/customer panes, assignment/CAS takeover, priority/tags/macros, separate Reply/Internal note composer, read state, resolution/reopen and search. Add business-hours routing, capacity, presence TTL, first-response/SLA clocks and escalation. Integrate scoped customer and billing context; privileged actions reuse existing domain APIs.

**Verify/gate:** two agents taking/replying simultaneously; disconnect/reassign; delayed messages; notes never sent as replies; resolved case reopens without losing history; true queue count vs paginated rows; no “online” claim from a static setting. Theme switch retains draft and assignment. Agent accessibility and mobile flow pass.

### E14 — Support follow-up, knowledge and feedback

**Dependencies:** E13.

**Implement:** email notification outbox and separate delivery mapping, minimal safe templates, bounce/retry visibility, verified inbound threading if provider configured; approved knowledge draft/review/publish/rollback; feedback/CSAT records and support-to-improvement linkage. Import/link old contact inquiries once with provenance; do not invent missing replies.

**Verify/gate:** repeated delivery webhook/inbound message deduped, spoofed sender/thread rejected, private notes absent, unsubscribe/preferences and secure links correct, old inquiry not duplicated, unpublished KB invisible to customers/AI. Human-support transcripts and follow-up are fully functional before AI is enabled.

### E15 — AI support with guarded human handoff

**Dependencies:** E14.

**Implement:** server provider adapter, published-knowledge retrieval, bounded read-only account tools, structured outputs, safe rendering/citations, durable AI jobs, per-turn/conversation/global budgets, timeout/circuit breaker and handoff. Guard final message commit by expected AI epoch/mode/trigger; no unawaited background promise as persistence. Add optional agent-assist drafts requiring send confirmation.

**Verify/gate:** maintained adversarial and product-answer set; cross-user/exfiltration attempts, document prompt injection, unknown pricing, unavailable provider, cost limit, abusive load, multilingual questions and full conversation recovery. Queue a human while AI is pending: the late bot reply must not appear. No tools can grant/refund/delete. Named human operator reviews quality before production enabling.

### E16 — AI/job operations, feedback insights and settings completion

**Dependencies:** E06, E08, E10, E15.

**Implement:** operational request/job and cost panels, known/unknown price coverage, safe retry/cancel/reconcile, user quota policy controls, integration health/freshness, notifications, support routing, flags/budgets, feedback categories and improvement owner/status. Link errors to safe operation IDs rather than collecting raw private content. Finish every scope row in README.

**Verify/gate:** retries cannot send an employer application twice; completed external work is not portrayed as undoable; missing costs are unknown; settings revisions/audit/rollback work; summary insights link to evidence and do not claim causality. Check no orphan placeholder/button remains for a required capability.

### E17 — Privacy lifecycle, security and destructive workflows

**Dependencies:** E16.

**Implement:** reviewed retention jobs, customer export/deletion orchestration, holds, attachment/cache/AI-provider deletion contracts, consent withdrawal, audit append-only controls and external evidence export. Complete threat model for privileged APIs, Realtime, guest recovery, Storage, AI retrieval/tools, CSV export and provider endpoints.

**Verify/gate:** RLS/RPC/Storage adversarial suite; stale role/session and concurrent owner tests; XSS/link handling, rate limits, request size, CSV formula injection, replay and insecure direct object references. Deletion has no hidden paid renewal left running; legal/financial holds are explicit; deletion jobs are resumable. No unrestricted secrets in frontend bundles, logs, git or transcripts. Security review signs off; unresolved high/critical issue blocks launch.

### E18 — Integrated QA, performance and accessibility

**Dependencies:** E17.

**Implement/verify:** run all existing project checks and the new database, provider, admin/chat, metric and AI suites. Exercise the complete owner/customer/guest/two-agent journeys in both themes. Capture network evidence, screenshots, accessibility findings, query plans, load reports and actual provider behavior in staging. Verify no regression in public SEO, signup, resume building/export, applications and checkout.

**Provisional test envelope, not a current traffic claim:** 10k registered users, 1m events/month, 50 concurrent support conversations and 80 messages/minute. Test p95 cached admin reads under 750ms, indexed detail reads under 1.5s and persisted message acknowledgement under 2s at that envelope. Establish separate observed AI latency; aim for a useful response/status within 8s and enforce a bounded timeout/human fallback. If measured infrastructure cannot meet these targets, report results and tune before launch rather than weakening them silently.

**Gate:** all mandatory acceptance IDs pass; unavailable external checks are recorded as blocked, not passed; critical paths tested on actual supported browsers and sizes. No fixture can reach production APIs. All expected UI states and theme transitions pass visual/keyboard checks.

### E19 — Staging rehearsal and operational handoff

**Dependencies:** E18.

**Implement/verify:** rehearse expand/contract migrations, workers, entitlement backfill comparison, provider webhook replay, email delivery, guest/account chat, human takeover and owner recovery. Test backup restore in an isolated environment; prove restored transcripts/ledger/audit are usable. Configure alerts with actual recipients and runbooks; simulate each alert and worker outage. Train a named agent/owner on queues, handoff, refunds, grant expiry and incident handling.

**Gate:** proposed operational RPO/RTO recorded against available infrastructure, suggested RPO <=15 minutes and RTO <=4 hours only if backup/restore drills demonstrate them; do not claim these from a plan. Support hours, staffing, budgets, retention policy, integration ownership and release checklist are filled in. Restore and rollback rehearsal succeeds without deleting durable chat/payment evidence.

### E20 — Controlled production launch and evidence-backed completion

**Dependencies:** E19 and production release authorization.

**Implement:** freeze the validated scoped diff, inspect dirty tree and preserve unrelated work. Stage only authorized files, review secrets/migrations, commit and push the agreed branch. Deploy additive schema and compatible functions before clients; deploy workers with mutation/AI flags initially disabled. Reconcile old/new entitlements without unexplained loss. Enable staff admin access, then support widget/human queue, then AI only after live safety/budget checks. Confirm scheduled jobs and email routing are active.

**Verify:** deployment is READY and correct commit/production aliases resolve; HTTP-check `https://www.resumeats.cv`; admin unauthorized/authorized behavior, theme default/persistence, real saved chat across reconnect and human handoff, real scoped manual grant/revocation, provider webhook/reconciliation, GA delivery/freshness, alert delivery and public regression smoke. Any live financial test must have scoped authorization. Production proof is distinct from local build or provider sandbox proof.

**Completion gate:** all required scope/acceptance rows pass; no required integration remains mock, inaccessible or disabled without an explicitly agreed scope change. Record commit/deployment ID, migration/function versions, exact URLs, timestamps, source environments, verification evidence and unresolved limitations. Do not call the full production dashboard finished after only producing this planning package or a UI prototype.

## Mandatory acceptance matrix

| ID | Must be demonstrated | Owning tasks |
| --- | --- | --- |
| A01 | Fresh membership/session/MFA enforced on direct requests, not only route guards | E02, E17 |
| A02 | Last usable owner survives concurrent revoke/ban/delete attempts | E02, E17 |
| A03 | Local mutations fail closed without audit; idempotency and revision conflict work | E02, E04, E10 |
| A04 | Manual, Stripe and PayPal entitlements coexist; grant/expiry never erases other valid access | E04, E09 |
| A05 | Correct indexed user pagination and scoped customer payloads at test scale | E05, E18 |
| A06 | No fake revenue/signups; duplicates, mature cohorts and zero denominator handled | E07, E08 |
| A07 | GA source/consent/property/hostname correct; missing data not zero; no PII | E07, E08, E20 |
| A08 | Provider signatures/ownership/replay/out-of-order and uncertain financial actions safe | E09, E10 |
| A09 | Customer A/guest cannot read B's transcript, attachments, notes or identifiers | E11, E12, E17 |
| A10 | Saved messages recover exactly once and in order after disconnect/retry/reload | E11, E12 |
| A11 | Human request/takeover prevents a pending AI answer from committing | E13, E15 |
| A12 | Agent notes never appear in customer responses, sockets, exports or AI context | E11, E13, E15 |
| A13 | Offline hours, presence, unread/read/delivery and human-response clocks are truthful | E13, E14 |
| A14 | AI cannot perform mutations/exfiltrate; budgets/outage route safely to saved human queue | E15, E17 |
| A15 | Light is default including sidebar; Dark/System cover every surface, persist and preserve draft/focus | E01, E06, E18, E20 |
| A16 | Full keyboard/zoom/mobile/contrast and XSS-safe text/attachments pass in both themes | E12, E18 |
| A17 | User export/deletion/retention/holds and active subscriptions reconcile end to end | E05, E17 |
| A18 | AI/job retry cannot repeat externally completed employer submissions | E16, E18 |
| A19 | Metrics reconcile, alerts deliver, workers recover and restoration meets recorded objective | E08, E18, E19 |
| A20 | Correct live deployment, authorized real-service checks and no required mock functionality | E20 |

## Release ordering and rollback rules

Use expand -> backfill/dry-run -> compatible server deployment -> staff verification -> new client -> flag enablement -> observe -> later contract cleanup. Keep old reads compatible during transition. Never roll back to the old direct `users.is_premium` writer once the unified ledger is authoritative.

Safe emergency controls: disable AI automation while retaining human support; pause new privileged/provider mutations while preserving read-only status and reconciliation; disable optional event enrichment while preserving financial/support event durability. If a frontend release fails, roll back UI to a version compatible with the new ledger or deploy a targeted patch. Do not drop new tables or restore an old database over new payments/transcripts as a routine rollback.

Suggested actionable alerts: billing event oldest pending age, repeated signature failures, entitlement mismatch, grant-expiry lag, worker heartbeat missed, support queue beyond staffed SLA, notification bounce spike, AI cost/latency/error limits, unauthorized admin attempts, audit insert failures and stale metric imports. Choose thresholds from staging/load evidence and operating coverage; route to named owners. Silent unchanged monitoring is preferable to repeated noise.

## Evidence manifest template

Create `evidence/implementation-status.md` when implementation begins, not with fabricated pass marks now. Each record includes:

```text
Task / acceptance ID:
Status: not_started | in_progress | passed | failed | blocked
Commit and migration/function versions:
Environment and exact source:
Test command or manually reproduced steps:
Expected / observed outcome:
Evidence path or provider/deployment link:
Timestamp and reviewer:
Known limitations / next action:
```

Existing command names are documented in CURRENT-STATE. Add new test scripts only after implementing their harness; label proposed commands as proposed until then. Do not treat a screenshot, successful build, static regex assertion or API HTTP 200 alone as proof of authorization, billing correctness or actual message delivery.

## Ready-to-use instruction for the implementing AI

> Implement the complete ResumeATS admin dashboard and persistent AI/human support described in `docs/admin-dashboard-plan/`. Read all six specification documents first and inspect the actual repository/deployed contracts. Start with E00, record an evidence manifest, and work through E01–E20 in dependency order. Preserve existing public, authentication, payment and application behavior. Default the admin area to a light sidebar and light content with complete saved Light/Dark/System support. Never trust client role/user/payment claims, leak customer data, bypass the entitlement ledger, fabricate metrics or label a mock integration live. Add failing tests for risky behavior before implementing it, verify scoped diffs, and record local/staging/production evidence separately. Do not skip later scope or call a UI prototype production-ready. If a required source/credential/business policy is unavailable, report the precise gate and continue independent safe tasks; do not invent success. Never expose secrets or make an unapproved real charge/refund. Release only the validated authorized diff, verify the actual production deployment and all required acceptance cases, and leave a concise handoff with any remaining limitations. No plan can guarantee flawless execution; the acceptance evidence is the standard.
