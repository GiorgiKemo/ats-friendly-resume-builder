import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';

/**
 * OfflineNotification - A component to notify users when they're offline
 * Displays a notification banner at the bottom of the screen
 *
 * @param {Object} props - Component props
 * @param {string} [props.className] - Additional CSS classes
 * @returns {JSX.Element|null} - OfflineNotification component or null if online
 */
const OfflineNotification = ({ className = '' }) => {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      className={`fixed bottom-16 inset-x-0 bg-yellow-100 text-yellow-800 px-4 py-2 text-center text-sm z-50 md:bottom-0 ${className}`}
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-center justify-center">
        <svg
          className="w-4 h-4 mr-2"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span>You're offline. Some features may be limited.</span>
      </div>
    </div>
  );
};

OfflineNotification.propTypes = {
  className: PropTypes.string
};

export default React.memo(OfflineNotification);
