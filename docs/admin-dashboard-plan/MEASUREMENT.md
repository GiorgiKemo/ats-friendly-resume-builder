# Metrics, instrumentation and data confidence

## Purpose and source boundaries

Daily operations should answer: Are customers reaching a useful result? Are they becoming paying customers? Are subscriptions and support healthy? Weekly review should identify product friction without turning every click into a headline KPI.

Candidate families considered: acquisition/reach, registration volume, activation/value, paid conversion, recurring revenue, retention, feature adoption, AI cost/quality, support response, reliability and privacy/coverage. Use the three primary outcomes below, with diagnostic pages for the remaining families. Do not set growth targets from fictional mockup numbers or stale screenshots. Establish a clean baseline for at least one complete conversion window before adopting business targets.

Sources of truth:

- Auth/profile domain operations: account identity and verified account lifecycle.
- Resume/application/AI domain operations: durable product outcomes and failures, not browser button clicks.
- Stripe/PayPal confirmed financial events plus reconciliation: purchases, subscriptions, refunds and access-relevant payment state.
- Saved support messages/state history: response time, resolution, handoff and workload.
- GA4: consented visitor sessions, traffic acquisition and GA key-event rates. GA visitors are not equivalent to registered accounts or all actual visitors.
- First-party event stream: explicitly instrumented and policy-permitted product activity. Error logs and event-name constants do not establish coverage.

Server-side GA reporting requires authorized property access and a supported credential flow; use a dedicated read-only reporting identity, not a user's browser token embedded in code. Cache bounded queries and expose source freshness. The official [GA Data API quickstart](https://developers.google.com/analytics/devguides/reporting/data/v1/quickstart) describes property access setup; apply [current API quotas](https://developers.google.com/analytics/devguides/reporting/data/v1/quotas) when choosing refresh/batch behavior. Verify property `552904382` and its production stream at implementation time.

## Primary KPIs

| KPI | Definition and source | Decision / caveat |
| --- | --- | --- |
| 7-day resume activation | Distinct confirmed new accounts completing their first successful resume export within 7 days of confirmation / confirmed new accounts in the same mature signup cohort | Prioritize onboarding/export friction. Export is a useful-result proxy, not proof of a job interview or customer satisfaction. Also show resume save and time-to-first-export |
| 30-day signup-to-paid conversion | Distinct confirmed new accounts with their first real, nonzero, successful subscription payment within 30 days of confirmation / confirmed new accounts in the same mature signup cohort | Improve plan value and checkout completion. Exclude manual grants, trials without payment, tests and renewal-only events; annotate refunds separately |
| Current recurring revenue, by currency | Sum current active paid subscription recurring amounts after recurring discounts, excluding tax; normalize annual amounts / 12 | Monitor business scale alongside subscriber retention and refunds. This is contracted monthly run rate, not cash received, profit or an accounting statement. Manual grants/trials are excluded |

Business owner: owner/admin. Metric-definition owner: the implementing analytics maintainer, then a named operator at handoff. Review outcomes weekly; monitor operational exceptions daily.

Guardrails: export error rate and time-to-export; refund/chargeback rate; verified AI cost coverage and cost per successful generation; first-human-response p90 and unanswered queue; consent/instrumentation coverage. Do not reward AI deflection without checking reopened cases and customer feedback. Do not optimize payments at the expense of unauthorized charges or confusing cancellation.

## Shared calculation rules

- Store UTC timestamps; use an explicit reporting timezone and half-open intervals `[start,end)`. Default admin display to Asia/Tbilisi until configured. Show GA's property timezone when different; do not silently combine daily totals across incompatible boundaries.
- Mature 7-day cohorts end at least 7 days before the evaluation timestamp; mature 30-day cohorts end at least 30 days before it. Recent cohorts display “Still maturing” with observed-to-date values, not a final comparison.
- Use same-length, equally mature prior cohorts for comparisons. Display numerator, denominator and observation window in metric help/drill-down. Denominator zero means “Not enough data,” not 0%.
- Exclude tagged staff, QA, synthetic transactions and non-production environments by default. Record exclusions at event ingestion and in metric version; do not rewrite all past history when someone's admin role changes later.
- No cross-device/anonymous identity stitching from email or fingerprinting. Link only through approved authenticated/consented identity contracts. Unlinked visitors remain unlinked.
- Missing event coverage, connector errors, incomplete imports, suppressed small cohorts and true zero are different states. Every response carries `source`, `asOf`, `coverageStart`, `metricVersion`, `isComplete` and `qualityReason`.
- Separate gross additions, cancellations, refunds and net movements; percent changes against a zero baseline show absolute change, not infinity.
- Multi-currency totals remain separate unless an explicitly selected, dated FX source and conversion policy exists. Never add USD and EUR as if they were the same unit.
- Historical queries use event-time facts/versioned plan snapshots, not today's plan joined onto all old events. Keep only approved dimensions to control cardinality.

