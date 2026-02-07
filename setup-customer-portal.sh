#!/bin/bash

# Script to set up Stripe customer portal for ATS-Friendly Resume Builder

# Check if Stripe CLI is installed
if ! command -v stripe &> /dev/null; then
  echo "Error: Stripe CLI is not installed."
  echo "Please install it from: https://stripe.com/docs/stripe-cli"
  exit 1
fi

# Get your website URL
read -p "Enter your website URL (e.g., https://your-domain.com): " WEBSITE_URL

# Validate URL format
if [[ ! $WEBSITE_URL =~ ^https?:// ]]; then
  echo "Error: URL must start with http:// or https://"
  exit 1
fi

# Log in to Stripe
echo "Logging in to Stripe..."
stripe login

# Configure customer portal
echo "Configuring customer portal..."
stripe customer_portal configurations create \
  --business_profile[headline]="Manage your subscription" \
  --business_profile[privacy_policy_url]="${WEBSITE_URL}/privacy" \
  --business_profile[terms_of_service_url]="${WEBSITE_URL}/terms" \
  --features[customer_update][enabled]=true \
  --features[subscription_cancel][enabled]=true \
  --features[subscription_update][enabled]=true \
  --default_return_url="${WEBSITE_URL}/account"

echo "Customer portal configured successfully!"
echo ""
echo "Next steps:"
echo "1. Create a button in your account page to redirect users to the portal"
echo "2. Implement the create-portal-session Edge Function in Supabase"
echo "3. Test the portal functionality with a test subscription"
