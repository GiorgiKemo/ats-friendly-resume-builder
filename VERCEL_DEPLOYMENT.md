# Vercel Deployment Guide

This guide explains how to deploy your ATS-Friendly Resume Builder to Vercel using the provided deployment scripts.

## Prerequisites

1. Install the Vercel CLI:
   ```bash
   npm install -g vercel
   ```

2. Make sure you have a Vercel account and are logged in:
   ```bash
   vercel login
   ```

3. Ensure your `.env` file contains all the necessary environment variables for production.
   Use [the environment matrix](docs/ENVIRONMENT_MATRIX.md) as the source of truth.
   Browser-safe `VITE_*` values belong in Vercel; provider secrets belong in
   Supabase Edge Function secrets. The optional CSP API is a Vercel server-only
   exception, disabled by default and subject to the admission gate below.

## Deployment Scripts

We've provided two scripts to simplify the deployment process:

### 1. `deploy-env-to-vercel.sh`

This script reads your `.env` file and deploys only the appropriate environment variables to Vercel's production environment.

**Variables that will be deployed**:
- Frontend variables (prefixed with `VITE_`)
- Build variables (`NODE_ENV`)

**Variables that will be skipped**:
- Backend-only variables (like `SUPABASE_SECRET_KEY`, `STRIPE_SECRET_KEY`, etc.)
- The server-only CSP persistence opt-in (`CSP_REPORT_PERSISTENCE_ENABLED`)

```bash
./deploy-env-to-vercel.sh
```

> **Note**: The uploader does not configure any server-only variables. Configure
> provider secrets in Supabase. Only an approved CSP-report deployment needs a
> separate privileged Supabase key in the Vercel server runtime, never in `VITE_*`.

### Optional CSP report persistence

The CSP endpoint acknowledges and discards reports with HTTP 204 unless the
server-only `CSP_REPORT_PERSISTENCE_ENABLED` equals `true`. Before an operator
opts in, configure and test distributed ingress rate/volume and wire-body limits,
approve retention/log access, and follow the
[CSP admission gate](docs/ENVIRONMENT_MATRIX.md#csp-reporting-admission-gate).
The code does not install a distributed limiter. The endpoint's payload checks
and ten-report batch cap do not limit the number of incoming requests.

Only after that gate is met, the optional server API requires `SUPABASE_URL`
(or the existing public project URL) and a server-only
`SUPABASE_SERVICE_ROLE_KEY` (`SUPABASE_SECRET_KEY`/`SB_SECRET_KEY` alternatives
are supported). Configure these separately from the frontend uploader; do not
rename secrets to `VITE_*` to make the script upload them. Verify actual sanitized
ingestion and error monitoring in staging: HTTP 204 also covers disabled,
unconfigured, rejected and failed writes. Keep persistence disabled if the gate
cannot be verified. This guide does not assert that the deployed gate is met.

### 2. `deploy-to-vercel.sh`

This is a comprehensive deployment script that:
1. Deploys environment variables from your `.env` file
2. Builds the application
3. Deploys the application to Vercel production

```bash
./deploy-to-vercel.sh
```

The script will prompt you at each step, allowing you to skip any steps you don't want to perform.

## Manual Deployment

If you prefer to deploy manually, follow these steps:

1. Deploy environment variables:
   ```bash
   # For each approved variable in the environment matrix, in its correct scope
   vercel env add VARIABLE_NAME production
   ```

2. Build the application:
   ```bash
   npm run build
   ```

3. Deploy to Vercel:
   ```bash
   vercel --prod
   ```

## Post-Deployment Steps

After deploying to Vercel, you should:

1. Configure your custom domain in the Vercel dashboard
2. Set up Stripe webhooks to point to your Supabase Edge Function
3. Test all functionality in the production environment

### Setting Up Backend Environment Variables

For provider secrets used by Supabase Edge Functions (not the optional Vercel CSP
API exception), configure them in Supabase:

1. Navigate to your Supabase project dashboard
2. Go to Settings > API
3. Under "Edge Functions", add the following environment variables:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `OPENROUTER_API_KEY` or `GROQ_API_KEY`
   - `OPENROUTER_MODEL=openai/gpt-oss-120b` or `GROQ_MODEL=openai/gpt-oss-120b`

You can set these variables using the Supabase CLI:

```bash
supabase secrets set STRIPE_SECRET_KEY=your_stripe_secret_key
supabase secrets set STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
```

These variables will be available to your Edge Functions but won't be exposed to the frontend.

### Supabase Database and Edge Functions

Production databases must be created from migrations, not from a schema snapshot:

```bash
npm run deploy:supabase:db
supabase migration list --linked
```

Deploy all Edge Functions with the per-function JWT settings from `supabase/config.toml`:

```bash
npm run deploy:supabase:functions
```

## Troubleshooting

If you encounter any issues during deployment:

1. Check the Vercel deployment logs in the dashboard
2. Verify that all environment variables are correctly set
3. Ensure Supabase migrations have been pushed and `supabase migration list --linked` shows no drift
4. Test the Stripe webhook endpoint to ensure it's working correctly

For more detailed information, refer to the [Vercel documentation](https://vercel.com/docs) and [Supabase documentation](https://supabase.io/docs).
