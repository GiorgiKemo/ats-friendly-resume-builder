# Privacy deletion execution contract

The `privacy-deletion-worker` is the separate destructive execution boundary for an approved account-deletion request. It is not called by the browser or admin API.

## Required boundary

- A request must have owner approval, no active legal/accounting/security/support hold, no active Stripe/PayPal entitlement, and no unresolved provider-cancellation review.
- Active admin memberships fail closed. An owner must revoke administrator access separately before the account can be deleted.
- The worker uses a service-only leased claim with a unique worker ID and a bounded retry path.
- Storage objects are removed from the private `support-attachments`, `privacy-exports`, and `resumes` buckets before database data is removed.
- Application, automation, connection, profile, resume, application, and customer-support data are deleted explicitly. Accounting projections/transactions and audit/error aggregates are retained without the account link where their schemas permit it.
- Auth deletion is performed only after the database data step succeeds. A missing Auth user is treated as an idempotent already-completed Auth step; unknown lookup/delete errors are retryable failures.
- The job is marked `completed` only after Auth deletion is confirmed. A failed attempt remains visible with its current step and failure code.

## Worker configuration

- `PRIVACY_DELETION_WORKER_SECRET` — private scheduler/invocation secret.
- The function's Supabase URL and service-role secret are supplied only by the hosted Edge Function runtime.
- Configure a hosted scheduler/private invocation after migration and function deployment. Do not place the secret in Vite variables, Git, or browser code.

## Release gates

The migration, worker tests, local migration replay, and local schema lint are required before staging. Production still requires a disposable staging account drill, storage-object verification, Auth/session invalidation verification, provider-reconciliation evidence, scheduler retry/lease testing, and an independent approval for any real destructive run.
