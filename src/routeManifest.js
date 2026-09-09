// One route manifest feeds the browser SEO layer, build-time metadata
// generation, and the read-only production HTTP gate. Keep route families here
// so parameterized paths share the same metadata as their base route.
export const publicRoutes = [
  {
    path: '/',
    title: 'ResumeATS - ATS-Friendly Resume Builder',
    description: 'Create professional, ATS-friendly resumes with AI assistance. Start free and build a clear document with common applicant-tracking-system considerations in mind.',
  },
  {
    path: '/learn',
    title: 'ATS Resume Guide - ResumeATS',
    description: 'Learn how applicant tracking systems read resumes and how to write clean, keyword-aware resume sections that recruiters can scan.',
  },
  {
    path: '/pricing',
    title: 'Pricing - ResumeATS',
    description: 'Compare free and Premium AI+ resume-building plans for templates, AI generation, exports, and job-search tools.',
  },
  {
    path: '/about',
    title: 'About ResumeATS',
    description: 'Learn about ResumeATS and our approach to practical, ATS-friendly resume building for modern job seekers.',
  },
  {
    path: '/terms',
    title: 'Terms of Service - ResumeATS',
    description: 'Read the ResumeATS terms of service for account use, subscriptions, user content, and acceptable use.',
  },
  {
    path: '/privacy-policy',
    title: 'Privacy Policy - ResumeATS',
    description: 'Read how ResumeATS collects, stores, protects, and processes account, resume, payment, and AI-generation data.',
  },
  {
    path: '/faq',
    title: 'FAQ - ResumeATS',
    description: 'Find answers about ResumeATS accounts, resume exports, AI generation, billing, subscriptions, and ATS-friendly templates.',
  },
  {
    path: '/contact',
    title: 'Contact Support - ResumeATS',
    description: 'Contact ResumeATS for product support, billing questions, export issues, extension help, or resume workflow feedback.',
  },
].map((route) => ({ ...route, indexable: true, canonical: true }));

export const privateRoutes = [
  ['/signin', 'Sign In - ResumeATS', 'Sign in to ResumeATS to manage resumes, exports, applications, subscriptions, and account settings.'],
  ['/signup', 'Sign Up - ResumeATS', 'Create a ResumeATS account to build ATS-friendly resumes, manage applications, and access resume export tools.'],
  ['/forgot-password', 'Reset Password - ResumeATS', 'Request a secure password reset link for your ResumeATS account.'],
  ['/update-password', 'Update Password - ResumeATS', 'Set a new password using your secure recovery session.'],
  ['/welcome', 'Account Confirmation - ResumeATS', 'Complete your ResumeATS account confirmation.'],
  ['/dashboard', 'Dashboard - ResumeATS', 'Manage your ResumeATS resumes, resume drafts, and job-search workflow.'],
  ['/builder', 'Resume Builder - ResumeATS', 'Build and edit an ATS-friendly resume with structured sections, templates, and export readiness checks.'],
  ['/preview', 'Resume Preview - ResumeATS', 'Review and export your saved resume.'],
  ['/profile', 'Career Profile - ResumeATS', 'Manage the career details used in your resumes and applications.'],
  ['/ai-generator', 'AI Resume Generator - ResumeATS', 'Generate a realistic, ATS-aware resume draft tailored to a target role and job description.'],
  ['/new', 'New Resume - ResumeATS', 'Choose how to start your next resume.'],
  ['/quick-resume', 'Quick Resume - ResumeATS', 'Create a targeted resume quickly from your profile and a job posting.'],
  ['/applications', 'Application Tracker - ResumeATS', 'Track job applications, statuses, notes, and follow-up activity in ResumeATS.'],
  ['/auto-apply', 'Auto-Apply - ResumeATS', 'Manage ResumeATS auto-apply settings and browser-assisted job application workflows.'],
  ['/analytics', 'Analytics - ResumeATS', 'Review resume and application activity insights in ResumeATS.'],
  ['/admin/users', 'Admin Users - ResumeATS', 'Review bounded customer accounts and authorized administration workflows.'],
  ['/admin', 'Administration - ResumeATS', 'ResumeATS administration workspace.'],
  ['/subscription/manage', 'Manage Subscription - ResumeATS', 'Review your plan and manage your billing subscription.'],
  ['/subscription/success', 'Subscription Status - ResumeATS', 'Check the status of your ResumeATS subscription.'],
  ['/return-from-stripe', 'Subscription Status - ResumeATS', 'Check the status of your ResumeATS subscription.'],
  ['/return-from-paypal', 'Subscription Status - ResumeATS', 'Check the status of your ResumeATS subscription.'],
].map(([path, title, description]) => ({
  path,
  title,
  description,
  indexable: false,
  canonical: false,
}));

export const routes = [...publicRoutes, ...privateRoutes];

export const routeMatchesPath = (routePath, pathname) => (
  routePath === '/'
    ? pathname === '/'
    : pathname === routePath || pathname.startsWith(`${routePath}/`)
);
