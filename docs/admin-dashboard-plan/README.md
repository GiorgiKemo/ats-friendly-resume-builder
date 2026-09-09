# ResumeATS administration and support blueprint

Planning baseline: 9 September 2026. Repository: `1ae6f4795a7dc6f6429989bb17542c1b9e6d21e3`.

## Outcome and status

Build one secure, light-first administration workspace inside ResumeATS for operating the business: users, subscriptions, complimentary access, conversion analytics, product activity, AI usage, job operations, customer feedback, and persistent AI/human live support. Dark mode is a complete alternative, not a dark sidebar attached to a light page.

This package is an implementation specification and a generated visual example. It does **not** claim the proposed dashboard or chat is implemented, deployed, or production-ready today. Production readiness is earned by completing the execution and release gates below. No production data, payments, permissions, or website code was changed while preparing it.

Live Supabase metadata inspection for `onuxzcectniowxqtmjpg` was denied by the connector. Source findings are verified against this checkout, not asserted as deployed schema. Phase 0 must reconcile production before any migration. Image values are illustrative, never reported as real traffic or revenue.

## Read and execute in this order

1. [Current state and concrete gaps](CURRENT-STATE.md): preserve working behavior and fix the right contracts.
2. [Architecture, permissions, billing, and chat](ARCHITECTURE.md): authoritative implementation contracts.
3. [Metric and event definitions](MEASUREMENT.md): what each number means and how it is produced.
4. [Light-first design and theme behavior](DESIGN.md): visual example, responsive layout, and accessibility.
5. [Execution tasks and release gates](EXECUTION.md): ordered work packages, test cases, rollback, and AI execution prompt.

## Scope coverage

| Area | Required capability | Completion evidence |
| --- | --- | --- |
| Overview | Revenue, activation, paid conversion, health, and items requiring action; source freshness | Fixture calculations reconcile with detail queries; unavailable data is not zero |
| Users | Server-side search/filter/pagination; customer detail, activity, usage, billing, support, suspension, session revocation, export and deletion workflows | Role tests, cursor tests, real authorization and reversible-state tests |
| Access | Time-limited/manual Premium grants, revocation, quotas, notes and reasons | Concurrent provider/manual entitlement tests; every change audited |
| Billing | Stripe and PayPal subscriptions, transactions, failed payments, refunds/disputes, cancellation and supported plan changes | Provider sandbox contracts, signed webhook replay, reconciliation, explicit production checks |
| Analytics | Acquisition, signup/activation/paid conversion, feature adoption, cohorts/retention, segments, exports | Defined denominators, instrumentation coverage, consent and data-quality gates |
| Product improvement | Feedback tags, reproducible issue context, support trends, feature funnels and linked improvement backlog | Traceable anonymized evidence, no unsupported causal claims |
| Support | Guest/account widget, durable messages, attachments, agent inbox, assignment, notes, search, customer history, follow-up notifications | Cross-user isolation, reconnect recovery, offline flow, transcript retention and export |
| AI support | Disclosed assistant, versioned knowledge, bounded account tools, confidence/failure escalation, explicit human request | Adversarial evaluation and no late AI reply after human takeover |
| AI and jobs | Usage/cost/latency, provider failures, budget controls, job status and safe retry/cancel | Idempotency, budget enforcement, no duplicate employer applications |
| Administration | Roles, MFA, audit trail, integration status, support hours/routing, knowledge publication, feature flags | Least privilege, last-owner guard, secret hygiene, history and rollback |
| Themes and usability | White/light sidebar by default; Light/Dark/System selection; complete responsive and keyboard support | Both themes and all major states checked at specified widths and zoom |
| Production operations | Monitoring, migrations, reconciliation jobs, backups, recovery, privacy lifecycle and incident runbooks | Staging drills, independent security checks, production smoke and evidence manifest |

All rows are part of the requested end state. The ordered tasks are dependencies, not a justification for omitting later work.

## Product decisions for implementation

- Use the existing React/Vite application and Supabase backend. Do not introduce a second application framework, standalone BI product, or new payment provider for this dashboard.
- Keep Stripe and PayPal as billing sources of truth. A manual upgrade changes access only; it must never pretend a payment occurred or trigger a charge.
- Use first-party domain events for authenticated product operations and provider-confirmed purchases. Use GA4 for consented visitor/acquisition reporting. Their populations are different.
- Default the admin surface to light mode, even when no preference is stored. Provide a deliberate System option and preserve the existing customer application's independent theme behavior.
- Use the existing email infrastructure where appropriate, but implement support notification delivery separately from job-application email tracking.
- Build persistent human chat before AI automation. AI can answer from approved knowledge and request a person; it cannot independently upgrade, charge, refund, ban, or delete users.
- Interpret “everything as admin” as all authorized business operations. Do not collect passwords, keystrokes, private resume text, private applications, or other sensitive content merely to fill activity charts. Raw content access requires a justified, audited, narrowly scoped support workflow.
- Do not include crypto integration in this build unless it is separately selected and scoped; expose any future provider through the same billing contracts, without assuming a live crypto account exists.

## Decisions/access needed before the corresponding launch gate

These do not block planning or local fixtures. They do block the relevant real integration or launch, and must not be silently replaced with mock success.

| Gate | Required input or verification | Proposed default while implementing locally |
| --- | --- | --- |
| Production schema | Authorized read of deployed schema, RPCs, policies, functions and migrations | Source-based design only; local isolated database |
| Team security | Confirm active owner identities, recovery owner and MFA enrollment | Existing membership is authoritative; do not grant new owners automatically |
| GA reporting | Verify GA property `552904382`, production stream and authorized server-side reporting credentials | Mark connector “Not connected”; deterministic fixtures clearly labeled |
| Support operations | Named agents, coverage hours/timezone, escalation recipient | Display actual offline status; preserve currently advertised response expectation until staffing is confirmed |
| AI operations | Approved provider/model, budget, region/data handling and server secret | Provider adapter and fake test client; AI disabled in production |
| Data policy | Review consent boundaries, retention, deletion/financial holds and support attachments | Conservative minimization; proposed retention in architecture, not a legal determination |
| Payment operations | Confirm provider capabilities, credentials, cancellation/refund policy and accounting currency | Sandbox only; no live charge or refund for a test without scoped authorization |
| Release | Validate complete scoped diff and environment mapping; production release authorization | No automatic deployment from this planning package |

## What success looks like

An owner can locate a customer, understand verified account and subscription state, safely grant temporary access, see that access survive unrelated billing events, and follow the customer's relevant activity. The customer can start chat, receive an identified AI answer, request a human, and continue the same saved conversation with an agent after reconnecting. Another customer cannot see that conversation or internal notes. Analytics and revenue have documented definitions, known coverage, real data sources, and drill-downs. Every privileged mutation leaves an auditable outcome. These flows must work in both themes and survive the failure scenarios in the execution plan.
