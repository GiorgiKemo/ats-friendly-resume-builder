# ATS-Friendly Resume Builder

A modern web application that helps job seekers create professional, ATS-optimized resumes with AI assistance.

## Features

- **ATS-Optimized Templates**: Multiple resume templates designed to pass Applicant Tracking Systems
- **AI Resume Generator**: Premium feature that creates tailored resume content based on job descriptions
- **LinkedIn Job Discovery**: Bright Data-backed job discovery can queue LinkedIn matches into Auto-Apply
- **Browser Agent**: Companion extension source for assisted job discovery and autofill
- **Premium Subscription**: Stripe integration for subscription management
- **Export Options**: Download resumes in PDF and Word formats
- **User Authentication**: Secure user accounts with Supabase authentication
- **Responsive Design**: Works on desktop and mobile devices

## Technology Stack

- **Frontend**: React, Vite, TailwindCSS
- **Backend**: Supabase (PostgreSQL, Auth, Storage)
- **AI Integration**: Supabase Edge Functions with OpenRouter primary and Groq fallback
- **Payments**: Stripe API
- **Deployment**: Vercel for the web app, Supabase Edge Functions for server-side integrations

## Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and add your API keys
4. Start the development server: `npm run dev`

For LinkedIn job discovery, also set `BRIGHT_DATA_API_TOKEN` in your Supabase Edge Function environment before using `Discover Jobs`.

## Scripts

- `npm run dev`: start the local Vite dev server
- `npm run build`: build the production web app
- `npm run lint`: run ESLint
- `npm test`: run Node unit tests
- `npm run build:extension`: build Chromium and Firefox browser-agent packages

## Repo Structure

- `src/`: React web app source
- `supabase/`: database schema, migrations, Edge Functions, and auth email templates
- `browser-agent/`: production browser extension source
- `browser-agent-training/`: local trainer extension for collecting autofill corrections
- `training/autofill-field-planner/`: local training planner source and seed examples
- `tests/`: unit and Playwright QA coverage
- `api/`: Vercel API endpoint for CSP reports

## Production Deployment

This project is optimized for production deployment with Vercel and Supabase:

### Prerequisites

1. A Supabase account with a project set up
2. A Stripe account for payment processing
3. An OpenRouter API key for AI generation features, plus a Groq API key for fallback
4. A Vercel account for hosting

### Deployment Steps

1. **Database Setup**:
   - Execute the `supabase/schema.sql` file in your Supabase SQL Editor
   - This will create all necessary tables, functions, and security policies

2. **Environment Configuration**:
   - Copy `.env.example` to `.env.production`
   - Fill in all required environment variables:
     - Supabase URL and keys
     - Stripe publishable key and secret
     - OpenRouter API key and optional Groq fallback key
     - Application URL and other settings

3. **Supabase Edge Functions Deployment**:
   - Deploy the Stripe webhook handler:
     ```bash
     ./deploy-webhook.sh
     ```
   - This will deploy the necessary Edge Functions for Stripe integration

4. **Vercel Deployment**:
   - Connect your GitHub repository to Vercel
   - Configure environment variables in Vercel dashboard
   - Deploy the application
   - Or use the Vercel CLI:
     ```bash
     npm run build
     vercel --prod
     ```

5. **Post-Deployment Configuration**:
   - Set up Stripe webhooks to point to your Supabase Edge Function
   - Configure your custom domain in Vercel
   - Test all functionality in production

### Production Checklist

- [x] Database schema optimized for production
- [x] Environment variables properly configured
- [x] Stripe webhooks set up correctly
- [x] AI provider integration tested
- [x] Security policies implemented
- [x] Error handling in place
- [x] Performance optimized

## Additional Docs

- `ENVIRONMENT_SETUP.md`: service and environment variable setup
- `STRIPE_SETUP.md`: Stripe product, price, webhook, and portal setup
- `STRIPE_WEBHOOK_SETUP.md`: webhook-specific checklist and troubleshooting
- `VERCEL_DEPLOYMENT.md`: Vercel deployment scripts and manual deployment notes
- `SECURITY.md`: security policy and reporting

