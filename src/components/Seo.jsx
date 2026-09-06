import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const SITE_ORIGIN = (import.meta.env.VITE_SITE_URL || 'https://resumeats.cv').replace(/\/+$/, '');
const SITE_NAME = 'ResumeATS';
const SITE_LOGO = `${SITE_ORIGIN}/favicon.svg`;
const SITE_IMAGE = `${SITE_ORIGIN}/resume-illustration-desktop.svg`;

const INDEXABLE_PUBLIC_PATHS = new Set([
  '/',
  '/learn',
  '/pricing',
  '/about',
  '/faq',
  '/contact',
  '/terms',
  '/privacy-policy',
]);

const defaultMetadata = {
  title: 'ResumeATS - ATS-Friendly Resume Builder',
  description: 'Create professional, ATS-optimized resumes with AI assistance, recruiter-approved templates, and export tools.',
};

const routeMetadata = [
  {
    match: (path) => path === '/',
    title: 'ResumeATS - ATS-Friendly Resume Builder',
    description: 'Create professional, ATS-optimized resumes with AI assistance. Start free and build a resume that passes applicant tracking systems.',
  },
  {
    match: (path) => path === '/learn',
    title: 'ATS Resume Guide - ResumeATS',
    description: 'Learn how applicant tracking systems read resumes and how to write clean, keyword-aware resume sections that recruiters can scan.',
  },
  {
    match: (path) => path === '/pricing',
    title: 'Pricing - ResumeATS',
    description: 'Compare free and Premium AI+ resume-building plans for templates, AI generation, exports, and job-search tools.',
  },
  {
    match: (path) => path === '/about',
    title: 'About ResumeATS',
    description: 'Learn about ResumeATS and our approach to practical, ATS-friendly resume building for modern job seekers.',
  },
  {
    match: (path) => path === '/faq',
    title: 'FAQ - ResumeATS',
    description: 'Find answers about ResumeATS accounts, resume exports, AI generation, billing, subscriptions, and ATS-friendly templates.',
  },
  {
    match: (path) => path === '/contact',
    title: 'Contact Support - ResumeATS',
    description: 'Contact ResumeATS for product support, billing questions, export issues, extension help, or resume workflow feedback.',
  },
  {
    match: (path) => path === '/terms',
    title: 'Terms of Service - ResumeATS',
    description: 'Read the ResumeATS terms of service for account use, subscriptions, user content, and acceptable use.',
  },
  {
    match: (path) => path === '/privacy-policy',
    title: 'Privacy Policy - ResumeATS',
    description: 'Read how ResumeATS collects, stores, protects, and processes account, resume, payment, and AI-generation data.',
  },
  {
    match: (path) => path === '/signin',
    title: 'Sign In - ResumeATS',
    description: 'Sign in to ResumeATS to manage resumes, exports, applications, subscriptions, and account settings.',
  },
  {
    match: (path) => path === '/signup',
    title: 'Sign Up - ResumeATS',
    description: 'Create a ResumeATS account to build ATS-friendly resumes, manage applications, and access resume export tools.',
  },
  {
    match: (path) => path === '/forgot-password',
    title: 'Reset Password - ResumeATS',
    description: 'Request a secure password reset link for your ResumeATS account.',
  },
  {
    match: (path) => path.startsWith('/dashboard'),
    title: 'Dashboard - ResumeATS',
    description: 'Manage your ResumeATS resumes, resume drafts, and job-search workflow.',
  },
  {
    match: (path) => path.startsWith('/builder'),
    title: 'Resume Builder - ResumeATS',
    description: 'Build and edit an ATS-friendly resume with structured sections, templates, and export readiness checks.',
  },
  {
    match: (path) => path.startsWith('/quick-resume'),
    title: 'Quick Resume - ResumeATS',
    description: 'Create a targeted resume quickly from your profile and a job posting.',
  },
  {
    match: (path) => path.startsWith('/ai-generator'),
    title: 'AI Resume Generator - ResumeATS',
    description: 'Generate a realistic, ATS-aware resume draft tailored to a target role and job description.',
  },
  {
    match: (path) => path.startsWith('/applications'),
    title: 'Application Tracker - ResumeATS',
    description: 'Track job applications, statuses, notes, and follow-up activity in ResumeATS.',
  },
  {
    match: (path) => path.startsWith('/auto-apply'),
    title: 'Auto-Apply - ResumeATS',
    description: 'Manage ResumeATS auto-apply settings and browser-assisted job application workflows.',
  },
  {
    match: (path) => path.startsWith('/analytics'),
    title: 'Analytics - ResumeATS',
    description: 'Review resume and application activity insights in ResumeATS.',
  },
  {
    match: (path) => path === '/profile',
    title: 'Career Profile - ResumeATS',
    description: 'Manage the career details used in your resumes and applications.',
  },
  {
    match: (path) => path === '/new',
    title: 'New Resume - ResumeATS',
    description: 'Choose how to start your next resume.',
  },
  {
    match: (path) => path.startsWith('/preview/'),
    title: 'Resume Preview - ResumeATS',
    description: 'Review and export your saved resume.',
  },
  {
    match: (path) => path === '/subscription/manage',
    title: 'Manage Subscription - ResumeATS',
    description: 'Review your plan and manage your billing subscription.',
  },
  {
    match: (path) => path === '/subscription/success' || path.startsWith('/return-from-stripe'),
    title: 'Subscription Status - ResumeATS',
    description: 'Check the status of your ResumeATS subscription.',
  },
  {
    match: (path) => path === '/update-password',
    title: 'Update Password - ResumeATS',
    description: 'Set a new password using your secure recovery session.',
  },
  {
    match: (path) => path === '/welcome',
    title: 'Account Confirmation - ResumeATS',
    description: 'Complete your ResumeATS account confirmation.',
  },
  {
    match: (path) => path === '/admin',
    title: 'Administration - ResumeATS',
    description: 'ResumeATS administration workspace.',
  },
];

