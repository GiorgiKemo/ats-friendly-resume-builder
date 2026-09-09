# Architecture and behavioral contracts

This is a proposed design, not an applied migration. Reconcile names/types with the deployed schema in E00 before creating SQL. Keep additions small and composable; use existing project primitives where their contracts are suitable.

## 1. System boundaries

```text
Admin React routes -> authenticated admin API -> capability check -> transactional domain operations
Customer widget   -> support API             -> participant check -> saved messages / handoff state
Payment providers -> verified webhook intake -> durable event inbox -> ledger / access / purchase outbox
Product operations -> transactional event outbox -> event stream -> daily aggregates
GA4 reporting API -> server-side cached aggregate reports -> analytics views
Support AI worker -> published knowledge + bounded read-only tools -> guarded message commit
Saved chat changes -> private notification channel -> authorized refetch -> customer or agent UI
Scheduled workers -> reconciliation / expiry / delivery / aggregation / retention / recovery
```

The database is the durable source of local state; a socket event, browser success page, or AI response is not. Do not expose service keys or GA/AI/provider secrets to the frontend. Privileged business actions go through explicit APIs, never an arbitrary SQL console.

### Frontend organization

Keep `/admin` as the overview and add nested routes for users, analytics, subscriptions, support, AI/jobs, feedback, audit and settings. Existing bookmarks continue to work. Build `src/components/admin/` primitives and `src/pages/admin/` route modules; keep `src/pages/AdminDashboard.jsx` as the migration boundary until the new routes are ready. Use a shared `AdminLayout`, `AdminAccessBoundary`, filter toolbar, server table, customer drawer, status indicator, metric card, mutation dialog and error/empty state.

Use `src/services/adminService.js` as the compatibility adapter, then split user/billing/support/report clients as size warrants. Share schema validation, capabilities and error codes with Edge Function contracts without importing secrets. Do not mix customer `/analytics` with the new business analytics route.

## 2. Identity, roles and privileged actions

Every endpoint verifies the bearer token, current account/session eligibility, active database membership and the capability required for the exact action. JWT/user metadata must not grant authority. Role revocation is checked again inside privileged database transactions; use a consistent membership lock to close the check-then-write race. For strict session revocation, validate session state on sensitive paths, not only token signature/expiry.

Require MFA/AAL2 for admin sessions. High-risk actions require a recent step-up, a specific reason, a typed target confirmation, and a server-generated preview where financial impact exists. Fail closed if assurance cannot be established. A client route guard is only a usability feature.

### Capability matrix

Extend existing roles with `billing` and `analyst` only after compatibility tests. Capabilities are fixed server definitions, not arbitrary client strings. “Scoped” means response fields and rows are restricted server-side.

| Capability | Owner | Admin | Support | Billing | Analyst |
| --- | --- | --- | --- | --- | --- |
| Business aggregates | Full | Full | Support only | Billing only | De-identified product reports |
| Customer directory/detail | Full | Full | Scoped support identity/context | Billing identity/context | No identifiable directory |
| Public support transcripts/reply | Yes | Yes | Yes | Billing cases assigned to role | No |
| Internal support notes | Yes | Yes | Yes | Assigned billing cases | No |
| Grant/revoke complimentary Premium | Yes | Yes | No; request escalation | Yes | No |
| Usage limit adjustment | Yes | Yes | No | No | No |
| Refund/cancel/change paid plan | Yes | Yes, within configured limits | No | Yes, within limits | No |
| Ban/revoke sessions | Yes | Yes, non-owner targets | No | No | No |
| User data export | Yes | Yes, purpose and scope | Conversation export only when allowed | Financial export only | Aggregated export only |
| Account deletion and retention holds | Yes | Prepare request; owner execution | No | No | No |
| Team roles/owner transfer | Yes with last-owner safeguard | No | No | No | No |
| Knowledge draft/publish | Yes | Yes | Draft | No | No |
| Audit read | Full | Operational, excluding restricted owner settings | Own/support scope | Billing scope | No |
| Integration secrets/security settings | Owner-authorized server workflow only | Health only | No | Health only | No |

