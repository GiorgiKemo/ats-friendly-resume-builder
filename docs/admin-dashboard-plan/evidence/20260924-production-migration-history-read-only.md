# Read-only production migration history — 2026-09-24

## Method

- Queried project `onuxzcectniowxqtmjpg` through the Supabase Management API's read-only SQL endpoint at `POST /v1/projects/{ref}/database/query/read-only`.
- The query selected only migration version identifiers from `supabase_migrations.schema_migrations`, ordered by version. The credential was read from an existing local environment into process memory and was not printed, copied, or persisted by this check.
- No migration, project setting, function, secret, or customer data was changed.

## Result

- Production migration history returned 80 applied versions.
- The local checkout contains 86 migration files: six are local-only and zero production versions are missing locally.
- Local-only versions: `20260923220527`, `20260923223745`, `20260923232233`, `20260923232407`, `20260923233340`, and `20260924010401`.

## Interpretation

This verifies the production migration-history table, not full production schema parity or authenticated behavior across Auth, REST, RPC, Storage, Edge Functions, and provider integrations. The six local-only migrations remain unapplied. This read-only check is not deployment authorization.
