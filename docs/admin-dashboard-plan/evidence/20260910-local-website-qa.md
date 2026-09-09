# Local website QA — 2026-09-10

## Scope

- Source: current `main` checkout, exercised against the disposable fixture backend and local Vite application.
- Command: `npm run test:website:full`.
- Boundary: this suite uses synthetic local Auth/database responses. It does not verify hosted Auth/RLS, provider delivery, live billing, scheduler execution, GA processed-report freshness, or production authenticated journeys.

## Result

- Passed all 15 journeys: protected-route redirect, sign-in, confirmation-dialog keyboard behavior, profile save/reload, saved-resume load/export, reusable answers, campaign controls/consent, interrupted search history, application create/persist, application modal keyboard behavior, application responsive layout, authenticated analytics, authenticated new-resume flow, authenticated pricing, and mobile workspace overflow.
- Failures: `0`.
- Page errors: `0`.
- Console messages: `0`.
- Blocked requests: `0`.
- The test process exited with code `0`.

This evidence supports the local portion of E18 only; the release manifest remains blocked where staging, providers, production authentication, performance, accessibility, operations, or privacy-drill evidence is still required.
