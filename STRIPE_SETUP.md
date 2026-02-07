# Stripe Setup Guide

This guide explains how to set up Stripe for your ATS-Friendly Resume Builder using the CLI.

## Prerequisites

1. Stripe CLI installed and configured
2. Supabase CLI installed and configured
3. Your application deployed to Vercel
4. Your Supabase database set up with the schema.sql file

## Step 1: Deploy the Stripe Webhook Handler

The webhook handler is essential for processing Stripe events like successful payments and subscription updates.

```bash
# Deploy the webhook handler to Supabase
./deploy-webhook.sh
```

This script will:
- Deploy the stripe-webhook function to Supabase
- Set up the necessary environment variables from your .env file
- Provide you with the webhook URL to use in the Stripe dashboard

## Step 2: Set Up Stripe Products and Prices

Create your subscription products and prices in Stripe:

```bash
# Log in to Stripe
stripe login

# Create a product for Premium subscription
PRODUCT_ID=$(stripe products create \
  --name="Premium Plan" \
  --description="For serious job seekers with AI Resume Generator" \
  --active=true \
  --metadata="ai_generations_limit=30" \
  --json | jq -r '.id')

echo "Product created with ID: $PRODUCT_ID"

# Create monthly price
MONTHLY_PRICE_ID=$(stripe prices create \
  --product=$PRODUCT_ID \
  --unit-amount=999 \
  --currency=usd \
  --recurring[interval]=month \
  --nickname="Premium Monthly" \
  --json | jq -r '.id')

echo "Monthly price created with ID: $MONTHLY_PRICE_ID"

# Create yearly price
YEARLY_PRICE_ID=$(stripe prices create \
  --product=$PRODUCT_ID \
  --unit-amount=9999 \
  --currency=usd \
  --recurring[interval]=year \
  --nickname="Premium Yearly" \
  --json | jq -r '.id')

echo "Yearly price created with ID: $YEARLY_PRICE_ID"
```

Make note of the price IDs - you'll need to update these in your application code.

## Step 3: Configure Stripe Webhooks

Set up the webhook endpoint in Stripe to receive events:

```bash
# Get your Supabase webhook URL
WEBHOOK_URL=$(supabase functions url stripe-webhook)

# Create webhook endpoint
WEBHOOK_ID=$(stripe webhooks create \
  --endpoint=$WEBHOOK_URL \
  --events="checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_failed" \
  --json | jq -r '.id')

echo "Webhook created with ID: $WEBHOOK_ID"

# Get webhook signing secret
WEBHOOK_SECRET=$(stripe webhooks get $WEBHOOK_ID --json | jq -r '.secret')

echo "Webhook signing secret: $WEBHOOK_SECRET"

# Set webhook secret in Supabase
supabase secrets set STRIPE_WEBHOOK_SECRET=$WEBHOOK_SECRET
```

## Step 4: Configure Customer Portal (Optional)

If you want to allow users to manage their subscriptions:

```bash
# Configure customer portal
stripe customer_portal configurations create \
  --business_profile[headline]="Manage your subscription" \
  --business_profile[privacy_policy_url]="https://your-domain.com/privacy" \
  --business_profile[terms_of_service_url]="https://your-domain.com/terms" \
  --features[customer_update][enabled]=true \
  --features[subscription_cancel][enabled]=true \
  --features[subscription_update][enabled]=true \
  --default_return_url="https://your-domain.com/account"
```

## Step 5: Update Your Application Code

Update your application code with the Stripe price IDs:

1. Open `src/contexts/SubscriptionContext.jsx` (or similar file)
2. Update the price IDs with the ones you created:
   ```javascript
   const MONTHLY_PRICE_ID = 'price_your_monthly_price_id';
   const YEARLY_PRICE_ID = 'price_your_yearly_price_id';
   ```

## Step 6: Test the Payment Flow

Test the subscription process in test mode:

```bash
# Start webhook listener for testing
stripe listen --forward-to your-webhook-url

# In another terminal, trigger a test event
stripe trigger checkout.session.completed
```

Use Stripe's test card numbers for testing:
- `4242 4242 4242 4242` (successful payment)
- `4000 0000 0000 0002` (declined payment)

## Step 7: Move to Production

Once everything is tested and working:

1. Switch to Live Mode in the Stripe dashboard
2. Update your API keys in Supabase to use the live keys
3. Create a new webhook endpoint for your production environment
4. Update the webhook secret in your Supabase Edge Function

## Troubleshooting

If you encounter issues:

1. Check webhook logs:
   ```bash
   supabase functions logs stripe-webhook
   ```

2. Verify webhook events in Stripe dashboard:
   ```bash
   stripe events list
   ```

3. Test webhook delivery:
   ```bash
   stripe trigger checkout.session.completed
   ```

4. Check Supabase secrets:
   ```bash
   supabase secrets list
   ```
