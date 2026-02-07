# Manual Stripe Webhook Setup Guide

Since we can't use Docker for local development, follow these steps to manually set up your Stripe webhook:

## Step 1: Deploy the Function via Supabase Dashboard

1. Go to the [Supabase dashboard](https://app.supabase.com)
2. Select your project "ATS-FRIENDLY-RESUME-BUILDER"
3. Go to "Edge Functions" in the sidebar
4. Click "Create a new function"
5. Name it "stripe-webhook"
6. Uncheck "JWT verification" (since Stripe webhooks don't use JWT)
7. Copy and paste the code from `supabase/functions/stripe-webhook/index.ts` into the editor
8. Click "Deploy"

## Step 2: Set Environment Variables

The following environment variables have already been set:
- STRIPE_SECRET_KEY
- API_URL (Supabase URL)
- SERVICE_ROLE_KEY
- NODE_ENV

## Step 3: Configure Stripe Dashboard

1. Go to the [Stripe Dashboard](https://dashboard.stripe.com/)
2. Navigate to **Developers > Webhooks**
3. Click **Add endpoint**
4. Enter the webhook URL: `https://[YOUR-PROJECT-REF].supabase.co/functions/v1/stripe-webhook`
5. Add the following events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
6. Click **Add endpoint**

## Step 4: Get the Webhook Secret

After creating the webhook endpoint in Stripe:

1. Click on the newly created webhook endpoint
2. Click **Reveal** next to "Signing secret"
3. Copy the signing secret
4. Run this command to set the secret in Supabase:
   ```bash
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
   ```
5. Update your `.env` file with this secret:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
   ```

## Step 5: Test the Webhook

1. In the Stripe Dashboard, go to your webhook endpoint
2. Click **Send test webhook**
3. Select an event type (e.g., `checkout.session.completed`)
4. Click **Send test webhook**
5. Check the Supabase logs to verify the webhook was received:
   ```bash
   supabase functions logs stripe-webhook
   ```

## Troubleshooting

If you encounter issues with the webhook:

1. **Check Supabase logs**:
   ```bash
   supabase functions logs stripe-webhook
   ```

2. **Verify environment variables**:
   ```bash
   supabase secrets list
   ```

3. **Check Stripe Dashboard**:
   - Go to Developers > Webhooks
   - Look at the "Recent events" section for any failed webhook attempts
