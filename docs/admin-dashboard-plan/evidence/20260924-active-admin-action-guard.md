# Active administrator ban/deletion guard — 2026-09-24

## Local change

- The admin API now refuses an account-ban request or deletion request while the target has an active `admin_members` row. Owners must use the separate, audited team-revocation flow first.
- The lookup fails closed on database errors. The deletion transaction already independently rejects an active admin membership immediately before deleting customer data.
- This removes the previous ban-route read-then-count behavior, which could permit simultaneous bans of multiple active owners. Owner revocation and role-demotion transactions share a database advisory lock.

## Verification

- `node --test tests/backendBoundaries.test.js tests/securityHardening.test.js` — passed 79/79, including active-admin rejection for ban and deletion requests and fail-closed behavior when membership lookup fails.
- `npm test` — passed 1,292/1,292.
- `npm run check:supabase:functions` — passed for all local Edge Functions.
- `npm run lint` — passed.
- `npm run test:migration-replay` — all 85 migrations passed in a new disposable PostgreSQL 17 container. Two concurrent reciprocal owner revocations and two concurrent reciprocal owner demotions each produced one successful mutation, one denied mutation, exactly one surviving active owner, and exactly one corresponding audit receipt. The privacy deletion RPC rejected an active support-member target, then succeeded after the separate audited revoke. The disposable container was stopped and removed; the local Supabase database was untouched.
- No schema change was needed. The admin API change is local and uncommitted; no production function, database, Auth setting, or customer data was changed.

## Remaining gate

The E02/A02 local database concurrency and deletion guards now have isolated PostgreSQL evidence, and the Edge Function denial path has executable unit tests. The gate remains open for an authenticated staging owner/session matrix, hosted Auth behavior, and production rollout. Deploy compatible database/session guards before the corresponding function/client release.
