# Support notification contract

Agent replies create a separate `email` delivery-outbox row through a database trigger. The customer-facing message is persisted first; email is an asynchronous best-effort follow-up and never replaces the in-app transcript.

## Provider delivery feedback

The worker includes the outbox UUID as Brevo's `X-Mailin-custom` header and persists Brevo's returned message ID when it completes the lease. The separate `support-delivery-webhook` endpoint requires the existing `BREVO_WEBHOOK_SECRET` as an `Authorization: Bearer` custom webhook header. Configure a Brevo transactional webhook to send `delivered`, `hardBounce`, `softBounce`, `blocked`, `invalid`, `deferred`, `spam`, and `unsubscribed` events to that endpoint. The webhook maps by the custom outbox UUID and verifies the provider message ID; it never tries to infer an owner from the recipient address.

Only an allowlisted event type, outbox UUID, provider message ID, and provider event timestamp are stored. Recipient email, subject, body, and provider bounce reason are discarded. Duplicate delivery callbacks are idempotent on `(outbox, event type, event time)`. Queue status `sent` continues to mean that Brevo accepted the send request; separate aggregate-only event counts indicate which recipient-delivery states Brevo actually reported. An empty event window means delivery status is unknown, not zero delivered. Until Brevo is configured with the custom header, secret, endpoint, and event subscriptions, provider delivery telemetry must be treated as unavailable.

This outbound delivery hook does not process inbound customer replies. Inbound threading requires a separately verified receiving subdomain/MX setup and its own spoof-resistant conversation binding; the current email footer must not imply those replies are ingested.

## Customer email preference

Authenticated customers can turn support-reply email notices off or on in the support widget. A missing preference defaults to enabled; the setting is tied to the verified account, not a client-supplied user ID. The in-app conversation remains available regardless of this setting. Opting out suppresses queued notices, and the worker checks both the current preference and current account email immediately before sending. A correlated provider unsubscribe disables future notices unless the customer made a newer explicit choice; replaying the same unsubscribe event does not reverse a later re-enable. Preference data and the aggregate suppressed count are service-role-only; the browser sees only its own boolean setting.

## Server-only configuration

- `SUPPORT_NOTIFICATION_SECRET` — internal worker invocation secret.
- `BREVO_API_KEY` — transactional email credential.
- `SUPPORT_EMAIL_FROM` — verified sender address.
- `SUPPORT_EMAIL_FROM_NAME` — bounded display name.

The `support-notification-worker` function accepts `POST` with `x-support-notification-secret` and an optional batch limit. It leases only authenticated customer recipients with a valid account email. Guest conversations without a verified recipient remain in-app and do not create an email delivery attempt.

Each send is bounded, validates the recipient, strips newlines from the subject, escapes the HTML body, and records `sent` only after Brevo returns success. The outbox UUID is sent as Brevo's `Idempotency-Key` and as the message header so an immediate retry has a stable provider key. Brevo's idempotency window is provider-controlled and finite, so the database outbox remains at-least-once and the in-app transcript remains authoritative; a provider retry after that window can still require reconciliation. Errors release the lease for up to five attempts and then move the row to `dead_letter`; the worker never logs the recipient, body, provider credential, or provider response body.
