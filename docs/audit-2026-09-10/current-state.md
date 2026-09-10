# ResumeATS current audit state — 2026-09-10

This is the current evidence snapshot for the takeover audit. It records what
is verified now and keeps hosted-provider and staging limitations separate from
frontend/local evidence.

## Source and production

- Source checkout: `main`, clean and aligned with `origin/main` at commit
  `73ddea1` (`Harden dark theme auth link contrast`).
- Canonical production host: `https://www.resumeats.cv`.
- The latest GitHub-triggered Vercel status for `73ddea1` is successful. The
  production HTTP audit at `2026-09-10T19:09:43.533Z` returned `failures: []`.
- Live assets include the current `index-C_qvyBs6.js` bundle and
  `index-D9MJgxo4.css` stylesheet. Public/private route metadata, canonical
  URLs, robots policy, unknown-route 404 behavior, Edge Function method guards,
  dynamic assets, and public-copy checks all passed.

## Fresh local verification

| Check | Result |
| --- | --- |
| `npm test` | 1,277 passed, 0 failed |
| `npm run lint -- --quiet` | passed |
| `npm run check:repo` | passed |
| `npm run audit:accessibility` | 17 public/auth/error routes passed |
| `npm run test:website:smoke` | 32 routes passed |
| `npm audit --omit=dev` | 0 vulnerabilities |

The production browser pass also verified route-announcement focus: navigating
from `/learn` to `/` leaves the destination `h1` available as the active
announcement target, with computed `outline: none` and `box-shadow: none`.
Pointer-only focus frames remain suppressed globally while keyboard indicators
on interactive controls remain available.

## Live security headers

The canonical host currently sends HSTS, a CSP, `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
and `Permissions-Policy: camera=(), microphone=(), geolocation=()` on the HTML,
auth route, and current JavaScript asset checks.

## Hosted capability evidence

Read-only capability probe completed at `2026-09-10T19:10:52.939Z` for project
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