Configure bounded refund and bulk-action limits before enabling those actions. A role cannot edit its own authority. Serialize owner-count-changing operations with one database guard/advisory lock so concurrent removal, ban and deletion cannot eliminate every usable owner. Owner transfer requires a verified, MFA-ready recipient; an invitation alone is not a replacement owner.

### Mutation contract

Request: named action, validated payload, idempotency key, expected record revision and reason where required. Actor identity comes only from the verified session. Limit body bytes while reading, reject unknown fields, validate identifiers/amounts/enums, restrict origins and rate-limit by actor and operation. CORS is not authorization.

Response: `requestId`, stable `code`, `data`, `revision`, and `asOf`; lists also return opaque `nextCursor`. Use appropriate 401/403/404/409/422/429/503 statuses; do not expose record existence to unauthorized callers. Error messages do not contain SQL, tokens, stack traces or private customer content.

For each idempotency key store actor, action, payload hash, status and response. Same key/same payload returns the prior outcome; changed payload is a conflict. Local mutation + audit + outbox are atomic. A failing audit insert rolls back local state. Return a mutation receipt, not a full overview whose failure could misrepresent a successful operation.

External calls cannot share a database transaction. Create an audited durable intent, call the provider with the provider-supported idempotency mechanism, then save and reconcile the result. On a network timeout return `pending_reconciliation`, not a new attempt/“failed” button that could refund twice. Record attempts and terminal outcomes. Never log full secrets or full provider payloads indiscriminately.

## 3. Data model

All exposed tables have RLS and explicit grants. Service-only tables revoke `anon` and general `authenticated` access. Customer-readable tables expose only that customer's records. Keep privileged security-definer helpers, if unavoidable, in a non-exposed schema with a fixed empty/safe search path and narrowly granted execution. Prefer security-invoker RPCs called only by the authenticated server's service client for domain mutations. Privileged functions must themselves check the trusted actor's current membership; service-role bypass is not a substitute for business authorization.

Names below are proposed contracts. Extend suitable existing tables instead of duplicating them. All times are `timestamptz` in UTC; monetary values use integer minor units plus ISO currency, never floating-point amounts. Financial identifiers are provider/environment scoped. JSON fields use bounded allowlisted schemas, not an unrestricted dumping ground.

