# Live UX pass: public conversion surfaces

Date: 2026-09-10. Surface: `https://www.resumeats.cv`. Capture tool: Codex
in-app browser with fresh accessibility-tree and screenshot checks in the
current run. The original production capture exposed screenshots inline but
did not provide a filesystem-backed screenshot path; that limitation is kept
separate from the saved local follow-up evidence below.

## Steps and evidence

1. **Homepage / first impression — healthy.** The live page rendered a clear
   hero, one H1, readable CTA hierarchy, real navigation, skip link, theme
   control, resume illustration, pricing teaser, workflow steps and support
   entry point. The CTA wording sets an accurate expectation: ATS checks are
   guidance and do not promise hiring outcomes.
2. **Signup entry and validation — healthy.** The homepage CTA opened
   `/signup`; the form exposed one email field, two password fields, native
   labels, autocomplete metadata, password guidance, terms/privacy links and a
   single submit action. Empty submission returned the browser's required-field
   feedback and restored focus to the email field.
3. **Support dialog — healthy with provider boundary.** The public support
   button opened a labelled modal, moved focus to Close support, exposed subject
   and message controls, reported `Checking availability…`, then resolved to
   `Support is open · your message will be queued`. Empty submission produced
   required-field feedback without sending a request. No real support message
   was submitted.
4. **Pricing and plan selection — healthy with external billing gate.** The
   pricing page rendered Basic and Premium cards, exposed a labelled radio group
   for monthly/yearly selection, updated the displayed amount, and linked
   anonymous users to signup. Actual Stripe/PayPal checkout, cancellation and
   provider reconciliation were not exercised in this synthetic/public pass.
5. **Follow-up after deployment `dpl_7YUyQ6Y2GHFx1iJs4kwTjAFEdeiy` — plan intent
   is now visible.** The live pricing page exposes `/signup?plan=free` and
   `/signup?plan=premium_monthly` links. Opening the yearly signup return path
   showed the labelled `Selected plan` summary, `Premium AI+ — Yearly`, and the
   explicit no-payment-during-signup explanation. No billing request is made by
   account creation.

6. **Local pointer-focus follow-up — healthy.** On the current local build,
   clicking the route heading on `/new` left the heading visually unframed while
   keyboard-visible control focus remained available. The accepted screenshot is
   [`58-pointer-focus-live.png`](58-pointer-focus-live.png).
7. **Local FAQ search follow-up — healthy.** Searching `billing` returned three
   matching questions, kept the result count beside the field, and left each
   disclosure collapsed until selected. The accepted screenshot is
   [`59-faq-search-live.png`](59-faq-search-live.png).
8. **Local Quick Resume premium gate — healthy.** An anonymous visit to
   `/quick-resume` settled from the brief subscription-loading state into a
   clear Premium gate with an honest feature list and two next actions: the
   free step-by-step editor or Premium plans. No form was shown before the
   requirement, and no browser/runtime warning was emitted. The accepted
   screenshot is [`60-quick-resume-premium-gate.png`](60-quick-resume-premium-gate.png).
9. **Shared pointer-focus treatment — healthy in the current production bundle.**
   The latest live CSS suppresses pointer-activation focus frames across custom
   text surfaces while preserving `:focus-visible` indicators for keyboard
   navigation. A live in-app-browser click on the hero heading moved focus to
   the main content container without displaying the blue frame shown in the
   original report.
10. **Local contact form — healthy with provider boundary.** The public support
   page presents a labelled four-field form, clear issue guidance, alternative
   contact channels, and a visible support expectation. Browser field limits
   now match the engagement endpoint (name 200, email 320, subject 200,
   message 5000 characters), preventing silent client-side truncation. The
   accepted full-page screenshot is [`61-contact-support-form.png`](61-contact-support-form.png).
11. **Support-session identity boundary — deployed; authenticated behavior gate
    remains open.**
    Support conversation IDs and guest tokens are now scoped to the active
    account identity, so switching accounts or returning to anonymous mode in
    the same tab cannot rehydrate another account's conversation. The targeted
    identity regression suite passes. The fix is included in the
    then-current READY deployment `dpl_9uW38BJzqtoGGv3TnBs3utDnFmdj`, built from
    `5a086fd`; no real authenticated support message was submitted.
