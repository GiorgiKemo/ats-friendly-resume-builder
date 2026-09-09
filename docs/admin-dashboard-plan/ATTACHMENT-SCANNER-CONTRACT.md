# Support attachment scanner contract

The support attachment worker is deliberately fail-closed. Upload finalization only moves an object to `quarantined`; the customer cannot download it until a configured scanner returns a clean verdict.

## Worker configuration

Configure these as server-side Supabase Edge Function secrets. None belongs in the Vite environment or browser bundle:

- `SUPPORT_ATTACHMENT_SCANNER_SECRET` — secret required by the internal worker invocation header.
- `ATTACHMENT_SCANNER_URL` — HTTPS endpoint for the malware scanner.
- `ATTACHMENT_SCANNER_TOKEN` — scanner credential.

The `support-attachment-scan` function is configured without Supabase JWT verification because it uses the separate internal header secret. The scheduler or private operator must call it over HTTPS with `POST` and an optional JSON body such as `{"limit":10}`.

## Scanner request and response

For each leased object the worker sends the exact uploaded bytes as the request body:

- `Content-Type`: the allowlisted declared MIME (`image/jpeg`, `image/png`, or `application/pdf`)
- `Authorization`: `Bearer ATTACHMENT_SCANNER_TOKEN`
- `X-Attachment-Id`, `X-Attachment-Name`, `X-Attachment-Mime`: bounded operational metadata

The scanner must return a successful JSON response with a boolean `clean` field. An optional short `code` is retained as a sanitized scan code. `clean: false`, an invalid response, an HTTP error, a timeout, a storage failure, a size mismatch, or a magic-byte mismatch never grants access. Transient failures are retried through the database lease; after five attempts the attachment becomes `failed` and remains unavailable.

## Database and scheduling boundary

The worker claims rows with a service-only `FOR UPDATE SKIP LOCKED` RPC and a five-minute lease. Only the worker that owns the current lease can persist a verdict. The migration and function still require application to the intended Supabase project, a real scanner provider, and a scheduled invocation before this is a live security control.
