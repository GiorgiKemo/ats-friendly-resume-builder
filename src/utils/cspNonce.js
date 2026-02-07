/**
 * Content Security Policy (CSP) Nonce Generator
 * 
 * This utility generates and manages CSP nonces for the application.
 * Nonces are used to allow specific inline scripts to execute while maintaining
 * a strict Content Security Policy that blocks arbitrary script execution.
 */

/**
 * Generate a cryptographically secure random nonce
 * @returns {string} A base64-encoded nonce
 */
export function generateNonce() {
  // Use crypto.getRandomValues for better randomness if available
  if (window.crypto && window.crypto.getRandomValues) {
    const array = new Uint8Array(16);
    window.crypto.getRandomValues(array);
    return btoa(String.fromCharCode.apply(null, array))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }
  
  // Fallback for older browsers
  return btoa(Math.random().toString(36).substring(2, 15) + 
              Math.random().toString(36).substring(2, 15))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Apply the nonce to the CSP meta tag
 * @param {string} nonce - The nonce to apply
 */
export function applyNonceToCSP(nonce) {
  const cspMeta = document.getElementById('csp-meta');
  if (cspMeta) {
    let content = cspMeta.getAttribute('content');
    content = content.replace(/nonce-[a-zA-Z0-9+/=_-]*/g, `nonce-${nonce}`);
    cspMeta.setAttribute('content', content);
  }
}

/**
 * Apply the nonce to all script tags
 * @param {string} nonce - The nonce to apply
 */
export function applyNonceToScripts(nonce) {
  const scripts = document.querySelectorAll('script');
  scripts.forEach(script => {
    script.setAttribute('nonce', nonce);
  });
}

/**
 * Initialize CSP nonce
 * @returns {string} The generated nonce
 */
export function initCSPNonce() {
  const nonce = generateNonce();
  
  // Apply nonce to CSP meta tag
  applyNonceToCSP(nonce);
  
  // Apply nonce to existing script tags
  applyNonceToScripts(nonce);
  
  // Store nonce in window for later use
  window.__CSP_NONCE__ = nonce;
  
  return nonce;
}

/**
 * Get the current CSP nonce
 * @returns {string} The current nonce
 */
export function getNonce() {
  return window.__CSP_NONCE__ || '';
}

/**
 * Create a script element with the CSP nonce
 * @param {string} code - The JavaScript code to execute
 * @returns {HTMLScriptElement} The created script element
 */
export function createNoncedScript(code) {
  const script = document.createElement('script');
  script.setAttribute('nonce', getNonce());
  script.textContent = code;
  return script;
}

export default {
  generateNonce,
  applyNonceToCSP,
  applyNonceToScripts,
  initCSPNonce,
  getNonce,
  createNoncedScript
};
