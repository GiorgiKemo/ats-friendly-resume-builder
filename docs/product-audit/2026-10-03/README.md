# ResumeATS audit addendum — 2026-10-03

This is a dated continuation of the wider audit, not a claim that every production workflow has been verified.

## Changes in this pass

- The production build now server-renders the existing React page components into the initial HTML for all nine indexable public routes. Private routes remain empty app shells with `noindex`; the public-page generation fails the build if a page lacks exactly one H1 or meaningful text. The homepage hero uses an isomorphic layout effect so its client layout behavior remains unchanged without server-render warnings.
- On authenticated mobile workspace routes, the analytics-consent notice now sits in normal page flow rather than covering dashboard content.
- The floating support launcher no longer overlaps mobile workspace actions. Mobile users can open the existing support dialog from the navigation menu; the desktop launcher remains unchanged.
- The support dialog layer is raised above the consent notice. The local browser fixture provides synthetic responses only for the support dialog's read-only routing and email-preference lookups.

## Verification

- `npm test`: 1,424 passed, 0 failed.
- `npm run lint`: passed.
- `npm run build`: passed; all nine public pages contain one H1 and 1,607–11,222 characters of initial body text. Private routes remain app shells. Existing non-fatal bundler notices remain for HarfBuzz's browser externalization, the empty Stripe chunk, and large PDF/3D bundles.
- Production-preview route smoke: 33 routes passed. Fixture browser QA: full website suite 19/19, with no page errors, console errors, or blocked requests. Support end-to-end suite passed with zero contrast violations, browser console errors, or page errors. Screenshots are in the ignored `output/playwright/seo-prerender/` and `output/playwright/resume-dashboard-recovery/` directories.
- Additional local checks already passed in this audit: 18 public/auth/error routes in the accessibility pass, 33-route smoke pass, and replay of all 104 migrations on disposable local PostgreSQL.
- Read-only production HTTP audit (2026-10-02 21:13 UTC): 9 public routes, 21 private shells, 60 referenced assets, and 3 Edge Function method/CORS probes; `failures: []`.

## Production capability snapshot

Read-only check at 2026-10-02 21:13 UTC for project `onuxzcectniowxqtmjpg`:

- Local/remote migrations: 104/104, with no missing or remote-only versions.
- Local/deployed Edge Functions: 31/33; no local function is missing or inactive. Two extra deployed functions still need a source/ownership reconciliation.
- Public tables: 64/64 have RLS enabled; the catalog reports 32 public policies. This inventory is not a cross-account RLS test and does not establish that every access path is correct.
- Supabase Cron is unavailable (`pg_cron` and `pg_net` absent); no jobs or runs are configured. Repository search found no scheduler/caller wiring for the internal worker endpoints.
- Provider credential names for Stripe, PayPal, and Brevo are present, but their values and delivery/transaction validity were not tested.
- Missing required worker configuration names: billing (`BILLING_RECONCILIATION_SECRET`, `BILLING_ACTION_WORKER_SECRET`); support delivery/scanning (`SUPPORT_NOTIFICATION_SECRET`, `SUPPORT_ATTACHMENT_SCANNER_SECRET`, `ATTACHMENT_SCANNER_URL`, `ATTACHMENT_SCANNER_TOKEN`); privacy (`PRIVACY_WORKER_SECRET`, `PRIVACY_DELETION_WORKER_SECRET`); invitation email (`ADMIN_INVITATION_EMAIL_SECRET`, `ADMIN_APP_URL`, `ADMIN_EMAIL_FROM`). These endpoints remain gated. No credentials were created or changed.
- Support-AI configuration is also absent (`SUPPORT_AI_ENABLED`, `SUPPORT_AI_PROVIDER_URL`, `SUPPORT_AI_PROVIDER_TOKEN`, `SUPPORT_AI_WORKER_SECRET`); this is optional and remains disabled, not a required production dependency.
- Active admin membership is one owner, zero admin members, and zero support members. No production test accounts were created.

## Still unverified / blocked

- TesterArmy cloud execution and its requested live role matrix were not run. The available Supabase access token is not a TesterArmy API credential; the `TESTERARMY_API_KEY` is not available in the project or environment. Local synthetic browser tests are not a substitute for production role/account verification.
- Real customer/admin account behavior, cross-account RLS isolation, premium entitlement lifecycle, provider sandbox checkout/webhooks, email delivery, attachment scanning, privacy export/deletion drills, backup/restore, and live monitoring remain open.
- Physical-device and screen-reader behavior remain unverified beyond the automated browser/accessibility checks.
- The previous production crawl found empty initial HTML across the public routes. This change addresses that code defect, but it does not guarantee indexing or impressions; after release, Google Search Console URL inspection and later indexing/traffic reports must verify what Google actually received and indexed. Search Console's current indexing/canonical/redirect state remains a separate production check.

Do not set worker secrets from the Supabase access token or guess provider values. The worker credentials/configuration and scheduler need an owner-supplied deployment plan and secure configuration source before enabling background processing.

## CI follow-up — 2026-10-03

- The first hosted CI attempt transiently failed one concurrent profile-write replay assertion; a same-commit retry passed the complete 104-migration replay and authorization checks.
- That retry then found an actual Edge Function import-map omission: the `auto-apply-run` PDF attachment path imports `bidi-js` and `pdf-lib`, but neither dependency was mapped for Deno. Added pinned npm mappings and updated `supabase/functions/deno.lock`.
- `npm run check:supabase:functions` now passes for all 31 local functions. This configuration change has not yet been deployed to Supabase; a targeted hosted function deploy and a staging attachment-generation check remain necessary before claiming that workflow fixed in production.
