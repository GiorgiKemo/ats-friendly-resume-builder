# Direct admin and support Auth-session guard — 2026-09-24

## Change

- Migration `20260923223745_enforce_active_sessions_for_direct_admin_and_support.sql` adds a boolean-only, fixed-search-path predicate that compares `auth.uid()` and the JWT `session_id` with an unexpired `auth.sessions` row.
- Direct `is_support_operator()`, `is_knowledge_manager()`, and `admin_list_user_directory()` authorization now fails closed when that session is absent or expired. The authenticated attachment-preparation RPC also requires an active session.
- The `support-api` service-role attachment finalize/download paths verify the exact user/session pair before granting owner or operator access. This is scoped protection for the touched privileged/direct-RPC and attachment boundaries, not a claim that every customer RPC rejects revoked JWTs.

## Local verification

- `npm run test:migration-replay` — all 82 application migrations replayed on an isolated PostgreSQL 17 container. Synthetic active and expired sessions verified the direct predicate, owner/customer role checks, support operator/knowledge manager checks, directory access, and attachment preparation; revoked sessions could not create an attachment row.
- `node --test tests/supportApiSessionGuard.test.js tests/backendBoundaries.test.js` — passed 20/20, including exact user/session binding and fail-closed support attachment service access.
- `npm test` — passed 1,285/1,285. `npm run lint`, `npm run build`, `npm run check:repo`, and `npm run check:supabase:functions` passed.
- `npx --no-install supabase db lint --local --level error --fail-on error` — no schema errors on the already-running local Supabase database. It was not reset.
- The isolated replay container was stopped and auto-removed. The existing local Supabase stack was left untouched.

## Production boundary

- Authorized read-only Management API checks enumerated eight projects and confirmed the active ResumeATS project. A read-only database query reported 80 applied migrations, newest `20260923204601`; this checkout has 82 migration files. Both session-guard migrations remain unapplied in production.
- No production schema, Edge Function, Auth session, membership, or secret was changed. Production role behavior across REST/RPC/Storage and staging verification remain open; this evidence does not close A01, E02, E03, E17, or E20.
