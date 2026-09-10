# Website and extension QA checkpoint

Date: 2026-09-10

## Local browser evidence

- `npm run audit:accessibility` passed the DOM audit for 17 public, auth, and
  error routes.
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

## Interpretation and remaining limits

The responsive audit intentionally reports the first heading's distance from
the fixed header. When analytics consent is undecided, the in-flow consent
notice adds 208px on the tested mobile widths and 138px on desktop widths;
this is a deliberate no-overlap tradeoff, not horizontal clipping. The report
does not claim Core Web Vitals, representative-device performance, screen-reader
coverage, or acceptance in an installed consumer browser profile. Those remain
separate release gates.