12. **Pricing return-state and subscription-success copy — deployed; provider
    behavior gate remains open.** Returning through `/pricing?plan=premium_yearly` now
    preserves the yearly selector, and the post-checkout screen now shows
    `Premium (Monthly)`/`Premium (Yearly)` instead of the incorrect Pro label or
    a raw plan ID. Commits `e89e39f` and `8747ceb` are pushed and included in the
    then-current READY production bundle; the browser regression is synthetic and no
    real billing return was exercised.
13. **Password-recovery normalization — deployed; provider behavior gate remains
    open.** Forgot-password requests trim the email before sending it to the
    auth provider. The targeted regression passes and the change is included in
    READY deployment `dpl_9uW38BJzqtoGGv3TnBs3utDnFmdj` from `5a086fd`.
14. **Support availability copy and dialog description — deployed.** The
    promoted support widget now presents business hours as `09:00–18:00
    (Asia/Tbilisi)` instead of exposing database seconds, and the dialog
    explicitly references its explanatory copy with `aria-describedby`. A
    fresh live browser check opened the dialog, confirmed focus moved to Close
    support, and observed the formatted status with no request submitted.

## Findings and limits

- No new public-surface defect was strong enough to change safely from this
  desktop run; existing focus, validation, route metadata and disclosure
  behavior were observable and coherent.
- The original production screenshots remain inline-only because that browser
  capture did not expose a writable path. The two local follow-up screenshots
  above were written from the captured bytes and inspected from disk; they are
  local visual evidence, not a claim that production was visually recaptured.
- This run does not certify screen readers, physical mobile devices, Core Web
  Vitals, authenticated customer journeys, real billing, email delivery,
  support persistence, or hosted Supabase behavior. Those remain explicit
  release gates in `next-pass.md`.
- The global pointer-focus hardening used for Step 9 is present in the current
  live CSS (deployment `dpl_4VRAovQPFhLx734WjMAaPkZNihXU`, built from
  `05bdb70`) and is also covered by the pushed regression test. The same bundle
  includes native tooltip controls, non-submitting dashboard actions, the
  support field limits and feedback live-region semantics, account-bound
  support-session storage, pricing return-state restoration, subscription-success
  labels and password-recovery normalization and the dashboard semantics fix.
  The live bundle is deployment `dpl_9uW38BJzqtoGGv3TnBs3utDnFmdj`, built from
  `5a086fd`.

- The dashboard feature callout semantics follow-up from `67e967e` is included
  in the promoted build; the live chunk was fetched and confirmed to contain
  the valid non-list wrappers.
- Newsletter subscription feedback is deployed in `f37b92e` through the current
  `05bdb70` production build. A fetch of the live homepage bundle found the
  `newsletter-feedback` inline `status`/`alert` live region; no real subscriber
  was created during QA.
- Tailoring leadership-risk hardening from `93fc4a2` is also deployed in the
  current `05bdb70` build. The live HTTP audit returned `failures: []`, and the
  production bundle contains the expanded `spearhead` signal.

## Historical release boundary after this pass

The follow-up lexical-boundary fix is pushed as `5ab145e`; the former
`dpl_9uW38BJzqtoGGv3TnBs3utDnFmdj` / `5a086fd` snapshot recorded the evidence
for that earlier release. The later scope-bound tailoring changes, Vercel
upload allowlist fix, business-impact claim protection, auth-token redirect
hardening, Stripe return guard and legacy recovery-route sanitizer are ancestors
of the then-promoted `dpl_b5jsXNnccxFhfNDfuk4cGeisnBrp` / `130a5d9` artifact;
the current focus-frame follow-up is recorded below.

## Automated corroboration from the same pass

- `npm test` passed all 1,264 Node tests.
- `npm run test:website:smoke` passed all 32 route checks.
- `npm run test:website:full` passed all 17 synthetic fixture journeys with no
  page errors, console messages, or blocked requests, including responsive
  workspace checks and export flow.
- `npm run test:website:support` could not start because Docker Desktop's
  Supabase engine is unavailable on this host; the public support dialog above
  was therefore checked without sending a message or claiming packaged-runtime
  persistence.

## Current-run public journey and mobile follow-up

The current run re-captured the live public journey with a fresh browser
session and saved the inspected viewport screenshots under
`output/playwright/01-home-live.png` through `output/playwright/10-home-mobile-menu-live.png`.

