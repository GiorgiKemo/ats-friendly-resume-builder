# UI and runtime audit — 9 September 2026

This is the current local evidence for the public ResumeATS experience. It is
not a production sign-off: the browser was signed out, the preview ran on
`http://127.0.0.1:5175`, and no deploy or external provider transaction was
performed.

## Runtime coverage

The Codex in-app browser inspected the rendered accessibility tree and visible
states for the following routes and interactions:

| Area | Evidence | Result |
| --- | --- | --- |
| Home | Hero, primary links, images, footer, theme switch, support trigger | Pass |
| Pricing | Monthly/yearly selector, price and CTA update | Pass |
| Sign up | Labels, password guidance, terms/privacy links, empty-submit validation | Pass |
| Learn | Section navigation, anchors, guide content, footer | Pass |
| Contact | Labeled form, required fields, support channels and response expectations | Pass |
| FAQ | Search field, accordion expansion, focus retention, cancellation guidance | Pass |
| Privacy | Public policy route and Stripe/PayPal provider disclosure | Pass |
| Terms | Public legal route and provider-specific cancellation wording | Pass |
| About | Public content, CTA, footer; unverifiable team claims removed | Pass |
| Signed-out protected route | Builder request redirects to `/signin` | Expected |
| Support widget | Dialog focus entry, Escape close, focus restoration and keyboard trap | Pass |
| Theme | Light mode renders readable text and controls | Pass |

The support-dialog accessibility regression was fixed in
`src/components/support/SupportWidget.jsx`: opening focuses the dialog,
Escape closes it, Tab stays within it, and focus returns to the opener.

## Corrections made in this pass

1. Removed unsupported public claims about named team members, roles, and
   credentials from `src/pages/AboutUs.jsx`; replaced them with a transparent
   product-focused, founder-neutral description.
2. Replaced the overpromising About CTA with “Start building your resume”.
3. Updated `src/pages/TermsOfService.jsx` so Stripe and PayPal cancellation
   instructions match the implemented billing providers.
4. Refreshed the public pricing/legal copy to match five currently available
   templates and the Stripe/PayPal cancellation paths.
5. Added a database trigger and typed client error for the advertised free
   three-resume limit, and restored the admin deletion guard for active billing
   or manual access.
6. At that checkpoint, refreshed audit evidence to **1,157/1,157** tests and
   the then-current production graph (**1,229 transformed modules; 61 JS
   chunks and 3 CSS/font assets**); the current gate below supersedes that
   intermediate count.
7. Reworked the Premium Monthly/Yearly selector as an exclusive radio group
   with visible focus states and Home/End/arrow-key navigation; the current
   desktop and 390px mobile captures expose the group and mobile menu correctly.
8. Added the active local preview origin (`127.0.0.1:5175`) to Edge Function
   CORS and return-origin handling, and preserved that exact signed origin for
   Gmail OAuth callbacks.
9. Removed outcome-guaranteeing homepage and metadata language (interviews,
   employer attention, and ATS pass claims); the public copy now describes
   reviewable drafting, tailoring, checks, and export behavior.
10. Normalized public, Stripe, OAuth, Edge Function, and audit-tool defaults to
    the canonical `https://www.resumeats.cv` host and clean routes, while the
    legacy hash bridge remains available for existing links.
11. Replaced password-field bullet glyph placeholders with explicit, readable
    prompts (`Enter your password`, `Create a password`, and `Re-enter your
    password`). A fresh local browser capture now shows the empty sign-in field
    unambiguously.
12. Removed unsupported concierge delivery timing and ATS-compatibility claims
    from the pricing surface; the offer now describes the inquiry, scope, and
    confirmation step that the implemented contact flow can actually support.
13. Updated route-smoke and full-website QA contracts to the current homepage
    headline, added a regression test for that contract, and gave programmatic
    route focus a visible blue ring instead of the browser's default outline.
14. Corrected the privacy page's tracking disclosure from “essential cookies”
   to the browser-storage model actually used by the app.
15. Replaced the template chooser's CSS-bar thumbnails with the actual five
   resume templates rendered against a synthetic sample resume, converted the
   template and font cards to native pressed buttons, and removed ATS outcome
   language from the builder guidance and AI prompts.
