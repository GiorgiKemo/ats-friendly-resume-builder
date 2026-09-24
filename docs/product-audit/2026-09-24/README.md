# ResumeATS product and mobile UX audit

Date: 2026-09-24 (Asia/Tbilisi)
Environment: production website in an isolated read-only browser profile; authenticated builder/admin checks use disposable local synthetic data

The release-gate notes below are timestamped snapshots from before the coordinated follow-up release. The latest release result is recorded at the end of this report and supersedes those earlier deployment-state statements.

## Coverage

- Visually inspected homepage, mobile navigation, consent notice, Learn guide, pricing, and the Contact form at desktop/mobile sizes. Evidence is in this folder.
- Checked homepage, Learn, Pricing, About, Contact, FAQ, Privacy, and Terms at a 320 CSS-pixel viewport. Every route rendered its main heading after its lazy-loaded page code completed; none had horizontal overflow.
- Exercised the pricing billing-period selector without opening checkout. Monthly and yearly selections update the price and signup plan link consistently.
- Clicked the Learn headline to reproduce the reported blue focus border. It did not appear on the live page. Keyboard focus indicators remain available for keyboard navigation.
- Declined analytics consent in the isolated test profile and verified the notice disappears and the choice is stored as `denied`.
- Inspected sign-in, dashboard, resume editing, and mobile preview in a local authenticated fixture at 390px, 930px, and desktop width. The initial tablet toolbar clipping was reproduced and fixed locally.

No production signup, checkout, contact/newsletter submission, support message, or customer record was created or changed. Local browser tests use synthetic accounts and support messages only.

## Findings

| Priority | Finding | Evidence / next action |
| --- | --- | --- |
| P2; fixed locally, not deployed | The compact analytics notice consumed a large part of the first mobile workspace screen. | Compact-only copy and line spacing reduce the block while preserving its privacy boundary and preference link. The authenticated 390px fixture checks the notice is at most 145px high; screenshot: [`compact-consent-390.png`](../../../output/playwright/consent-layout-20260924/compact-consent-390.png). |
| Resolved (P2) | The floating support `?` launcher overlapped body text at 320px and partially covered the hero illustration at 375px. | In `0c1d058`, the launcher was moved into document flow at all viewport sizes while retaining its labelled 48px button and support dialog. The live `/learn` page at 320px has zero measured text intersections and zero horizontal overflow; see `13-learn-support-320-before.png` and `16-live-learn-support-320-full.png`. |
| Not reproduced | The blue outline around text on pointer click was not reproducible on production. The heading receives no visible outline; CSS retains `:focus-visible` treatment for keyboard operation. | See `09-learn-after-heading-click.png`; implementation rules are in `src/index.css`. If the ring still appears in the user's browser, identify the exact element/browser extension before changing focus styling further. |
| Pass | The mobile menu opens with working navigation, and analytics consent can be declined without leaving the banner stuck. | `04-mobile-menu-open.png`, `03-home-mobile-first-fold.png`, and `12-home-after-consent-choice.png`. |
| Pass | Monthly/yearly pricing selection is internally consistent at the public UI boundary. Yearly shows $99.99/year, $19.89 savings, and a `premium_yearly` signup target. | `06-pricing-mobile.png` and `08-pricing-yearly-viewport.png`. No payment flow was opened. |
| Pass | Tested public pages fit a 320px viewport without horizontal scrolling. | Route matrix recorded in this audit run; this is a layout check, not a WCAG certification. |
| P2; fixed locally, not deployed | The resume selector's fixed flex sizing and a side-by-side title/action row caused horizontal overflow and clipped the save action around 930px. | The selector can now shrink and the row stacks below the wide-screen breakpoint. The 1024/930/768/390/320px regression check passes; at 930px the document width is 915px and the full save button is visible. Before/after screenshots are in `03-resume-builder.png` and `07-builder-responsive-fixed-930.png`. |
| P2; fixed locally, not deployed | Required-field asterisks used `red-500`, measuring 3.76:1 on white, and the punctuation was included in accessible label text. | Shared form controls and Contact now use `red-700` in light mode and `red-400` in dark mode; markers are hidden from accessible label text and native `required` inputs remain intact. Local checks measured 6.47:1 on white and 6.73:1 on the dark form surface; see screenshots 27–28 and 33. |
| P2; fixed locally, not deployed | The signup password-policy info button appeared inert: focus opened the tooltip, then click toggled it closed. Its blue focus ring also applied to pointer clicks. The hint overlapped the Email field. | Click now opens idempotently, Escape dismisses, pointer focus has no blue ring, and keyboard focus retains a visible ring. Form hints open in layout flow; browser geometry confirmed no Email-field overlap. Screenshot 33 shows the open inline hint. |
| Contrast spot check | Common visible text was sampled on all eight public routes in both themes. No other sampled text fell below the 4.5:1 normal-text threshold; gradient-backed text and full assistive-technology conformance were not certified. | The footer support controls are icon links with screen-reader-only labels; their visible icons measure 3.6:1, above the 3:1 non-text threshold. |
| P1; protections deployed, production role-matrix proof remains open | Authenticated support access relied on assignment/participant status for some direct conversation RPCs, allowing stale customer sessions and assigned AAL1 agents to bypass the intended live-session/AAL2 boundary. | `support-api` now enforces staff AAL2 for `send`, `read`, and `markRead`; the deployed 86/86 migration history includes live-session checks in direct RPCs while preserving ordinary customer AAL1 access. Local PostgreSQL replay and Chromium/Firefox browser tests verify active/stale sessions, AAL1 denial, AAL2 access, and internal-note secrecy. Production authenticated role/session behavior remains unverified. |

