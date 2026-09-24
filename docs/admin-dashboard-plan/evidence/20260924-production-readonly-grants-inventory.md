# 2026-09-24 production read-only grants inventory

## Source and method

- Captured at approximately `2026-09-24T05:40:58Z` against production project `onuxzcectniowxqtmjpg`.
- Used the existing project-local Management API token from `.env.supabase.local`; the value was not printed, copied, or persisted elsewhere.
- Queried only PostgreSQL catalogs, policy metadata, view definitions, effective privilege predicates, role attributes, and the migration-history count. The endpoint reported `supabase_read_only_user` with `transaction_read_only = on`. No customer/business rows were selected, and no production object or setting was changed.
- The query path is Supabase's documented beta read-only Management API endpoint: [Read-only query reference](https://supabase.com/docs/reference/api/v1-read-only-query). All inspected database objects were schema-qualified.
- At `2026-09-24T05:42Z`, also used the documented read-only [Edge Function list endpoint](https://supabase.com/docs/reference/api/v1-list-all-functions). It returned deployment metadata only; no function body or secrets were retrieved.

## Observed production state

- Migration history contains 86 applied versions, from `20240601000000` through `20260924010401`.
- `public` contains 59 tables, all with RLS enabled, and three views. The public policy catalog contains 29 policies. All 59 tables and three views are owned by `postgres`.
- `storage` contains eight tables, all with RLS enabled, and five policies. Those tables are owned by `supabase_storage_admin`.
- Effective relation-level privilege predicates report API-role grants on six public relations for `anon`, 15 for `authenticated`, and 61 of 62 public relations for `service_role`. The six relations reached by `anon` include `application_analytics`, `auto_apply_stats`, `auto_apply_jobs`, `auto_apply_runs`, `job_applications`, and `job_preferences`; the latter four tables have RLS policies whose row predicates bind to `auth.uid() = user_id`.
- `application_analytics` and `auto_apply_stats` have `security_invoker=true`; both are built over the user-owned job-application/auto-apply tables. `user_resumes` is also a security-invoker view and has no `anon` SELECT privilege. These catalog facts support the intended RLS boundary but do not replace live request tests; no view rows were read.
- Production currently has 134 public functions, 106 `SECURITY DEFINER`; no such function is executable by `anon`, 33 are executable by `authenticated`, and all 33 have an explicit `search_path`. Function bodies and the direct caller/session authorization of every RPC remain to be reviewed.
- The Management API listed 31 deployed Edge Functions, all `ACTIVE`:

| Function | Version | `verify_jwt` |
| --- | ---: | :---: |
| `add-brevo-contact` | 25 | false |
| `admin-api` | 20 | false |
| `admin-invitation-email` | 1 | false |
| `analyze-keywords` | 35 | true |
| `auto-apply-run` | 36 | true |
| `billing-action-worker` | 1 | false |
| `billing-reconciliation` | 1 | false |
| `create-checkout-session` | 37 | false |
| `create-customer-portal-session` | 28 | false |
| `create-portal-session` | 37 | false |
| `email-webhook` | 21 | false |
| `gemini-proxy` | 30 | true |
| `gmail-auth` | 18 | false |
| `gmail-callback` | 18 | false |
| `gmail-disconnect` | 18 | false |
| `gmail-scan` | 20 | true |
| `groq-proxy` | 35 | true |
| `inbound-reply` | 21 | false |
| `openrouter-proxy` | 15 | true |
| `paypal-billing` | 5 | false |
| `paypal-webhook` | 3 | false |
| `privacy-deletion-worker` | 1 | false |
| `privacy-worker` | 1 | false |
| `public-engagement` | 10 | false |
| `report-client-error` | 16 | false |
| `support-ai-worker` | 1 | false |
| `support-api` | 2 | false |
| `support-attachment-scan` | 1 | false |
| `support-notification-worker` | 1 | false |
| `stripe-webhook` | 33 | false |
| `verify-checkout-session` | 36 | false |

`verify_jwt=false` is gateway configuration, not proof that handler authentication is absent or correct. Review the deployed custom bearer/webhook/worker guards separately before claiming those entry points secure.

At `2026-09-24T05:46Z`, a further read-only Storage catalog check found three configured buckets, all private:

| Bucket | Limit | Allowed MIME types |
| --- | ---: | --- |
| `privacy-exports` | 50 MiB | `application/json` |
| `resumes` | 10 MiB | unrestricted at bucket metadata level |
| `support-attachments` | 10 MiB | JPEG, PNG, PDF |

The five deployed `storage.objects` policies cover the `resumes` bucket only and enforce the user-ID folder boundary. There is no direct permissive `storage.objects` policy for `support-attachments`; the local `support-api` source uses its service client for signed upload URLs and five-minute signed downloads, consistent with the service-mediated design. The bucket row and policy metadata were read; no object listing or object contents were accessed. Local Storage HTTP behavior is covered below; production Storage behavior and deployed function-body/source parity remain unverified.
- The `postgres` default grants for new `public` application objects remain revoked as recorded by the earlier migration evidence. The full default-ACL inventory also shows separate broad `anon`/`authenticated`/`service_role` defaults owned by `supabase_admin` for `public` tables, sequences, and functions, plus PostgreSQL defaults in `storage`. Current `public` relations are owned by `postgres`, and current Storage tables by `supabase_storage_admin`; this audit did not establish that application migrations create relations as `supabase_admin` or modify its platform defaults. No default privileges were changed.
- A follow-up read-only query at approximately `2026-09-24T05:58Z` confirmed PostgreSQL `17.6`, effective query role `supabase_read_only_user`, and `transaction_read_only=on`. `supabase_admin` is a superuser with broad role-specific defaults, but PostgreSQL reports that `postgres` is not a member of it, does not inherit its privileges, and cannot `SET ROLE` to it. The same query found 59 public tables, three public views, one public sequence, and all 134 public functions owned by `postgres`; a source scan found no explicit `SET ROLE supabase_admin` in application migrations. Per PostgreSQL's [ALTER DEFAULT PRIVILEGES rules](https://www.postgresql.org/docs/16/sql-alterdefaultprivileges.html), new object ACLs use defaults for the role actually creating the object and are not inherited from membership roles. Therefore the `supabase_admin` entries are a conditional future risk if the migration actor changes, not evidence that current `postgres`-owned application objects inherit those grants. No platform ACL or object was changed. Recheck the migration actor and resulting object owners during any staged release.

## Local comparison and limits

- The already-running local Supabase catalog has the same `supabase_admin` defaults on `public` and PostgreSQL defaults on `storage`; it has ten Storage tables, versus eight in production. The shared local database was queried only and was not reset or changed.
- `npm run test:migration-replay` passed all 87 local migrations on a disposable PostgreSQL 17 container. Synthetic Storage fixtures verified that two authenticated users see only their own `resumes/{user_id}/...` rows, an owner can insert only into their own folder, cross-user inserts and folder moves fail, anonymous reads return no objects, and authenticated direct inserts/reads for `support-attachments` are denied. The test also asserted that `support-attachments` is private with a 10 MiB limit and JPEG/PNG/PDF allowlist, and that `privacy-exports` is private with a 50 MiB limit and JSON-only allowlist. This exercises PostgreSQL policy behavior against synthetic rows, not the managed Storage HTTP API, signed-upload token flow, deployed Edge Function behavior, or production objects. Supabase's [Storage Access Control guide](https://supabase.com/docs/guides/storage/security/access-control) likewise describes direct Storage operations as governed by explicit `storage.objects` RLS policies.
- `npm run test:storage:http` passed against the loopback local Supabase stack and local `support-api`: private bucket metadata; authenticated own-resume upload/download; customer and guest signed support upload; wrong-path signed-token rejection; other-customer and wrong-guest denial; finalization into quarantine; declared/actual size mismatch blocked as `metadata_mismatch`; oversized prepare rejected before a token is issued; and anonymous/uploader direct support-object reads denied. The test exposed an outer-catch bug that returned HTTP 400 for helper failures; the handler now uses its sanitized 401/404/422 mapping, and a fresh run verified wrong-guest `401`, cross-customer `404`, and oversized-prepare `422`. Cleanup removed the synthetic Auth users, conversations, guest session, and stored objects. This is local HTTP evidence only; scanner verdicts, clean-file downloads, production Storage, and deployed function parity remain unverified.
- A fresh replay asserts its effective creator is `postgres` and that application-created public relations and non-extension functions are owned by `postgres`, catching accidental migration-owner drift in the disposable test chain. It excludes only PostgreSQL-recorded extension-member functions (`pg_depend.deptype = 'e'`), which retain their platform owner. The full 89-migration replay passed; exact environment, checks, and limits are documented in [`20260924-local-migration-replay.md`](20260924-local-migration-replay.md). This local invariant is not a replacement for checking the actor and object owners on a staged/live release.
- This remains a catalog/ACL snapshot, not a complete production authorization test. Effective SQL privileges do not prove production row outcomes, Storage object isolation, JWT freshness, revoked-session behavior, or the application/API layer's role checks. Function listing proves deployed name/version/status/configuration, not source parity or runtime authorization.
- E00 remains open for direct REST/RPC/Storage tests across anonymous, ordinary customer, guest, support, billing, admin, owner, revoked, and stale-session contexts. That matrix requires isolated test identities/staging so no customer records are inspected. The `supabase_admin` ACL is now bounded to objects actually created under that role; verify that the migration actor and object owners remain `postgres` during staged releases, and do not modify platform defaults based on catalog metadata alone.