16. Fixture-backed signed-in browser QA opened the saved resume, selected a
   different template, opened the real preview, and completed both DOCX and PDF
   save-and-download flows with visible success feedback.
17. Added template-aware styling to the text-native PDF renderer, with regression
   coverage for modern color, traditional name casing, ATS-friendly labels, and
   unknown-template fallback behavior.
18. Corrected the in-platform ATS adapter so shipped Modern resumes are not
   falsely reported as multi-column, empty skills cannot pass silently, dates
   reach consistency checks, malformed titles do not throw, and checklist copy
   describes parser risk without promising hiring or rejection outcomes.
19. Replaced the acronym checklist placeholder with a bounded detector for
   common terms and explicit “full name (ACRONYM)” expansions.
20. Rechecked the rebuilt homepage in the local Chrome browser: the hero,
  navigation, primary CTAs, support control, and accessible headings are
  visibly present; the only console error was unrelated wallet-extension
  noise from the browser profile.
21. Replayed the current worktree's full **76** migration files in isolated
   PostgreSQL 17 after detecting that the prior evidence still covered only
   57; all migrations and the existing RLS/RPC assertions passed.
22. Replaced the admin sidebar's dead Planned Feedback entry with a source-backed
   feedback surface that refreshes, paginates older records, and exposes clear
   loading, empty, and error states.
23. Made PayPal transaction reconciliation bounded and paginated, labeled PayPal
   sandbox projections as test data, and aligned Stripe/PayPal reconciliation
   leases with the configured provider environment.
24. Re-ran the packaged Chromium extension QA against the rebuilt extension; the
   real browser harness passed with no reported failures.
25. Made the keyword-analysis Edge Function honor `AI_PROVIDER=groq` ordering
   instead of silently ignoring that deployment setting.
26. Ran the responsive audit across 10 public/auth routes and six viewport
   sizes (60 captures); every route rendered without horizontal overflow or
   audit errors. The two large desktop home heading gaps are intentional hero
   composition, not clipping.
27. Re-ran the local production build, 30-route smoke suite, 15-step fixture
   browser journey, and all 60 responsive captures after the current worktree
   settled; the same zero-error result was reproduced. The fresh responsive
   artifacts are in `playwright-audit/20260909-continuation`.
28. Added a reserved content tail for the fixed public support trigger and
   raised it above the authenticated mobile bottom navigation when both are
   visible; the follow-up 60-capture audit still reports zero overflow or
   rendering errors. The latest artifacts are in
   `playwright-audit/20260909-support-offset`.
29. Removed the admin dashboard's duplicate inner tab bar so the responsive
   sidebar is the single navigation model; Client errors and Admin access are
   now reachable from that canonical model.
30. Added Escape-key and outside-click dismissal for the mobile admin sidebar,
   with a labelled backdrop and regression coverage in the security suite.
31. Scoped admin theme state to the admin root instead of mutating the global
   document theme; the customer application's saved/system preference remains
   untouched while admin native controls follow the selected admin theme.
32. Added route-level theme isolation: while `/admin` is active, customer global
   theme classes and customer chrome are suppressed, while the admin root owns
   its explicit light/dark state and mobile layout.
33. Replaced every remaining native `window.confirm` flow with the shared
   accessible confirmation dialog: labelled modal semantics, danger-aware
   initial focus, Escape/outside-click cancellation, focus restoration, and
   body-scroll locking. Updated the lifecycle/profile/UI tests for the async
   confirmation contract.
34. Added a real-browser fixture journey for the destructive confirmation
   flow: the dashboard delete dialog opens with an accessible name, Escape
   cancels without mutation, and the explicit cancel action restores the card.
35. Revalidated the local Supabase reset/lint path, replayed all 76 migrations
   plus the RLS/RPC/concurrency assertions on a disposable PostgreSQL 17
   cluster, and rebuilt/replayed the Chromium extension QA with no failures.
36. Read-only production inspection found that protected-route response HTML
   still inherited the homepage's indexable metadata before JavaScript ran.
   The release prerender now emits route-specific `noindex,follow` metadata
   without structured data for known private/payment-return routes, and the
   Vercel header guard covers both return providers.