| Store | Important fields and constraints | Index/access requirement |
| --- | --- | --- |
| Existing `admin_members` | user ID, normalized invite email, role, active/revoked timestamps, revision | Unique active user; preserve verified invite claim; service-only membership management |
| Existing `admin_audit_events` | actor/target snapshots, action, reason, request ID, safe before/after, outcome, created time | Cursor `(created_at,id)` plus actor/target/action filters; no application update/delete |
| `admin_operation_requests` | actor, idempotency key, action, input hash, state, response, provider reference | Unique `(actor,idempotency_key)`; short-retention response redaction |
| `admin_user_directory` | user ID, normalized email/search fields, account state, joined/last-active times, projection version | Cursor indexes for supported filters; service-only PII; reconciliation from Auth/profile sources |
| `manual_access_grants` | grant ID, user ID, plan, starts/expires, reason, issuer, revoker/time | Valid time range; index `(user_id,expires_at)`; explicit permanent grants require elevated confirmation |
| Existing `billing_entitlements` | user/provider/subscription, state, expiry, observed/version data | Preserve provider-scoped uniqueness and user lock; manual entries link to grant ID |
| `billing_subscriptions` | provider, environment, subscription ID, user, plan/price, normalized and raw status, renewal/cancel state, refreshed time | Unique provider/environment/subscription; status/renewal cursors |
| `billing_transactions` | provider transaction/invoice IDs, subscription/user, kind, currency, gross/tax/discount/refund/fee when known, occurred time | Unique provider/environment/transaction/kind; finance access; explicit unknown fees |
| `billing_event_inbox` | provider event ID, environment, received/provider time, signature result, processing state, attempts, retry time | Unique provider/environment/event; retry index; restricted payload with retention |
| `domain_event_outbox` | event ID, event name/version, authoritative source ID, safe payload, created/dispatched times, retry state | Unique domain event occurrence; lease/retry index; no browser writes |
| `product_events` | event ID, event/version, trusted user or consented pseudonym, occurred/received times, source, environment, route, properties | Event ID unique; time and `(user_id,occurred_at,id)` indexes; event allowlist; no public reads |
| `metric_daily` / `metric_cohorts` | versioned metric, date/cohort, approved dimensions, counts/components, completeness and as-of | Unique metric/version/grain/dimensions; store numerator/denominator, not just percentages |
| `integration_report_cache` | source/property/query hash, payload, window/timezone, fetched/expires time, quality/errors | Unique source/query hash; server-only GA credentials stored elsewhere |
| `ai_usage_records` | request ID, user/feature/model, token counts, price version, estimated/actual cost, latency/result | Unique provider/request or logical attempt; no prompt bodies; append corrections explicitly |
| `support_conversations` | ID, user or guest identity, subject, status, mode, assigned agent/team, priority, revision, AI epoch, last sequence, timestamps | Queue cursor `(status,mode,priority,last_message_at,id)`; owner/user indexes; strict subject size |
| `support_participants` | conversation ID, authenticated subject, participant role, revoked time | Unique conversation/subject; validate current membership on every read/write |
| `support_messages` | ID, conversation, sequence, sender ID/type, client message ID, body, reply reference, created time | Unique conversation/sequence and sender/client ID; immutable public messages; max body length |
| `support_internal_notes` | ID, conversation, agent, note, created/edited times with history | Separate table/API/channel; never customer-readable or part of public transcript |
| `support_attachments` | message/conversation, private storage key, size, detected MIME, checksum, scan state | Private bucket; no serving pending/quarantined content; upload ownership verified |
| `support_conversation_events` | conversation, actor, from/to state, assignment/handoff reason, sequence/time | Immutable state history; scoped customer-safe event serialization |
| `support_read_cursors` | conversation, participant, last-read sequence | Unique conversation/participant; monotonic updates; derive unread counts |
| `support_ai_runs` | conversation, trigger message, expected epoch/revision, knowledge version, status, usage/refusal category | Unique trigger/epoch; durable worker lease; bounded safe diagnostics |
| `support_delivery_outbox` | message/conversation, channel, verified recipient reference, delivery ID/status, retries | Unique notification occurrence; email webhook maps provider ID to this record |
| `support_guest_sessions` | high-entropy token hash, conversation binding, expiry/revocation, session subject | Never store plaintext bearer token; no email-based transcript access |
| `support_knowledge_articles` / versions | slug, locale, title, approved content, draft/published version, author/reviewer | AI sees published versions only; restore prior version without erasing history |
| `customer_feedback` / `improvement_items` | source conversation/event, category, sanitized summary, impact, owner, status | Role-restricted links; redacted analyst view; no raw transcript in broad reports |
| `admin_settings` / version history | allowlisted key, validated non-secret value, revision, editor/reason | No arbitrary environment edits; public subset explicitly serialized |

Add notification preferences/agent availability to existing profiles or a small support settings table. Reuse existing job/quota/rate-limit tables after discovery. Avoid partitioning and extra infrastructure until measured load requires it. The table list expresses distinct access and durability boundaries, not a mandate for needless wrappers.

## 4. User operations and data lifecycle

The user detail view has Account, Access/Billing, Activity, Resumes metadata, Applications metadata, AI usage, Support, Feedback and Audit tabs. Default to metadata such as counts, template identifiers and timestamps. Do not load resume text, attachment bodies or full application content for a directory view.

Show source/as-of and account state accurately: active, unconfirmed, suspended, deletion pending or deleted. A user directory projection is an index, not the authority for authorization or money. Reconcile it periodically, record failures and validate the source at mutation time. Search/pagination happens server-side; allowlisted sort fields and cursor tie-breakers prevent gaps/duplicates. Exports run as audited background jobs with row limits and expiring private download links.

Suspension: record reason and scope, deny sensitive APIs immediately, invalidate/revoke sessions as supported and verify the resulting behavior. Do not accidentally keep an active owner's only recovery path suspended. Unsuspension is separate from restoring deleted data.

