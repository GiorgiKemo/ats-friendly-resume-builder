# Security Best Practices

This document outlines security best practices for the ATS-Friendly Resume Builder application.

## Content Security Policy (CSP)

Our application uses a Content Security Policy to prevent cross-site scripting (XSS) and other code injection attacks. The CSP restricts the sources from which content can be loaded.

### CSP source of truth

The complete enforced policies live in [`vercel.json`](vercel.json) and
[`public/_headers`](public/_headers). Keep those two sources in parity when
changing a provider, asset host, or reporting endpoint. The policy intentionally
uses a same-origin script baseline with explicit Stripe.js and Google Tag Manager
allowlists, pins network access to the configured Supabase project, Stripe, and
consent-gated Google Analytics, and keeps `object-src 'none'`,
`base-uri 'self'`, and `frame-ancestors 'none'`. Do not maintain a copied
hash list here; the header files are the only configuration sources.

### `unsafe-eval`

The enforced production policy intentionally omits `'unsafe-eval'`. Do not add it
to accommodate a dependency; use ordinary function callbacks and keep user input
out of code execution paths. The deployed header sources are `vercel.json` and
`public/_headers`.

### CSP Violation Reporting

The browser may send sanitized CSP reports to `/api/csp-report`. Persistence is
disabled by default and only an owner-approved deployment setting enables it;
the handler drops reports until distributed ingress limits and retention controls
are in place.

## Safer Alternatives to eval() and new Function()

We've provided safer alternatives in `src/utils/security.js`:

- `safeJSONParse(jsonString)`: Use instead of `JSON.parse` for parsing JSON
- `safeGetProperty(obj, path)`: Use instead of dynamic property access
- `safeCallMethod(obj, methodName, args)`: Use instead of dynamic method calls
- `safeSetTimeout(callback, delay)`: Use instead of `setTimeout` with string arguments
- `safeSetInterval(callback, delay)`: Use instead of `setInterval` with string arguments

Example usage:

```javascript
import { safeSetTimeout, safeJSONParse } from '../utils/security';

// Instead of:
// setTimeout("doSomething()", 1000);

// Use:
safeSetTimeout(() => doSomething(), 1000);

// Instead of:
// const data = JSON.parse(userInput);

// Use:
const data = safeJSONParse(userInput);
```

## Input Sanitization

Always sanitize user input to prevent XSS attacks:

```javascript
import { sanitizeInput } from '../utils/security';

// Sanitize user input before using it
const sanitizedInput = sanitizeInput(userInput);
```

## URL Validation

Validate URLs before using them:

```javascript
import { isValidUrl } from '../utils/security';

if (isValidUrl(url)) {
  // Use the URL
} else {
  // Handle invalid URL
}
```

## CSP Violation Reporting

CSP violations are reported to the console in development mode. In production, they should be reported to a server endpoint.

## Additional Security Headers

In addition to CSP, we use the following security headers:

- **X-Frame-Options**: Prevents clickjacking by controlling whether the page can be embedded in an iframe
- **X-Content-Type-Options**: Prevents MIME type sniffing
- **Referrer-Policy**: Controls how much referrer information is included with requests
- **Permissions-Policy**: Restricts access to browser features
- **Strict-Transport-Security**: Forces HTTPS connections

## Security Contacts

If you discover a security vulnerability, please report it to:

- Email: contact@giorgi.codes (subject: Security report)
- Responsible Disclosure: Please provide details of the vulnerability and steps to reproduce it. Do not include passwords, payment-card details, access tokens, or other secrets.