37. Changed hashed `/assets/*` responses to one-year immutable caching in the
   local Vercel config; un-hashed SVG/PNG assets retain short revalidation so
   brand/illustration updates are not pinned indefinitely.
38. Served the built `dist` tree through a static HTTP server and verified
   root, public, auth, dashboard, and payment-return paths return the expected
   titles, canonical URLs, and `noindex,follow` private metadata before any
   client JavaScript executes.
39. The live public JSON-LD still contains the older `ATS-optimized` and
   `recruiter-approved` wording even on route-specific pages; the local
   prerendered JSON-LD is bounded to the current truthful copy and route URL.
40. Replaced the catch-all Vercel rewrite with explicit dynamic-route rewrites
   and a custom noindex `404.html`; unknown paths no longer need to resolve to
   the homepage shell with an HTTP 200, while builder/preview/payment-return
   IDs still receive the SPA entry point.
41. Replaced the browser extension's four native `window.confirm` autofill
   prompts with one shared shadow-DOM confirmation dialog. Popup, side panel,
   and injected job-board widgets now use labelled modal semantics, visible
   Cancel/Continue actions, Escape cancellation, and a single-flight consent
   guard; packaged Chromium QA and Firefox compatibility checks pass.
42. Moved the analytics-consent notice into normal page flow below the fixed
   header, and disabled marketing-hero pull-up while consent is pending, so the
   card cannot cover hero CTAs, auth fields, or article text. The responsive
   audit was rerun across 60 route/viewport combinations with no overflow or
   rendering errors; its heading-distance guard now measures clearance from the
   fixed header without subtracting an in-flow notice.
43. Added a compact consent treatment for authenticated workspace routes and
   tightened the applications overview spacing so the table remains visible
   near the desktop fold without restoring an overlay. The complete 15-step
   fixture website journey now passes again, including the 1,440px-to-320px
   application layout loop.
44. Replayed the current worktree's complete 76-migration set in the isolated
   PostgreSQL 17 verification path; the full unit suite remains green at 1,194
   passing tests, and the latest 60-capture responsive run is in
   `playwright-audit/audit`.
45. Wrapped the 15 high-traffic workspace RLS policies in statement-stable
   `(select auth.uid())` expressions. The local Supabase advisor no longer
   reports any `auth_rls_initplan` warnings.
46. Added covering indexes for all 39 foreign-key columns identified by the
   local performance advisor. A fresh reset/lint and advisor run now reports
   zero unindexed foreign keys; the remaining unused-index notices are expected
   on an empty database and are retained until real traffic can justify removal.
47. Removed the obsolete inline-theme script hash from the Vercel and static
   headers, and added a security regression assertion so the external theme
   bootstrap cannot regress into a stale inline CSP dependency.
48. Hardened route smoke service identity to require the exact ResumeATS HTML
   title, a prerendered `/terms/` response, and a JavaScript theme-bootstrap
   response before reusing a preview; fetches are bounded with a timeout and
   the default port is the dedicated `4199` port.
49. Added explicit gateway policies for the anonymous `public-engagement` and
   `support-api` boundaries, and moved disposable support browser QA to
   dedicated port `5176`; the real guest/operator journey passes end to end.
50. Added `npm run audit:production:http`, a read-only canonical-host release
   gate covering public/private titles, indexability, canonicals, `X-Robots-Tag`,
   unknown-route status, referenced asset content types, deployed public-copy
   strings, and the removed inline-theme CSP hash. The 9 September live run
   proves public routes and referenced JS/CSS assets are correct but fails on
   stale private-route metadata, homepage fallback for unknown paths and
   `/theme-bootstrap.js`, missing payment-return robot headers, stale deployed
   public copy, and the still-deployed obsolete theme hash; no production
   mutation was performed.
51. Updated the source `index.html` metadata and social URLs to match the
   bounded ATS-aware public copy and canonical `www.resumeats.cv` host, then
   added that raw document to the public-claims regression scan so
   development/first-response HTML cannot reintroduce outcome-promising copy
   or apex-host drift before prerendering.