## Diagnostic metric dictionary

| Metric | Grain / numerator / denominator | Caveats and useful slices |
| --- | --- | --- |
| Registered accounts | Distinct Auth accounts as of snapshot; separately confirmed/unconfirmed/deleted | Not GA active users; directory reconciliation coverage visible |
| Product active users | Distinct authenticated users with a successful meaningful action in the window: resume save/export, successful AI task, or saved application action | Page views/login alone do not qualify; show 1/7/30-day windows |
| GA visitor acquisition | GA sessions/users by default channel, source/medium, landing path, country and device | Consent, blockers, bot filtering and property timezone affect coverage; no individual visitor identities |
| GA session key-event rate | GA sessions containing the selected key event / GA sessions, as calculated by GA | Select `sign_up` or `purchase`; “any key event” can include unrelated outcomes; not the first-party signup cohort metric |
| GA user key-event rate | GA users triggering the selected event / GA users under GA's definition | Different denominator from session rate; label it explicitly |
| Signup completion | Confirmed accounts / distinct eligible signup starts in an instrumented, consistently identified cohort | Unknown anonymous linkage means coverage gap, not successful attribution |
| Resume save-to-export | Users who saved then exported within the defined 7-day sequence / eligible savers | Ordered funnel; count users, not repeated events; distinguish imported/sample resumes |
| Checkout success | Unique completed paid checkout attempts / unique eligible created checkout attempts, within 24 hours | Checkout attempt ID is the grain, not page loads; canceled/pending attempts separate; exclude renewals |
| Feature adoption | Distinct active users using a feature / product active users in same window | Feature/version breakdown; cannot sum percentages across overlapping features |
| D7 / D30 retention | Signup cohort users with a meaningful action on day 7/day 30 in reporting timezone / eligible cohort users | Exact-day retention, separately label rolling retention if added; account for mature coverage |
| Subscriber retention / churn | Cohort of paid users at interval start who still have paid recurring subscriptions at interval end / cohort at start; churn is lost / cohort | Users with two providers count once at user grain; subscription-level table separate; scheduled cancellation is not immediate churn |
| Effective Premium users | Users with valid paid entitlement or valid manual grant at as-of | Access metric, not paid subscriber count or revenue |
| Active paid subscriptions | Count provider subscription records meeting active-paid policy at as-of | Different from distinct paying users; trials/past-due/expired/manual separate |
| Collected receipts | Successful collected amounts minus successful refunds/chargebacks, excluding tax, grouped by currency and settlement/event policy | Before fees unless actual fees are available; disclose policy; do not call this profit |
| Payment failure rate | Failed renewal attempts / total renewal attempts | Attempts vs affected subscriptions shown separately; retry loops can inflate attempts |
| AI success and latency | Successful requests / eligible requests; p50/p95 completed request duration | Separate provider/network/validation/quota failures; don't include denied requests in provider latency |
| AI cost per result | Known attributable AI cost / successful billable results | Show missing-price/token coverage; never substitute missing cost with zero |
| Support queue | Open queued conversations awaiting human response, by priority/business-hours age | Count from full query, not loaded inbox rows; presence does not imply staffing |
| First human response | Time from first human request/queued entry to first public human reply, excluding internal notes | Report wall-clock and explicitly configured business-time p50/p90 separately; AI response never stops this clock |
| Resolution / reopen | Resolution duration and conversations reopened within 7 days / resolved cohort | Resolution status alone is not customer success; show customer-confirmed outcome where available |
| AI-only resolution | Eligible conversations resolved without human messages, no handoff and no reopen within 7 days / eligible mature conversations | Label as operational proxy; abandoned/silent conversations are not automatically resolved |
| CSAT | Positive responses / submitted eligible responses; response count and response rate | Voluntary response bias; suppress personally identifying small slices |
| Product friction | Failed operation attempts / eligible operation attempts by feature/version and linked feedback category | Triangulate events, error evidence and feedback; correlation is not causation |

### Funnel display constraint

The design image uses a fictional visit-to-paid progression to demonstrate layout only. The implemented default product funnel must use one identifiable cohort and ordered timestamps: confirmed signup -> first saved resume -> first export -> first payment. Put GA acquisition/visitor conversion in its own card unless a consented common identity contract is validated. Do not divide unlinked GA visitors into database signups and label the result an exact conversion rate.

## Event envelope

Proposed schema, not a public endpoint that already exists:

```json
{
  "eventId": "uuid",
  "name": "resume_export_completed",
  "version": 1,
  "occurredAt": "UTC timestamp",
  "source": "server",
  "environment": "production",
  "actorId": "server-verified user ID or null",
  "anonymousId": "consented pseudonym or null",
  "sessionId": "approved pseudonymous session or null",
  "entityId": "opaque domain ID",
  "route": "/builder",
  "properties": { "format": "pdf", "templateId": "approved identifier" }
}
```

