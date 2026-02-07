import { useState, useCallback } from 'react';
import { toast } from 'react-hot-toast';

/**
 * Custom hook for handling API errors
 * @param {Object} options - Configuration options
 * @param {boolean} options.showToast - Whether to show toast notifications for errors
 * @param {Function} options.onError - Optional callback for when an error occurs
 * @returns {Object} - Error handling utilities
 */
export const useApiError = (options = {}) => {
  const { showToast = true, onError } = options;
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  /**
   * Handles an API error
   * @param {Error} err - The error object
   * @param {string} customMessage - Optional custom message to display
   */
  const handleError = useCallback((err, customMessage = null) => {
    console.error('API Error:', err);
    
    // Set the error state
    setError(err);
    
    // Show toast notification if enabled
    if (showToast) {
      const message = customMessage || getErrorMessage(err);
      toast.error(message);
    }
    
    // Call the onError callback if provided
    if (onError && typeof onError === 'function') {
      onError(err);
    }
    
    // Always set loading to false when an error occurs
    setIsLoading(false);
  }, [showToast, onError]);

  /**
   * Wraps an async function with error handling
   * @param {Function} fn - The async function to wrap
   * @param {Object} options - Options for this specific call
   * @param {string} options.loadingMessage - Message to show while loading
   * @param {string} options.successMessage - Message to show on success
   * @param {string} options.errorMessage - Custom error message
   * @returns {Function} - The wrapped function
   */
  const withErrorHandling = useCallback((fn, options = {}) => {
    return async (...args) => {
      const { 
        loadingMessage = 'Loading...',
        successMessage = null,
        errorMessage = null
      } = options;
      
      try {
        setIsLoading(true);
        setError(null);
        
        // Show loading toast if a message is provided
        let loadingToast;
        if (loadingMessage) {
          loadingToast = toast.loading(loadingMessage);
        }
        
        // Call the function
        const result = await fn(...args);
        
        // Dismiss loading toast and show success toast if provided
        if (loadingToast) {
          toast.dismiss(loadingToast);
        }
        
        if (successMessage) {
          toast.success(successMessage);
        }
        
        setIsLoading(false);
        return result;
      } catch (err) {
        handleError(err, errorMessage);
        throw err; // Re-throw the error for the caller to handle if needed
      }
    };
  }, [handleError]);

  /**
   * Clears the current error
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    error,
    isLoading,
    handleError,
    withErrorHandling,
    clearError
  };
};

/**
 * Extracts a user-friendly error message from an error object
 * @param {Error} error - The error object
 * @returns {string} - A user-friendly error message
 */
function getErrorMessage(error) {
  // Handle Supabase errors
  if (error?.message) {
    // Clean up common Supabase error messages
    let message = error.message;
    
    // Remove technical details that users don't need to see
    message = message.replace(/PGRST\d+: /g, '');
    message = message.replace(/Error: /g, '');
    
    // Handle specific error codes
    if (message.includes('JWT expired')) {
      return 'Your session has expired. Please log in again.';
    }
    
    if (message.includes('duplicate key value violates unique constraint')) {
      return 'This item already exists.';
    }
    
    return message;
  }
  
  // Handle network errors
  if (error?.name === 'NetworkError' || error?.message?.includes('network')) {
    return 'Network error. Please check your internet connection.';
  }
  
  // Handle timeout errors
  if (error?.name === 'TimeoutError' || error?.message?.includes('timeout')) {
    return 'Request timed out. Please try again.';
  }
  
  // Default error message
  return 'An unexpected error occurred. Please try again.';
}
