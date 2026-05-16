# Environment Matrix

Use this file as the production contract for environment variables. Frontend `VITE_*`
values belong in Vercel. Backend secrets belong in Supabase Edge Function secrets.

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
| `SUPABASE_URL` | Yes | Vercel API handlers that persist CSP reports |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Vercel API handlers that persist CSP reports |

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
