# Remaining local work and release gates

The takeover goal remains active. Passing the current suite does not establish
perfection or niche leadership. Avoid replacing known limitations with broader
claims merely because more regression tests exist.

## Latest verified release boundary (2026-09-10)

The current user-facing runtime is READY at Vercel deployment
`dpl_41rW6JRf5cjXdxixTPPrAuaCE5qw`, promoted from commit `f6846cd` and
served through `www.resumeats.cv` and `resumeats.cv`. A fresh live browser
check confirmed that static text and route-announcement headings can receive
focus without rendering a blue outline or ring, while keyboard focus on
interactive controls remains visible. The same bundle still suppresses
pointer-only focus frames while preserving keyboard-visible focus. The latest
source hardening commit `39aa623` now binds business-impact outcomes such as
retention, conversion, cost, and satisfaction to captured evidence; its local
CI is green and the independent held-out set is 16/16. Follow-up commit
`d91dd5c` strips auth/recovery parameters from same-origin internal redirects;
`904ab74` applies the same guard to Stripe return paths, `130a5d9` sanitizes
legacy recovery hash routes before rewriting browser history, and `530c6b8`
suppresses static-text focus frames while preserving keyboard-visible control
focus. All source changes are included in the promoted bundle and the live
HTTP/CSS/browser checks passed against `f6846cd`.

## Latest promoted release (2026-09-10)

Commit `f6846cd` completes the authenticated-surface semantics pass by hiding
decorative SVGs from assistive technology in the application tracker and
analytics screens, following the same fix in the dashboard and builder.
The source-level contract suite, full suite (1,272/1,272), lint, production
build, 17-route accessibility audit, and the 17-step fixture browser journey
all pass. The change is promoted in READY deployment
`dpl_41rW6JRf5cjXdxixTPPrAuaCE5qw` (GitHub release commit `f6846cd`), and the
live HTTP audit returned `failures: []`.

Earlier in this release, commit `b8c9c99` improved the support dialog by formatting business hours as
`09:00–18:00 (Asia/Tbilisi)` and explicitly associating the dialog description
with `aria-describedby`. Focused security tests (59/59), the full suite
(1,268/1,268), lint, production build, 17-route accessibility audit, and the
17-step fixture browser journey all pass. The change is promoted in READY
deployment `dpl_41rW6JRf5cjXdxixTPPrAuaCE5qw` (GitHub release commit
`f6846cd`), and a fresh live browser check exposed the formatted hours and
dialog copy. `npm run audit:production:http` returned `failures: []`.

## Next bounded local remediation

The Auto-Apply Settings screen now exposes every matching preference supported by
the backend (skills, experience level, salary bounds, industries, excluded
companies and matching speed). Salary overlap and speed thresholds are enforced
server-side and covered by regression tests.

1. **Complete locally; packaging remains open.** Ordinary exports are local-only,
   profile sync is document-free at app and extension boundaries, and the callable
   Gmail path now uses one caller-authorized, revisioned snapshot plus the shared
   paginated Unicode renderer. The mutable Storage reader, raw one-page fallback
   and attachmentless Gmail fallback are removed. Missing-resume outreach fails
   before discovery/paid work; discovery-only without a resume remains possible.
   Revision revalidation marks a current job failed before stopping the run. The
   remaining gate is an isolated Docker/Supabase packaged-runtime check, which
   cannot run on this host because Docker is unavailable. See [consumer evidence](legacy-pdf-consumers.md),
   [containment evidence](legacy-pdf-containment.md) and the [version-bound implementation plan](legacy-email-pdf-plan.md).
2. **Completed locally; limitation documented.** The current PDF builder uses a
   standard Letter layout and embedded font, while template previews and DOCX can
   differ in styling, section order and page size. All five text-native PDF
   variants were rendered and visually inspected; section order, headings,
   bullets, dates, Unicode, and template style treatments remained intact. The
   remaining difference is intentional: PDF is a text-native export rather than
   an exact pixel copy of every on-screen template. See
   [export visual review](export-visual-review-20260910.md).