Deletion is a durable workflow: preview affected data and active subscriptions -> owner confirmation -> access lock/session revocation -> provider cancellation policy -> export/retention-hold evaluation -> anonymize/delete scoped app/support/storage data -> Auth deletion -> reconcile completion. Track failures by step and resume idempotently. Warn that deleting an account does not itself stop external recurring payments. Never cascade-delete accounting evidence blindly or label a soft deletion as full erasure.

Do not add unrestricted impersonation. If later approved, implement an expiring read-only support session with a visible banner, purpose, explicit scope, audit, and no payment/security mutations; never expose the customer's tokens/password.

## 5. Billing and complimentary access

### One access calculation

All providers and manual grants feed one effective-access calculation. Serialize per user. A valid paid entitlement **or** valid manual grant can supply access. Revoking one grant removes only that grant. Paid cancellations apply the provider's effective end date, not an immediate blanket downgrade. Manual expiry must not erase still-paid access. Resolve plan/feature limits through an explicit plan-capability policy rather than whichever event arrived last.

Keep current `users` Premium fields only as compatibility projections while clients migrate. Route **every** writer through the new atomic calculation, including current admin grants, checkout verification, provider webhooks, expiry jobs and repair scripts. Do not reset AI usage when projecting access. Quota changes and usage resets are separate audited policy operations that cannot manufacture extra paid entitlement.

Backfill existing manual access conservatively. A Stripe customer ID does not prove every historical Premium interval was purchased. Classify provable provider records; preserve ambiguous active access with a flagged legacy grant and reconciliation report instead of silently charging or downgrading anyone. Dry-run old/new effective access and require explained differences before cutover.

### Provider operations

Normalize trialing, active, overdue, cancel-at-period-end, canceled, suspended and expired states without losing provider raw status. Store last successful refresh; show stale/unknown instead of “Free” when a provider read fails. Separate paid subscriber count, subscription count, effective Premium users and manual grants.

Provide read views for plans, subscriptions, invoices/transactions, refunds, disputes, failed renewals and reconciliation anomalies. For cancellation, resume, refund and plan change: verify provider capability and ownership, fetch a current preview including amount/currency/timing/proration, require reason and confirmation, submit a durable idempotent intent, then reconcile. Some capabilities differ by provider; disable unsupported actions with an explanation and verified provider-dashboard link. Never silently substitute another operation.

Signed webhook intake stores a durable event before acknowledging receipt. Dedupe by provider/environment/event ID. Processing is retryable with leases/backoff/dead-letter status. Handle duplicates and out-of-order delivery by comparing authoritative object versions/timestamps and refetching provider state when ambiguous. Refunds and cancellations cannot be inferred from customer browser navigation. Keep strict checkout-to-user ownership; never recover ownership using email alone.

