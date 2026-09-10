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
2. Resolve or clearly disclose preview/export differences. The current PDF builder
   uses a standard Letter layout and embedded font, while template previews and
   DOCX can differ in styling, section order and page size. Preserve text-native
   export and exact candidate content; compare actual output images for all five
   templates instead of assuming template selection proves PDF fidelity.
3. Inspect a complete browser download journey for the actual PDF/DOCX outputs
   using the permitted browser surface. File builder/text extraction evidence is
   strong, but it does not prove that the browser delivered a file to the user.
4. Static production loading and export costs are now captured in
   [production-loading](production-loading.md), including the initial auth,
   animation, builder AI-tab and lazy export graph boundaries. Keep those
   snapshots stable; representative-device performance and Core Web Vitals
   measurements remain an external release gate.
5. **Risk gate implemented; continue semantic validation.** The unchanged 30-case
   corpus now resolves 30/30 by default: seven previously retained semantic
   proposals are flagged, and suggested/edited wording fails closed until the user
   confirms accuracy. Five independent held-out probes now also resolve 5/5 by
   default, including negation, affiliation, subject-bound proficiency, licensure
   and ownership. Keep expanding the corpus and independent held-out probes;
   metric meaning, negation, ownership, affiliation, proficiency and licensure
   require more than heuristics. Do not wire dormant raw-text summary/bullet APIs
   into UI without the same review boundary. Do not claim that manual review or
   the confirmation checkbox establishes proposal truth.

6. **Close the remaining abuse and privacy gates.** The Gmail scanner now bounds
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
   parsing, and keyword results are normalized before ATS issue construction. These
   backend changes are locally verified but await Supabase deployment permission.

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
label, ATS text/PDF order, and DOCX order changes are included in the promoted
production deployment for `cf38adb` and verified with the live HTTP audit. The
later `9fbefe3` commit only adds audit documentation. No provider purchase,
employer application, real candidate data, or destructive action was performed.

Release note (2026-09-10): the frontend and client-side hardening are live through
the verified Vercel Production deployment associated with `ccfcd04`; the live HTTP
audit passed with no failures. The changed Edge Functions are pushed to GitHub but
the Supabase CLI and managed deployment connector return a 403 permission error
for the linked project, so that backend hardening is locally verified but not yet
deployed.