3. **Completed locally; production delivery remains open.** The permitted
   browser fixture now downloads and validates both the actual PDF and DOCX
   outputs, and the downloaded PDF was rendered and inspected. This proves the
   browser journey against disposable fixtures, not live account delivery until
   the latest frontend deployment is promoted.
4. **Completed locally; provider deployment remains open.** The premium AI
   fixture now exercises the lazy-loaded builder boundary, synthetic provider
   request, and source-review screen. It passed with no page errors, console
   warnings, or blocked requests. This proves the client flow against a
   disposable provider-shaped response, not provider quality, billing, or live
   Supabase Edge Function behavior. Run it with `npm run test:website:ai`.
5. Static production loading and export costs are now captured in
   [production-loading](production-loading.md), including the initial auth,
   animation, builder AI-tab and lazy export graph boundaries. Keep those
   snapshots stable; representative-device performance and Core Web Vitals
   measurements remain an external release gate.
6. **Completed locally; installed-user and performance gates remain open.** The
   latest [website and extension QA checkpoint](website-qa-20260910.md) records
   17-route accessibility, 60 responsive route/viewport checks, both extension
   package builds, Firefox readiness, and 19 Chromium extension browser steps.
   No horizontal overflow, browser errors, or extension warnings were observed.
7. **Risk gate implemented; continue semantic validation.** The unchanged 30-case
   corpus now resolves 30/30 by default: seven previously retained semantic
   proposals are flagged, and suggested/edited wording fails closed until the user
   confirms accuracy. Sixteen independent held-out probes now also resolve 16/16
   by default, covering negation, affiliation, subject-bound proficiency,
   licensure, ownership, oversight, transformation leadership, orchestration,
   mentorship, management scope, organization-wide scope and unsupported
   business-impact outcomes. Keep expanding the
   corpus and independent held-out probes;
   metric meaning, negation, ownership, affiliation, proficiency and licensure
   require more than heuristics. Do not wire dormant raw-text summary/bullet APIs
   into UI without the same review boundary. Do not claim that manual review or
   the confirmation checkbox establishes proposal truth.

8. **Close the remaining abuse and privacy gates.** The Gmail scanner now bounds
   jobs, recruiter addresses, message fetches and decoded body size, reports
   database/provider failures as failures, and gates each user with a durable
   lease plus daily message/AI work budget. Approve least-privilege OAuth,
   retention/deletion and scheduled-scan policy before enabling automation. The
   public engagement and client-error limiters now use an atomic transaction-level
   claim/reservation RPC; eight concurrent PostgreSQL claims produce one allowed
   reservation and seven denials. Verify the sanitized billing diagnostics
   against deployed log access and retention controls. Application-answer
   provider input/output is now bounded and request-scoped, but provider
   retention, sensitive-answer policy and real-model correctness still require
   owner-approved authority and sandbox evaluation. Keyword-analysis provider
   failures now discard upstream response bodies, chat proxy messages are shape-
   validated before quota work, provider response bodies are stream-bounded before
   parsing, keyword results are normalized before ATS issue construction, and
   webhook/checkout/telemetry JSON inputs are stream-bounded before parsing, and
   sign-in/billing return paths are normalized to same-origin routes before client
   navigation. These backend changes are locally verified but await Supabase
   deployment permission.

9. **Completed locally; provider gates remain open.** Pricing now carries a
   validated Free, Premium Monthly or Premium Yearly intent into signup. Signup
   shows the selected plan, explicitly keeps payment out of account creation, and
   preserves a pricing return link after confirmation. The disposable browser
   journey covers the Yearly path with no page errors, console warnings or blocked
   requests. Actual email confirmation and post-signup Stripe/PayPal checkout
   remain external provider gates.

10. **Hosted capability checkpoint (2026-09-10).** The read-only production
    capability audit found 77/77 migrations applied, 31 deployed functions with
    no missing local function, and all named Stripe/PayPal/Brevo provider
    credentials present. Billing, support, privacy, invitation, and support-AI
    worker secrets remain unconfigured; Supabase scheduler metadata is unavailable
    and no scheduler configuration is inferred. These are operator/deployment
    gates, not client defects, and no secret values were read or changed.

