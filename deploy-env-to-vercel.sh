#!/bin/bash

# Script to deploy environment variables from .env file to Vercel
# This script reads your .env file and deploys the variables to Vercel

# Check if .env file exists
if [ ! -f .env ]; then
  echo "Error: .env file not found!"
  exit 1
fi

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
  echo "Error: vercel CLI is not installed. Please install it with 'npm install -g vercel'"
  exit 1
fi

echo "Deploying environment variables to Vercel..."

# Login to Vercel if not already logged in
vercel login

# Read .env file and deploy appropriate variables to Vercel
while IFS='=' read -r key value || [[ -n "$key" ]]; do
  # Skip empty lines and comments
  if [[ -z "$key" || "$key" == \#* ]]; then
    continue
  fi

  # Only deploy frontend variables (VITE_*) and build variables (NODE_ENV)
  # Skip backend-only variables
  if [[ "$key" == VITE_* || "$key" == NODE_ENV ]]; then
    # Remove any quotes from the value
    value=$(echo $value | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")

    # Deploy the environment variable to Vercel
    echo "Adding $key to Vercel..."
    vercel env add $key production <<< "$value"
  else
    echo "Skipping backend-only variable: $key"
  fi
done < .env

echo "Environment variables deployed successfully!"
echo "Now you can deploy your application with 'vercel --prod'"
