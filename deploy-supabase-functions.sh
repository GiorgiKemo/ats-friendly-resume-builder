#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v supabase &> /dev/null; then
  echo "Error: Supabase CLI is not installed."
  echo "Install it from https://supabase.com/docs/guides/cli and run supabase login/link first."
  exit 1
fi

echo "Deploying all Supabase Edge Functions using supabase/config.toml..."
supabase functions deploy

echo ""
echo "Deployment complete. Required public/webhook functions are configured in supabase/config.toml."
echo "Set or verify required secrets with:"
echo "  supabase secrets set STRIPE_SECRET_KEY=..."
echo "  supabase secrets set STRIPE_WEBHOOK_SECRET=..."
echo "  supabase secrets set BREVO_WEBHOOK_SECRET=..."
echo "  supabase secrets set INBOUND_WEBHOOK_SECRET=..."
echo "  supabase secrets set GOOGLE_CLIENT_ID=..."
echo "  supabase secrets set GOOGLE_CLIENT_SECRET=..."
echo "  supabase secrets set GMAIL_OAUTH_STATE_SECRET=..."
