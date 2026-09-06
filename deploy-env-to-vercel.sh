#!/bin/bash

# Script to deploy environment variables from .env file to Vercel
# Uploads browser/build variables only. Server-only CSP opt-in and credentials
# are deliberately excluded; see docs/ENVIRONMENT_MATRIX.md before configuring
# an approved server exception manually. Never rename a secret to VITE_*.

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
if ! vercel login; then
  echo "Error: Vercel login failed; no variables were uploaded."
  exit 1
fi

# Read .env file and deploy appropriate variables to Vercel
while IFS='=' read -r key value || [[ -n "$key" ]]; do
  # Skip empty lines and comments
  if [[ -z "$key" || "$key" == \#* ]]; then
    continue
  fi

  # Only deploy frontend variables (VITE_*) and build variables (NODE_ENV).
  # Provider API keys and secrets must stay server-side in Supabase/Vercel secrets.
  if [[ "$key" == VITE_* || "$key" == NODE_ENV ]]; then
    upper_key=$(echo "$key" | tr '[:lower:]' '[:upper:]')
    if [[ "$upper_key" == *"API_KEY"* || "$upper_key" == *"SECRET"* || "$upper_key" == *"TOKEN"* ]]; then
      echo "Skipping unsafe frontend secret-like variable: $key"
      continue
    fi

    # Remove any quotes from the value
    value=$(printf '%s' "$value" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")

    # Deploy the environment variable to Vercel
    echo "Adding $key to Vercel..."
    if ! vercel env add "$key" production <<< "$value"; then
      echo "Error: Failed to upload $key; earlier variables may already be updated."
      exit 1
    fi
  else
    echo "Skipping backend-only variable: $key"
  fi
done < .env

echo "Selected frontend/build variables uploaded successfully."
echo "Server variables and CSP persistence remain outside this uploader; see docs/ENVIRONMENT_MATRIX.md."
echo "Now you can deploy your application with 'vercel --prod'"
