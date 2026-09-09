# Billing reconciliation contract

`billing-reconciliation` is an internal, bounded worker. It is not a browser endpoint and does not accept a Supabase user JWT.

## Invocation

- `POST` only, with `x-billing-reconciliation-secret` matching the server-only `BILLING_RECONCILIATION_SECRET`.
- Optional JSON body: `{ "provider": "stripe" | "paypal" | "all", "limit": 1..25 }`.
- `STRIPE_SECRET_KEY`, PayPal client credentials, and the Supabase service key stay in the Edge Function environment.
- A scheduler should invoke it at a bounded interval and alert on a failed run or a growing failed count. Scheduler configuration is deployment work, not implied by this source file.

## Safety contract

1. The worker claims one provider/environment lease through a service-only database row. A second worker receives `busy` and does not process the same provider concurrently.
2. Stripe subscription ownership must match the stored Stripe customer ID. PayPal ownership is rechecked by the existing checkout mapping and provider custom ID.
3. Provider retrieval errors, timeouts, missing ownership, missing periods, and projection failures count as failed observations. They never revoke local access.
4. A successful observation reuses the existing entitlement reconciler and quota synchronization. It does not insert a fake payment or emit a client-originated purchase event.
5. A run records processed and failed counts. Failed observations remain retryable on the next run; no failed run is presented as fresh provider state.
6. Batch size, lease duration, request size, and provider work are bounded. Secrets, full provider payloads, and customer content are not logged.

The admin subscriptions view shows the latest run records separately from webhook receipts and subscription/transaction projections. Missing schema or missing worker configuration is rendered as unavailable rather than zero or healthy.