## Evidence index

- `01-home.png` — desktop homepage, first-visit state
- `02-home-mobile.png` — full mobile homepage
- `03-home-mobile-first-fold.png` — mobile first fold with consent notice
- `04-mobile-menu-open.png` — mobile menu open
- `05-consent-banner-still-visible.png` — initial menu dismissal; consent notice correctly remains until a choice is made
- `06-pricing-mobile.png` — mobile pricing, monthly selected
- `08-pricing-yearly-viewport.png` — normal viewport after selecting yearly
- `09-learn-after-heading-click.png` — Learn page after clicking headline text
- `10-learn-mobile-full.png` and `11-learn-mobile-320.png` — Learn guide at narrow mobile widths
- `12-home-after-consent-choice.png` — homepage after declining analytics consent
- `13-learn-support-320-before.png` — production baseline showing the floating support button over Learn copy
- `16-live-learn-support-320-full.png` — live production page after the fix; support remains available in normal content flow

The after-fix support launcher is no longer fixed-position, so the full-page capture shows its actual document-flow placement.

## Release boundary

This is a visual and public-route pass, not a complete audit of every authenticated journey or third-party delivery. Do not treat screenshots, route shells, or local tests as proof of signup delivery, newsletter email delivery, paid checkout, provider reconciliation, or worker scheduling. Current hosted capability/security findings and remaining release gates are tracked in [the production capability audit](../../admin-dashboard-plan/evidence/20260924-production-capability-audit.md) and [the implementation status](../../admin-dashboard-plan/evidence/implementation-status.md). The session guard and support AAL2 protections are deployed (86/86 production migrations; `admin-api` v20 and `support-api` v2). Paid-conversion cohort analytics, audited owner-managed QA exclusions, and allowing AAL2 agents to mark unassigned queue rows read are local-only in migrations 87–89 with paired API updates. Supabase CLI migration dry-run and Supabase MCP project operations both returned permission errors; no partial UI/API/schema release was made.

## Fresh screenshot and verification pass — 2026-09-24

### Current-run screenshots

- `17-live-learn-fresh-run.png` — public Learn page at a narrow mobile viewport.
- `18-live-learn-desktop.png` — full Learn page at desktop width.
- `19-live-home-desktop.png` and `22-live-home-mobile.png` — public homepage at desktop and mobile widths.
- `21-live-pricing-mobile.png` and `23-live-pricing-desktop-tall.png` — full public pricing experience at mobile and desktop widths.
- `20-live-pricing-desktop.png` — first-screen pricing comparison.
- `24-live-home-after-headline-click.png` — homepage after clicking the headline; no pointer focus frame.
- `25-live-home-keyboard-focus.png` — primary signup link after pressing Tab; keyboard focus remains visible.
- `26-live-learn-after-headline-click.png` — Learn page after clicking the headline; no pointer focus frame.
- `27-local-contact-required-markers-dark.png` and `28-local-contact-required-markers-light.png` — local production build after correcting required-marker contrast; all four fields retained native required state and passed the measured contrast check.
- `33-local-signup-info-tooltip-open.png` — local production build showing the working inline password-policy hint without covering the Email field.
- [`support-inbox-local-2026-09-24T00-53-18-139Z.png`](../../admin-dashboard-plan/evidence/support-inbox-local-2026-09-24T00-53-18-139Z.png) and [`support-guest-resolved-local-2026-09-24T00-53-18-139Z.png`](../../admin-dashboard-plan/evidence/support-guest-resolved-local-2026-09-24T00-53-18-139Z.png) — latest local support inbox and resolved guest view.

