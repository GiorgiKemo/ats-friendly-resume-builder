#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v npx &> /dev/null || ! npx --no-install supabase --version &> /dev/null; then
  echo "Error: the project-pinned Supabase CLI is not installed."
  echo "Run npm ci (or npm install) before deploying Supabase functions."
  exit 1
fi

echo "Deploying all Supabase Edge Functions with the project-pinned Supabase CLI..."
npx --no-install supabase functions deploy

echo ""
echo "Deployment complete. Required public/webhook functions are configured in supabase/config.toml."
echo "Set or verify required secrets with:"
echo "  npx --no-install supabase secrets set STRIPE_SECRET_KEY=..."
echo "  npx --no-install supabase secrets set STRIPE_WEBHOOK_SECRET=..."
echo "  npx --no-install supabase secrets set BREVO_WEBHOOK_SECRET=..."
echo "  npx --no-install supabase secrets set INBOUND_WEBHOOK_SECRET=..."
echo "  npx --no-install supabase secrets set GOOGLE_CLIENT_ID=..."
echo "  npx --no-install supabase secrets set GOOGLE_CLIENT_SECRET=..."
echo "  npx --no-install supabase secrets set GMAIL_OAUTH_STATE_SECRET=..."
