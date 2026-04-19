import React from 'react';
// import PropTypes from 'prop-types'; // Removed unused PropTypes
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/**
 * MobileBottomNav - A mobile navigation bar fixed to the bottom of the screen
 * Only visible on mobile devices and for authenticated users
 *
 * @returns {JSX.Element|null} - MobileBottomNav component or null if user not authenticated
 */
const MobileBottomNav = () => {
  const location = useLocation();
  const { user } = useAuth();

  const isActive = (path) => location.pathname.includes(path);

  // Don't show bottom nav for non-logged in users
  if (!user) return null;

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-800 shadow-lg border-t border-gray-200 dark:border-slate-700 z-50 transition-colors duration-200"
      aria-label="Mobile navigation"
    >
      <div className="flex justify-around items-center h-16">
        <Link
          to="/dashboard"
          className={`flex flex-col items-center p-2 ${isActive('/dashboard') ? 'text-blue-600' : 'text-gray-600 dark:text-slate-400'}`}
          aria-label="My Resumes"
          aria-current={isActive('/dashboard') ? 'page' : undefined}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-xs">Resumes</span>
        </Link>

        <Link
          to="/quick-resume"
          className={`flex flex-col items-center p-2 ${isActive('/quick-resume') ? 'text-blue-600' : 'text-gray-600 dark:text-slate-400'}`}
          aria-label="Quick Resume"
          aria-current={isActive('/quick-resume') ? 'page' : undefined}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span className="text-xs">Create</span>
        </Link>

        <Link
          to="/applications"
          className={`flex flex-col items-center p-2 ${isActive('/applications') ? 'text-blue-600' : 'text-gray-600 dark:text-slate-400'}`}
          aria-label="Applications"
          aria-current={isActive('/applications') ? 'page' : undefined}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          <span className="text-xs">Track</span>
        </Link>

        <Link
          to="/analytics"
          className={`flex flex-col items-center p-2 ${isActive('/analytics') ? 'text-blue-600' : 'text-gray-600 dark:text-slate-400'}`}
          aria-label="Analytics"
          aria-current={isActive('/analytics') ? 'page' : undefined}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span className="text-xs">Analytics</span>
        </Link>
      </div>
    </nav>
  );
};

export default React.memo(MobileBottomNav);
