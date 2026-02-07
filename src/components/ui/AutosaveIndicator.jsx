import React, { useState, useEffect } from 'react';
import { safeSetTimeout } from '../../utils/security';

const AutosaveIndicator = ({ status, lastSavedTimestamp }) => {
  const [visible, setVisible] = useState(false);
  const [displayMessage, setDisplayMessage] = useState('');

  useEffect(() => {
    let message = '';
    let shouldBeVisible = false;

    if (status === 'saving') {
      message = 'Saving...';
      shouldBeVisible = true;
    } else if (status === 'saved') {
      const timeString = lastSavedTimestamp
        ? new Date(lastSavedTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '';
      message = `All changes saved ${timeString ? `at ${timeString}` : ''}`.trim();
      shouldBeVisible = true;
    } else if (status === 'error') {
      message = 'Autosave failed. Please save manually.';
      shouldBeVisible = true;
    } else {
      // For null or other statuses, ensure it's not visible
      shouldBeVisible = false;
    }

    setDisplayMessage(message);
    setVisible(shouldBeVisible);

    if (shouldBeVisible && (status === 'saved' || status === 'error')) {
      const timer = safeSetTimeout(() => {
        setVisible(false);
      }, 5000); // Hide after 5 seconds for 'saved' or 'error'
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [status, lastSavedTimestamp]);

  if (!visible || !displayMessage) return null;

  const getStatusStyles = () => {
    switch (status) {
      case 'saving':
        return 'bg-yellow-50 text-yellow-700 border border-yellow-200';
      case 'saved':
        return 'bg-green-50 text-green-700 border border-green-200';
      case 'error':
        return 'bg-red-50 text-red-700 border border-red-200';
      default:
        return 'bg-gray-50 text-gray-700 border border-gray-200'; // Fallback, though should not be visible
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'saving':
        return (
          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
        );
      case 'saved':
        return (
          <svg className="h-5 w-5 text-green-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        );
      case 'error':
        return (
          <svg className="h-5 w-5 text-red-500" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div className={`fixed bottom-4 right-4 px-4 py-2 rounded-md shadow-lg transition-opacity duration-300 z-50 text-sm ${getStatusStyles()} ${visible ? 'opacity-100' : 'opacity-0'}`}>
      <div className="flex items-center space-x-2">
        {getStatusIcon()}
        <span className="font-medium">{displayMessage}</span>
        {status === 'error' && (
          <button
            className="ml-2 text-xs underline hover:text-red-800"
            onClick={() => setVisible(false)} // Allow dismissing error message
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
};

export default AutosaveIndicator;
