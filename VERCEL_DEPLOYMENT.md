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

## Deployment Scripts

We've provided two scripts to simplify the deployment process:

### 1. `deploy-env-to-vercel.sh`

This script reads your `.env` file and deploys only the appropriate environment variables to Vercel's production environment.

**Variables that will be deployed**:
- Frontend variables (prefixed with `VITE_`)
- Build variables (`NODE_ENV`)

**Variables that will be skipped**:
- Backend-only variables (like `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, etc.)

```bash
./deploy-env-to-vercel.sh
```

> **Note**: Backend-only variables should be configured in Supabase Edge Functions, not in Vercel.

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
   # For each variable in your .env file
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

For backend-only variables (those not deployed to Vercel), you need to configure them in Supabase Edge Functions:

1. Navigate to your Supabase project dashboard
2. Go to Settings > API
3. Under "Edge Functions", add the following environment variables:
   - `STRIPE_SECRET_KEY`
   - `STRIPE_WEBHOOK_SECRET`
   - `OPENAI_API_KEY` (if needed for backend operations)

You can set these variables using the Supabase CLI:

```bash
supabase secrets set STRIPE_SECRET_KEY=your_stripe_secret_key
supabase secrets set STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret
```

These variables will be available to your Edge Functions but won't be exposed to the frontend.

## Troubleshooting

If you encounter any issues during deployment:

1. Check the Vercel deployment logs in the dashboard
2. Verify that all environment variables are correctly set
3. Ensure your Supabase database is properly configured with the schema.sql file
4. Test the Stripe webhook endpoint to ensure it's working correctly

For more detailed information, refer to the [Vercel documentation](https://vercel.com/docs) and [Supabase documentation](https://supabase.io/docs).
