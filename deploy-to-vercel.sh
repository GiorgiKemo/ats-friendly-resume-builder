#!/bin/bash

# Comprehensive script to deploy your application to Vercel
# This script handles environment variables, building, and deployment

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
  echo "Error: vercel CLI is not installed. Please install it with 'npm install -g vercel'"
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

# Step 1: Deploy environment variables
if confirm "Do you want to deploy environment variables from .env file?"; then
  echo "Deploying environment variables..."
  ./deploy-env-to-vercel.sh
  if [ $? -ne 0 ]; then
    echo "Error deploying environment variables. Aborting."
    exit 1
  fi
fi

# Step 2: Build the application
if confirm "Do you want to build the application?"; then
  echo "Building application..."
  npm run build
  if [ $? -ne 0 ]; then
    echo "Error building application. Aborting."
    exit 1
  fi
fi

# Step 3: Deploy to Vercel
if confirm "Do you want to deploy to Vercel production?"; then
  echo "Deploying to Vercel..."
  vercel --prod
  if [ $? -ne 0 ]; then
    echo "Error deploying to Vercel. Please check the logs."
    exit 1
  fi
fi

echo "Deployment process completed!"
echo "Your application should now be live on Vercel."
echo "Don't forget to set up your custom domain and configure Stripe webhooks."
