# 2026-09-24 default public-object grants

## Change

Migration `20260923204601_revoke_automatic_public_object_grants.sql` makes API grants opt-in for future objects created by migration owner `postgres`: all default privileges on `public` tables, all default privileges on sequences, and function execution are revoked from `anon`, `authenticated`, and `service_role`. PostgreSQL combines global and per-schema function defaults, so global default `PUBLIC` execution is also revoked for functions created by that owner. Existing tables, sequences, functions, and their grants are not changed.

## Local verification

- The migration replay completed all 80 application migrations in an isolated temporary PostgreSQL 17 container and verified each API role lacks `SELECT`, `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER`, and `MAINTAIN` on a newly created table; `USAGE`, `SELECT`, and `UPDATE` on a new sequence; and `EXECUTE` on a new function.
- The already-running local Supabase database was not reset. Its migration history includes this migration; after the full-table revoke was strengthened, the migration statements were re-applied idempotently and a transaction-scoped probe verified the same privilege set before rolling back its temporary objects.
- `npx --no-install supabase db lint --local --level error --fail-on error` passed with no schema errors.
- In the same work cycle, the 1,281-test unit suite, lint, Supabase function checks, and production build passed. They do not prove production grants or production data-plane behavior.

## Production boundary

The ignored local Supabase CLI credential was used without displaying or copying its value. A linked read-only database query then succeeded as `postgres`, and the dry-run showed only this migration pending. The migration was applied to the linked production project with `--skip-vault`; Vault secrets were not changed. `supabase migration list --linked` and the capability audit confirmed 80 local / 80 remote migration versions.

A post-apply query of the relevant default ACLs showed only owner grants for `postgres` on public table, sequence, and function defaults. This verifies the migration's default-privilege effect; it does not prove the complete grants, membership, or row-level behavior matrix for existing objects. See [`20260924-production-capability-audit.md`](20260924-production-capability-audit.md) for the broader read-only audit and remaining gates. No customer data or existing object grants were changed by this migration.