14. **First visit / analytics choice — healthy.** The consent panel clearly
    describes what is and is not collected, links to the privacy policy, and
    offers explicit Decline and Accept actions. Dismissing it reveals the
    primary hero without a dead-end.
15. **Learn and pricing navigation — healthy.** Header navigation reached
    `/learn` and `/pricing` with the expected active state, readable hierarchy,
    and no loading or error surface. Pricing exposed the free/premium plan
    intent and monthly/yearly controls without initiating checkout.
16. **Signup validation — healthy.** The live signup form exposed labelled
    controls, native email validation, password guidance, and an inline
    `Passwords do not match` alert. No real account was created.
17. **Support dialog — healthy with provider boundary.** The labelled support
    dialog opened from the public homepage, exposed a truthful offline status,
    warned users not to submit secrets, and provided a clear start action. No
    support message was sent.
18. **Mobile navigation — fixed.** At 390×844, the menu rendered a compact
    labelled control and reachable links. The audit reproduced a defect where
    tapping page content left the menu open; the header now closes the menu on
    outside click, with a local browser assertion proving `open → closed`.

### Current-run verification

- `npm run test:website:full`: all 17 synthetic journeys passed with no page
  errors, console messages, or blocked requests.
- `npm run audit:accessibility`: 17 public/auth/error routes passed the DOM
  audit.
- `npm run audit:production:http`: live public/private/unknown-route and asset
  checks returned `failures: []`.
- `npm run audit:production:capabilities`: read-only production inspection
  found 77/77 migrations and 31/31 deployed functions, while correctly
  reporting the worker secrets and scheduler as not configured; this remains
  an external operations gate, not a source-code pass.
- `npm run build`, `npm run lint`, and `npm test`: production build and lint
  passed; the full Node suite passed 1,268 tests.

The historical focus/menu verification was performed against deployment
`dpl_4VRAovQPFhLx734WjMAaPkZNihXU`, promoted from `05bdb70`. Fresh live
browser checks confirmed the outside-click fix: opening the menu, clicking the
hero heading, and re-snapshotting leaves the menu closed. Source commit
`39aa623` adds business-impact claim protection, `d91dd5c` strips auth/recovery
parameters from internal redirects, `904ab74` hardens Stripe return paths,
`130a5d9` sanitizes legacy recovery routes and `530c6b8` suppresses static-text
focus frames; `b8c9c99` formats support hours and adds dialog description
semantics. The current superseding deployment is
`dpl_41rW6JRf5cjXdxixTPPrAuaCE5qw` from `f6846cd`, which also includes
`8e5da22` and `6700027` decorative-icon semantics fixes; the full release is
covered by the production HTTP audit with `failures: []`.

## Post-release verification (2026-09-10)

The current worktree was rechecked after the release-boundary documentation
update. `npm test` passed all 1,268 tests with zero failures; the fixture
browser journey passed all 17 steps with no page errors, console messages, or
blocked requests; and the DOM accessibility audit passed all 17 public,
auth, and error routes. A fresh read-only production HTTP run returned
`failures: []` across public/private/unknown routes, referenced assets, and the
three deployed edge-function health probes (`public-engagement`, `support-api`,
and `report-client-error`). The live `support-api` probe now returns its
expected method guard (`405`) rather than the historical `404` recorded earlier
in this audit.

The read-only production capability check still finds 77/77 migrations and
31/31 deployed functions, with no missing functions. Worker secrets for billing,
support notifications/attachment scanning, privacy deletion, admin invitations,
and optional support AI remain unconfigured, and no Supabase scheduler is
available. Those are explicit operator/deployment gates; no secret or hosted
database mutation was performed.

## Post-release focus verification (2026-09-10)

The current production deployment is `dpl_41rW6JRf5cjXdxixTPPrAuaCE5qw`, built
from `f6846cd` (with runtime source through the authenticated decorative-icon
fixes). Live browser verification focused the homepage heading after a
route transition and found `outline: none` and no box shadow, including when
Chromium reported `:focus-visible` for the programmatic heading focus. A Tab
navigation check still showed the expected visible focus ring on the primary
CTA. The live CSS contains the static-text and `tabindex="-1"` guard, and the
production HTTP audit returned `failures: []`.