11. **Telemetry privacy hardening (2026-09-10).** Client and server error-report
    boundaries now redact raw email addresses in messages, nested context, and
    development console output. Authentication telemetry retains event type and
    server-side session identity where available without duplicating the address
    in user-controlled payload fields. URL credentials and recovery parameters
    remain separately stripped; no provider deployment or historical-log rewrite
    is claimed.

12. **Auth input normalization (2026-09-10).** Signup, sign-in, and verification
    resend now trim email input at the shared auth boundary, and confirmation
    copy uses the normalized value. A transport-level regression covers all three
    calls. This removes an avoidable whitespace failure without changing provider
    identity semantics.

13. **Support session identity transition hardening (2026-09-10).** Support
    service state now clears account-bound conversation IDs and guest tokens on
    identity changes, including sign-out before an anonymous request. The
    regression suite and full local suite pass. The change is included in the
    then-current READY frontend deployment `dpl_9uW38BJzqtoGGv3TnBs3utDnFmdj`, built
    from `5a086fd`; real authenticated support persistence remains unverified.

14. **Pricing return-state restoration (2026-09-10).** Returning from signup to
    `/pricing?plan=premium_yearly` now restores the yearly radio selection instead
    of silently reverting to monthly. The browser fixture covers the route and
    the full local suite/build pass. The change was included in the then-current READY
    deployment `dpl_9uW38BJzqtoGGv3TnBs3utDnFmdj` through `5a086fd`; real billing
    remains an external gate.

15. **Subscription success copy (2026-09-10).** The success screen now maps
    `premium_monthly` and `premium_yearly` to their user-facing Premium labels
    instead of incorrectly saying “Pro plan” or exposing a raw plan ID. Commit
    `8747ceb` is pushed, locally verified and included in the current live
    bundle; a real provider return remains an external gate.

16. **Password-recovery input normalization (2026-09-10).** Forgot-password
    requests now trim the email at the Supabase boundary, matching the other
    authentication paths. The targeted regression passes and the change is
    included in READY deployment `dpl_9uW38BJzqtoGGv3TnBs3utDnFmdj` from
    `5a086fd`.

17. **Newsletter feedback accessibility (2026-09-10).** Footer subscription
    success and failure messages now render as inline `status`/`alert` live
    regions instead of relying only on toast visuals. The targeted regression,
    full 1,264-test suite, build, accessibility audit, smoke routes and browser
    fixture pass. Commit `f37b92e` is pushed and included in READY deployment
    `dpl_9uW38BJzqtoGGv3TnBs3utDnFmdj` from `5a086fd`; the live homepage bundle
    was fetched and contains the `newsletter-feedback` live region.

18. **Tailoring leadership-risk coverage (2026-09-10).** Nine independent
    held-out probes now fail closed for oversight, spearheading, orchestration and
    mentorship synonyms in addition to the existing semantic-risk categories.
    Commit `93fc4a2` is pushed and included in READY deployment
    `dpl_9uW38BJzqtoGGv3TnBs3utDnFmdj` from `5a086fd`. The live HTTP audit for
    this release passed with `failures: []`.

19. **Whole-token and scope-bound claim evidence (2026-09-10).** Factual-risk
    evidence now matches Unicode whole tokens, so substring lookalikes such as
    `handled` cannot authorize a new `led` claim. Team/staff and
    organization-wide scope terms also remain confirmation-gated when a
    generated sentence reuses the source verb, even when the same words appear
    only in structured employer/title metadata. The regressions are covered by
    the full suite and focused tailoring tests; this remains a heuristic gate
    rather than a proof of semantic truth.

20. **Static-text focus frame suppression (2026-09-10).** Static text and
    `tabindex="-1"` announcement targets now clear both browser outlines and
    Tailwind ring shadows even when Chromium classifies programmatic focus as
    `:focus-visible`; interactive controls retain their keyboard indicators.
    The focused security/public-claims regressions, full 1,268-test suite,
    build, accessibility audit, disposable browser journey, and live browser
    check all pass. Commit `530c6b8` is deployed in
    `dpl_4VRAovQPFhLx734WjMAaPkZNihXU`; production HTTP verification returned
    `failures: []`.