The key public flow reads coherently across sizes: the homepage has a clear free-start action, Learn provides a scannable guide and resume CTA, and Pricing separates Basic from Premium with visible FAQs. The in-flow support launcher does not cover copy in the fresh captures. On wide pricing, the free-plan card has materially more empty space than Premium; this is a polish opportunity, not a functional failure. Secondary/footer text is visually small in full-page captures. A computed-color spot check now covers common text and the fixed Contact markers; gradients, the complete control set, and assistive-technology behavior still need broader validation before making a WCAG conformance claim.

The focused production check clicked the homepage and Learn headlines in Chrome and captured the same public states in an isolated Playwright session. No blue frame appeared after either pointer click (screenshots 24 and 26). Pressing Tab showed the visible focus indicator on the primary signup link (screenshot 25), so keyboard focus was preserved. This verifies representative text and keyboard targets, not every control, browser, or extension. No billing period was selected, checkout opened, signup/contact/newsletter/support form submitted, or customer record inspected.

### Current-run engineering checks

- Current local verification: `npm test` — 1,315/1,315 passed; Supabase function typecheck, lint, repository hygiene, and production build passed. All 89 local migrations replayed on a disposable loopback-only PostgreSQL 17 container, including paid-conversion cohort, QA-exclusion, and support read-before-assignment contracts. The 32-route smoke and 17-route accessibility DOM audits passed. Production still has 86 migrations.
- Current Chromium fixture journeys: `npm run test:website:full` passed 18/18 scenarios, including the 1024/930/768/390/320px builder reflow regression check and compact-consent height guard at 390px, with no page errors, console errors, or blocked requests. `npm run test:website:support` passed in Chromium, Firefox, and WebKit: guest recovery/isolation, handoff, internal-note separation, resolution/CSAT, AAL1 denial, AAL2 access, owner-only QA exclusion, and admin accessibility checks (22 text, 22 non-text, 110 status-tone checks; 494/494/518 keyboard targets respectively; zero findings or page errors). A separate Chromium run passed all 22 real 200% zoom checks. These use local fixtures/local Supabase, not production Auth or customer data.
- Fresh `npm run audit:production:http` at `2026-09-24T09:43:44.994Z` returned `failures: []`. `npm run audit:production:capabilities` at `2026-09-24T08:43:04Z` confirmed 29 local functions represented among 31 active deployments, production migration history 86 versus local 89, three local-only migrations (`20260924044734`, `20260924065849`, `20260924090331`), 15 worker/config names missing, and no configured Supabase Cron jobs. The deployed migration `20260924010401` is unchanged; the AAL2 queue-read correction is isolated in additive migration `20260924090331` and covered by replay tests.
- `npm audit --omit=dev --audit-level=high` — zero reported vulnerabilities. The mobile Lighthouse provider call timed out at 300 seconds, so there is no verified Lighthouse score.

## Expanded production pass — 2026-09-24

1. **Live desktop routes — pass with an auth boundary.** Opened 27 route URLs in isolated Chrome. Every navigation returned HTTP 200, rendered the expected page title/heading or redirected protected content to sign-in, and produced no page errors or desktop horizontal overflow. This verifies route shells, not authenticated page contents. Full-page captures are in [`output/playwright/production-review-20260924/routes`](../../../output/playwright/production-review-20260924/routes).
2. **Responsive public pages — pass for tested widths.** Eight key routes had no horizontal overflow at 390 CSS pixels. The homepage and Pricing also passed at 320px in dark mode; desktop and mobile light/dark screenshots are in [`output/playwright/production-review-20260924`](../../../output/playwright/production-review-20260924).
3. **Reported blue text frame — not reproduced.** Client-side navigation to Learn focused its heading for assistive technology but showed no pointer outline. Keyboard Tab still reveals focus on the skip link and navigation. The current browser integration suite's `pointer-route-focus` step passed; see [`learn-after-nav.png`](../../../output/playwright/production-review-20260924/learn-after-nav.png) and [`keyboard-first-tab.png`](../../../output/playwright/production-review-20260924/keyboard-first-tab.png).
4. **Accessibility and core local workflows — pass within stated boundaries.** The 17-route DOM accessibility audit passed. The 18-step authenticated-fixture journey, Chromium extension test, Firefox extension compatibility check, and support/admin QA completed without page errors; the latest support/admin checks reported zero text/control contrast violations and 486 keyboard targets.
5. **Build and database contracts — pass locally.** 1,315 unit tests, lint, build, Supabase function typecheck, repository hygiene, and all 89 PostgreSQL 17 migration replays passed. The database was a disposable Docker instance bound only to `127.0.0.1:55432`; it was stopped after the run. No production rows or settings were changed.
6. **Production HTTP/capability audit — public delivery passes; release remains gated.** The read-only HTTP audit at `2026-09-24T09:43:44.994Z` exited with `failures: []`. The fresh capability inventory reports 86 production migrations versus 89 local, all 29 local functions represented among 31 active deployments, 15 required worker/config values absent, and no available Supabase Cron metadata. `supabase db push --dry-run --skip-vault` was denied with HTTP 403 before producing a migration plan; Supabase MCP project reads were also denied. Chrome's signed-in Dashboard can view the production function and migration inventories, but no release action was performed. Do not ship the coupled UI/API/migrations partially.

