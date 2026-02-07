# Edge Functions Deployment

This directory contains the Edge Functions for the subscription management system. Since we couldn't deploy them directly from the CLI due to Docker requirements, you'll need to deploy them manually through the Supabase dashboard.

## Deployment Steps

1. **Log in to the Supabase Dashboard**
   - Go to https://supabase.com/dashboard
   - Select your project: `ATS-FRIENDLY-RESUME-BUILDER`

2. **Set Environment Variables**
   - Go to the "Settings" section in the sidebar
   - Click on "API"
   - Scroll down to "Project API keys"
   - Copy the "anon" key and "URL" for the next steps

3. **Deploy the Edge Functions**
   - Go to the "Edge Functions" section in the sidebar
   - For each function in the `edge-functions` directory:
     - Click "New Function"
     - Enter the function name (e.g., `create-checkout-session`)
     - Upload the corresponding `index.js` file
     - Click "Deploy"

4. **Set Environment Variables for the Edge Functions**
   - After deploying the functions, go to the "Edge Functions" section
   - Click on "Settings" (gear icon)
   - Add the following environment variables:
     - `STRIPE_SECRET_KEY`: Your Stripe secret key (use test key for development, live key for production)
     - `STRIPE_PUBLISHABLE_KEY`: Your Stripe publishable key
     - `STRIPE_WEBHOOK_SECRET`: Your Stripe webhook signing secret
     - `CORS_ORIGIN`: Set to `*` for development or your domain for production (e.g., `https://your-domain.com`)

5. **Test the Edge Functions**
   - Go to the "Edge Functions" section
   - Click on each function
   - Click "Invoke" to test the function
   - Check the logs for any errors

6. **Set Up Stripe Webhooks**
   - Go to the Stripe Dashboard: https://dashboard.stripe.com/webhooks
   - Click "Add endpoint"
   - Enter your webhook URL: `https://[YOUR_PROJECT_REF].supabase.co/functions/v1/stripe-webhook`
   - Select the following events:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
   - Click "Add endpoint"

7. **Update Your Frontend Code**
   - Make sure your frontend code is using the correct Supabase URL and API key
   - Update the `VITE_STRIPE_PUBLISHABLE_KEY` in your `.env` file

## Function Descriptions

- **create-checkout-session**: Creates a Stripe checkout session for subscription
- **create-customer-portal-session**: Creates a Stripe customer portal session for managing subscription
- **verify-checkout-session**: Verifies a Stripe checkout session and updates the user's subscription status
- **stripe-webhook**: Handles Stripe webhook events

## Production Deployment

For production deployment, refer to the `PRODUCTION_DEPLOYMENT.md` file in this directory.
