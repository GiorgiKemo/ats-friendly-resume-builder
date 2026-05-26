import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const FOCUS_ROUTE_PATTERN = /^\/(builder|preview|quick-resume)(\/|$)/;

const MobileBottomNav = () => {
  const location = useLocation();
  const { user } = useAuth();

  if (!user || FOCUS_ROUTE_PATTERN.test(location.pathname)) {
    return null;
  }

  const isActive = (path) =>
    location.pathname === path || location.pathname.startsWith(`${path}/`);

  const tabClass = (active) =>
    `flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 ${
      active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-600 dark:text-slate-400'
    }`;

  return (
    <nav
      className="app-bottom-nav border-t border-gray-200 bg-white shadow-lg transition-colors duration-200 dark:border-slate-700 dark:bg-slate-800 md:hidden"
      aria-label="Main navigation"
    >
      <div className="app-bottom-nav-inner flex items-stretch justify-around">
        <Link
          to="/dashboard"
          className={tabClass(isActive('/dashboard'))}
          aria-current={isActive('/dashboard') ? 'page' : undefined}
        >
          <svg className="h-6 w-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-[11px] font-medium">My resumes</span>
        </Link>

        <Link
          to="/new"
          className={tabClass(isActive('/new'))}
          aria-current={isActive('/new') ? 'page' : undefined}
        >
          <svg className="h-6 w-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span className="text-[11px] font-medium">New resume</span>
        </Link>

        <Link
          to="/applications"
          className={tabClass(isActive('/applications'))}
          aria-current={isActive('/applications') ? 'page' : undefined}
        >
          <svg className="h-6 w-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <span className="text-[11px] font-medium">Applications</span>
        </Link>

        <Link
          to="/profile"
          className={tabClass(isActive('/profile'))}
          aria-current={isActive('/profile') ? 'page' : undefined}
        >
          <svg className="h-6 w-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <span className="text-[11px] font-medium">Account</span>
        </Link>
      </div>
    </nav>
  );
};

export default React.memo(MobileBottomNav);
