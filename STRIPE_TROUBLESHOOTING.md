# Stripe Troubleshooting Guide

This guide provides instructions for troubleshooting and fixing common Stripe integration issues.

## Common Issues

### 1. "No subscription found" or "No Stripe customer ID associated with this account"

This error occurs when a user has subscribed through Stripe, but their Stripe customer ID was not properly saved in the database.

#### Solution:

Run the auto-fix script with the user's email:

```bash
node auto-fix-stripe-customer-id.js user@example.com
```

This script will:
1. Look up the user in the database
2. Check if they already have a Stripe customer ID
3. If not, look for an existing customer in Stripe with their email
4. If found, use that customer ID; if not, create a new customer
5. Update the user's record in the database

### 2. Webhook Not Working

If the webhook is not properly updating user records when events occur in Stripe:

#### Solution:

Run the webhook fix script:

```bash
node fix-webhook.js
```

This script will:
1. Check for premium users without a Stripe customer ID and fix them
2. Verify the webhook configuration and update it if necessary

### 3. Testing Webhook Configuration

To test if the webhook is properly configured:

```bash
node test-webhook.js
```

This script will:
1. Check if a specific user has the correct Stripe customer ID
2. Verify their subscription status
3. Check the webhook configuration

## Manual Fix for a Specific User

If you need to manually fix a specific user's Stripe customer ID:

1. Find the user's Stripe customer ID in the Stripe dashboard
2. Run the update script:

```bash
node update-user-stripe-id.js
```

(Edit the script first to set the correct email and customer ID)

## Preventive Measures

To prevent these issues in the future:

1. Make sure the webhook is properly configured with all required events
2. Ensure the webhook secret is correctly set in the environment variables
3. Verify that the create-checkout-session function is properly creating and storing customer IDs
4. Regularly run the fix-webhook.js script to catch and fix any issues
