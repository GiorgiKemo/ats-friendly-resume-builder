# ResumeATS current audit state — 2026-09-22

This is the current evidence snapshot for the takeover audit. It records what
is verified now and keeps hosted-provider and staging limitations separate from
frontend/local evidence.

## Source and production

- Source checkout: `main`, clean and aligned with `origin/main`; the latest
  runtime change is `5746b8c` (`Keep marketing content visible without scroll`),
  following `c1bebda` (`Improve dark support button contrast`).
- Canonical production host: `https://www.resumeats.cv`.
- The latest runtime-containing deployment is Vercel
  `dpl_DdfnVbwQhcf77njmis7xaa51ktNP`, `READY`/production, built from
  `5746b8c`. Subsequent audit-documentation-only pushes also produced
  `READY`/production deployments with the same runtime tree and custom-domain
  alias.
- The production HTTP audit at `2026-09-21T19:39:54.488Z` returned
  `failures: []`: public/private route checks, the unknown-route 404, theme
  bootstrap, static/dynamic assets, CSP hash checks, public-copy checks, and all
  three hosted Edge Function method/CORS checks passed.
- A fresh production HTTP audit at `2026-09-22T12:24:19.859Z` also returned
  `failures: []` after the hosted database migration pass.

## Fresh local verification

| Check | Result |
| --- | --- |
| `npm test` | 1,278 passed, 0 failed |
| `npm run lint` | passed |
| `npm run check:repo` | passed |
| `npm run audit:accessibility` | 17 public/auth/error routes passed |
| `npm run test:website:smoke` | 32 routes passed |
| `npm run test:website:full` | 17 isolated browser scenarios passed |
| `npm run test:website:ai` | 3 isolated AI/auth scenarios passed |
| `npm run build` | passed; Vite production build, 1,245 modules |
| `npm audit --omit=dev` | 0 vulnerabilities |
| Lighthouse production (desktop, 2026-09-21) | 95 performance, 100 accessibility, 100 best practices, 100 SEO; no color-contrast findings |
| `supabase db lint --linked --schema public` | passed; no schema errors |

The mobile dashboard fixture also verifies that saved-resume cards are not left
at `opacity: 0` when they begin below the initial viewport. Dashboard cards now
use an explicit mount animation, while decorative lists retain their existing
in-viewport behavior.

The live conversion capture found the same hidden-content failure in pricing:
below-fold billing controls and concierge links could remain at `opacity: 0`
until an intersection event, leaving focusable controls invisible after a direct
end-of-page jump. `5746b8c` makes `AnimatedElement` and
`StaggeredContainer` animate on mount by default while retaining reduced-motion
support, and adds a browser regression that rejects hidden focusable pricing
controls. A fresh live mobile probe at `2026-09-21` found zero hidden focusable
controls, FAQ/concierge opacity `1`, no horizontal overflow, and no page errors.

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

The dark-theme floating Support trigger previously used `#3b82f6` behind white
text, producing a 3.67:1 contrast ratio in Lighthouse. `c1bebda` moves the dark
state to the blue-600/700 pair; the production Lighthouse run now reports no
color-contrast failures.

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

The latest read-only capability probe completed at `2026-09-21T19:40:02.700Z`
for project `onuxzcectniowxqtmjpg`, which is now `ACTIVE_HEALTHY` in
`eu-west-1`:

- 29 local Edge Functions are represented by 31 deployed functions.
- No local functions are missing or inactive.
- All 77 local migrations are visible remotely.
- All 59 inspected public tables have RLS enabled.
- Provider secret names exist for Stripe, PayPal, and Brevo; values were not
  read and credential validity or delivery was not inferred.
- Billing-worker, support-worker, privacy-worker, invitation-worker, and
  support-AI secret groups remain missing.
- `pg_cron` and `pg_net` are unavailable and no scheduler configuration is
  inferred.

## Hosted database audit and remediation

The saved local Supabase access token was used without printing or persisting
its value. Read-only inspection found 224 advisor findings before remediation:
117 low-confidence unused-index notices, 52 RLS-without-policy notices for
private/service tables, one unindexed foreign key, 14 stale per-row
`auth.uid()` policy plans, six duplicate permissive policy pairs, 33
authenticated security-definer RPC grants, and leaked-password protection
disabled. The 33 RPC grants were reviewed against live function bodies: they
are intentional client or support/admin entry points with explicit owner,
participant, operator, or allowlist checks and fixed `search_path` settings.

Two forward-only migrations were applied to the linked project on
`2026-09-22`:

- `20260922121719_remove_legacy_duplicate_owner_policies.sql` removes only the
  14 legacy public-role owner policies and two exact duplicate public read
  policies. The authenticated baseline/restrictive policies remain in place.
- `20260922121851_harden_production_function_definitions.sql` fixes the
  ambiguous revoked maintenance helper and replaces the stale analytics RPC
  body that called unavailable `jsonb_object_length`, restoring the flat-key
  guard already present in source.

Post-migration verification reports 79 local/79 remote migrations, no schema
lint errors, and 204 remaining advisor findings: 33 intentional
authenticated security-definer grants, one owner-controlled leaked-password
protection setting, plus low-priority info-level index/table hygiene notices.
No secrets, user rows, billing rows, or provider settings were changed.

## Hosted restoration record

The saved local Supabase access token first restored read-only visibility of the
correct project, `ATS-FRIENDLY-RESUME-BUILDER`, which progressed from `COMING_UP`
to `RESTORING` and then `ACTIVE_HEALTHY`. After the policy/function review, the
two scoped migrations above were applied; no Vercel URL/key changes, secret
writes, or data mutations were performed. DNS now resolves and the production
HTTP audit is fully green.

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
as part of this audit; the only hosted write was the two scoped schema
migrations recorded above.
