# Support notification contract

Agent replies create a separate `email` delivery-outbox row through a database trigger. The customer-facing message is persisted first; email is an asynchronous best-effort follow-up and never replaces the in-app transcript.

## Server-only configuration

- `SUPPORT_NOTIFICATION_SECRET` — internal worker invocation secret.
- `BREVO_API_KEY` — transactional email credential.
- `SUPPORT_EMAIL_FROM` — verified sender address.
- `SUPPORT_EMAIL_FROM_NAME` — bounded display name.

The `support-notification-worker` function accepts `POST` with `x-support-notification-secret` and an optional batch limit. It leases only authenticated customer recipients with a valid account email. Guest conversations without a verified recipient remain in-app and do not create an email delivery attempt.

Each send is bounded, validates the recipient, strips newlines from the subject, escapes the HTML body, and records `sent` only after Brevo returns success. The outbox UUID is sent as Brevo's `Idempotency-Key` and as the message header so an immediate retry has a stable provider key. Brevo's idempotency window is provider-controlled and finite, so the database outbox remains at-least-once and the in-app transcript remains authoritative; a provider retry after that window can still require reconciliation. Errors release the lease for up to five attempts and then move the row to `dead_letter`; the worker never logs the recipient, body, provider credential, or provider response body.
