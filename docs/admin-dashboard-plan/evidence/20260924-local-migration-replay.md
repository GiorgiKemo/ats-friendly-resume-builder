# Local migration replay evidence — 2026-09-24

## Environment and result

- Result: `npm run test:migration-replay` passed all 89 local migrations in timestamp order, followed by the migration/RPC/role/security fixtures.
- Database: a disposable `public.ecr.aws/supabase/postgres:17.6.1.063` Docker container, published only on `127.0.0.1:55432`. The replay-created database and all synthetic data disappeared when the container was stopped (`--rm`). The running project Supabase database and production were not reset or changed.
- Credentials: a random password existed only in the temporary PowerShell process and container environment; no project or provider credential was used or recorded.
- The migration-replay script now requires an explicit `AUDIT_PG_PORT` and refuses the installed PostgreSQL default port `5432`; this prevents accidentally connecting to a host database when no isolated test port is configured.

## Assertions exercised

- All 89 migrations replay from the synthetic Supabase platform baseline. The run verifies role/grant defaults, RLS, Auth-session matching/expiry, private AAL2 predicates, support/customer/guest boundaries, owner concurrency/audit behavior, paid-conversion cohort math and quality gates, billing action fail-closed behavior, privacy deletion, and attachment Storage policies.
- The migration-owner check verifies application-created public relations and non-extension functions are owned by `postgres`. It excludes only functions PostgreSQL records as extension members (`pg_depend.deptype = 'e'`); installed `uuid-ossp`/`pgcrypto` extension functions in the Supabase image are expected to have their platform owner. See the [PostgreSQL 17 `pg_depend` documentation](https://www.postgresql.org/docs/17/catalog-pg-depend.html).
- The first owner-check attempt exposed this extension-member false positive; the scope was corrected without relaxing checks on application-created objects, and the full replay passed afterward.

## Limits

This is isolated PostgreSQL 17 evidence. It does not prove hosted Supabase Auth/Storage HTTP behavior, production role/session outcomes, deployed function-source parity, PostgreSQL 15 compatibility, or staging/backup recovery. Those gates remain open.
