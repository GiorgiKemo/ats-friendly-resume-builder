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
9. **Local contact form — healthy with provider boundary.** The public support
   page presents a labelled four-field form, clear issue guidance, alternative
   contact channels, and a visible support expectation. Browser field limits
   now match the engagement endpoint (name 200, email 320, subject 200,
   message 5000 characters), preventing silent client-side truncation. The
   accepted full-page screenshot is [`61-contact-support-form.png`](61-contact-support-form.png).

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
- The global pointer-focus hardening used for Step 6 is in pushed commit
  `c912a9e`; the current Vercel daily deployment limit means this latest CSS
  is local evidence until that provider promotes the commit.

## Automated corroboration from the same pass

- `npm run test:website:smoke` passed all 32 route checks.
- `npm run test:website:full` passed all 15 synthetic fixture journeys with no
  page errors, console messages, or blocked requests, including responsive
  workspace checks and export flow.
- `npm run test:website:support` could not start because Docker Desktop's
  Supabase engine is unavailable on this host; the public support dialog above
  was therefore checked without sending a message or claiming packaged-runtime
  persistence.
