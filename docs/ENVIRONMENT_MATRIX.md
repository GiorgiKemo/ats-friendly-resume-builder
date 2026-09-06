# Environment Matrix

Use this file as the production contract for environment variables. Frontend `VITE_*`
values belong in Vercel. Provider secrets belong in Supabase Edge Function secrets.
The optional Vercel CSP-report API has a separate server-only configuration below;
never prefix any server secret with `VITE_`.

## Vercel

| Variable | Required | Scope |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Yes | Browser Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes | Browser-safe Supabase key |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Yes | Browser Stripe checkout |
| `VITE_STRIPE_SUCCESS_URL` | Yes | Checkout success redirect |
| `VITE_STRIPE_CANCEL_URL` | Yes | Checkout cancel redirect |
| `VITE_AI_PROVIDER` | Yes | Client provider selection |
| `VITE_APP_URL` | Yes | Public app origin |
| `VITE_DISABLE_SYSTEM_LOGGING` | No | Local troubleshooting only; keep `false` or unset in production |
| `CSP_REPORT_PERSISTENCE_ENABLED` | No; default disabled | Server-only. Only exact `true` enables CSP writes, after the admission/retention gate below |
| `SUPABASE_URL` | Only if CSP persistence is enabled | Vercel server API project URL; falls back to `VITE_SUPABASE_URL` |
| `SUPABASE_SERVICE_ROLE_KEY` | Only if CSP persistence is enabled | Vercel server-only privileged key; `SUPABASE_SECRET_KEY` or `SB_SECRET_KEY` are supported alternatives |

### CSP reporting admission gate

`/api/csp-report` returns 204 and discards reports by default, even if a server key
is present. A 204 response does not prove ingestion succeeded. Before enabling
persistence, the release owner must configure and test a distributed perimeter
request-rate/volume limit for this anonymous endpoint, approve log access and
retention, and verify the Vercel server-only variables in the intended environment.
The flag does not install a limiter; there is no per-process fallback advertised
as a distributed control. Keep it disabled if these controls are unavailable.

The handler checks at most 32 KiB of actual raw UTF-8 bytes or reserialized JSON
when Vercel has already parsed the body, accepts at most ten CSP reports per
request, strips URL credentials/query/fragment, and excludes script samples and
original policy text. Configure a platform wire-body limit as well: a parsed body
cannot reveal whitespace already discarded by the platform parser. Retained
URL paths and user agents can still contain personal data; sanitization is not
an anonymization or retention policy.

`deploy-env-to-vercel.sh` intentionally uploads only safe `VITE_*` and `NODE_ENV`
values. It skips the CSP flag and all server credentials; authorized operators
must configure any approved server-only exception separately. No environment
configuration or provider policy was enabled by the local audit.

## Supabase Edge Functions

| Variable | Required | Scope |
| --- | --- | --- |
| `SB_PUBLISHABLE_KEY` | Yes | Server-side user JWT verification |
| `SB_SECRET_KEY` | Yes | Service-role database work |
| `STRIPE_SECRET_KEY` | Yes | Checkout, portal, webhook verification |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook signature verification |
| `STRIPE_PRICE_PREMIUM_MONTHLY_LIVE` | Yes in live mode | Checkout price allowlist |
| `STRIPE_PRICE_PREMIUM_YEARLY_LIVE` | Yes in live mode | Checkout price allowlist |
| `STRIPE_PRICE_PREMIUM_MONTHLY_TEST` | Yes in test mode | Checkout price allowlist |
| `STRIPE_PRICE_PREMIUM_YEARLY_TEST` | Yes in test mode | Checkout price allowlist |
| `OPENROUTER_API_KEY` | Yes | Primary AI provider |
| `OPENROUTER_MODEL` | Yes | Primary AI model |
| `GROQ_API_KEY` | Yes for fallback | Fallback AI provider |
| `GROQ_MODEL` | Yes for fallback | Fallback AI model |
| `BREVO_API_KEY` | Yes | Transactional email and contact sync |
| `BREVO_WEBHOOK_SECRET` | Yes | Brevo transactional webhook bearer auth |
| `INBOUND_WEBHOOK_SECRET` | Yes | Brevo inbound webhook bearer auth |
| `BREVO_SMTP_USER` | Yes | Supabase Auth SMTP |
| `BREVO_SMTP_PASSWORD` | Yes | Supabase Auth SMTP |
| `SMTP_ADMIN_EMAIL` | Yes | Supabase Auth SMTP sender |
| `GOOGLE_CLIENT_ID` | Yes for Gmail | Gmail OAuth |
| `GOOGLE_CLIENT_SECRET` | Yes for Gmail | Gmail OAuth |
| `GMAIL_OAUTH_STATE_SECRET` | Recommended | Signed Gmail OAuth state |
| `CORS_ORIGIN_PROD` | Recommended | Canonical production browser origin |
| `CORS_ADDITIONAL_ORIGINS` | Optional | Comma-separated deploy preview/alias origins |
| `BRIGHT_DATA_API_TOKEN` | Optional | LinkedIn job discovery |
| `JSEARCH_API_KEY` | Optional | Secondary job discovery |

## Validation

Run these before production release:

```bash
npm ci
npm run lint
npm test
npm audit --omit=dev
npm run check:supabase:functions
npm run build
npm run test:website:smoke
```

For Supabase deployment:

```bash
npm run deploy:supabase:db
npm run deploy:supabase:functions
supabase migration list --linked
supabase functions list
```
