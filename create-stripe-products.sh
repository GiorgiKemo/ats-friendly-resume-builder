#!/bin/bash

# Script to create Stripe products and prices for ATS-Friendly Resume Builder

# Check if Stripe CLI is installed
if ! command -v stripe &> /dev/null; then
  echo "Error: Stripe CLI is not installed."
  echo "Please install it from: https://stripe.com/docs/stripe-cli"
  exit 1
fi

# Check if jq is installed (needed for JSON parsing)
if ! command -v jq &> /dev/null; then
  echo "Error: jq is not installed."
  echo "Please install it with: sudo apt-get install jq"
  exit 1
fi

# Log in to Stripe
echo "Logging in to Stripe..."
stripe login

# Create Premium product
echo "Creating Premium subscription product..."
PRODUCT_ID=$(stripe products create \
  --name="Premium Plan" \
  --description="For serious job seekers with AI Resume Generator" \
  --active=true \
  --metadata="ai_generations_limit=30" \
  --json | jq -r '.id')

echo "Product created with ID: $PRODUCT_ID"

# Create monthly price
echo "Creating monthly price..."
MONTHLY_PRICE_ID=$(stripe prices create \
  --product=$PRODUCT_ID \
  --unit-amount=999 \
  --currency=usd \
  --recurring[interval]=month \
  --nickname="Premium Monthly" \
  --json | jq -r '.id')

echo "Monthly price created with ID: $MONTHLY_PRICE_ID"

# Create yearly price
echo "Creating yearly price..."
YEARLY_PRICE_ID=$(stripe prices create \
  --product=$PRODUCT_ID \
  --unit-amount=9999 \
  --currency=usd \
  --recurring[interval]=year \
  --nickname="Premium Yearly" \
  --json | jq -r '.id')

echo "Yearly price created with ID: $YEARLY_PRICE_ID"

# Save price IDs to a file
echo "Saving price IDs to stripe-products.txt..."
cat > stripe-products.txt << EOL
# Stripe Product and Price IDs
# Created on $(date)

STRIPE_PRODUCT_ID=$PRODUCT_ID
STRIPE_MONTHLY_PRICE_ID=$MONTHLY_PRICE_ID
STRIPE_YEARLY_PRICE_ID=$YEARLY_PRICE_ID
EOL

echo "Price IDs saved to stripe-products.txt"
echo ""
echo "Next steps:"
echo "1. Update your application code with these price IDs"
echo "2. Look for MONTHLY_PRICE_ID and YEARLY_PRICE_ID in your code"
echo "3. Replace them with the values above"
