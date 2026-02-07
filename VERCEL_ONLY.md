# Vercel-Only Testing Workflow

This project is configured for testing directly on Vercel without using localhost. All development and testing is done by pushing changes to GitHub and testing on the live Vercel deployment.

## Workflow

1. **Make Changes to Your Code**
   - Edit files in your local repository
   - Focus on one feature or bug fix at a time

2. **Push Changes to GitHub**
   - Use the provided script:
   ```bash
   ./vercel-test.sh
   ```
   - This will:
     - Commit your changes
     - Push to GitHub
     - Trigger a Vercel deployment

3. **Test Your Changes**
   - Visit your Vercel deployment: [https://ats-friendly-resume-builder.vercel.app](https://ats-friendly-resume-builder.vercel.app)
   - Test the specific feature or fix you implemented
   - Check for any errors in the browser console

4. **View Deployment Status**
   - Go to [Vercel Dashboard](https://vercel.com/giorgikemo/ats-friendly-resume-builder/deployments)
   - Check the status of your deployment
   - View build logs if there are any issues

## Environment Variables

All environment variables are set in the Vercel dashboard:

- `VITE_SUPABASE_URL`: Your Supabase URL
- `VITE_SUPABASE_ANON_KEY`: Your Supabase anonymous key
- `VITE_OPENAI_API_KEY`: Your OpenAI API key
- `VITE_STRIPE_PUBLISHABLE_KEY`: Your Stripe publishable key
- `VITE_APP_URL`: Your Vercel deployment URL
- `VITE_APP_ENV`: Set to "production"
- `VITE_APP_VERSION`: Your application version

## Supabase Edge Functions

The Supabase Edge Functions are already deployed and configured for production:

- `create-checkout-session`: Creates a Stripe checkout session
- `create-customer-portal-session`: Creates a Stripe customer portal session
- `verify-checkout-session`: Verifies a Stripe checkout session
- `stripe-webhook`: Handles Stripe webhook events

## Troubleshooting

### Deployment Failed

1. Check the Vercel deployment logs
2. Fix any build errors in your code
3. Push the fixes to GitHub

### Application Errors

1. Open the browser console to check for errors
2. Fix the issues in your code
3. Push the fixes to GitHub
