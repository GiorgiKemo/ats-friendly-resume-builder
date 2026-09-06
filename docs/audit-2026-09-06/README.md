# ResumeATS browser audit — 6 September 2026

## Result and release status

Browser testing reproduced the reported production failure. The live frontend expects versioned resume/profile storage, but the connected production database has not received those migrations. Local fixes and regression checks are complete for the findings below. Production repair and release verification are approved but blocked by database/browser access; this is not a claim that every integration or possible state is defect-free.

Testing used the owner's signed-in Chrome for read-only production inspection and an isolated local backend with synthetic Alex Morgan records for saves, AI review, exports, and tracking. No real applications, purchases, emails, account-role changes, or production data/schema changes were made.

## Confirmed production blockers

1. Dashboard `user_resumes` query returns HTTP 400, PostgreSQL `42703`: `column user_resumes.revision does not exist`.
2. Profile request to `get_user_profile_versioned` returns HTTP 404. Editing correctly pauses instead of overwriting unloaded details.
3. Read-only SQL in the signed-in Supabase dashboard confirmed no revision columns or versioned resume/profile RPCs. The latest recorded migration was `20260430030000`; the private schema and legacy save RPCs exist. The existing `user_resumes` view has the expected columns except the new trailing revision.

The precise repair is documented in [database-repair.md](database-repair.md). Merely removing `revision` from the list projection would leave reads/saves broken and discard the concurrency contract.

The `MaxListenersExceededWarning` and `ObjectMultiplex` messages were traced to an injected `chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn/scripts/contentscript.js`, rather than a website bundle. Another wallet extension injected a missing-wallet-channel error. No application listener limit was increased, and no user extensions were disabled.

## Findings fixed locally

- Dashboard no longer starts a duplicate initial list fetch. A failed list load shows recovery instead of misleading first-resume onboarding, with an accessible alert and working retry.
- Empty Analytics has a page heading and links directly to application tracking.
- Private pages have specific titles and descriptions while retaining noindex behavior.
- Auto-Apply read requests aborted during navigation/StrictMode no longer emit misleading service errors. Actual failures remain logged.
- Saving Auto-Apply filters no longer overwrites `is_active`. Only the activation control changes that flag. Browser verification: activate, save settings, reload, still Active.
- Auto-Apply setup failure messages distinguish saving, activation, and discovery; failed discovery has a usable retry path.
- Profile skill type and the browser agent's manual job URL have associated form labels.
- Pricing and Contact cards animate vertically, eliminating observed mobile horizontal overflow. At the tested 390px browser width, document client width and scroll width both measured 375px after the fix.
- Admin access failures explain authorization/session problems instead of exposing a generic SDK error. The non-admin role remains blocked.
- Missing resume previews have a page heading, announced error, and readable dark-mode error text.
- Failed payment returns replace raw SDK text with recovery guidance and a working Check Subscription Status button, without assuming a failed verification means no charge occurred.
- Local fixture coverage now includes Auto-Apply statistics, run history, and Gmail connection status so those screens can be exercised without real services.

Some early fixes were already present in the current checkout by the final diff review. After approval, the intended fixes and this report were committed locally for release. No pushes, production deployments, or unrelated-file resets have been performed.

## Route coverage

“Local” means the real frontend in a browser with an in-memory fixture backend; it does not establish production service parity. “Guard” means the unauthorized/error state was tested, not privileged success.

