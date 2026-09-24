# AI lifecycle analytics implementation — 2026-09-24

## Local implementation

- Authenticated resume/provider-proxy, keyword-analysis, application-answer, Auto-Apply scoring/cover-letter/email-extraction, and Gmail reply-classification operations now emit first-party `ai_generation_started`, `ai_generation_completed`, or `ai_generation_failed` events when—and only when—the visitor explicitly granted analytics consent on `resumeats.cv` or `www.resumeats.cv`.
- Browser code forwards the consent marker only on an approved production customer route. The Edge Functions independently require that exact marker and a production ResumeATS `Origin`. Missing, declined, local, preview, and admin contexts write no AI lifecycle events.
- Event keys are server-generated UUID + event-name pairs. The allowlisted event properties contain only the opaque attempt ID, feature, provider/model when resolved, duration, usage version, an explicitly `unpriced` cost version, and fixed failure categories. Resume/job/application prompts, answers, generated content, and provider response/error bodies are not recorded.
- Keyword analysis, Auto-Apply, and Gmail classification record one logical task across their internal provider fallback. The general proxy endpoints record individual provider attempts; a client fallback therefore has distinct attempt IDs for each provider request. Auto-Apply and Gmail client requests forward the consent marker only from an explicitly consented production customer route.
- The support-AI worker retains its separate operational usage-record model and is not covered by this optional-consent `ai_generation_*` event family.
- AI lifecycle names are permitted by the pending local analytics migration. The client-facing `record_analytics_event` RPC allowlist is unchanged, so clients cannot claim server AI outcomes.

## Verification

- `node --test tests/aiAnalyticsLifecycle.test.js tests/backendPrivacy.test.js tests/analyticsConsent.test.js tests/analyticsServerEvent.test.js tests/backendAutoApplyScoring.test.js tests/backendGmailReplies.test.js tests/autoApplyAccountService.test.js`: passed, including consent rejection, production-origin enforcement, safe-property checks, lifecycle success across proxy, keyword, Auto-Apply and Gmail providers, invalid provider JSON/refund handling, and no prompt/result/email persistence.
- `npm test`: 1,331 passed after the expanded Auto-Apply and Gmail lifecycle coverage. `npm run lint`, `npm run build`, `npm run check:supabase:functions`, and `npm run check:repo` also passed after these changes.
- `npm run lint`, `npm run build`, `npm run check:supabase:functions`, and `npm run check:repo`: passed.
- `npm run test:migration-replay`: all 89 migrations and local authorization/privacy fixtures passed on a separate disposable PostgreSQL 17 container; no project-local or production database was modified.
- `npm run test:website:smoke`: all 32 routes passed on rerun. The first run had one transient timeout for `/preview/test-resume-id`; direct browser navigation and the rerun both redirected correctly to sign-in.

## Release boundary

This proves local wiring and test behavior only. The analytics constraint migration and Edge Function changes have not been deployed. There is no separate ResumeATS staging project, and production processed-event delivery, consented real-user receipts, and priced AI cost coverage remain unverified. Do not interpret missing AI cost as zero.
