# Release verification — 2026-09-24

This supplement verifies the consented signup-event change after its release.
It is not a completion claim for the admin-dashboard plan or its operational
acceptance gates.

## Production release

- Source commit: `6515a63317629b4c2c2acb39eb6e3f91ebff717f` on `main`.
- GitHub combined status reported Vercel `success` for the commit.
- Read-only `npm run audit:production:http` completed with exit code 0 and no
  reported failures against `https://www.resumeats.cv`. Public pages returned
  HTTP 200 with indexable metadata and canonical URLs; private routes retained
  `noindex` metadata; checked assets and function boundaries passed.
- A fresh request to the canonical homepage returned HTTP 200 and referenced
  `/assets/index-DDxg807F.js`. Fetching that production bundle confirmed it
  contains the recommended `sign_up` event and the email method parameter.
- The change sends only `method: email`, only after Supabase returns a new
  identity, and only when the visitor has granted analytics consent. It does
  not send email addresses, account IDs, names, or resume contents.

## GA4 configuration

- In Admin → Data display → Events for the `ResumeATS` property (`552904382`),
  the Key events table now contains `purchase` and `sign_up`.
- `sign_up` is counted once per event and has no default monetary value, so a
  signup is not assigned fabricated revenue.
- The existing dashboard's user key event rate can now include users who sign
  up or purchase. It is a rate for any configured key event, not a signup-to-paid
  rate. No production signup, checkout, or purchase was generated as a test.
- GA4 showed no recent stream data for `sign_up` at configuration time. Receipt
  and processed reporting for a real future consented signup remain to be
  verified; reporting can lag collection.

## Remaining boundary

This evidence closes only the signup-event code/release and preemptive GA4
key-event setup. E07 still needs processed-event receipt and an authenticated
conversion journey; E08 still needs its server-side reporting and mature-cohort
gates; E18–E20 remain open for the staging, provider, worker, scheduler,
backup/restore, operational, and final acceptance evidence documented in the
plan. No production Supabase data or configuration was changed in this step.
