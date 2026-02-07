export default async function handler(req, res) {
  const isProd = process.env.NODE_ENV === 'production';
  let reportBody = req.body;

  // Check if body is a string (might happen if not auto-parsed)
  // and has a CSP-like structure.
  if (typeof req.body === 'string' && req.body.includes('csp-report')) {
    try {
      reportBody = JSON.parse(req.body);
    } catch (e) {
      console.error('CSP Report: Failed to parse string body:', e);
      // Keep original string body if parsing fails
    }
  } else if (!req.body || Object.keys(req.body).length === 0) {
    // If req.body is empty or not populated, it might be due to Vercel not parsing
    // a specific content-type like 'application/csp-report'.
    // For Vercel, direct raw body access is not straightforward without custom config.
    // We'll log a warning if the body seems unparsed.
    if (!isProd) {
      console.warn('CSP Report: req.body is empty or not an object. Content-Type:', req.headers['content-type']);
    }
    // Avoid logging raw request objects in production
    if (!req.body) reportBody = {};
  }

  if (!isProd) {
    console.log('CSP Violation Report Received:', reportBody);
  }

  // It's good practice to return 204 No Content for report endpoints
  res.status(204).send();
}