These retry/signature requirements follow the official [Stripe webhook guidance](https://docs.stripe.com/webhooks) and [PayPal webhook integration guidance](https://developer.paypal.com/api/rest/webhooks/rest/). Validate each provider's actual supported idempotency and action contracts before implementation.

## 6. Durable live chat and human handoff

### Identity and delivery

Support both logged-in customers and guests. Logged-in identity comes from verified Auth. A guest gets an unguessable, expiring, conversation-scoped session; store its hash server-side. Prefer a same-origin secure HttpOnly cookie through a reviewed proxy; otherwise use a scoped short-lived token held in memory with a narrowly reviewed recovery flow. Do not put it in URLs, analytics or logs. A typed email is contact information, never proof of transcript ownership. Link guest history to an account only after proving both the account identity and guest session ownership.

Persist each message with a client-generated idempotency identifier. A transaction allocates a monotonically increasing conversation sequence and commits message/state/outbox together. Only then acknowledge and notify. UI states: sending, saved, failed/retry; server acceptance does not mean email delivery or agent read. Reconnect fetches `afterSequence` from durable storage, dedupes by message ID and restores order. Paginate older history; never load all conversations/messages in a single payload.

Realtime is an acceleration layer, not storage. Use private channels and explicit authorization. Broadcast only minimal invalidation IDs, then refetch via the API with fresh authorization; do not broadcast transcript text/internal notes. Realtime authorization can be evaluated on connection, so role revocation must also stop/rotate subscriptions and be enforced on every subsequent API fetch/send. Guests may use bounded authorized polling first, with Realtime enabled only after a reviewed guest-token design. The [Supabase Realtime authorization documentation](https://supabase.com/docs/guides/realtime/authorization) distinguishes channel authorization from durable storage.

### State machine

Use orthogonal fields: `status = open | waiting_customer | resolved` and `mode = ai | queued | human`. Assignment and AI eligibility are server controlled. State changes increment a revision and append a conversation event in one transaction.

| Action | Required transition / invariant |
| --- | --- |
| Customer starts chat | Save message; open/AI if enabled and available, otherwise open/queued with honest offline notice |
| Customer requests a person | Set queued, increment AI epoch, cancel pending AI work logically, retain full history; always available without AI approval |
| Agent takes ownership | Compare-and-set assignment; mode human; increment AI epoch; competing agent gets conflict |
| Agent sends reply | Recheck membership/assignment/revision; save once; AI remains paused |
| Agent adds internal note | Separate note storage; never becomes a public reply or AI knowledge input |
| AI finishes after handoff | Guarded commit checks expected epoch, eligible mode, unresolved state and trigger sequence; discard obsolete answer |
| Another customer message arrives during AI work | Supersede/coalesce according to saved trigger sequence; avoid contradictory replies to an old question |
| Resolve | Record resolver/time/outcome; invalidate pending AI work; retain transcript; send at most one feedback request |
| Customer replies to resolved conversation | Reopen same thread; previously human-handled threads return to queued/human routing, not silently to AI |
| Agent returns thread to AI | Explicit audited action; new epoch and eligibility check; no automatic takeover from a human |
| Agent disconnects | Presence expires; do not lose assignment or promise online coverage; alert/reassign using configured policy |

Two-agent races, takeover while AI is responding, retransmitted messages, old sockets and revoked identities are mandatory tests. Typing/presence uses TTL and contains no message body; it cannot establish delivery or availability guarantees.

### Widget and inbox

Customer widget: clear AI label, “Talk to a person” action, message history, unread indicator, attachments, connection/retry state, hours/offline expectation and privacy notice. Guest email follow-up is optional and verified where needed. Do not auto-open aggressively or obstruct checkout, consent controls or mobile navigation.

Inbox: queue filters, search, unread/status/priority, SLA age, assignment, collision indicators, threaded messages, separate Reply/Internal note composer, approved reply macros, internal tags, customer context, related subscriptions and an escalation request. Privileged actions in the customer drawer obey the same roles as elsewhere; support agents do not gain grant/refund rights merely by opening a conversation.

Queue routing uses configured business hours/timezone, agent capacity and topic; billing cases can be prioritized. Do not invent “2 agents online” or response promises from a static label. Store first-human-response and resolution clocks separately from AI reply times. Customer-visible delivery, read and availability statuses must reflect observed state.

Offline notifications go through `support_delivery_outbox`, with provider delivery/bounce tracking. Reuse verified email sending infrastructure, not the auto-apply job table. Keep email content minimal and link to an authenticated/secure conversation view. If email replies are supported, require a provider-verified inbound webhook and high-entropy thread binding; reject spoofed/ambiguous senders and dedupe provider message IDs. No inbound provider is assumed configured today.

Attachments: private object storage, allowlisted JPEG/PNG/PDF, initial proposed limit 10 MB each and 3 per message, enforced on bytes and detected MIME. Quarantine until malware checks succeed; short-lived authorized download links; no inline executable HTML/SVG. Prevent path traversal, cross-thread object reuse and forged scan status. Text chat stays available if scanning is down. Resume attachments require explicit customer sharing, not automatic ingestion of every stored resume.

## 7. AI support design

Put AI calls behind a provider adapter in a server worker with durable job leases, explicit timeouts and budget limits. Reuse existing provider infrastructure only after verifying its data and cost contracts. No model/provider is silently assumed authorized for live support. Do not rely on an unawaited Edge Function promise for completion; persist a job, invoke a bounded worker and provide scheduled retry recovery.

Inputs: recent authorized public conversation messages, a bounded customer-context summary when authenticated, published knowledge versions and allowlisted tool results. Keep internal notes, unrelated conversations, raw payment credentials and unshared resumes out of context. Guest tools cannot read account or billing data. Publish/review knowledge from current pricing, feature instructions, troubleshooting and policy sources; store source/version references with answers.

Treat customer messages, retrieved documents and attachments as untrusted content. System prompts alone do not prevent abuse. Enforce tool schemas, identity, capability and data bounds outside the model. Ground answers in approved sources; when evidence is absent, contradictory, sensitive or stale, say so and route to a person. These controls align with [OWASP's prompt-injection prevention guidance](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html); retrieval does not turn untrusted text into authority.

Initial tools: read public help/pricing, read the authenticated customer's effective plan and remaining quota, read that customer's relevant job status, and request human handoff. No refund, grant, charge, email-send-to-arbitrary-address, ban, deletion, arbitrary SQL or browsing arbitrary private URLs. Agent-assist drafts are clearly labeled and require the agent to send them.

AI outputs use validated structured fields: answer, approved citations, proposed support category, escalation flag and safe reason code. Store the final customer-visible answer, knowledge version, tool names/approved result references, latency/tokens/cost and outcome; do not store hidden chain of thought. Escape/render Markdown safely and allowlist links. A low-confidence answer must not be confidently fabricated to improve “AI resolution” statistics.

Budget controls: per-turn token/context limits, per-conversation turn cap, per-user/guest rate limits, global daily/monthly cost limits and alerts, provider concurrency caps, circuit breaker and kill switch. On timeout, limit exhaustion, refusal or outage, preserve the customer message and offer/queue a human. Do not reset quotas simply because a chat page reloads.

Release evaluation set: genuine product questions, outdated pricing, unknown features, billing disputes, account-specific requests, multilingual queries, hostile text, prompt injection in documents, attempted other-customer access, jailbreaks asking for secrets, abusive load and human takeover races. Require zero cross-user disclosure or unauthorized action in the maintained adversarial suite; measure answer grounding and escalate uncertain results. Human review must assess usefulness and safety, not just a numeric score.

## 8. Privacy, audit and operations

Proposed retention defaults, pending policy/contract review: raw product events 90 days; de-identified daily aggregates 13 months; support transcripts/attachments 180 days after resolution; security/audit records 12 months unless a documented hold applies. Financial retention follows the business's reviewed accounting obligations, not these generic durations. Open cases and legal/accounting holds need an explicit owner and expiry/review process. Explain retention to customers before collection; do not claim legal compliance from this plan alone.

Do not send email, phone, resume text, chat bodies, payment identifiers or arbitrary query strings to GA. Separate essential service operations from consent-controlled analytics. Honor consent withdrawal, identity unlinking and deletion across events, exports, storage, caches and AI provider settings as applicable. Aggregates should use suppressed small cohorts when needed to prevent re-identification. No keylogging/session replay is proposed.

Audit logs are append-only to application roles, with redacted before/after values and stable actor snapshots. Restrict service credentials, export audit evidence to an independently controlled append-only destination, and alert on missing audit/outbox writes. Database superuser access is not made tamper-proof by RLS; keep administrative access controls and infrastructure logs too.

Workers: billing reconciliation and missed-webhook repair; manual grant expiry; directory sync; product event dispatch/aggregation; AI job recovery; support notification retries/SLA alerts; retention/export/deletion jobs. Each has a lease, idempotency key, bounded batch, timeout, heartbeat, last-success time, backlog gauge and dead-letter visibility. Reconciliation reuses the same domain operations rather than bespoke writes.

Operational settings include integration health, secret-presence status (never values), API quota/freshness, support hours/routing, knowledge versions, feature flags and AI cost limits. Support and product feedback can link to an improvement backlog with evidence, owner, priority and outcome. Do not infer causality from a support tag count or user cohort alone.

AI/job panels show request counts, success/failure, latency, known costs and missing-price coverage. Existing auto-apply retries must prove external submission/email idempotency before enabling a Retry action; otherwise show investigation/reconciliation, not a duplicate submission button. Cancelling internal work cannot undo an already-sent employer application.

See the execution plan for environment separation, load targets, disaster recovery and release gates.
