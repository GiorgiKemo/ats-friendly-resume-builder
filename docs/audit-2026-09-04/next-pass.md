# Remaining local work and release gates

The takeover goal remains active. Passing the current suite does not establish
perfection or niche leadership. Avoid replacing known limitations with broader
claims merely because more regression tests exist.

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
   confirms accuracy. Five independent held-out probes now also resolve 5/5 by
   default, including negation, affiliation, subject-bound proficiency, licensure
   and ownership. Keep expanding the corpus and independent held-out probes;
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
label, ATS text/PDF order, DOCX order, focus, and release-process changes are
represented by the promoted production frontend deployment for `a246acd` and
verified with the live HTTP audit. Later commits add audit documentation and CI
coverage only; they do not change the deployed runtime. No provider purchase,
employer application, real candidate data, or destructive action was performed.

Release note (2026-09-10): an earlier verified Vercel Production deployment
`dpl_7ghfn1bjVr9d5ksCa9pr512icUDZ` was built from `f9bfd31`; the intervening
direct-deploy attempts hit the Hobby daily deployment limit. GitHub integration
later promoted `a246acd` as `dpl_3mkKa2uygLmTL1ApM4NWNz8x5MxR`, which is READY
on `www.resumeats.cv`; the live HTTP audit passed with `failures: []`, and the
live CSS contains both the route-focus and pointer-focus suppression rules.
Supabase functions and migrations are read-only-audited (29 local functions,
31 deployed, 77/77 migrations), but the linked CLI/managed deployment connector
still returns a 403 permission error for deploying changed Edge Functions. The
backend hardening therefore remains locally verified rather than newly deployed.
