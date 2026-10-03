# CI root-cause repair and release verification

## Failure evidence

The owner's GitHub failure emails referred to earlier commits on `main`, not a
new failure after `dadfa53`. That commit's hosted CI completed successfully.
The failed runs contained actual mobile pricing/AI overflow findings and an
asynchronous PostgreSQL stderr-drain race. These are not notification settings.

## Permanent changes

- Replaced the vulnerable Tailwind 3 build chain with Tailwind 4.3.3 and its Vite
  integration. `braces`, its affected watcher/glob chain, and the obsolete
  PostCSS integration are removed. The full dependency audit blocks every
  advisory again; there is no severity exception or `continue-on-error`.
- Preserved the existing ResumeATS palette, font stack, corner/shadow sizing,
  fixed text line heights, legacy flex utilities, and accessible focus behavior.
  Source scanning is limited to app sources and the HTML entrypoint. Mobile
  signup overrides retain their selector precedence in the utility layer.
- The actual PostgreSQL process helper resolves only on `close`, after both
  output streams drain. Regression tests cover large final output, sixteen
  concurrent conflict diagnostics, unavailable binaries, and nonzero exits.
- Fixture Vite processes have separate optimizer caches per run; prerendering
  uses a separate cache too. They no longer invalidate a user's running dev
  server cache or each other's fixture-specific backend configuration.
- Browser CI now checks compiled brand colors, control radius/shadow, flex
  sizing, line heights, and mobile signup spacing. Existing pricing clearance
  and AI mobile-overflow assertions remain enabled.

## Local verification

- Dependency audit: zero findings, including development dependencies.
- Full unit suite, ESLint, repository hygiene, and all 31 Edge Function
  typechecks pass.
- Production build and all nine public-page prerenders pass.
- Route smoke: 33 routes. Accessibility DOM audit: 18 routes, no issues.
- Full fixture browser journey: 22 steps, no page/console errors or blocked
  requests. Premium AI review and hero pointer/click/reduced-motion checks pass.
- Chromium extension smoke and Firefox manifest compatibility pass.
- Screenshot/layout comparison: 24 states across Home, Pricing, Learn, Signup,
  Signin, and Contact at 390px/1440px in light/dark themes. All recorded heading,
  control, and consent-panel boxes match the pre-upgrade baseline; no horizontal
  overflow. Screenshots remain in ignored local `output/playwright/ci-hardening`.

## Backend deployment verified

The five outstanding, previously replay-tested migrations were applied to
`onuxzcectniowxqtmjpg` without seed, role, or Vault changes. Fresh comparison
reports 109 local/109 remote migrations and no differences. The owner-only
recovery RPC exists, remains inaccessible to `authenticated`, and is granted
to `service_role`; all five eligibility guards and the actor index are present.
No account-deletion jobs were pending or executed.

`admin-api` v25, `auto-apply-run` v39, and `privacy-deletion-worker` v2 are
deployed and ACTIVE with their intended JWT settings. The CLI's API uploader
included all five declared font/license assets without Docker. This verifies
deployment packaging, not a real provider-delivery or deletion drill.

## Boundaries

Tailwind 4 targets Safari 16.4+, Chrome 111+, and Firefox 128+, per the upstream
[upgrade guide](https://tailwindcss.com/docs/upgrade-guide). This is a modern
browser release, not a claim of compatibility with older browsers.

Fixture checks use synthetic accounts/providers, not real payment or email
delivery. Worker/provider secrets, scheduling, physical-device/screen-reader
coverage, and production role/provider journeys remain separately unverified.
Account-deletion execution and unconfigured background workers are not enabled
by this release. The owner requested normal task work without goal mode; the
goal was paused and has not been restarted.
