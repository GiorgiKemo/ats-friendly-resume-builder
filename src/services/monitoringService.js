import { supabase } from './supabase';

const LOG_TO_CONSOLE = import.meta.env.DEV === true;

const logToConsole = (level, ...args) => {
  if (!LOG_TO_CONSOLE) return;
  const fn = console[level] || console.log;
  fn(...args);
};

/**
 * Service for monitoring and logging important events
 */

// Set VITE_DISABLE_SYSTEM_LOGGING=true only for local troubleshooting.
const DISABLE_SYSTEM_LOGGING = import.meta.env.VITE_DISABLE_SYSTEM_LOGGING === 'true';
let globalHandlersInstalled = false;

// Event types
export const EVENT_TYPES = {
  // Authentication events
  AUTH_SIGN_IN_SUCCESS: 'auth.signin.success',
  AUTH_SIGN_IN_FAILURE: 'auth.signin.failure',
  AUTH_SIGN_UP_SUCCESS: 'auth.signup.success',
  AUTH_SIGN_UP_FAILURE: 'auth.signup.failure',
  AUTH_SIGN_OUT: 'auth.signout',
  AUTH_PASSWORD_RESET: 'auth.password.reset',

  // Resume events
  RESUME_CREATE: 'resume.create',
  RESUME_UPDATE: 'resume.update',
  RESUME_DELETE: 'resume.delete',
  RESUME_EXPORT: 'resume.export',

  // Subscription events
  SUBSCRIPTION_CREATE: 'subscription.create',
  SUBSCRIPTION_UPDATE: 'subscription.update',
  SUBSCRIPTION_CANCEL: 'subscription.cancel',

  // AI generation events
  AI_GENERATION_SUCCESS: 'ai.generation.success',
  AI_GENERATION_FAILURE: 'ai.generation.failure',

  // Security events
  SECURITY_UNAUTHORIZED_ACCESS: 'security.unauthorized_access',
  SECURITY_SUSPICIOUS_ACTIVITY: 'security.suspicious_activity',

  // Error events
  ERROR_API: 'error.api',
  ERROR_UI: 'error.ui',
  ERROR_BOUNDARY: 'error.boundary'
};

// Severity levels
export const SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical'
};

const reportClientError = async (error, context = 'unknown', additionalData = {}, severity = SEVERITY.ERROR) => {
  try {
    if (!error) return { success: false, message: 'No error provided' };

    const message = error.message || String(error);
    const stack = error.stack || '';
    const { data, error: reportError } = await supabase.functions.invoke('report-client-error', {
      body: {
        severity,
        source: context || 'client',
        message,
        stack,
        context: additionalData,
        url: typeof window !== 'undefined' ? window.location.href : '',
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      },
    });

    if (reportError || data?.ok === false) {
      return { success: false, error: reportError || data?.error };
    }

    return { success: true };
  } catch (reportingError) {
    logToConsole('error', 'Error reporting client error:', reportingError);
    return { success: false, error: reportingError, gracefulFailure: true };
  }
};

/**
 * Log an event to the system_logs table
 * @param {string} eventType - Type of event from EVENT_TYPES
 * @param {string} message - Description of the event
 * @param {Object} metadata - Additional data about the event
 * @param {string} severity - Severity level from SEVERITY
 * @returns {Promise<Object>} - Result of the logging operation
 */
export const logEvent = async (eventType, message, metadata = {}, severity = SEVERITY.INFO) => {
  try {
    // Always log to console for debugging
    logToConsole('log', `[${severity.toUpperCase()}] ${eventType}: ${message}`, metadata);

    if (DISABLE_SYSTEM_LOGGING) {
      return Promise.resolve({ success: true, disabled: true });
    }

    return await reportClientError(new Error(message), eventType, metadata, severity);

  } catch (error) {
    logToConsole('error', 'Error in logEvent:', error);
    // Return a resolved promise even on error to prevent breaking the app flow
    return Promise.resolve({ success: false, error, gracefulFailure: true });
  }
};

/**
 * Log an error to the system_logs table
 * @param {Error} error - The error object
 * @param {string} context - Where the error occurred
 * @param {Object} additionalData - Any additional data about the error
 * @returns {Promise<Object>} - Result of the logging operation
 */
