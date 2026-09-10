# Website and extension QA checkpoint

Date: 2026-09-10

## Local browser evidence

- `npm run audit:accessibility` passed the DOM audit for 17 public, auth, and
  error routes.
- `npm run test:website:smoke` reached all 32 declared public, protected, and
  fallback routes without a route-level failure.
- `node scripts/responsive-audit.mjs --label=20260910-continuation` completed
  all 60 route/viewport combinations (10 routes × 6 viewports). Every route
  rendered without navigation errors or horizontal overflow at 375, 390, 768,
  1280, 1440, and 1920 pixels.
- `npm run build:extension` produced both Chromium and Firefox packages.
- `npm run test:extension:firefox` found Firefox support ready with no blockers.
- `npm run test:extension:chromium` passed all 19 extension browser steps with
  zero failed steps, errors, console errors, or warnings. Coverage included the
  app bridge, profile sync, job detection, autofill, AI answer handoff, widget
  drag/snap, scan, partial forms, and cleanup paths.
- `npx tsc --noEmit`, `npm run check:supabase:functions`, `npm audit`, and
  `npm audit --omit=dev --audit-level=high` completed successfully; both audit
  scopes reported zero vulnerabilities.
- CI now runs the route smoke, accessibility audit, full fixture browser QA,
  and premium AI fixture QA on every `main` push and pull request, so these
  local gates cannot silently regress.
- `npm run test:website:support` was attempted but could not start because the
  local Supabase/Docker engine is unavailable on this host. Support UI contracts
  and unit coverage remain green; the local Auth/REST/browser support journey
  still needs a Docker-enabled or disposable Supabase environment.

## Interpretation and remaining limits

The responsive audit intentionally reports the first heading's distance from
the fixed header. When analytics consent is undecided, the in-flow consent
notice adds 208px on the tested mobile widths and 138px on desktop widths;
this is a deliberate no-overlap tradeoff, not horizontal clipping. The report
does not claim Core Web Vitals, representative-device performance, screen-reader
coverage, or acceptance in an installed consumer browser profile. Those remain
separate release gates.
