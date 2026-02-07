# Supabase Database Setup

This directory contains the SQL file needed to set up the database for the ATS-Friendly Resume Builder.

## Setup Instructions

Execute `schema.sql` to create the complete database structure, including tables, views, functions, and security policies.

You can execute this file in the SQL Editor in the Supabase dashboard.

## Troubleshooting

If you encounter an error like `column reference "id" is ambiguous`, it means that the database functions are not properly defined. Make sure you've executed the entire `schema.sql` file.

## Database Structure

- `users`: Stores user profiles linked to Supabase Auth
- `resumes`: Stores resume metadata
- `resume_content`: Stores the actual content of resumes in JSON format
- `subscription_plans`: Defines available subscription plans
- `user_profiles`: Stores detailed user profile information including personal details, work experience, education, skills, etc.

## Views

- `user_resumes`: A view that provides a summary of each user's resumes

## Functions

- `get_resume_with_content`: Retrieves a resume with all its content
- `save_resume`: Creates or updates a resume
- `delete_resume`: Deletes a resume
- `handle_new_user`: Automatically creates a user profile when a new user signs up
- `toggle_premium_status`: Toggles a user's premium status (for development purposes)
- `has_premium_access`: Checks if a user has premium access
- `track_ai_generation`: Tracks AI generation usage
- `save_user_profile`: Saves or updates a user's detailed profile information
- `get_user_profile`: Retrieves a user's detailed profile information

## Premium Plans

The application supports two subscription plans:

1. **Free Plan**:
   - Create ATS-friendly resumes with clean, single-column layouts
   - Access to 4 professional templates optimized for ATS systems
   - Export to PDF and Word formats with proper formatting
   - Basic resume formatting and styling options
   - Store up to 3 resumes in your account
   - Access to ATS best practices guides and resources

2. **Premium Plan**:
   - Everything in Free plan, plus:
   - AI Resume Generator that creates tailored content based on job descriptions
   - 30 AI resume generations per month with customization options
   - Advanced formatting options with more templates and fonts
   - Industry-specific suggestions tailored to your target job sector
   - Location-aware resume generation that adapts to job and user locations
   - Unlimited resume storage with easy management
   - Priority support with faster response times

## Row Level Security

The database uses Row Level Security (RLS) to ensure users can only access their own data. Each table has appropriate RLS policies defined in `schema.sql`.
