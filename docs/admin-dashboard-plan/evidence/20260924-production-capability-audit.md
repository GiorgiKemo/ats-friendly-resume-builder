# 2026-09-24 linked-production capability audit

This is a read-only snapshot of linked Supabase production metadata and a record of the separately reviewed default-ACL migration. It is not a complete authorization audit or a claim that the gated integrations are operational.

## Migration and default-ACL verification

- The locally ignored Supabase CLI credential was used transiently; its value was not printed, copied into repository files, or included in this evidence.
- A linked database query succeeded as `postgres`. The dry-run identified only `20260923204601_revoke_automatic_public_object_grants.sql` as pending.
- That single migration was applied with `npx --no-install supabase db push --linked --include-all --skip-vault --yes`. Vault secrets were skipped and not changed.
- `supabase migration list --linked` and the capability audit reported 80 local / 80 remote migrations.
- The post-apply default-ACL query found only owner grants for `postgres` in the inspected global/public function defaults and public table and sequence defaults. This is scoped to defaults for future objects created by that owner; it does not revoke existing-object grants or prove all current object access paths.

## Current capability snapshot

- 59 public tables; all 59 have RLS enabled; 29 public policies and 133 public functions.
- 29 local Edge Functions and 31 deployed; no local function was missing from production or reported inactive.
- One active owner membership and zero active admin/support memberships.
- `pg_cron`, `pg_net`, scheduler jobs, and recent scheduler runs were not available in the inspected metadata.
- Provider credential inventory was name/presence-only: Stripe, PayPal, and Brevo names are present. Missing worker-secret groups include billing reconciliation/actions, support notification/scanning, privacy, invitations, and Support AI. No secret values were read or changed by the audit.

## Authorization and advisor observations

- On the selected sensitive admin, billing, support, and user tables, the sampled grants showed no `anon` grant rows; `authenticated` had only `SELECT` on `users`; and the selected admin/support/billing tables had `service_role` grants. This is a targeted summary, not a full inventory of every table, view, sequence, function, Storage object, membership, or role inheritance path.
- Function privilege metadata showed zero functions executable by `anon`, 42 executable by `authenticated`, and 33 `SECURITY DEFINER` functions executable by `authenticated`. All 33 had an explicit fixed `search_path` in function configuration.
- A separate query counted 105 public `SECURITY DEFINER` functions: zero are executable by `anon`, 33 by `authenticated`, and none lack an explicit `search_path`. All have `public` in their pinned path, but `anon` and `authenticated` do not have `CREATE` on the `public` schema. These facts reduce the untrusted-object replacement risk; the caller/operation authorization review is still required.
- The Supabase security advisor returned 34 warning-level findings: 33 for authenticated execution of `SECURITY DEFINER` functions and one for Auth leaked-password protection being disabled. The findings were not treated as proof of exploitable defects. No blanket `EXECUTE` revoke was applied because these RPCs may be intentional application operations; they require a reviewed caller/role matrix. The `support_send_message_with_attachments` wrapper delegates to separately guarded message and attachment helpers.
- Auth leaked-password protection was not changed in this audit.

## Local role-boundary replay

- `npm run test:migration-replay` passed all 80 migrations on isolated PostgreSQL 17. Its checks include public `SECURITY DEFINER` grants/search paths; a synthetic active owner versus an ordinary customer for admin, support-operator, and knowledge-manager RPCs; own-versus-other-customer support conversation access; internal-note secrecy; and anon/authenticated denial for service-only guest RPCs.
- These are synthetic local database results, not managed Supabase Auth, Storage, or live production role/session tests. CI now runs the isolated replay on pushes and pull requests; the production matrix remains open.

## Remaining production gates

- Complete a production-safe role/session matrix for anonymous, ordinary customer, guest, support, billing, admin, owner, revoked, and stale-session cases across direct REST/RPC/Storage paths. RLS enablement and metadata counts alone do not prove row-level outcomes.
- Review every authenticated-callable `SECURITY DEFINER` RPC against its intended caller and authorization checks before changing execution grants.
- Configure and validate required worker credentials, scheduler identities/jobs, notification recipients, and operational alerts in an isolated staging environment.
- Complete provider sandbox/reconciliation checks, backup/restore and destructive-operation drills, and the remaining authenticated journeys before enabling gated workers or declaring the implementation plan complete.
