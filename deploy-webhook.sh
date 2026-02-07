#!/bin/bash

# Script to deploy the Stripe webhook to Supabase

echo "Deploying Stripe webhook to Supabase..."

# Navigate to the project root
cd "$(dirname "$0")"

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "Error: Supabase CLI is not installed. Please install it first."
    echo "Visit https://supabase.com/docs/guides/cli for installation instructions."
    exit 1
fi

# Deploy the webhook function
echo "Deploying stripe-webhook function..."
supabase functions deploy stripe-webhook --no-verify-jwt

# Set environment variables for the function
echo "Setting environment variables..."
# Extract values from .env file
STRIPE_SECRET_KEY_VALUE=$(grep STRIPE_SECRET_KEY .env | cut -d '=' -f2-)
# Check if STRIPE_WEBHOOK_SECRET is set in .env
STRIPE_WEBHOOK_SECRET_LINE=$(grep STRIPE_WEBHOOK_SECRET .env)
if [[ "$STRIPE_WEBHOOK_SECRET_LINE" == *"="* && ! "$STRIPE_WEBHOOK_SECRET_LINE" == *"=whsec_your-webhook-secret"* && ! "$STRIPE_WEBHOOK_SECRET_LINE" == *"# Note:"* ]]; then
    STRIPE_WEBHOOK_SECRET_VALUE=$(echo "$STRIPE_WEBHOOK_SECRET_LINE" | cut -d '=' -f2-)
else
    STRIPE_WEBHOOK_SECRET_VALUE=""
fi
SUPABASE_URL_VALUE=$(grep VITE_SUPABASE_URL .env | cut -d '=' -f2-)
SUPABASE_SERVICE_ROLE_KEY_VALUE=$(grep SUPABASE_SERVICE_ROLE_KEY .env | cut -d '=' -f2-)

# Set secrets individually with explicit values
echo "Setting STRIPE_SECRET_KEY..."
supabase secrets set STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY_VALUE"

echo "Setting STRIPE_WEBHOOK_SECRET..."
if [[ -n "$STRIPE_WEBHOOK_SECRET_VALUE" ]]; then
    supabase secrets set STRIPE_WEBHOOK_SECRET="$STRIPE_WEBHOOK_SECRET_VALUE"
    echo "STRIPE_WEBHOOK_SECRET set from .env file"
else
    echo "STRIPE_WEBHOOK_SECRET not found in .env file or has an invalid value."
    echo "You will need to set it manually after getting the webhook secret from Stripe:"
    echo "supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret"
fi

echo "Setting API_URL (instead of SUPABASE_URL)..."
supabase secrets set API_URL="$SUPABASE_URL_VALUE"

echo "Setting SERVICE_ROLE_KEY (instead of SUPABASE_SERVICE_ROLE_KEY)..."
supabase secrets set SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY_VALUE"

echo "Setting NODE_ENV..."
supabase secrets set NODE_ENV="production"

echo "Deployment complete!"
WEBHOOK_URL=$(supabase functions url stripe-webhook)
echo "Your webhook URL is: $WEBHOOK_URL"
echo ""
echo "Next steps:"
echo "1. Copy this URL and set it in your Stripe dashboard"
echo "2. Go to Stripe Dashboard > Developers > Webhooks"
echo "3. Click 'Add endpoint' and paste the URL"
echo "4. Add the following events to listen for:"
echo "   - checkout.session.completed"
echo "   - customer.subscription.updated"
echo "   - customer.subscription.deleted"
echo "   - invoice.payment_succeeded"
echo "   - invoice.payment_failed"
echo "5. After creating the webhook in Stripe dashboard:"
echo "   a. Click on the newly created webhook endpoint"
echo "   b. Click 'Reveal' next to 'Signing secret'"
echo "   c. Copy the signing secret"
echo "   d. Run this command to set the secret in Supabase:"
echo "      supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret"
echo "   e. Update your .env file with the secret"
echo ""
echo "Done!"