52. Extended the read-only production gate to fetch every JavaScript and CSS
   asset referenced by the live root document plus Vite's dynamic route chunks,
   reject HTML fallbacks, validate content types, and scan deployed JavaScript
   for the removed outcome-promising public claims. The live assets serve with
   the expected types, but the root, Learn, Pricing, Resume Builder, and
   Resume Tailoring chunks still contain stale claims until the local release
   is deployed.
53. Added read-only health probes for the public-engagement, support-api, and
   client-error Edge Function boundaries. The live public-engagement and
   client-error functions return the expected method guard, but `support-api`
   returns Supabase `404 NOT_FOUND`, proving the live support widget/operator
   path is not deployed even though the local function and browser journey pass.
54. Reconciled local Supabase Auth redirect configuration with the actual Vite
   and dedicated QA origins. The previous `127.0.0.1:3000` value did not match
   the app's 5174/5175/5176 workflows, so the local Auth site URL now uses the
   active 5175 preview and explicitly allows the localhost/loopback QA ports.
55. Standardized the plain `npm run dev` origin to `127.0.0.1:5175`, matching
   the active browser/responsive-audit workflow; the fixture, support, route
   smoke, and legacy staging scripts retain their explicit isolated ports.
56. Refreshed all dependencies within their existing semver ranges (including
   Supabase JS 2.116.0, Playwright 1.63.0, date-fns 4.4.0, docx 9.7.1,
   Terser 5.51.2, and TypeScript ESLint 8.70.0). The lockfile now resolves the
   current non-major versions; React 19, Vite 8, Tailwind 4, and other major
   upgrades remain a separately testable migration rather than an unreviewed
   compatibility change.
57. Corrected the Firefox compatibility audit to inspect the Firefox-targeted
   `dist-extension-firefox` package by default and exposed it as
   `npm run test:extension:firefox`. The rebuilt package reports
   `firefoxReady: true`; Chromium package QA also passes.
58. Updated CI's release-build placeholders to the canonical 5175 local origin
   and added the Firefox compatibility gate alongside Chromium extension smoke;
   a source contract now prevents either packaged browser target from silently
   disappearing from CI.
59. Added semantic `name` fields to sign-in, password-recovery, and password-
   update controls so browser/password-manager autofill matches the explicit
   autocomplete hints. Corrected the security disclosure contact to the
   verified support channel and marked the header files as the CSP source of
   truth; targeted auth/security regression suites pass.
60. Aligned the static hosting CSP with Vercel by allowing Stripe's hosted
   checkout frame origin in both header sources; the security suite now guards
   this parity so alternate hosting cannot silently break checkout.
61. Corrected the legacy staging QA report to record the actual configured
   target instead of always claiming `localhost:5174`; a QA contract now
   prevents that misleading host note from returning.
62. Expanded the read-only production HTTP gate from a handful of auth/return
   pages to every configured private route, including builder, preview,
   account, admin, analytics, and subscription paths. The QA contract now
   guards the complete private-route matrix so a new protected surface cannot
   silently escape deployment metadata checks.
63. Moved the public/private route metadata into a shared route manifest used
   by both prerendering and the production gate, removing the duplicate route
   lists that could otherwise drift between release output and verification.
64. Hardened the interactive Vercel deployment script so it runs the read-only
   production HTTP gate after `vercel --prod` and refuses to print a verified
   success message when the deployed host still fails release checks.
65. Normalized that shell script to LF and verified it with `bash -n`; the
   previous mixed CRLF/LF file failed before the first prompt under Bash.
66. Added shell syntax checks for every deployment helper to CI and documented
   the production HTTP gate in the manual README flow, preventing future
   release scripts from silently regressing outside the JavaScript test suite.
67. Corrected private prerender metadata to omit canonical URLs as well as
    setting `noindex,follow`; generated output now matches the production gate's
    privacy invariant for all 20 protected routes.
68. Corrected the client-side `Seo` effect to remove canonical and structured-data
    nodes on private or unknown SPA routes instead of recreating a canonical after
    hydration/navigation; targeted SEO regression coverage now guards both static
    and runtime behavior contracts.
