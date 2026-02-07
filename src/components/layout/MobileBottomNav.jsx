import React from 'react';
// import PropTypes from 'prop-types'; // Removed unused PropTypes
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useResume, initialResumeState } from '../../context/ResumeContext.tsx'; // Import useResume and initialResumeState

/**
 * MobileBottomNav - A mobile navigation bar fixed to the bottom of the screen
 * Only visible on mobile devices and for authenticated users
 *
 * @returns {JSX.Element|null} - MobileBottomNav component or null if user not authenticated
 */
const MobileBottomNav = () => {
  const location = useLocation();
  const { user } = useAuth();
  const { updateCurrentResume } = useResume(); // Get updateCurrentResume instead

  const isActive = (path) => location.pathname.includes(path);

  const handleCreateClick = () => {
    updateCurrentResume(initialResumeState, false); // Call updateCurrentResume, autosave false
    // Navigation will be handled by the Link's `to` prop
  };

  // Don't show bottom nav for non-logged in users
  if (!user) return null;

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 bg-white shadow-lg border-t border-gray-200 z-50"
      aria-label="Mobile navigation"
    >
      <div className="flex justify-around items-center h-16">
        <Link
          to="/dashboard"
          className={`flex flex-col items-center p-2 ${isActive('/dashboard') ? 'text-blue-600' : 'text-gray-600'}`}
          aria-label="My Resumes"
          aria-current={isActive('/dashboard') ? 'page' : undefined}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-xs">My Resumes</span>
        </Link>

        <Link
          to="/builder"
          className={`flex flex-col items-center p-2 ${isActive('/builder') ? 'text-blue-600' : 'text-gray-600'}`}
          aria-label="Create Resume"
          aria-current={isActive('/builder') ? 'page' : undefined}
          onClick={handleCreateClick} // Add onClick handler
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          <span className="text-xs">Create</span>
        </Link>

        <Link
          to="/ai-generator"
          className={`flex flex-col items-center p-2 ${isActive('/ai-generator') ? 'text-blue-600' : 'text-gray-600'}`}
          aria-label="AI Generator"
          aria-current={isActive('/ai-generator') ? 'page' : undefined}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span className="text-xs">AI Generator</span>
        </Link>

        <Link
          to="/profile"
          className={`flex flex-col items-center p-2 ${isActive('/profile') ? 'text-blue-600' : 'text-gray-600'}`}
          aria-label="Settings"
          aria-current={isActive('/profile') ? 'page' : undefined}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-xs">Settings</span>
        </Link>
      </div>
    </nav>
  );
};

export default React.memo(MobileBottomNav);