No signup, checkout, support, or newsletter form was submitted; no customer record or production configuration was changed in the live system.

### Pricing-to-signup flow recheck — 2026-09-24

1. **Pricing, monthly — pass with a first-visit interruption.** The public page shows Basic at $0 and Premium at $9.99/month. The optional analytics-consent panel takes a prominent block above the comparison and pushes the plans down; no consent choice was made in this isolated browser. [Screenshot](../../../output/playwright/production-pricing-flow-20260924/01-pricing-monthly.png)
2. **Pricing, yearly — pass.** Choosing Yearly updates the displayed price to $99.99/year, shows $19.89 savings versus monthly, and updates the Premium action to target `premium_yearly`. [Screenshot](../../../output/playwright/production-pricing-flow-20260924/02-pricing-yearly.png)
3. **Premium yearly signup destination — production pass; copy fixed locally.** The CTA opens `/signup?plan=premium_yearly`; the page confirms “Premium AI+ — Yearly” and says payment is not taken on the form. Production's “Get started for free” eyebrow was incongruous with the selected paid plan, so the local signup hero now says “Create your account first” for either Premium intent and keeps “Get started for free” for Basic/no plan. The production baseline and local fixed-build result are [here](../../../output/playwright/production-pricing-flow-20260924/03-signup-premium-yearly.png) and [here](../../../output/playwright/production-pricing-flow-20260924/04-local-signup-premium-copy.png).

This was a read-only public journey in an isolated Chrome session. The signup form was not filled or submitted, and no checkout/payment provider was opened. Captures are viewport screenshots, not full-page or authenticated-flow evidence.

### Authenticated resume-builder responsive recheck — 2026-09-24

1. **Sign-in — pass in a disposable local fixture.** The test account entered the authenticated dashboard without changing production identity or data. [Screenshot](../../../output/playwright/customer-builder-flow-20260924/01-sign-in.png)
2. **Dashboard — pass.** One seeded resume and the primary resume-opening action were visible. [Screenshot](../../../output/playwright/customer-builder-flow-20260924/02-dashboard.png)
3. **Resume builder at 930px, before fix — fail.** The resume selector and top action group extended beyond the viewport; “Save Resume” was clipped. [Before](../../../output/playwright/customer-builder-flow-20260924/03-resume-builder.png)
4. **Resume builder at 1440px — pass.** The selector, actions, section editor, and preview fit the wide layout. [Screenshot](../../../output/playwright/customer-builder-flow-20260924/04-resume-builder-wide.png)
5. **Resume builder at 390px — pass with vertical scrolling.** Actions wrap and the editor remains usable; the optional analytics notice occupies a substantial first-screen block. [Screenshot](../../../output/playwright/customer-builder-flow-20260924/05-resume-builder-mobile.png)
6. **Resume preview at 390px — pass.** Preview text and export controls remain visible; the preview itself scrolls vertically. [Screenshot](../../../output/playwright/customer-builder-flow-20260924/06-mobile-resume-preview.png)
7. **Resume builder at 930px, after local fix — pass.** The toolbar stacks below the title and the selector can shrink. Browser measurements report 915px document width in a 930px viewport and the complete Save button bounds (x=549–704); the 1024/930/768px regression checks all pass. [After](../../../output/playwright/customer-builder-flow-20260924/07-builder-responsive-fixed-930.png)

