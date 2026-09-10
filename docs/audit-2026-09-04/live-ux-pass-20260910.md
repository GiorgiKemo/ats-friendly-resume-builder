# Live UX pass: public conversion surfaces

Date: 2026-09-10. Surface: `https://www.resumeats.cv`. Capture tool: Codex
in-app browser with fresh accessibility-tree and screenshot checks in the
current run. The browser API exposed screenshots inline but did not provide a
filesystem-backed screenshot path; this limitation is recorded rather than
presenting an unsaved image as a durable artifact.

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

## Findings and limits

- No new public-surface defect was strong enough to change safely from this
  desktop run; existing focus, validation, route metadata and disclosure
  behavior were observable and coherent.
- Screenshot evidence is valid for the visible desktop states above but is not
  saved as local image files because the permitted in-app browser API returns
  bytes without a writable screenshot path.
- This run does not certify screen readers, physical mobile devices, Core Web
  Vitals, authenticated customer journeys, real billing, email delivery,
  support persistence, or hosted Supabase behavior. Those remain explicit
  release gates in `next-pass.md`.

## Automated corroboration from the same pass

- `npm run test:website:smoke` passed all 32 route checks.
- `npm run test:website:full` passed all 15 synthetic fixture journeys with no
  page errors, console messages, or blocked requests, including responsive
  workspace checks and export flow.
- `npm run test:website:support` could not start because Docker Desktop's
  Supabase engine is unavailable on this host; the public support dialog above
  was therefore checked without sending a message or claiming packaged-runtime
  persistence.
