/**
 * Content Security Policy (CSP) Violation Report Endpoint
 * 
 * This endpoint receives CSP violation reports from browsers and logs them.
 * In a production environment, these reports would be stored in a database
 * for analysis.
 */

export default function handler(req, res) {
  const isProd = process.env.NODE_ENV === 'production';
  if (req.method === 'POST') {
    try {
      // Log the CSP violation report
      const report = req.body['csp-report'] || req.body;
      
      if (!isProd) {
        console.error('CSP Violation:', {
          'violatedDirective': report['violated-directive'],
          'effectiveDirective': report['effective-directive'],
          'blockedURI': report['blocked-uri'],
          'sourceFile': report['source-file'],
          'lineNumber': report['line-number'],
          'columnNumber': report['column-number'],
          'documentURI': report['document-uri'],
          'originalPolicy': report['original-policy'],
          'disposition': report['disposition'],
          'referrer': report['referrer'],
          'statusCode': report['status-code']
        });
      }
      
      // In production, you would store this in a database
      
      res.status(204).end(); // No content response
    } catch (error) {
      if (!isProd) {
        console.error('Error processing CSP report:', error);
      }
      res.status(500).json({ error: 'Failed to process CSP report' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
