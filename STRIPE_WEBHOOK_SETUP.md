# Stripe Webhook Setup Guide

This guide will help you set up and configure the Stripe webhook for your ATS-Friendly Resume Builder application.

## What is a Stripe Webhook?

Stripe webhooks allow your application to receive notifications about events that happen in your Stripe account, such as:
- When a customer completes a checkout session
- When a subscription is created, updated, or canceled
- When a payment succeeds or fails

## Prerequisites

1. A Stripe account with API keys
2. Supabase CLI installed on your machine
3. Your `.env` file configured with Stripe keys

## Step 1: Deploy the Webhook Function

We've created a script to make deployment easy:

```bash
# Make the script executable (if not already)
chmod +x deploy-webhook.sh

# Run the deployment scriptt
./deploy-webhook.sh
```

This script will:
1. Deploy the webhook function to Supabase
2. Set the necessary environment variables
3. Output the webhook URL

## Step 2: Configure Stripe Dashboard

1. Go to the [Stripe Dashboard](https://dashboard.stripe.com/)
2. Navigate to **Developers > Webhooks**
3. Click **Add endpoint**
4. Paste the webhook URL from the deployment script
5. Add the following events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
6. Click **Add endpoint**

## Step 3: Get the Webhook Secret

After creating the webhook endpoint in Stripe:

1. Click on the newly created webhook endpoint
2. Click **Reveal** next to "Signing secret"
3. Copy the signing secret
4. Update your `.env` file with this secret:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
   ```
5. Update the secret in Supabase:
   ```bash
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret
   ```

## Step 4: Test the Webhook

1. In the Stripe Dashboard, go to your webhook endpoint
2. Click **Send test webhook**
3. Select an event type (e.g., `checkout.session.completed`)
4. Click **Send test webhook**
5. Check the Supabase logs to verify the webhook was received:
   ```bash
   supabase functions logs stripe-webhook
   ```

## Webhook Events Handled

The webhook handler processes the following events:

1. `checkout.session.completed`: When a customer completes a checkout session
   - Updates the user's premium status
   - Sets the subscription end date
   - Updates AI generation limits

2. `customer.subscription.updated`: When a subscription is updated
   - Updates premium status based on subscription status
   - Updates subscription end date
   - Resets AI generation counters if specified

3. `customer.subscription.deleted`: When a subscription is canceled
   - Sets the user's premium status to false
   - Records when the premium status was updated

4. `invoice.payment_succeeded`: When a payment succeeds
   - Confirms the user's premium status
   - Updates the subscription end date

5. `invoice.payment_failed`: When a payment fails
   - Logs the failure (subscription status will be updated later if payment continues to fail)

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

3. **Test with Stripe CLI**:
   ```bash
   stripe listen --forward-to your-webhook-url
   ```

4. **Check Stripe Dashboard**:
   - Go to Developers > Webhooks
   - Look at the "Recent events" section for any failed webhook attempts

## Security Considerations

- The webhook secret is used to verify that requests are coming from Stripe
- The webhook function uses the Supabase service role key to update user data
- Make sure your environment variables are kept secure

## Next Steps

After setting up the webhook, you should:

1. Create products and prices in Stripe
2. Implement the checkout flow in your application
3. Test the subscription lifecycle (create, update, cancel)
4. Monitor webhook events in production