The local fix changes the title/action row breakpoint to a wide-screen layout and removes the selector’s fixed flex sizing. The action remains in normal document flow; keyboard focus behavior is unchanged. Build and all 18 fixture scenarios pass, including no horizontal overflow at 320px. The optional analytics-consent block remains visually prominent on mobile; no choice was made. These authenticated screenshots are synthetic local data and do not prove production account behavior.

## Follow-up release — 2026-09-24

- The production Supabase database is now at 89/89 local migrations. Migrations 87–89 add consent-aware conversion/AI analytics, owner-audited QA exclusion management, and the AAL2 unassigned support read cursor; each migration was dry-run reviewed, applied, and confirmed in the remote history.
- Thirteen coupled Edge Functions were deployed and confirmed active: `admin-api`, `support-api`, `analyze-keywords`, `auto-apply-run`, `gmail-scan`, `groq-proxy`, `openrouter-proxy`, `create-checkout-session`, `verify-checkout-session`, `stripe-webhook`, `paypal-billing`, `paypal-webhook`, and `billing-reconciliation`. Their existing `verify_jwt` settings were preserved. The Supabase access token was used only for CLI authentication and was not added as an Edge Function secret; no other production secrets or Auth settings were changed.
- Commit `93b17f1` was pushed to `origin/main` and Vercel deployment `dpl_7dAqfsj1HcjWgfQwW9QUuxAMbjvL` reached `READY` on `www.resumeats.cv` and `resumeats.cv`. The post-promotion HTTP/asset audit at `2026-09-24T11:54:25.558Z` returned `failures: []` across 8 public routes, 21 private route shells, 55 referenced assets, and 3 function health checks.
- Local verification is 1,328/1,328 unit tests, lint, repo hygiene, Supabase function type-check, production build, and the 89-migration PostgreSQL 17 replay. The 18-step browser fixture run and multi-browser support/admin checks pass within their documented synthetic-data boundaries. The 37 public-flow screenshots are stored beside this report.
- This is not proof of an end-to-end production payment, an authenticated production role matrix, GA4 processed data, scanner delivery, scheduled worker execution, or a successful backup restore. Fifteen worker/config values remain absent, no scheduler jobs are configured, and the active production owner has not verified TOTP. These remain explicit owner/operations gates; no values were guessed or uploaded.

### Live focus-indicator recheck — 2026-09-24

- On the deployed site, clicking the home headline leaves focus on `main` with `:focus-visible` false, and no pointer focus frame appears. Screenshot: [`34-live-home-pointer-click-after-release.png`](34-live-home-pointer-click-after-release.png).
- Keyboard Tab still visibly focuses “Skip to main content” with `:focus-visible` true and a solid 2px outline. This is intentional accessibility feedback; pointer clicks on text do not show it. Screenshot: [`35-live-home-keyboard-focus-after-release.png`](35-live-home-keyboard-focus-after-release.png).

### Earlier release-gate snapshot — before the follow-up release

- Vercel production remains `READY` on deployment `dpl_M4uShkZDEH9R31Bm2yXAYh74Mspm`, built from `14c6a20`; GitHub `main` and `origin/main` still match, and no current worktree changes have been pushed. The public HTTP/asset audit at `2026-09-24T09:43:44.994Z` completed with `failures: []`. Local UI/API changes and migrations 87–89 are not published.
- Production migration history is 86/86; `admin-api` v20 and `support-api` v2 remain active. The current PAT-based CLI migration dry-run is denied with HTTP 403, and Supabase MCP project operations are denied; the browser Dashboard remains read-only in this task. No production migration, Edge Function, Auth configuration, or secret was changed for the local work.
- Production TOTP enrollment is enabled in the compared Auth configuration, but the sole active owner currently has no verified TOTP factor. The new Admin MFA panel preserves AAL1 read-only access during setup and supports enrollment after the coordinated release. Worker-secret inventory found provider credential names present but 15 billing/support/privacy/invitation/Support-AI settings missing; those background capabilities remain gated and their values were not found in local environment files (only example placeholders exist). No scheduler extension or jobs are configured.
- Production writes are blocked until the active Supabase CLI token has adequate project/account permission (or the Owner deploys through the supported workflow). Do not paste or replace access tokens in chat. The 15 missing worker/config values and absent scheduler are separate: those background workers remain gated and are not required to deploy this frontend/API/schema bundle. Keep the analytics frontend/API and migrations together; deploying only the frontend would mismatch the active response schema. After access is restored, verify the cohort API against production reconciliation/QA readiness, the owner's MFA enrollment, and the production admin/support role matrix; do not claim authenticated production QA until that is completed.