export const logError = async (error, context, additionalData = {}) => {
  try {
    // Handle case where error might be null or undefined
    if (!error) {
      return Promise.resolve({ success: false, message: 'No error provided' });
    }

    const errorType = error.name || 'Unknown';
    const errorMessage = error.message || 'An unknown error occurred';
    const stackTrace = error.stack || '';

    let eventType = EVENT_TYPES.ERROR_API;
    if (context && typeof context === 'string') {
      if (context.includes('ui') || context.includes('component')) {
        eventType = EVENT_TYPES.ERROR_UI;
      } else if (context.includes('boundary')) {
        eventType = EVENT_TYPES.ERROR_BOUNDARY;
      }
    }

    const metadata = {
      errorType,
      stackTrace,
      context: context || 'unknown',
      ...additionalData
    };

    reportClientError(error, context, metadata, SEVERITY.ERROR);

    // Wrap in try/catch to ensure we always return a Promise
    try {
      return await logEvent(eventType, errorMessage, metadata, SEVERITY.ERROR);
    } catch (loggingError) {
      logToConsole('error', 'Error in logEvent during logError:', loggingError);
      return Promise.resolve({ success: false, error: loggingError });
    }
  } catch (unexpectedError) {
    logToConsole('error', 'Unexpected error in logError:', unexpectedError);
    return Promise.resolve({ success: false, error: unexpectedError });
  }
};

export const installGlobalErrorHandlers = () => {
  if (typeof window === 'undefined' || globalHandlersInstalled) return;
  globalHandlersInstalled = true;

  window.addEventListener('error', (event) => {
    reportClientError(event.error || new Error(event.message), 'window.error', {
      filename: event.filename,
      lineNumber: event.lineno,
      columnNumber: event.colno,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason instanceof Error
      ? event.reason
      : new Error(typeof event.reason === 'string' ? event.reason : 'Unhandled promise rejection');

    reportClientError(reason, 'window.unhandledrejection', {
      reason: event.reason && typeof event.reason === 'object' ? String(event.reason) : event.reason,
    });
  });
};

/**
 * Log a security event to the system_logs table
 * @param {string} eventType - Type of security event
 * @param {string} message - Description of the security event
 * @param {Object} metadata - Additional data about the security event
 * @returns {Promise<Object>} - Result of the logging operation
 */
export const logSecurityEvent = async (eventType, message, metadata = {}) => {
  try {
    return await logEvent(eventType, message, metadata, SEVERITY.WARNING);
  } catch (error) {
    logToConsole('error', 'Error in logSecurityEvent:', error);
    return Promise.resolve({ success: false, error });
  }
};

/**
 * Track failed login attempts
 * @param {string} email - The email that failed to login
 * @param {string} reason - The reason for the failure
 * @param {Object} additionalData - Any additional data
 * @returns {Promise<Object>} - Result of the logging operation
 */
export const trackFailedLogin = async (email, reason, additionalData = {}) => {
  try {
    let ipAddress = 'unknown';
    try {
      ipAddress = await getClientIP();
    } catch (ipError) {
      logToConsole('error', 'Error getting IP address:', ipError);
    }

    const metadata = {
      email: email || 'unknown',
      reason: reason || 'unknown',
      ipAddress,
      userAgent: navigator.userAgent,
      ...additionalData
    };

    return await logEvent(
      EVENT_TYPES.AUTH_SIGN_IN_FAILURE,
      `Failed login attempt for ${email || 'unknown'}: ${reason || 'unknown'}`,
      metadata,
      SEVERITY.WARNING
    );
  } catch (error) {
    logToConsole('error', 'Error in trackFailedLogin:', error);
    return Promise.resolve({ success: false, error });
  }
};

/**
 * Track successful login
 * @param {string} userId - The user ID
 * @param {string} email - The email that logged in
 * @returns {Promise<Object>} - Result of the logging operation
 */
export const trackSuccessfulLogin = async (userId, email) => {
  try {
    let ipAddress = 'unknown';
    try {
      ipAddress = await getClientIP();
    } catch (ipError) {
      logToConsole('error', 'Error getting IP address:', ipError);
    }

    const metadata = {
      userId: userId || 'unknown',
      email: email || 'unknown',
      ipAddress,
      userAgent: navigator.userAgent
    };

    return await logEvent(
      EVENT_TYPES.AUTH_SIGN_IN_SUCCESS,
      `Successful login for ${email || 'unknown'}`,
      metadata,
      SEVERITY.INFO
    );
  } catch (error) {
    logToConsole('error', 'Error in trackSuccessfulLogin:', error);
    return Promise.resolve({ success: false, error });
  }
};

/**
 * Get the client's IP address
 * @returns {Promise<string>} - The client's IP address
 */
const getClientIP = async () => {
  try {
    // Set a timeout for the fetch request
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout

    const response = await fetch('https://api.ipify.org?format=json', {
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.ip || 'unknown';
  } catch (error) {
    logToConsole('error', 'Error getting client IP:', error);
    return 'unknown';
  }
};

export default {
  logEvent,
  logError,
  installGlobalErrorHandlers,
  logSecurityEvent,
  trackFailedLogin,
  trackSuccessfulLogin,
  EVENT_TYPES,
  SEVERITY
};
