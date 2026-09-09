import fs from 'node:fs/promises';
import path from 'node:path';
import { routes } from './route-manifest.mjs';

const distDir = path.resolve('dist');
const baseUrl = (process.env.VITE_SITE_URL || 'https://www.resumeats.cv').replace(/\/+$/, '');

const notFoundRoute = {
  path: '',
  title: 'Page Not Found - ResumeATS',
  description: 'The ResumeATS page you requested could not be found.',
  indexable: false,
  canonical: false,
};

const escapeHtml = (value) => value
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

const structuredDataFor = (route, canonical) => JSON.stringify({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${baseUrl}/#website`,
      url: `${baseUrl}/`,
      name: 'ResumeATS',
      description: 'Create professional, ATS-friendly resumes with AI assistance, practical templates, and export tools.',
      publisher: { '@id': `${baseUrl}/#organization` },
    },
    {
      '@type': 'Organization',
      '@id': `${baseUrl}/#organization`,
      name: 'ResumeATS',
      url: `${baseUrl}/`,
      logo: {
        '@type': 'ImageObject',
        url: `${baseUrl}/favicon.svg`,
      },
    },
    {
      '@type': 'WebPage',
      '@id': `${canonical}#webpage`,
      url: canonical,
      name: route.title,
      description: route.description,
      isPartOf: { '@id': `${baseUrl}/#website` },
      publisher: { '@id': `${baseUrl}/#organization` },
    },
  ],
}).replaceAll('<', '\\u003c');

const upsertMetaTag = (html, pattern, tag) => (
  pattern.test(html)
    ? html.replace(pattern, tag)
    : html.replace('</head>', `  ${tag}\n</head>`)
);

const upsertMeta = (html, route) => {
  const title = escapeHtml(route.title);
  const description = escapeHtml(route.description);
  const canonical = route.canonical === false ? null : `${baseUrl}${route.path}`;

  let output = html.replace(/<title>.*?<\/title>/i, `<title>${title}</title>`);
  output = upsertMetaTag(output, /<meta name="description"[^>]*>/i, `<meta name="description" content="${description}" />`);
  output = upsertMetaTag(
    output,
    /<meta name="robots"[^>]*>/i,
    `<meta name="robots" content="${route.indexable === false ? 'noindex,follow' : 'index,follow'}" />`,
  );
  output = upsertMetaTag(output, /<meta property="og:title"[^>]*>/i, `<meta property="og:title" content="${title}" />`);
  output = upsertMetaTag(output, /<meta property="og:description"[^>]*>/i, `<meta property="og:description" content="${description}" />`);
  output = upsertMetaTag(output, /<meta property="og:type"[^>]*>/i, '<meta property="og:type" content="website" />');
  output = upsertMetaTag(output, /<meta property="og:site_name"[^>]*>/i, '<meta property="og:site_name" content="ResumeATS" />');
  if (canonical) {
    output = upsertMetaTag(output, /<meta property="og:url"[^>]*>/i, `<meta property="og:url" content="${canonical}" />`);
  } else {
    output = output.replace(/\s*<meta property="og:url"[^>]*>/i, '');
  }
  output = upsertMetaTag(output, /<meta property="og:image"[^>]*>/i, `<meta property="og:image" content="${baseUrl}/resume-illustration-desktop.svg" />`);
  output = upsertMetaTag(output, /<meta name="twitter:card"[^>]*>/i, '<meta name="twitter:card" content="summary_large_image" />');
  output = upsertMetaTag(output, /<meta name="twitter:title"[^>]*>/i, `<meta name="twitter:title" content="${title}" />`);
  output = upsertMetaTag(output, /<meta name="twitter:description"[^>]*>/i, `<meta name="twitter:description" content="${description}" />`);
  output = upsertMetaTag(output, /<meta name="twitter:image"[^>]*>/i, `<meta name="twitter:image" content="${baseUrl}/resume-illustration-desktop.svg" />`);

  if (canonical) {
    if (/<link rel="canonical"/i.test(output)) {
      output = output.replace(/<link rel="canonical"[^>]*>/i, `<link rel="canonical" href="${canonical}" />`);
    } else {
      output = output.replace('</head>', `  <link rel="canonical" href="${canonical}" />\n</head>`);
    }
  } else {
    output = output.replace(/\s*<link rel="canonical"[^>]*>/i, '');
  }

  if (route.indexable !== false) {
    output = output.replace('</head>', `  <script type="application/ld+json" data-resumeats-structured-data="true">${structuredDataFor(route, canonical)}</script>\n</head>`);
  } else {
    output = output.replace(/\s*<script type="application\/ld\+json" data-resumeats-structured-data="true">[\s\S]*?<\/script>/i, '');
  }

  return output;
};

const writeRouteHtml = async (route, html) => {
  const routeHtml = upsertMeta(html, route);
  if (route.path === '/') {
    await fs.writeFile(path.join(distDir, 'index.html'), routeHtml);
    return;
  }

  const routeDir = path.join(distDir, route.path.slice(1));
  await fs.mkdir(routeDir, { recursive: true });
  await fs.writeFile(path.join(routeDir, 'index.html'), routeHtml);
};

const main = async () => {
  const indexHtml = await fs.readFile(path.join(distDir, 'index.html'), 'utf8');
  await Promise.all(routes.map((route) => writeRouteHtml(route, indexHtml)));
  await fs.writeFile(path.join(distDir, '404.html'), upsertMeta(indexHtml, notFoundRoute));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