const getOrCreateMeta = (selector, createAttributes) => {
  let element = document.head.querySelector(selector);

  if (!element) {
    element = document.createElement('meta');
    Object.entries(createAttributes).forEach(([key, value]) => {
      element.setAttribute(key, value);
    });
    document.head.appendChild(element);
  }

  return element;
};

const setMetaContent = (selector, createAttributes, content) => {
  const element = getOrCreateMeta(selector, createAttributes);
  element.setAttribute('content', content);
};

const getCanonicalPath = (pathname) => (pathname === '/' ? '/' : pathname.replace(/\/+$/, ''));

const getStructuredData = (canonicalUrl, metadata) => ({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${SITE_ORIGIN}/#website`,
      url: `${SITE_ORIGIN}/`,
      name: SITE_NAME,
      description: defaultMetadata.description,
      publisher: { '@id': `${SITE_ORIGIN}/#organization` },
    },
    {
      '@type': 'Organization',
      '@id': `${SITE_ORIGIN}/#organization`,
      name: SITE_NAME,
      url: `${SITE_ORIGIN}/`,
      logo: {
        '@type': 'ImageObject',
        url: SITE_LOGO,
      },
    },
    {
      '@type': 'WebPage',
      '@id': `${canonicalUrl}#webpage`,
      url: canonicalUrl,
      name: metadata.title,
      description: metadata.description,
      isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
      publisher: { '@id': `${SITE_ORIGIN}/#organization` },
    },
  ],
});

const setStructuredData = (data) => {
  let script = document.head.querySelector('script[data-resumeats-structured-data]');

  if (!data) {
    script?.remove();
    return;
  }

  if (!script) {
    script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-resumeats-structured-data', 'true');
    document.head.appendChild(script);
  }

  script.textContent = JSON.stringify(data);
};

const Seo = () => {
  const location = useLocation();

  useEffect(() => {
    const metadata = routeMetadata.find((item) => item.match(location.pathname)) || defaultMetadata;
    const canonicalPath = getCanonicalPath(location.pathname);
    const canonicalUrl = `${SITE_ORIGIN}${canonicalPath}`;
    const isIndexablePublicPage = INDEXABLE_PUBLIC_PATHS.has(canonicalPath);

    document.title = metadata.title;
    setMetaContent('meta[name="description"]', { name: 'description' }, metadata.description);
    setMetaContent('meta[name="robots"]', { name: 'robots' }, isIndexablePublicPage ? 'index,follow' : 'noindex,follow');
    setMetaContent('meta[property="og:title"]', { property: 'og:title' }, metadata.title);
    setMetaContent('meta[property="og:description"]', { property: 'og:description' }, metadata.description);
    setMetaContent('meta[property="og:type"]', { property: 'og:type' }, 'website');
    setMetaContent('meta[property="og:site_name"]', { property: 'og:site_name' }, SITE_NAME);
    setMetaContent('meta[property="og:url"]', { property: 'og:url' }, canonicalUrl);
    setMetaContent('meta[property="og:image"]', { property: 'og:image' }, SITE_IMAGE);
    setMetaContent('meta[name="twitter:card"]', { name: 'twitter:card' }, 'summary_large_image');
    setMetaContent('meta[name="twitter:title"]', { name: 'twitter:title' }, metadata.title);
    setMetaContent('meta[name="twitter:description"]', { name: 'twitter:description' }, metadata.description);
    setMetaContent('meta[name="twitter:image"]', { name: 'twitter:image' }, SITE_IMAGE);

    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', canonicalUrl);
    setStructuredData(isIndexablePublicPage ? getStructuredData(canonicalUrl, metadata) : null);
  }, [location.pathname]);

  return null;
};

export default Seo;
