# Privacy export worker contract

The `privacy-worker` Edge Function processes only export jobs and export expiry cleanup. It does not delete Auth users, cancel billing, or mark deletion jobs complete. Those destructive steps remain a separate reviewed workflow.

## Server-only configuration

- `PRIVACY_WORKER_SECRET` — internal invocation secret.
- The function's `SUPABASE_URL` and service-role secret are supplied by the hosted Edge Function runtime; the service-role secret must never enter the Vite environment or browser bundle.

The request is `POST` with `x-privacy-worker-secret` and an optional JSON `{"limit":3}` body. The worker claims jobs with a service-only leased RPC, gathers explicit user-owned fields, uploads a JSON export to the private `privacy-exports` bucket, and completes the job only after upload succeeds. It emits no signed URL itself; the authenticated admin API creates a five-minute URL only for a ready, unexpired job.

The export intentionally excludes Auth credentials, Gmail connection tokens, internal support notes, raw provider webhook payloads, and arbitrary table columns. A missing table, query failure, oversized export, storage error, or completion failure retries through the durable job state and never produces a ready result.

## Scheduling and expiry

Use a hosted scheduler/private invocation after the migration is applied. Supabase documents `pg_cron` plus `pg_net` and Vault-backed secrets for scheduled Edge Function calls. Configure that outside Git with the project URL, publishable key, and worker secret; do not add guessed production URLs or secrets to this repository. Run frequently enough to keep export leases and 48-hour export retention responsive.

Deletion jobs now have a durable owner-approval and provider-cancellation review boundary. A request is prepared first, then an owner must approve it; the claim RPC fails closed in `waiting_owner_approval` until that approval exists. When a request is queued, active Stripe/PayPal entitlement rows are snapshotted as required reviews; a request with no active external subscription records an explicit not-required review. The claim RPC then fails closed in `waiting_provider_cancellation` if a new active provider row appears, the entitlement has not reconciled inactive, or any required review lacks confirmed evidence. An owner/admin can record an external cancellation reference and note after completing the cancellation in the provider dashboard; this action is audited but does not call Stripe or PayPal.

Provider review evidence is not provider truth: webhook/reconciliation state still wins, and no review action is allowed to delete Auth data or erase accounting evidence. The separate `privacy-deletion-worker` now provides the fail-closed destructive execution boundary; it remains disabled until the hosted scheduler, secrets, provider reconciliation, and a disposable staging deletion drill are configured and verified. See `PRIVACY-DELETION-CONTRACT.md`.
