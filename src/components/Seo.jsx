import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const SITE_ORIGIN = (import.meta.env.VITE_SITE_URL || 'https://resumeats.cv').replace(/\/+$/, '');

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

const Seo = () => {
  const location = useLocation();

  useEffect(() => {
    const metadata = routeMetadata.find((item) => item.match(location.pathname)) || defaultMetadata;
    const canonicalUrl = `${SITE_ORIGIN}${getCanonicalPath(location.pathname)}`;

    document.title = metadata.title;
    setMetaContent('meta[name="description"]', { name: 'description' }, metadata.description);
    setMetaContent('meta[property="og:title"]', { property: 'og:title' }, metadata.title);
    setMetaContent('meta[property="og:description"]', { property: 'og:description' }, metadata.description);
    setMetaContent('meta[property="og:url"]', { property: 'og:url' }, canonicalUrl);
    setMetaContent('meta[name="twitter:card"]', { name: 'twitter:card' }, 'summary');
    setMetaContent('meta[name="twitter:title"]', { name: 'twitter:title' }, metadata.title);
    setMetaContent('meta[name="twitter:description"]', { name: 'twitter:description' }, metadata.description);

    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', canonicalUrl);
  }, [location.pathname]);

  return null;
};

export default Seo;
