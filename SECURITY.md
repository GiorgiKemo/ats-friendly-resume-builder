# Security Best Practices

This document outlines security best practices for the ATS-Friendly Resume Builder application.

## Content Security Policy (CSP)

Our application uses a Content Security Policy to prevent cross-site scripting (XSS) and other code injection attacks. The CSP restricts the sources from which content can be loaded.

### Current CSP Configuration

```
default-src 'self';
script-src 'self' https://js.stripe.com 'sha256-mMpkovCzzuFysqxeZ2iwkN+VEcAgKZxWGZro5Y/sTeQ=';
connect-src 'self' https://onuxzcectniowxqtmjpg.supabase.co https://api.stripe.com;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=' 'sha256-Nqnn8clbgv+5l0PgxcTOldg8mkMKrFn4TvPL+rYUUGg=' 'sha256-13vrThxdyT64GcXoTNGVoRRoL0a7EGBmOJ+lemEWyws=' 'sha256-QZ52fjvWgIOIOPr+gRIJZ7KjzNeTBm50Z+z9dH4N1/8=' 'sha256-yOU6eaJ75xfag0gVFUvld5ipLRGUy94G17B1uL683EU=' 'sha256-OpTmykz0m3o5HoX53cykwPhUeU4OECxHQlKXpB0QJPQ=' 'sha256-SSIM0kI/u45y4gqkri9aH+la6wn2R+xtcBj3Lzh7qQo=' 'sha256-ZH/+PJIjvP1BctwYxclIuiMu1wItb0aasjpXYXOmU0Y=' 'sha256-58jqDtherY9NOM+ziRgSqQY0078tAZ+qtTBjMgbM9po=' 'sha256-7Ri/I+PfhgtpcL7hT4A0VJKI6g3pK0ZvIN09RQV4ZhI=' 'sha256-D6zmPl9SPOA5yA8xbXKrLL0cVKn8FB4+jrOuJzlq4sI=' 'sha256-RMLuAlXIwRu2+YnnDVl5tzQPV2YlmPqSWSKEwJidCyc=' 'sha256-J0fb1cj+TvfbuwoWFcBRWXfZjjxyNBgv9RziegQUbxk=' 'sha256-+h218lrS+a9xO+7drwOfWjgpuVq/J66Fi1VVl/fnmSY=' 'sha256-iO7F2hy476ppWnd4pn3N47Ghu4N5JTJ6HwMLvn+hsuo=' 'sha256-S0YC/uXDAItX6fZw7W0jini2nSubFplw0SLxwxT5MIA=' 'sha256-zPGpewjcIvICZvc20/gzIzxzjxGh14DFhw4Sjpc/YI0=' 'sha256-UPf9P6UBqy4VzehzUvBqtM1y7TNEYtlok2L1ansrR2M=' 'sha256-XTyObgibb7bGqOF5oiFvpAKfVy5amQ0Q93zIx6/MtCk=' 'sha256-5vLND17KkR5h73s6GgqHErok0kDpG4KohGcxMEzTN1k=' 'sha256-TUiEkFBDhkSWQ4DHYll5yBWMScmQpD4/Ezeke1r6XwU=' 'sha256-vBxbnehTDgN6NkKbSYYkK0xnn1JTzXduOikbvd4Qdnc=' 'sha256-w3z/Zi/mZiPi7d/I9AeMPOE3yJjWiNR9flFCItMz5qw=' 'sha256-X8/U6XsU9vJCuDZiwtzZ2sHkib6u4qW5qCww2+65v4M=' 'sha256-S8WvDsuOheuw1pqhp6E2vrGq69NN3WOkq+WnT/Xdyy4=' 'sha256-+sRv+5ZP+JjjyOwy5QD3ySS+npOAVIsOLsfJV6wyaM0=' 'sha256-MDy3q0bbHcdgFz8YLT+Tok8rPWQY/tkM9/mkcbTwrG4=' 'sha256-KpKT4dJpyL2oGVGSRUH2NnVZYJOtNvkOKKJUxniUe5c=' 'sha256-gZ+YR3HDUvKxuDM7rIjZgCtfNlqIwwMcuf9sXMIuLzc=' 'sha256-xxDQXJByYLJNGk36xDRraofA4PbKABlSCCl3g1petmk=' 'sha256-XIqFfI4iOxUsKwDCJ86jviFyb+VIe2935gTD2lH6jC0=';
font-src 'self' https://fonts.gstatic.com;
img-src 'self' data: https://via.placeholder.com;
frame-src 'self' https://js.stripe.com;
worker-src 'self' blob:;
object-src 'none';
report-uri /api/csp-report;
report-to csp-endpoint;
```

### `unsafe-eval`

The enforced production policy intentionally omits `'unsafe-eval'`. Do not add it
to accommodate a dependency; use ordinary function callbacks and keep user input
out of code execution paths. The policy shown here is a documentation snapshot;
the deployed header sources are `vercel.json` and `public/_headers`.

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

- Email: security@ats-resume-builder.com
- Responsible Disclosure: Please provide details of the vulnerability and steps to reproduce it.
