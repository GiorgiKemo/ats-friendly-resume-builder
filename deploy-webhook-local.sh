#!/bin/bash

# Script to deploy the Stripe webhook to Supabase (for local use)

echo "Deploying Stripe webhook to Supabase..."

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "Error: Supabase CLI is not installed. Please install it first."
    echo "Visit https://supabase.com/docs/guides/cli for installation instructions."
    exit 1
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "Error: Docker is not running. Please start Docker Desktop."
    exit 1
fi

# Check if logged in to Supabase
if ! supabase projects list > /dev/null 2>&1; then
    echo "Error: Not logged in to Supabase. Please run 'supabase login' first."
    exit 1
fi

# Deploy the webhook function
echo "Deploying stripe-webhook function..."
supabase functions deploy stripe-webhook --no-verify-jwt

# Set environment variables for the function
echo "Setting environment variables..."
# Extract values from .env file
STRIPE_SECRET_KEY_VALUE=$(grep STRIPE_SECRET_KEY .env | cut -d '=' -f2-)
STRIPE_WEBHOOK_SECRET_VALUE=$(grep STRIPE_WEBHOOK_SECRET .env | cut -d '=' -f2-)
SUPABASE_URL_VALUE=$(grep VITE_SUPABASE_URL .env | cut -d '=' -f2-)
SUPABASE_SERVICE_ROLE_KEY_VALUE=$(grep SUPABASE_SERVICE_ROLE_KEY .env | cut -d '=' -f2-)

# Set secrets individually with explicit values
echo "Setting STRIPE_SECRET_KEY..."
supabase secrets set STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY_VALUE"

echo "Setting STRIPE_WEBHOOK_SECRET..."
supabase secrets set STRIPE_WEBHOOK_SECRET="$STRIPE_WEBHOOK_SECRET_VALUE"

echo "Setting API_URL (instead of SUPABASE_URL)..."
supabase secrets set API_URL="$SUPABASE_URL_VALUE"

echo "Setting SERVICE_ROLE_KEY (instead of SUPABASE_SERVICE_ROLE_KEY)..."
supabase secrets set SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY_VALUE"

echo "Setting NODE_ENV..."
supabase secrets set NODE_ENV="production"

# Get the webhook URL
WEBHOOK_URL=$(supabase functions url stripe-webhook)

echo "Deployment complete!"
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
echo ""
echo "Done!"