| Route | Browser coverage and result |
| --- | --- |
| `/` | Local guest homepage, hero/CTAs, responsive menu and navigation |
| `/signin` | Local successful sign-in and incorrect-password feedback |
| `/signup` | Local form and guest route rendering; no real registration/email |
| `/forgot-password` | Local synthetic request and privacy-preserving confirmation |
| `/update-password` | Local invalid/missing recovery-link state |
| `/welcome` | Local missing-callback guard and redirect |
| `/learn` | Live content; local mobile rendering |
| `/pricing` | Live content; local mobile overflow repair, monthly/yearly toggle |
| `/about` | Live content; local mobile rendering |
| `/terms` | Live content; local mobile rendering |
| `/privacy-policy` | Live content; local mobile rendering |
| `/faq` | Live content; local search and accordion expansion |
| `/contact` | Live content; local mobile overflow repair; no real message sent |
| `/dashboard` | Live schema failure; local populated workspace, safe error and retry |
| `/new` | Live/local entry options; local free-editor creation |
| `/builder` | Local new blank resume created through the normal UI |
| `/builder/:resumeId` | Local saved resume editing, manual save, reload persistence, editor sections, templates, ATS check, preview/fullscreen/Escape, missing-ID recovery |
| `/preview/:resumeId` | Local saved preview, actual PDF and DOCX downloads, mobile layout, missing-ID error |
| `/profile` | Live missing-RPC failure; local six sections, save confirmation and reload persistence |
| `/ai-generator` | Local synthetic generation, explicit wording choices, blocked unreviewed save, reviewed save and opening generated resume |
| `/quick-resume` | Local three-step generation/review/preview, saved resume and tracker record; tracked as Saved, not submitted |
| `/applications` | Live read; local create, status change to Interview, reload persistence, search and quick-flow saved record |
| `/analytics` | Live empty state; local route/mobile check and improved empty CTA |
| `/auto-apply` | Live read only; local onboarding, settings persistence, activation, tabs, empty jobs/history, discovery failure/retry feedback |
| `/subscription/manage` | Live expired subscription display; local premium display/mobile layout; no billing mutation |
| `/subscription/success` | Local active-premium success and guest guard |
| `/return-from-stripe` | Local missing-session failure state |
| `/return-from-stripe/:sessionId` | Local invalid synthetic checkout return; no paid session |
| `/admin` | Live/local non-admin 403 guard and friendly local denial; no privileged operations |
| `*` | Local unknown-route 404 state |

Quick-flow metadata extraction safely left an unstructured prose-only posting as Unknown Company/Position in the editable tracker. Structured job descriptions/imports remain preferable; this test does not demonstrate perfect metadata extraction from arbitrary prose.

## Verification evidence

- Full test suite: **1,049 passed, zero failed/skipped/cancelled**.
- ESLint passed; TypeScript check passed; Supabase function checks passed.
- Production build passed. The final preview/payment recovery edits were followed by 25 passing focused preview/subscription tests and another lint/build check.
- Isolated PostgreSQL 17 replay: **all 37 migrations passed**, including owner isolation, revision-aware reads/writes, rollback on failed content saves, legacy data preservation, direct-write restrictions, and concurrent update conflict tests. This used synthetic platform roles/data on loopback port 15439, not the live Supabase database.
- Successful browser downloads were observed in Downloads: `Alex_Morgan_ATS_Friendly_Resume.docx` (9,321 bytes) and `Alex_Morgan_ATS_Friendly_Resume (1).pdf` (60,345 bytes). This confirms export completion for the exercised resume/template, not every document/template combination.
- Detailed command logs are in the ignored local folder `playwright-audit/browser-2026-09-06/`, including `tests-final.log`, `lint-final.log`, `types-final.log`, `build-final.log`, and `migration-replay-current.log`.

## Remaining verification after approval

The owner approved the database repair and frontend release after reviewing this report. Apply the reviewed database repair, then verify production list/profile/read/save requests and concurrency behavior with a disposable account. Release the intended frontend fixes and wait for the production deployment to be ready before rechecking actual production URLs. The current access blocker is recorded in database-repair.md.

Real Stripe checkout/portal changes, email delivery, OAuth completion, paid AI providers, job discovery providers, browser-extension installation/autofill on employer sites, privileged admin flows, physical mobile devices, and PostgreSQL 15 parity were not exercised end to end in this session. They cannot be marked passed based on fixtures or a PostgreSQL 17 replay.
