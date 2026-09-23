# 2026-09-24 default public-object grants

## Change

Migration `20260923204601_revoke_automatic_public_object_grants.sql` makes API grants opt-in for future objects created by migration owner `postgres`: all default privileges on `public` tables, all default privileges on sequences, and function execution are revoked from `anon`, `authenticated`, and `service_role`. PostgreSQL combines global and per-schema function defaults, so global default `PUBLIC` execution is also revoked for functions created by that owner. Existing tables, sequences, functions, and their grants are not changed.

## Local verification

- The migration replay completed all 80 application migrations in an isolated temporary PostgreSQL 17 container and verified each API role lacks `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER`, and `MAINTAIN` on a newly created table; `USAGE`, `SELECT`, and `UPDATE` on a new sequence; and `EXECUTE` on a new function.
- The already-running local Supabase database was not reset. Its migration history includes this migration; after the full-table revoke was strengthened, the migration statements were re-applied idempotently and a transaction-scoped probe verified the same privilege set before rolling back its temporary objects.
- `npx --no-install supabase db lint --local --level error --fail-on error` passed with no schema errors.
- In the same work cycle, the 1,281-test unit suite, lint, Supabase function checks, and production build passed. They do not prove production grants or production data-plane behavior.

## Production boundary

The read-only capability snapshot observed 79 linked production migration versions before this local migration was added. Both `supabase db query --linked` and `supabase db push --linked --dry-run --skip-vault` returned HTTP 403 because the current Supabase identity lacks the required database privileges. No production DDL was executed. Production remains at the previously observed 79 versions until an authorized database role can run the migration and local/remote parity can be rechecked.

Next step: have a Supabase project owner grant the signed-in deployment identity the required database migration/query permissions, or perform the reviewed migration from the authorized owner context; do not send database passwords or access tokens in chat.