69. Added React-route/manifest parity coverage that extracts every concrete route
    family (including parameterized builder, preview, and Stripe-return paths) and
    fails on missing, duplicate, or stale manifest entries.
70. Promoted the route manifest into `src/routeManifest.js` so runtime SEO,
    prerendering, production HTTP checks, and route-parity tests consume the same
    metadata and parameterized-family matcher; the scripts module is now a thin
    Node-facing re-export.
71. Removed runtime `og:url` values from private and unknown SPA routes alongside
    their canonical and structured-data removal, preventing social crawlers from
    receiving private route URLs after hydration; static output and SEO tests pass.
72. Bound sitemap coverage to the manifest's eight indexable public route
   families, including duplicate detection and private-route exclusion, so SEO
   discovery cannot silently drift from the actual router.
73. Added fail-fast validation for parameterized Stripe return session IDs;
   malformed paths now render the existing payment-verification error without
   contacting the provider, and the browser smoke suite covers that state.
74. Corrected the unauthenticated header's Home active-state matcher so the
   root link is active only at `/`, keeping `aria-current="page"` and visual
   emphasis accurate on Learn, Pricing, and other public routes.
75. Removed the implicit `tabindex="0"` that Framer Motion added to animated
   link wrappers. Native controls are now the only sequential keyboard stops;
   shared primitives and interactive wrappers across auth, marketing, 404,
   dashboard, auto-apply, and preview are covered by the route smoke guard.
76. Gave the runtime unknown-route state its own `Page Not Found - ResumeATS`
   title and not-found description. The built preview smoke now verifies the
   title and `noindex,follow` metadata instead of checking only visible copy.
77. Replaced the nested `<main>` in the PayPal return state with a labelled
   section and made the 30-route preview smoke require exactly one main
   landmark and one primary heading per public state.
78. Raised the light-theme Stripe return error copy from `text-red-500` to
   `text-red-700`; the visible malformed-session state now clears the normal
   text contrast threshold while retaining the dark-theme treatment.
79. Removed the admin shell's nested `main` landmark by keeping the app frame as
   a layout `<div>` in admin mode and assigning the skip-link target to the
   labelled admin `<main>`; the route contract now guards one landmark per shell.
80. Made the legacy `Tooltip` component keyboard-operable and properly labelled:
   Enter/Space toggle its disclosure, Escape closes it, and the visible tooltip
   is linked with `aria-describedby`; the UI semantics suite covers the contract.
81. Replayed the 60-capture responsive audit after the latest semantic fixes;
   all public/auth route and viewport combinations remain free of horizontal
   overflow and rendering errors (`playwright-audit/audit/report.json`).
82. Added an explicit `react/button-has-type` lint rule and annotated every
   native source button with its intended `button` or `submit` type; this
   prevents accidental form submission as the builder gains new form nesting.
83. Reduced the fixed support trigger to a compact labelled icon at mobile
   widths so it no longer obscures hero copy; the accessible name and expanded
   state remain explicit and the QA contract covers the responsive treatment.
84. Widened and tightened the compact workspace consent card so authenticated
   application summaries remain visible near the desktop fold while keeping
   the consent actions readable at mobile widths.

## Current local gates

- `npm test`: 1,194 passed, 0 failed, 0 skipped.
- `npm run lint`: pass.
- Native button semantics: `react/button-has-type` reports zero violations
  across `src`, with submit actions kept explicit and all other controls
  marked `type="button"`.
- `npx tsc --noEmit`: pass.
- `npm run check:supabase:functions`: pass.
- `npm run check:repo`: pass.
- `npm audit --audit-level=high`: 0 vulnerabilities.
- Dependency refresh: `npm update` completed within the existing semver ranges;
  `npm ls --depth=0`, the full test suite, lint, build, function type-check, and
  route smoke all pass against the refreshed lockfile, with 0 audit findings.
- `node scripts/test-migration-replay.mjs`: all 76 migrations pass in a fresh
  isolated PostgreSQL 17 cluster, including support feedback, free-limit, concurrency, RLS and
  RPC privilege assertions.
