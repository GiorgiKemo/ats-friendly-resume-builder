# Production Deployment Guide for Subscription Management

This guide outlines the steps to deploy the subscription management system to production, ensuring that the Stripe integration works properly.

## Prerequisites

- A Supabase project with the database schema set up
- A Stripe account with API keys
- A domain for your production application

## Step 1: Set Up Stripe for Production

1. **Create a Stripe Account or Switch to Live Mode**
   - If you're using a test account, switch to live mode in the Stripe dashboard
   - If you're creating a new account, complete the onboarding process

2. **Get Your Live API Keys**
   - Go to the [Stripe Dashboard](https://dashboard.stripe.com/apikeys)
   - Copy your live publishable key (starts with `pk_live_`)
   - Copy your live secret key (starts with `sk_live_`)

3. **Set Up Your Products and Prices**
   - Go to the [Stripe Products page](https://dashboard.stripe.com/products)
   - Create the same products and prices as in your test environment
   - Note the price IDs for each plan (e.g., `price_1234567890`)

4. **Configure Webhook Endpoints**
   - Go to the [Stripe Webhooks page](https://dashboard.stripe.com/webhooks)
   - Add a new endpoint with your Supabase Edge Function URL:
     - `https://[YOUR_PROJECT_REF].supabase.co/functions/v1/stripe-webhook`
   - Select the following events:
     - `checkout.session.completed`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
   - Copy the signing secret (starts with `whsec_`)

## Step 2: Update Environment Variables

1. **Update the `.env` File**
   - Edit the `.env` file in your project root
   - Replace the test Stripe keys with your live keys:

   ```
   VITE_STRIPE_PUBLISHABLE_KEY=pk_live_YOUR_LIVE_PUBLISHABLE_KEY
   ```

2. **Update the Supabase Edge Function Secrets**
   - Run the deployment script with the production flag:

   ```bash
   ./deploy-edge-functions.sh production
   ```

   - When prompted, enter your live Stripe keys and webhook secret
   - Set the CORS_ORIGIN to your production domain (e.g., `https://your-domain.com`)

## Step 3: Deploy the Edge Functions

1. **Deploy the Edge Functions to Supabase**
   - The deployment script will deploy the following functions:
     - `create-checkout-session`
     - `create-customer-portal-session`
     - `verify-checkout-session`
     - `stripe-webhook`

2. **Verify the Deployment**
   - Check that all functions are deployed successfully
   - Test the webhook endpoint by sending a test event from the Stripe dashboard

## Step 4: Update Your Frontend Code

1. **Build Your Application for Production**
   - Run the build command:

   ```bash
   npm run build
   ```

2. **Deploy Your Frontend**
   - Deploy the built application to your hosting provider
   - Ensure that your domain is properly configured

## Step 5: Test the Production Deployment

1. **Test the Checkout Flow**
   - Go to your pricing page
   - Click on "Upgrade to Premium"
   - Complete the checkout process with a real card
   - Verify that you're redirected to the success page
   - Check that your subscription status is updated in the database

2. **Test the Customer Portal**
   - Go to your account page
   - Click on "Manage Subscription"
   - Verify that you're redirected to the Stripe Customer Portal
   - Make changes to your subscription (e.g., update payment method)
   - Verify that the changes are reflected in your application

## Troubleshooting

### Edge Function Issues

- **Check the Supabase Logs**
  - Go to the Supabase dashboard
  - Navigate to the Edge Functions section
  - Check the logs for each function

- **Verify Environment Variables**
  - Ensure that all required environment variables are set
  - Check that the CORS_ORIGIN is set correctly

### Stripe Issues

- **Check the Stripe Dashboard**
  - Go to the Stripe dashboard
  - Check the Events log for any errors
  - Verify that webhooks are being delivered successfully

- **Test with Stripe CLI**
  - Use the Stripe CLI to test webhooks locally
  - Forward events to your local development environment

### Frontend Issues

- **Check the Browser Console**
  - Open the browser developer tools
  - Check for any errors in the console
  - Verify that the Stripe.js library is loaded correctly

- **Check Network Requests**
  - Monitor network requests in the browser developer tools
  - Verify that requests to the Edge Functions are successful

## Security Considerations

- **Protect Your API Keys**
  - Never expose your Stripe secret key in client-side code
  - Use environment variables to store sensitive information

- **Implement Proper Authentication**
  - Ensure that all subscription-related endpoints require authentication
  - Verify that users can only access their own subscription data

- **Set Up Proper CORS Headers**
  - Configure CORS headers to only allow requests from your domain
  - Prevent cross-site request forgery (CSRF) attacks

## Maintenance

- **Monitor Webhook Deliveries**
  - Regularly check the Stripe dashboard for webhook delivery issues
  - Set up alerts for failed webhook deliveries

- **Update API Versions**
  - Keep your Stripe API version up to date
  - Test changes in a staging environment before deploying to production

- **Backup Your Database**
  - Regularly backup your Supabase database
  - Implement a disaster recovery plan

## Conclusion

By following this guide, you should have a fully functional subscription management system in production. If you encounter any issues, refer to the troubleshooting section or contact Stripe support for assistance.
