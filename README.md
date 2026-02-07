# ATS-Friendly Resume Builder

A modern web application that helps job seekers create professional, ATS-optimized resumes with AI assistance.

## Latest Update
- Removed all preset data to ensure resumes are 100% AI-generated
- Improved resume generation process
- Fixed system logging to prevent errors when saving resumes
- Triggered new deployment: 2025-05-06

## Features

- **ATS-Optimized Templates**: Multiple resume templates designed to pass Applicant Tracking Systems
- **AI Resume Generator**: Premium feature that creates tailored resume content based on job descriptions
- **Premium Subscription**: Stripe integration for subscription management
- **Export Options**: Download resumes in PDF and Word formats
- **User Authentication**: Secure user accounts with Supabase authentication
- **Responsive Design**: Works on desktop and mobile devices

## Technology Stack

- **Frontend**: React, Vite, TailwindCSS
- **Backend**: Supabase (PostgreSQL, Auth, Storage)
- **AI Integration**: OpenAI API
- **Payments**: Stripe API
- **Deployment**: Supabase Edge Functions

## Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and add your API keys
4. Start the development server: `npm run dev`

## Production Deployment

This project is optimized for production deployment with Vercel and Supabase:

### Prerequisites

1. A Supabase account with a project set up
2. A Stripe account for payment processing
3. An OpenAI API key for AI generation features
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
     - OpenAI API key
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
- [x] OpenAI API integration tested
- [x] Security policies implemented
- [x] Error handling in place
- [x] Performance optimized

