#!/bin/bash

# Script to set up Stripe for ATS-Friendly Resume Builder
# This script will:
# 1. Log in to Stripe
# 2. Create products and prices
# 3. Set up webhooks
# 4. Configure the customer portal

# Check if Stripe CLI is installed
if ! command -v stripe &> /dev/null; then
  echo "Error: Stripe CLI is not installed."
  echo "Please install it from: https://stripe.com/docs/stripe-cli"
  exit 1
fi

# Function to confirm actions
confirm() {
  read -p "$1 (y/n): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    return 1
  fi
  return 0
}

# Step 1: Log in to Stripe
echo "Logging in to Stripe..."
stripe login

# Step 2: Create products and pricess
if confirm "Do you want to create Stripe products and prices?"; then
  echo "Creating Premium subscription product..."
  
  # Create Premium product
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
  
  # Save price IDs to a file for reference
  echo "STRIPE_MONTHLY_PRICE_ID=$MONTHLY_PRICE_ID" > stripe-config.txt
  echo "STRIPE_YEARLY_PRICE_ID=$YEARLY_PRICE_ID" >> stripe-config.txt
  
  echo "Price IDs saved to stripe-config.txt"
fi

# Step 3: Set up webhooks
if confirm "Do you want to set up Stripe webhooks?"; then
  # Get Supabase project URL
  read -p "Enter your Supabase project URL (e.g., https://icekxsrhxgjycebjyovs.supabase.co): " SUPABASE_URL
  
  # Create webhook endpoint
  echo "Creating webhook endpoint..."
  WEBHOOK_ENDPOINT="${SUPABASE_URL}/functions/v1/stripe-webhook"
  
  WEBHOOK_ID=$(stripe webhooks create \
    --endpoint=$WEBHOOK_ENDPOINT \
    --events="checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_failed" \
    --json | jq -r '.id')
  
  echo "Webhook created with ID: $WEBHOOK_ID"
  
  # Get webhook signing secret
  WEBHOOK_SECRET=$(stripe webhooks get $WEBHOOK_ID --json | jq -r '.secret')
  
  echo "Webhook signing secret: $WEBHOOK_SECRET"
  echo "STRIPE_WEBHOOK_SECRET=$WEBHOOK_SECRET" >> stripe-config.txt
  
  # Set webhook secret in Supabase
  if confirm "Do you want to set the webhook secret in Supabase?"; then
    echo "Setting webhook secret in Supabase..."
    supabase secrets set STRIPE_WEBHOOK_SECRET=$WEBHOOK_SECRET
  fi
fi

# Step 4: Configure customer portal
if confirm "Do you want to configure the Stripe customer portal?"; then
  echo "Configuring customer portal..."
  
  # Get your website URL
  read -p "Enter your website URL (e.g., https://your-domain.com): " WEBSITE_URL
  
  # Configure customer portal
  stripe customer_portal configurations create \
    --business_profile[headline]="Manage your subscription" \
    --business_profile[privacy_policy_url]="${WEBSITE_URL}/privacy" \
    --business_profile[terms_of_service_url]="${WEBSITE_URL}/terms" \
    --features[customer_update][enabled]=true \
    --features[subscription_cancel][enabled]=true \
    --features[subscription_update][enabled]=true \
    --default_return_url="${WEBSITE_URL}/account"
  
  echo "Customer portal configured successfully"
fi

# Step 5: Create a test webhook listener (for development)
if confirm "Do you want to start a webhook listener for testing?"; then
  echo "Starting webhook listener..."
  echo "This will forward events to your local webhook endpoint."
  echo "Press Ctrl+C to stop the listener when you're done testing."
  
  # Start webhook listener
  stripe listen --forward-to "${SUPABASE_URL}/functions/v1/stripe-webhook"
fi

echo "Stripe setup completed!"
echo "Price IDs and webhook secret are saved in stripe-config.txt"
echo ""
echo "Next steps:"
echo "1. Update your application code with the price IDs"
echo "2. Test the subscription flow in test mode"
echo "3. When ready for production, switch to live mode in the Stripe dashboard"
