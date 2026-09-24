# E00 project-access and production-inventory refresh

Captured 2026-09-24 at approximately 10:30 UTC from the current `main` checkout (`14c6a20`) with a large, pre-existing dirty worktree. All production checks in this note were reads; no migration, function, secret, Auth, project, or business-data mutation was made.

## Credential and project access

- Located `SUPABASE_ACCESS_TOKEN` in the ignored project-local `.env.supabase.local`. The value was read into process memory only, never printed or copied. `git check-ignore` confirms the file is excluded by `.gitignore`.
- The token lists eight projects and includes ResumeATS `onuxzcectniowxqtmjpg`; the project detail endpoint reports `ACTIVE_HEALTHY`, region `eu-west-1`. The other seven projects are inactive, and the account list contains no separate ResumeATS staging project.
- Supabase MCP project/database tools still return a permission error under their separate connector identity. The project-local token works through the Management API and Supabase CLI for project details, migration/function listings, and database reads.
- The documented read-only Management API SQL endpoint reported `current_user = supabase_read_only_user` and `transaction_read_only = on`. A schema-only inventory returned 59/59 public tables with RLS, 29 public policies, 134 public functions (106 `SECURITY DEFINER`, zero without a pinned `search_path`), and 8/8 Storage tables with RLS. No application/customer rows were queried.
- A separate `supabase db query --linked` probe returned `current_user = postgres`. That invocation ran only a metadata `SELECT` and made no writes; do not use that general SQL command as a read-only boundary. Continue catalog inspection through the explicitly read-only endpoint.

## Deployment parity

- `supabase migration list --linked --output-format json`: 89 local migrations, 86 applied remotely, zero remote-only versions. The three local-only migrations are `20260924044734_analytics_paid_conversion_cohorts.sql`, `20260924065849_admin_analytics_qa_exclusion_management.sql`, and `20260924090331_allow_aal2_support_queue_mark_read.sql`.
- `supabase functions list --project-ref onuxzcectniowxqtmjpg --output-format json`: 31 deployed functions, all `ACTIVE`. The checkout has 29 function source directories (excluding `_shared`); production also has `create-customer-portal-session` and `gemini-proxy`, for which no local source directory was found. Preserve these deployed functions until their code and callers are reconciled; do not prune them as part of this read-only audit.
- Because there is no staging project and the three migrations/API changes are not yet in a reviewed release, this refresh did not apply migrations or deploy functions.

## Local verification at refresh

- `npm test -- --test-concurrency=1 --test-timeout=60000`: 1,321 passing.
- `npm run lint`, `npm run build`, `npm run check:supabase:functions`, `npm run check:repo`: passing.
- `npm run test:website:smoke`: all 32 routes passed.

These results establish local checks and read-only production metadata, not production role/session journeys, staging validation, provider replay, worker readiness, or full plan completion.
