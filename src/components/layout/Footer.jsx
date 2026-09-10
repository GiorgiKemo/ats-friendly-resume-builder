import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { TouchLink, TouchExternalLink } from '../ui';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { subscribeToNewsletter } from '../../services/publicEngagementService';
import {
  SUPPORT_BILLING_PRIORITY,
  SUPPORT_EMAIL,
  SUPPORT_PHONE_DISPLAY,
  SUPPORT_PHONE_URI,
  SUPPORT_RESPONSE_TIME,
  SUPPORT_WHATSAPP_URI,
} from '../../config/supportInfo';
import { SupportChannelIcon } from '../ui';

const MARKETING_PATHS = new Set([
  '/',
  '/learn',
  '/pricing',
  '/about',
  '/terms',
  '/privacy-policy',
  '/faq',
  '/contact',
  '/signin',
  '/signup',
  '/forgot-password',
]);

const Footer = ({ compact = false }) => {
  const currentYear = new Date().getFullYear();
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [isSubscribing, setIsSubscribing] = useState(false);

  const showNewsletter = !compact && !user && MARKETING_PATHS.has(pathname);
  const showFullFooter = !compact && (!user || MARKETING_PATHS.has(pathname));

  // Function to scroll to top when clicking links
  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  if (!showFullFooter) {
    return (
      <footer className="border-t border-gray-200 bg-white py-5 text-gray-600 transition-colors dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
        <div className="container mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 text-sm sm:flex-row">
          <p>&copy; {currentYear} ResumeATS</p>
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
            <TouchLink to="/faq" className="hover:text-blue-600 dark:hover:text-blue-400">
              FAQ
            </TouchLink>
            <TouchLink to="/contact" className="hover:text-blue-600 dark:hover:text-blue-400">
              Contact
            </TouchLink>
            <TouchLink to="/privacy-policy" className="hover:text-blue-600 dark:hover:text-blue-400">
              Privacy
            </TouchLink>
            <TouchLink to="/terms" className="hover:text-blue-600 dark:hover:text-blue-400">
              Terms
            </TouchLink>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className="bg-gray-50 dark:bg-slate-900 text-gray-700 dark:text-slate-300 border-t border-gray-200 dark:border-slate-700 transition-colors duration-200">
      <div className="container mx-auto px-6 pt-12 pb-8">
        {showNewsletter && (
        <div className="max-w-4xl mx-auto bg-white dark:bg-slate-800 rounded-xl p-8 mb-12 shadow-md border border-gray-100 dark:border-slate-700">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="text-center md:text-left">
              <h3 className="text-xl font-bold mb-2 text-gray-800 dark:text-slate-100">Stay ahead in your job search</h3>
              <p className="text-gray-600 dark:text-slate-400 text-sm">
                Get resume tips, ATS insights, product updates, and support notices delivered to your inbox.
              </p>
            </div>
            <form className="w-full md:w-auto" onSubmit={async (e) => {
              e.preventDefault();
              if (!newsletterEmail || !newsletterEmail.includes('@')) {
                toast.error('Please enter a valid email address.');
                return;
              }
              setIsSubscribing(true);
              try {
                const result = await subscribeToNewsletter(newsletterEmail, 'footer');
                toast.success(
                  result.alreadySubscribed
                    ? 'You are already on the list. We will keep sending new resume tips there.'
                    : 'You are subscribed. We will send resume tips and product updates to your inbox.'
                );
                setNewsletterEmail('');
              } catch {
                toast.error('We could not save your subscription right now. Please try again in a moment.');
              } finally {
                setIsSubscribing(false);
              }
            }}>
              <div className="flex flex-col sm:flex-row gap-3">
                <label htmlFor="newsletter-email" className="sr-only">Email address</label>
                <input
                  id="newsletter-email"
                  type="email"
                  placeholder="Enter your email"
                  value={newsletterEmail}
                  onChange={(e) => setNewsletterEmail(e.target.value)}
                  className="px-4 py-3 rounded-lg bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 text-gray-700 dark:text-slate-200 placeholder-gray-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-400 min-w-[240px]"
                  required
                />
                <button type="submit" disabled={isSubscribing} className="bg-blue-600 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70 text-white font-medium px-6 py-3 rounded-lg transition-[background-color,box-shadow] duration-200 ease-out shadow hover:shadow-md">
                  {isSubscribing ? 'Saving...' : 'Subscribe'}
                </button>
              </div>
            </form>
          </div>
        </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          {/* Column 1: Logo and Description */}
          <div className="col-span-2 md:col-span-1">
            <TouchLink to="/" className="inline-block mb-4" onClick={scrollToTop}>
              <span className="text-xl font-bold text-blue-600">ResumeATS</span>
            </TouchLink>
            <p className="text-gray-600 dark:text-slate-400 text-sm mb-6">
              Build clear resumes from your experience, review common ATS issues, and keep your applications organized.
            </p>

            <div className="mb-5 rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-100/70 dark:bg-slate-800/70 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Support Expectations</p>
              <p className="mt-2 text-sm text-gray-700 dark:text-slate-300">{SUPPORT_RESPONSE_TIME}</p>
              <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">{SUPPORT_BILLING_PRIORITY}</p>
            </div>

            {/* Contact shortcuts */}
            <div className="flex space-x-3">
              <TouchExternalLink
                href={`mailto:${SUPPORT_EMAIL}`}
                className="bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 p-2 rounded-full transition-[background-color,color,box-shadow] duration-200 ease-out text-blue-600"
                ariaLabel="Email support"
                openInNewTab={false}
              >
                <span className="sr-only">Email support</span>
                <SupportChannelIcon kind="email" />
              </TouchExternalLink>
              <TouchExternalLink
                href={`tel:${SUPPORT_PHONE_URI}`}
                className="bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 p-2 rounded-full transition-[background-color,color,box-shadow] duration-200 ease-out text-blue-600"
                ariaLabel="Call support"
                openInNewTab={false}
              >
                <span className="sr-only">Call support</span>
                <SupportChannelIcon kind="phone" />
              </TouchExternalLink>
              <TouchExternalLink
                href={SUPPORT_WHATSAPP_URI}
                className="bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 p-2 rounded-full transition-[background-color,color,box-shadow] duration-200 ease-out text-blue-600"
                ariaLabel="WhatsApp support"
              >
                <span className="sr-only">WhatsApp support</span>
                <SupportChannelIcon kind="whatsapp" />
              </TouchExternalLink>
              <TouchLink
                to="/contact"
                className="bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 p-2 rounded-full transition-[background-color,color,box-shadow] duration-200 ease-out text-blue-600"
                ariaLabel="Open contact page"
                onClick={scrollToTop}
              >
                <span className="sr-only">Open contact page</span>
                <SupportChannelIcon kind="contact" />
              </TouchLink>
            </div>
            <p className="mt-3 text-xs text-gray-500 dark:text-slate-500">
              <span className="whitespace-nowrap">Email: {SUPPORT_EMAIL}</span>
              <span aria-hidden="true" className="mx-1">/</span>
              <span className="whitespace-nowrap">{SUPPORT_PHONE_DISPLAY}</span>
            </p>
          </div>

          {/* Column 2: Quick Links */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-gray-900 dark:text-slate-100 uppercase tracking-wider">Quick Links</h3>
            <ul className="space-y-1.5">
              <li>
                <TouchLink
                  to="/"
                  className="text-gray-600 dark:text-slate-400 hover:text-blue-600 text-sm flex items-center group py-1"
                  onClick={scrollToTop}
                >
                  <span className="transform transition-transform group-hover:translate-x-1">Home</span>
                </TouchLink>
              </li>
              <li>
                <TouchLink
                  to={user ? '/dashboard' : '/signup'}
                  className="text-gray-600 dark:text-slate-400 hover:text-blue-600 text-sm flex items-center group py-1"
                  onClick={scrollToTop}
                >
                  <span className="transform transition-transform group-hover:translate-x-1">
                    {user ? 'My resumes' : 'Get started free'}
                  </span>
                </TouchLink>
              </li>
              <li>
                <TouchLink
                  to="/learn"
                  className="text-gray-600 dark:text-slate-400 hover:text-blue-600 text-sm flex items-center group py-1"
                  onClick={scrollToTop}
                >
                  <span className="transform transition-transform group-hover:translate-x-1">Resume tips</span>
                </TouchLink>
              </li>
              <li>
                <TouchLink
                  to="/pricing"
                  className="text-gray-600 dark:text-slate-400 hover:text-blue-600 text-sm flex items-center group py-1"
                  onClick={scrollToTop}
                >
                  <span className="transform transition-transform group-hover:translate-x-1">Pricing</span>
                </TouchLink>
              </li>
            </ul>
          </div>

          {/* Column 3: Resources */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-gray-900 dark:text-slate-100 uppercase tracking-wider">Resources</h3>
            <ul className="space-y-1.5">
              <li>
                <TouchLink
                  to="/learn#best-practices"
                  className="text-gray-600 dark:text-slate-400 hover:text-blue-600 text-sm flex items-center group py-1"
                >
                  <span className="transform transition-transform group-hover:translate-x-1">ATS Best Practices</span>
                </TouchLink>
              </li>
              <li>
                <TouchLink
                  to="/learn#keyword-optimization"
                  className="text-gray-600 dark:text-slate-400 hover:text-blue-600 text-sm flex items-center group py-1"
                >
                  <span className="transform transition-transform group-hover:translate-x-1">Keyword Optimization</span>
                </TouchLink>
              </li>
              <li>
                <TouchLink
                  to="/faq"
                  className="text-gray-600 dark:text-slate-400 hover:text-blue-600 text-sm flex items-center group py-1"
                  onClick={scrollToTop}
                >
                  <span className="transform transition-transform group-hover:translate-x-1">FAQ</span>
                </TouchLink>
              </li>
            </ul>
          </div>

          {/* Column 4: Company */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-gray-900 dark:text-slate-100 uppercase tracking-wider">Company</h3>
            <ul className="space-y-1.5">
              <li>
                <TouchLink
                  to="/about"
                  className="text-gray-600 dark:text-slate-400 hover:text-blue-600 text-sm flex items-center group py-1"
                  onClick={scrollToTop}
                >
                  <span className="transform transition-transform group-hover:translate-x-1">About Us</span>
                </TouchLink>
              </li>
              <li>
                <TouchLink
                  to="/contact"
                  className="text-gray-600 dark:text-slate-400 hover:text-blue-600 text-sm flex items-center group py-1"
                  onClick={scrollToTop}
                >
                  <span className="transform transition-transform group-hover:translate-x-1">Contact</span>
                </TouchLink>
              </li>
              <li>
                <TouchLink
                  to="/terms"
                  className="text-gray-600 dark:text-slate-400 hover:text-blue-600 text-sm flex items-center group py-1"
                  onClick={scrollToTop}
                >
                  <span className="transform transition-transform group-hover:translate-x-1">Terms of Service</span>
                </TouchLink>
              </li>
              <li>
                <TouchLink
                  to="/privacy-policy"
                  className="text-gray-600 dark:text-slate-400 hover:text-blue-600 text-sm flex items-center group py-1"
                  onClick={scrollToTop}
                >
                  <span className="transform transition-transform group-hover:translate-x-1">Privacy Policy</span>
                </TouchLink>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Copyright Section */}
      <div className="border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-6">
        <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center">
          <div className="flex items-center space-x-4">
            <button
              type="button"
              onClick={scrollToTop}
              className="bg-gray-100 hover:bg-gray-200 dark:bg-slate-800 dark:hover:bg-slate-700 p-2 rounded-full transition-[background-color,color,box-shadow] duration-200 ease-out text-gray-600"
              aria-label="Scroll to top"
            >
              <svg aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            </button>
            <p className="text-gray-600 dark:text-slate-400 text-sm">
              &copy; {currentYear} ResumeATS. All rights reserved.
            </p>
          </div>
          <div className="mt-4 md:mt-0">
            <p className="text-gray-500 dark:text-slate-500 text-sm">
              Support requests are tracked in ResumeATS and answered by email.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