The target-headline and shared vacancy-parser repairs are implemented and covered
by [the current evidence](headline-requirements-pass.md). They preserve explicit
manual/blank headlines and candidate history, and leave ambiguous experience
requirements unknown. Neither change establishes semantic truth or validates the
extension's overall fit-score weights.

## Separate authority or environment needed

- Installed Chrome and Firefox extension sandbox acceptance: choose, preview,
  select, return, explicitly fill, manually attach ambiguous/embedded uploads,
  revoke, restart/suspend, and pause/resume each queued job. In-app CUA component
  checks are not a substitute. Direct Playwright CLI/MCP permission has not been
  granted; do not run it based on this plan.
- Owner-approved disposable Supabase multi-user Auth/Storage HTTP tests and
  existing-deployment migration rehearsal. The isolated PostgreSQL proof does not
  certify a managed deployment. Do not touch the unrelated local database port.
- Stripe/OAuth/email sandboxes and a separately approved synthetic real-model
  evaluation. No live purchase, employer application, real candidate data or paid
  provider request is authorized by this plan.
- Owner-approved operating facts: biographies, privacy/AI-processing disclosures,
  retention/deletion, support commitments and incident handling. Do not invent
  business facts or legal compliance.
- Representative usability sessions, screen-reader/physical-device checks and
  actual ATS-parser comparisons before claiming best-in-class usability or
  universal parsing compatibility.

The local remediation commits are pushed. The preview/export geometry, template
label, ATS text/PDF order, DOCX order, focus, support-trigger safe-area,
programmatic-heading-focus, plan-intent onboarding, pricing return-state,
subscription-success labels, auth input normalization, telemetry redaction,
support field limits, support-session identity isolation, password-recovery
normalization, and release-process changes are locally verified. The current
promoted frontend
deployment is verified with the live HTTP audit and includes the latest runtime
fixes through `530c6b8` (including `5a086fd`, `f37b92e`, `93fc4a2`, and
`5ab145e`). No provider
purchase, employer application, real candidate data, or destructive action was
performed.

Historical release record (2026-09-10): commit `67e967e` replaces three feature
callouts that were invalid `<li>` elements nested inside animation wrappers with
valid non-list wrappers. The public-claims regression and targeted lint pass; the
fix was included in the then-current READY Git-triggered deployment
`dpl_9uW38BJzqtoGGv3TnBs3utDnFmdj` from release commit `5a086fd`.

Historical release note (2026-09-10): earlier direct-deploy attempts hit the
Hobby daily deployment limits, but the Git integration subsequently promoted
the frontend at that time. That historical READY deployment was
    `dpl_9uW38BJzqtoGGv3TnBs3utDnFmdj`, built from GitHub commit `5a086fd` and
served behind `www.resumeats.cv` and `resumeats.cv`. Its live CSS contains the
global pointer-focus suppression, route-focus, control, `tabindex="-1"`,
programmatic-heading-focus, compact-footer, and authenticated-content safe-area
rules; the live bundle also contains auth email trimming, telemetry email
redaction, native tooltip controls, non-submitting dashboard actions,
support/newsletter field limits and feedback live-region semantics,
account-bound support-session storage, pricing return-state restoration,
subscription-success labels and password-recovery normalization. The focus
regression,
tooltip semantics and dashboard-action tests are production-verified by the live
bundle; the newer behavior remains covered by local tests and synthetic browser
fixtures rather than real account/provider actions.
Supabase deployment remains a separate 403 authorization gate.
Supabase functions and migrations are read-only-audited (29 local functions,
31 deployed, 77/77 migrations), but the linked CLI/managed deployment connector
still returns a 403 permission error for deploying changed Edge Functions. The
backend hardening therefore remains locally verified rather than newly deployed.

Historical release boundary (2026-09-10): commit `5ab145e` adds Unicode whole-token
claim-evidence matching and is included in the live `5a086fd` artifact. The
later scope-bound tailoring changes (`b2125ad`, `38cf4d2`, `9ed0384`) and the
CLI upload fix (`e9a5904`) are pushed with green CI, but GitHub's Vercel status
reports `failure` with `upgradeToPro=build-rate-limit`; the verified
`5a086fd` deployment remains promoted until the Vercel daily build allowance
resets or the owner changes the hosting plan.
