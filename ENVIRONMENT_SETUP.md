# Environment Setup Guide

This guide will help you set up all the necessary services and obtain the credentials needed for your ATS-Friendly Resume Builder application.

## Table of Contents

1. [Supabase Setup](#supabase-setup)
2. [Stripe Setup](#stripe-setup)
3. [OpenAI Setup](#openai-setup)
4. [Vercel Setup](#vercel-setup)
5. [Environment Variables](#environment-variables)

## Supabase Setup

1. **Create a Supabase Account**:
   - Go to [Supabase](https://supabase.com/) and sign up or log in
   - Create a new project

2. **Get Your API Keys**:
   - Go to Project Settings > API
   - Copy the URL (e.g., `https://[YOUR-PROJECT-REF].supabase.co`)
   - Copy the `anon` public key
   - Copy the `service_role` key (keep this secret, only use for Edge Functions)

3. **Set Up Database**:
   - Go to the SQL Editor
   - Run the `schema.sql` file from your project to set up all tables and functions

## Stripe Setup

1. **Create a Stripe Account**:
   - Go to [Stripe](https://stripe.com/) and sign up or log in

2. **Get Your API Keys**:
   - Go to Developers > API Keys
   - Copy the Publishable key (starts with `pk_`)
   - Copy the Secret key (starts with `sk_`)
   - Use test keys for development and live keys for production

3. **Set Up Webhook**:
   - Go to Developers > Webhooks
   - Add an endpoint (your Supabase Edge Function URL)
   - Select events to listen for (e.g., `checkout.session.completed`, `customer.subscription.updated`)
   - Copy the Webhook Signing Secret (starts with `whsec_`)

4. **Create Products and Prices**:
   - Go to Products > Add Product
   - Create your subscription plans (Free, Premium)
   - Set up recurring prices for each plan

## OpenAI Setup

1. **Create an OpenAI Account**:
   - Go to [OpenAI](https://platform.openai.com/) and sign up or log in

2. **Get Your API Key**:
   - Go to API Keys
   - Create a new secret key
   - Copy the key (starts with `sk-`)

3. **Set Usage Limits**:
   - Go to Usage Limits
   - Set appropriate limits to control costs

## Vercel Setup

1. **Create a Vercel Account**:
   - Go to [Vercel](https://vercel.com/) and sign up or log in

2. **Import Your GitHub Repository**:
   - Connect your GitHub account
   - Select your repository
   - Configure the build settings (Build Command: `npm run build`, Output Directory: `dist`)

3. **Set Environment Variables**:
   - Go to Settings > Environment Variables
   - Add all the variables from your `.env` file
   - Make sure to mark secret keys as "Production Only"

4. **Get Project Information**:
   - Go to Settings > General
   - Copy your Project ID and Team ID (if applicable)

## Environment Variables

Create a `.env` file in your project root with all the variables from the `.env.example` file:

1. **For Local Development**:
   - Copy `.env.example` to `.env`
   - Fill in all the values with your actual credentials

2. **For Production**:
   - Set these variables in your Vercel project settings
   - Make sure to mark secret keys as "Production Only"

3. **For Supabase Edge Functions**:
   - Set the necessary environment variables in the Supabase dashboard
   - Go to Edge Functions > [Your Function] > Settings > Environment Variables

## Security Notes

- Never commit your `.env` file to version control
- Keep your secret keys (Stripe Secret, Supabase Service Role, OpenAI API Key) secure
- Use environment variables for all sensitive information
- Implement proper error handling and validation

## Testing Your Setup

1. **Test Supabase Connection**:
   - Try signing up a test user
   - Verify data is being stored correctly

2. **Test Stripe Integration**:
   - Make a test purchase with Stripe's test cards
   - Verify webhook events are being received

3. **Test OpenAI Integration**:
   - Try generating a resume with AI
   - Check usage in the OpenAI dashboard

4. **Test Vercel Deployment**:
   - Deploy to Vercel
   - Verify all features work in the production environment