- `npm run build`: pass; Vite transformed 1,240 modules and prerendered public routes.
- The critical theme bootstrap is served as a same-origin static asset, so the
  production CSP no longer depends on a stale inline-script hash.
- `npm run build:extension`: Chrome and Firefox packages pass.
- Packaged Chromium extension QA passes with no page errors or blocked requests.
- Fixture-backed browser flow: signed-in dashboard -> saved builder -> template
  selection -> preview -> DOCX download and PDF download both pass locally.
- Fixture-backed website QA: all 15 authenticated/profile/application/mobile
  steps pass with no page errors, console errors, or blocked requests.
- Local route smoke: all 30 public and protected-route checks pass, including
  safe missing-payment-return states and preview-service identity validation.
- Responsive audit: 60 route/viewport captures pass with no horizontal overflow
  or rendering errors; the latest artifacts are in
  `playwright-audit/audit` (earlier runs remain in
  `playwright-audit/20260909-fresh-live`,
  `playwright-audit/20260909-support-offset`,
  `playwright-audit/20260909-continuation` and
  `playwright-audit/20260909-after`).
- Fresh local Chrome homepage smoke: visual hero, navigation, CTA, support
  trigger, and accessibility tree present; no application console errors.
- `npm run audit:production:http` — read-only live run intentionally fails on
  deployment drift: public metadata passes, while private-route metadata,
  unknown-route handling, JavaScript asset content type, payment-return
  `X-Robots-Tag`, and the obsolete theme-hash check remain open until the
  staged build is approved and deployed.
- `git diff --check`: no whitespace errors; only expected LF/CRLF warnings.
- Admin navigation regression suite: 37 security-hardening checks pass,
  including canonical section coverage and mobile dismissal behavior.
- Admin theme isolation is covered by the same suite: the provider no longer
  toggles `document.documentElement.dark`, and the admin root owns the dark
  class and `color-scheme`.
- Shared confirmation dialog semantics are covered by UI tests; `rg` reports no
  remaining `window.confirm` calls in `src` or `browser-agent`.

## Evidence limits and remaining gates

- Fixture-backed authenticated builder QA is complete locally; a real hosted
  account still needs separate dashboard/admin visual QA after an approved
  staging target is provided.
- Hosted Supabase/Auth/Storage/RPC parity and migration application remain
  unverified. The repository currently contains 76 migration files, and the
  complete set now replays successfully in a fresh isolated PostgreSQL 17
  cluster with Auth/Storage platform scaffolding, including the free-resume-limit
  rejection and concurrency/RLS assertions. That replay is still not hosted
  Supabase parity proof.
- Direct read-only hosted probes confirm `public-engagement` and
  `report-client-error` are deployed, but `support-api` returns Supabase
  `404 NOT_FOUND`; the local support journey therefore cannot be called a live
  support-path verification. The Supabase management listing was unavailable
  to the current account (`403`), so no remote deployment mutation was attempted.
- Stripe, PayPal, Gmail/OAuth, AI, and Brevo journeys still need staging or
  provider-sandbox transactions, including refund and webhook reconciliation.
- The extension still needs a real packaged browser round trip on supported
  employer sites; local unit/fixture tests do not prove that path.
- Full WCAG screen-reader, mobile device, Core Web Vitals, download-delivery,
  and deployment checks remain open.
- Read-only production header check found that `/return-from-stripe` and
  `/return-from-paypal` currently lack `X-Robots-Tag`; the local `vercel.json`
  fix is staged but intentionally not deployed.
- A follow-up read-only probe confirmed the live root is improved but
  `/signin`, `/signup`, `/return-from-stripe`, and an unknown path still serve
  the homepage metadata with HTTP 200. The local config now selects Vercel's
  static/Other mode, preserves only the explicit dynamic rewrites, and lets
  the generated noindex `404.html` handle unknown paths; this remains pending
  approved deployment.
- The live root/auth HTML also still exposes the older `ATS-optimized`/
  `passes applicant tracking systems` description and root canonical on auth
  routes, while the local build contains the corrected bounded copy and
  private-route metadata. This is deployment drift, not a local build failure.

No deployment, commit, push, payment, email, or managed-database mutation was
performed during this audit checkpoint.
