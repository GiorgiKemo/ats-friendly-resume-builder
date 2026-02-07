/**
 * Security utilities for the application
 */

const LOG_SECURITY_DEBUG = import.meta.env.DEV === true;

/**
 * Reports CSP violations to the console in development
 * In production, this would report to a server endpoint
 */
export const setupCSPReporting = () => {
  if (import.meta.env.DEV) {
    document.addEventListener('securitypolicyviolation', (e) => {
      if (!LOG_SECURITY_DEBUG) return;
      console.error('CSP Violation:', {
        'violatedDirective': e.violatedDirective,
        'effectiveDirective': e.effectiveDirective,
        'blockedURI': e.blockedURI,
        'sourceFile': e.sourceFile,
        'lineNumber': e.lineNumber,
        'columnNumber': e.columnNumber
      });
    });

    if (LOG_SECURITY_DEBUG) {
      console.info('CSP violation reporting enabled for development');
    }
  }
};

/**
 * Validates and sanitizes user input to prevent XSS attacks
 * @param {string} input - The user input to sanitize
 * @returns {string} - The sanitized input
 */
export const sanitizeInput = (input) => {
  if (!input || typeof input !== 'string') return '';

  // Basic HTML entity encoding
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

/**
 * Validates a URL to ensure it's safe
 * @param {string} url - The URL to validate
 * @returns {boolean} - Whether the URL is safe
 */
export const isValidUrl = (url) => {
  if (!url || typeof url !== 'string') return false;

  try {
    const parsedUrl = new URL(url);
    return ['http:', 'https:'].includes(parsedUrl.protocol);
  } catch { // _e was unused
    return false;
  }
};

/**
 * Creates a nonce for use in CSP
 * @returns {string} - A random nonce
 */
export const generateNonce = () => {
  const array = new Uint8Array(16);
  window.crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
};

/**
 * Safer alternatives to eval() and new Function()
 * Use these functions instead of direct eval() when possible
 */

/**
 * Safely evaluates a JSON string
 * @param {string} jsonString - The JSON string to parse
 * @returns {any} - The parsed JSON object
 */
export const safeJSONParse = (jsonString) => {
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    console.error('Error parsing JSON:', e);
    return null;
  }
};

/**
 * Robustly parses JSON from AI model responses, handling various edge cases
 * @param {string} responseText - The raw text response from the AI model
 * @param {string} errorContext - Context for error messages (e.g., 'resume generation')
 * @returns {any} - The parsed JSON object
 * @throws {Error} - If parsing fails after all attempts
 */
export const robustJSONParse = (responseText, errorContext = 'AI response') => {
  if (!responseText) {
    throw new Error(`Empty response received from AI model`);
  }

  try {
    // First try the simple cleaning approach - remove markdown code blocks
    const cleanedJsonText = responseText.replace(/^```json\s*|```$/g, '').trim();

    // Try to parse the cleaned text
    try {
      return JSON.parse(cleanedJsonText);
    } catch (parseError) {
      if (LOG_SECURITY_DEBUG) {
        console.warn(`Initial JSON parsing failed for ${errorContext}, attempting more robust extraction:`, parseError.message);
      }

      // If simple cleaning fails, try more advanced extraction
      // Find the first opening brace and last closing brace
      const firstBrace = responseText.indexOf('{');
      const lastBrace = responseText.lastIndexOf('}');

      if (firstBrace !== -1 && lastBrace > firstBrace) {
        // Extract what looks like a JSON object
        const jsonCandidate = responseText.substring(firstBrace, lastBrace + 1);
        return JSON.parse(jsonCandidate);
      } else {
        throw new Error('Could not find valid JSON structure in response');
      }
    }
  } catch (error) {
    if (LOG_SECURITY_DEBUG) {
      console.error(`Failed to parse JSON ${errorContext}:`, error);
      console.error('Raw response text:', responseText);
    }
    throw new Error(`Failed to parse the AI-generated ${errorContext}. Please try again.`);
  }
};

/**
 * Safely accesses a property path on an object
 * @param {Object} obj - The object to access
 * @param {string} path - The property path (e.g., 'user.profile.name')
 * @returns {any} - The value at the property path or undefined
 */
export const safeGetProperty = (obj, path) => {
  if (!obj || !path) return undefined;

  const keys = path.split('.');
  let result = obj;

  for (const key of keys) {
    if (result === null || result === undefined) return undefined;
    result = result[key];
  }

  return result;
};

/**
 * Safely calls a method on an object by name
 * @param {Object} obj - The object containing the method
 * @param {string} methodName - The name of the method to call
 * @param {Array} args - Arguments to pass to the method
 * @returns {any} - The result of the method call
 */
export const safeCallMethod = (obj, methodName, args = []) => {
  if (!obj || typeof obj !== 'object' || typeof methodName !== 'string') {
    return undefined;
  }

  const method = obj[methodName];
  if (typeof method !== 'function') {
    return undefined;
  }

  try {
    return method.apply(obj, args);
  } catch (e) {
    console.error(`Error calling method ${methodName}:`, e);
    return undefined;
  }
};

/**
 * Creates a safer version of setTimeout that doesn't use string evaluation
 * @param {Function} callback - The function to call
 * @param {number} delay - The delay in milliseconds
 * @returns {number} - The timeout ID
 */
export const safeSetTimeout = (callback, delay) => {
  if (typeof callback !== 'function') {
    console.error('safeSetTimeout requires a function as the first argument');
    return null;
  }

  return setTimeout(callback, delay);
};

/**
 * Creates a safer version of setInterval that doesn't use string evaluation
 * @param {Function} callback - The function to call
 * @param {number} delay - The delay in milliseconds
 * @returns {number} - The interval ID
 */
export const safeSetInterval = (callback, delay) => {
  if (typeof callback !== 'function') {
    console.error('safeSetInterval requires a function as the first argument');
    return null;
  }

  return setInterval(callback, delay);
};

export default {
  setupCSPReporting,
  sanitizeInput,
  isValidUrl,
  generateNonce,
  safeJSONParse,
  robustJSONParse,
  safeGetProperty,
  safeCallMethod,
  safeSetTimeout,
  safeSetInterval
};
