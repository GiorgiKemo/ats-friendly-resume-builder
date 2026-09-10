# ResumeATS current audit state — 2026-09-10

This is the current evidence snapshot for the takeover audit. It records what
is verified now and keeps hosted-provider and staging limitations separate from
frontend/local evidence.

## Source and production

- Source checkout: `main`, clean and aligned with `origin/main`; runtime changes
  remain through `e870fef` (`Align password recovery with auth flows`).
- Canonical production host: `https://www.resumeats.cv`.
- The last successful GitHub-triggered Vercel status is for `e870fef`; the
  deployment completed at `https://vercel.com/giorgikemos-projects/ats-friendly-resume-builder/FGJoeCswXZcgb9uibKXdGJaMUTWY`.
  Earlier documentation-only builds were rate-limited, but this runtime change
  was accepted and is live. The production HTTP audit at
  `2026-09-10T19:33:16.444Z` returned `failures: []`.
- Live assets include the current `index-D2kwURY3.js` bundle and
  `index-D9MJgxo4.css` stylesheet. Public/private route metadata, canonical
  URLs, robots policy, unknown-route 404 behavior, Edge Function method guards,
  dynamic assets, and public-copy checks all passed.

## Fresh local verification

| Check | Result |
| --- | --- |
| `npm test` | 1,278 passed, 0 failed |
| `npm run lint -- --quiet` | passed |
| `npm run check:repo` | passed |
| `npm run audit:accessibility` | 17 public/auth/error routes passed |
| `npm run test:website:smoke` | 32 routes passed |
| `npm run test:website:full` | 17 isolated browser scenarios passed |
| `npm run test:website:ai` | 3 isolated AI/auth scenarios passed |
| `npm run build` | passed; Vite production build, 1,245 modules |
| `npm audit --omit=dev` | 0 vulnerabilities |

The support-specific browser suite could not start because Docker Desktop's
local Supabase engine was unavailable. It was not reported as a product pass;
the hosted capability probe above remains read-only and does not replace this
local support integration run.

The production browser pass also verified route-announcement focus: navigating
from `/learn` to `/` leaves the destination `h1` available as the active
announcement target, with computed `outline: none` and `box-shadow: none`.
Pointer-only focus frames remain suppressed globally while keyboard indicators
on interactive controls remain available. The live browser pass also confirms
that `/builder` redirects unauthenticated visitors to `/signin`, while an
authenticated visitor is redirected from `/forgot-password` to `/dashboard`.

## Combined UX and accessibility pass

The current live browser capture covered the public conversion and recovery
journey at desktop viewport:

1. **Homepage — healthy.** The primary CTA, secondary resume-tips route, hero
   illustration, and support entry point are visible without a login wall. The
   heading hierarchy and link names are exposed clearly in the accessibility
   tree.
2. **Resume tips — healthy.** The guide exposes real section links, readable
   content hierarchy, source attribution, and a clear build-resume CTA. The
   route announcement target receives focus without a pointer-only ring.
3. **Pricing — healthy.** Free and Premium plans are visually distinct; the
   billing selector exposes an exclusive radio choice and plan-specific signup
   links. The first viewport prioritizes plan comparison, with purchase CTAs
   available lower in each card.
4. **Sign-up — healthy.** The selected plan is stated before the form, payment
   is explicitly not taken on the form, required fields have labels, and legal
   links are present.
5. **Sign-in and recovery — healthy after alignment.** Sign-in and password
   recovery now share the same hero, spacing, contrast, and route-title pattern.
   Authenticated users cannot remain on the reset form; they return to the
   dashboard instead.

This pass is a desktop visual and DOM review, not a claim of full WCAG
conformance. Physical-device behavior, screen-reader announcements beyond the
captured accessibility tree, zoom reflow, and authenticated production data
flows remain separate verification gates.

## Performance architecture finding

An anonymous production homepage load was sampled with a real browser after the
successful `4091518` deployment. The initial asset set transferred about 247 KB
compressed, including `backend-api` (~57 KB) and `animations` (~43 KB). Both are
currently expected: the global auth/subscription providers restore session state
for the public header and CTA, while the homepage visibly uses Framer Motion.
The current Lighthouse baseline was already 95 for the homepage and key auth
pages, so no speculative provider split was shipped. A future optimization can
defer the Supabase client behind post-paint session restoration, but it must first
preserve sign-in, recovery, subscription, extension-bridge, and protected-route
behavior in browser tests.

## Live security headers

The canonical host currently sends HSTS, a CSP, `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
and `Permissions-Policy: camera=(), microphone=(), geolocation=()` on the HTML,
auth route, and current JavaScript asset checks.

## Hosted capability evidence

Read-only capability probe completed at `2026-09-10T19:37:35.861Z` for project
`onuxzcectniowxqtmjpg`:

- 29 local Edge Functions are represented by 31 deployed functions.
- All 77 local migrations are visible remotely.
- All 59 inspected public tables have RLS enabled.
- Provider secret names exist for Stripe, PayPal, and Brevo; values were not
  read and credential validity or delivery was not inferred.
- Billing-worker, support-worker, privacy-worker, invitation-worker, and
  support-AI secret groups remain missing.
- `pg_cron` and `pg_net` are unavailable and no scheduler configuration is
  inferred.

## Remaining release gates

These are not claimed complete by this snapshot:

1. Managed Supabase Auth/PostgREST/Storage behavior, cross-account RLS and
   existing-deployment migration replay on the target platform.
2. Provider sandbox checkout, webhook ordering/reconciliation, Gmail/Brevo
   delivery, attachment scanning, invitation delivery, and support notification
   evidence.
3. Scheduler, alerting, backup/restore, retention, and accountable operator
   runbooks.
4. Support-AI policy/model/region/budget approval and adversarial evaluation.
5. Privacy export/deletion drills, provider cleanup, and retention sign-off.
6. DNS-rebinding-safe egress enforcement for public job-page fetching; DNS
   preflight alone is explicitly not treated as address pinning.
7. Authenticated production journeys and representative physical-device,
   screen-reader, Core Web Vitals, and real ATS-parser validation.

No real charge, refund, destructive deletion, provider purchase, employer
application, scheduler mutation, secret mutation, or AI enablement was performed
as part of this audit.
