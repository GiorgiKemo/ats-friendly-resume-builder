import React, { useState } from 'react';
import { TouchLink, TouchExternalLink } from '../ui';
import toast from 'react-hot-toast';

const Footer = () => {
  const currentYear = new Date().getFullYear();
  const [newsletterEmail, setNewsletterEmail] = useState('');

  // Function to scroll to top when clicking links
  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  return (
    <footer className="bg-gray-50 text-gray-700 border-t border-gray-200">
      {/* Newsletter Section */}
      <div className="container mx-auto px-6 pt-12 pb-8">
        <div className="max-w-4xl mx-auto bg-white rounded-xl p-8 mb-12 shadow-md border border-gray-100">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="text-center md:text-left">
              <h3 className="text-xl font-bold mb-2 text-gray-800">Stay ahead in your job search</h3>
              <p className="text-gray-600 text-sm">
                Get resume tips, ATS insights, and career advice delivered to your inbox.
              </p>
            </div>
            <form className="w-full md:w-auto" onSubmit={(e) => {
              e.preventDefault();
              if (!newsletterEmail || !newsletterEmail.includes('@')) {
                toast.error('Please enter a valid email address.');
                return;
              }
              toast.success('Thank you for subscribing! We\'ll keep you updated with resume tips and career advice.');
              setNewsletterEmail('');
            }}>
              <div className="flex flex-col sm:flex-row gap-3">
                <label htmlFor="newsletter-email" className="sr-only">Email address</label>
                <input
                  id="newsletter-email"
                  type="email"
                  placeholder="Enter your email"
                  value={newsletterEmail}
                  onChange={(e) => setNewsletterEmail(e.target.value)}
                  className="px-4 py-3 rounded-lg bg-gray-50 border border-gray-200 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 min-w-[240px]"
                  required
                />
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 rounded-lg transition-all shadow hover:shadow-md">
                  Subscribe
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          {/* Column 1: Logo and Description */}
          <div className="col-span-2 md:col-span-1">
            <TouchLink to="/" className="inline-block mb-4" onClick={scrollToTop}>
              <span className="text-xl font-bold text-blue-600">ResumeATS</span>
            </TouchLink>
            <p className="text-gray-600 text-sm mb-6">
              Create ATS-optimized resumes that get past applicant tracking systems and into the hands of hiring managers.
            </p>

            {/* Social Media Icons */}
            <div className="flex space-x-3">
              <TouchExternalLink
                href="https://facebook.com"
                className="bg-gray-100 hover:bg-gray-200 p-2 rounded-full transition-all text-blue-600"
                ariaLabel="Facebook"
              >
                <span className="sr-only">Facebook</span>
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path fillRule="evenodd" d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z" clipRule="evenodd" />
                </svg>
              </TouchExternalLink>
              <TouchExternalLink
                href="https://twitter.com"
                className="bg-gray-100 hover:bg-gray-200 p-2 rounded-full transition-all text-blue-600"
                ariaLabel="Twitter"
              >
                <span className="sr-only">Twitter</span>
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
                </svg>
              </TouchExternalLink>
              <TouchExternalLink
                href="https://linkedin.com"
                className="bg-gray-100 hover:bg-gray-200 p-2 rounded-full transition-all text-blue-600"
                ariaLabel="LinkedIn"
              >
                <span className="sr-only">LinkedIn</span>
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path fillRule="evenodd" d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" clipRule="evenodd" />
                </svg>
              </TouchExternalLink>
            </div>
          </div>

          {/* Column 2: Quick Links */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-gray-900 uppercase tracking-wider">Quick Links</h3>
            <ul className="space-y-1.5">
              <li>
                <TouchLink
                  to="/"
                  className="text-gray-600 hover:text-blue-600 text-sm flex items-center group py-1"
                  onClick={scrollToTop}
                >
                  <span className="transform transition-transform group-hover:translate-x-1">Home</span>
                </TouchLink>
              </li>
              <li>
                <TouchLink
                  to="/builder"
                  className="text-gray-600 hover:text-blue-600 text-sm flex items-center group py-1"
                  onClick={scrollToTop}
                >
                  <span className="transform transition-transform group-hover:translate-x-1">Resume Builder</span>
                </TouchLink>
              </li>
              <li>
                <TouchLink
                  to="/learn"
                  className="text-gray-600 hover:text-blue-600 text-sm flex items-center group py-1"
                  onClick={scrollToTop}
                >
                  <span className="transform transition-transform group-hover:translate-x-1">ATS Guide</span>
                </TouchLink>
              </li>
              <li>
                <TouchLink
                  to="/pricing"
                  className="text-gray-600 hover:text-blue-600 text-sm flex items-center group py-1"
                  onClick={scrollToTop}
                >
                  <span className="transform transition-transform group-hover:translate-x-1">Pricing</span>
                </TouchLink>
              </li>
            </ul>
          </div>

          {/* Column 3: Resources */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-gray-900 uppercase tracking-wider">Resources</h3>
            <ul className="space-y-1.5">
              <li>
                <TouchLink
                  to="/learn#best-practices"
                  className="text-gray-600 hover:text-blue-600 text-sm flex items-center group py-1"
                >
                  <span className="transform transition-transform group-hover:translate-x-1">ATS Best Practices</span>
                </TouchLink>
              </li>
              <li>
                <TouchLink
                  to="/learn#keyword-optimization"
                  className="text-gray-600 hover:text-blue-600 text-sm flex items-center group py-1"
                >
                  <span className="transform transition-transform group-hover:translate-x-1">Keyword Optimization</span>
                </TouchLink>
              </li>
              <li>
                <TouchLink
                  to="/faq"
                  className="text-gray-600 hover:text-blue-600 text-sm flex items-center group py-1"
                  onClick={scrollToTop}
                >
                  <span className="transform transition-transform group-hover:translate-x-1">FAQ</span>
                </TouchLink>
              </li>
            </ul>
          </div>

          {/* Column 4: Company */}
          <div>
            <h3 className="text-sm font-semibold mb-3 text-gray-900 uppercase tracking-wider">Company</h3>
            <ul className="space-y-1.5">
              <li>
                <TouchLink
                  to="/about"
                  className="text-gray-600 hover:text-blue-600 text-sm flex items-center group py-1"
                  onClick={scrollToTop}
                >
                  <span className="transform transition-transform group-hover:translate-x-1">About Us</span>
                </TouchLink>
              </li>
              <li>
                <TouchLink
                  to="/contact"
                  className="text-gray-600 hover:text-blue-600 text-sm flex items-center group py-1"
                  onClick={scrollToTop}
                >
                  <span className="transform transition-transform group-hover:translate-x-1">Contact</span>
                </TouchLink>
              </li>
              <li>
                <TouchLink
                  to="/terms"
                  className="text-gray-600 hover:text-blue-600 text-sm flex items-center group py-1"
                  onClick={scrollToTop}
                >
                  <span className="transform transition-transform group-hover:translate-x-1">Terms of Service</span>
                </TouchLink>
              </li>
              <li>
                <TouchLink
                  to="/privacy-policy"
                  className="text-gray-600 hover:text-blue-600 text-sm flex items-center group py-1"
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
      <div className="border-t border-gray-200 bg-white py-6">
        <div className="container mx-auto px-6 flex flex-col md:flex-row justify-between items-center">
          <div className="flex items-center space-x-4">
            <button
              onClick={scrollToTop}
              className="bg-gray-100 hover:bg-gray-200 p-2 rounded-full transition-all text-gray-600"
              aria-label="Scroll to top"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
            </button>
            <p className="text-gray-600 text-sm">
              &copy; {currentYear} ResumeATS. All rights reserved.
            </p>
          </div>
          <div className="mt-4 md:mt-0">
            <p className="text-gray-500 text-sm">
              Designed to help you land your dream job
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