Validate event-specific properties, size, timestamp skew, string lengths, rate and source. Server ignores client-supplied actor identity, privilege, plan, paid amount and `source=server`. Client events may report intent/UI state, never authoritative purchases, access grants or server job outcomes. Store `receivedAt` independently. Dedupe retries by event ID and domain occurrence key.

## Required instrumentation points

| Event | Authoritative trigger | Deduplication / allowed details |
| --- | --- | --- |
| `account_confirmed` | First verified account activation in trusted account lifecycle | User + lifecycle version; method enum only; handle existing-account responses without fake signup |
| `resume_created`, `resume_saved` | Successful persisted operation | Resume + revision + action; template ID, not text |
| `resume_export_requested` | Valid export request | Request ID, format |
| `resume_export_completed`, `resume_export_failed` | Actual generation completion/failure | Export request ID; format/safe failure code. Browser-only file-save completion is not proof the user kept/read a file |
| `ai_generation_started/completed/failed` | Trusted AI task lifecycle | Request/attempt IDs, feature, model, usage/cost version; no prompt/result bodies |
| `application_created/status_changed` | Saved application record transition | Application + revision; allowlisted status and source, no employer message body |
| `auto_apply_job_completed/failed` | Durable job outcome, after provider evidence | Job + attempt/outcome; safe failure category; never infer employer receipt from enqueue |
| `checkout_created` | Backend creates verified provider checkout/subscription attempt | Provider + environment + attempt ID, plan and currency |
| `payment_succeeded/refunded` | Verified provider event and reconciled transaction | Provider + transaction + event kind; integer amount/currency; restrict identifiers to financial store |
| `subscription_changed` | Normalized provider lifecycle change | Subscription + authoritative version; prior/new status and plan |
| `manual_access_granted/revoked/expired` | Atomic admin/domain grant lifecycle | Grant ID + transition; operational audit only; not a GA purchase |
| `support_started/handoff_requested/resolved/reopened` | Saved conversation transition | Conversation + revision; mode/reason category, no transcript |
| `feedback_submitted` | Saved feedback record | Feedback ID/category/rating; free text restricted to feedback store |

Successful domain changes enqueue events in the same transaction where possible. For external/Auth operations, persist an intent and reconcile before asserting completion. Do not delay core product success waiting for GA; use retryable outbox dispatch. Backfilled events are marked `backfill` with provenance and coverage limits, not passed off as observed activity.

## GA conversion bridge

Keep route page views query-free. Add production-host and environment guards and reviewed consent behavior. Emit `sign_up` only once for real account creation/confirmation according to the chosen documented meaning, `begin_checkout` after server checkout creation, and `purchase` after verified successful payment. Never fire a purchase merely because `/success` is visited.

If using server-side GA Measurement Protocol for financial outcomes, verify its current validation, consent, timestamp/session attribution and deduplication contracts first. Retain only approved consented GA identifiers for the checkout; payment access must still work without analytics consent. Use a provider-prefixed non-PII transaction ID. A retry must not duplicate revenue. Client and server must not independently emit the same purchase without a tested dedupe policy. Server records remain the financial source of truth even if GA delivery is unavailable.

Mark the appropriate GA events as key events and then configure the dashboard rate. New instrumentation does not reconstruct untracked historical conversions. Validate in the provider's debugging/realtime tools and in processed reports; ingestion and report processing are separate proofs. Do not fabricate traffic or purchases just to make cards nonzero.

## Data QA fixtures and gates

Create isolated fixtures with known answers:

- 10 mature confirmed accounts; 4 export within 7 days; 2 first-pay within 30 days; 1 gets manual Premium only. Expected activation 40%, paid conversion 20%; grant does not change conversion.
- 2 annual USD subscriptions at $120 each and 1 monthly USD at $10: expected USD MRR $30, excluding tax. A separate EUR subscription stays in a EUR series. No implied FX conversion.
- 1 paying user with Stripe and PayPal subscriptions: two subscriptions but one paying user. Access persists after only one is canceled if the other remains valid.
- Duplicate webhook/client dispatch, delayed signup, reordered events, midnight/DST/timezone boundaries, refunded payments, immature cohorts and deleted users under retention policy.
- No eligible denominator, no connector credentials, partial event coverage, stale report cache, GA quota exhaustion and unknown AI prices produce distinct visible quality states.
- A human request followed by an AI reply and then a human reply: first-human-response uses the human reply, not the bot timestamp. Reopened or abandoned cases do not inflate AI resolution.

Reconcile aggregate components to source records, compare detail/filter totals, test staff/test exclusions and verify no sensitive payloads enter GA or product analytics. Publish metric versions and coverage dates alongside the finished dashboard.
