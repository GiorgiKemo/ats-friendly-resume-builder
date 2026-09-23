# Admin API Auth-session guard — 2026-09-24

## Change

- Migration `20260923220527_admin_auth_session_guard.sql` adds a boolean-only, fixed-empty-search-path `SECURITY DEFINER` function. It returns true only when the supplied user/session UUID pair exists in `auth.sessions` and the session is not past `not_after`.
- `EXECUTE` is revoked from `PUBLIC`, `anon`, and `authenticated`; only `service_role` can call the function. It exposes no session, IP, user-agent, or refresh-token fields.
- `admin-api` validates its bearer token through Supabase Auth, then requires a valid UUID `session_id` claim matching that user and an active database session before checking admin membership. Missing claims, revoked/expired sessions, mismatched subjects, and RPC failures fail closed as invalid sessions.

## Local verification

- `node --test tests/backendBoundaries.test.js` — passed 17/17, including accepted active session and denied revoked, missing-claim, and database-error cases.
- `npm run test:migration-replay` — all 81 migrations replayed on a disposable PostgreSQL 17 container. The new RPC accepted the active matching user/session pair and rejected an expired session, a mismatched user, and an absent session. Role checks confirmed only `service_role` can execute it.
- `npm test` — passed 1,282/1,282; `npm run lint`, `npm run check:repo`, `npm run check:supabase:functions`, and `npm run build` all passed.
- Docker container `resumeats-session-audit-20260924` was stopped and removed after the isolated run. No local Supabase database was reset.

## Production boundary

- A read-only linked query confirmed the deployed `auth.sessions` relation has `id uuid`, `user_id uuid`, and `not_after timestamptz`; no session/user rows were inspected.
- The migration is local only: production remains at 80 migrations, and its currently deployed `admin-api` does not yet perform this check. Production rollout is migration-first/function-second and still needs verification against an authenticated owner session plus revoked-session behavior. This local evidence does not close A01, E02, E03, E17, or E20.
- No production schema, Auth session, function, membership, or secret was changed.
