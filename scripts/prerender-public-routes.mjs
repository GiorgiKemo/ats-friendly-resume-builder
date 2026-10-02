import fs from 'node:fs/promises';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MotionConfig } from 'framer-motion';
import { StaticRouter } from 'react-router-dom';
import { createServer } from 'vite';
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

const publicPageModules = new Map([
  ['/', 'Home'],
  ['/learn', 'Learn'],
  ['/pricing', 'Pricing'],
  ['/resume-writing', 'ResumeWriting'],
  ['/about', 'AboutUs'],
  ['/terms', 'TermsOfService'],
  ['/privacy-policy', 'PrivacyPolicy'],
  ['/faq', 'FAQ'],
  ['/contact', 'Contact'],
]);

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

const renderPublicPages = async () => {
  const vite = await createServer({
    mode: 'production',
    logLevel: 'error',
    server: { middlewareMode: true },
    appType: 'custom',
  });

  try {
    const [{ AuthProvider }, { SubscriptionProvider }, { AnalyticsConsentProvider }] = await Promise.all([
      vite.ssrLoadModule('/src/context/AuthContext.jsx'),
      vite.ssrLoadModule('/src/context/SubscriptionContext.jsx'),
      vite.ssrLoadModule('/src/context/AnalyticsConsentContext.jsx'),
    ]);
    const renderedPages = new Map();

    for (const route of routes.filter(({ indexable }) => indexable !== false)) {
      const moduleName = publicPageModules.get(route.path);
      if (!moduleName) throw new Error(`No static page renderer is registered for ${route.path}.`);

      const { default: Page } = await vite.ssrLoadModule(`/src/pages/${moduleName}.jsx`);
      let page = React.createElement(Page);
      if (['/', '/pricing', '/resume-writing'].includes(route.path)) {
        if (route.path === '/pricing') page = React.createElement(SubscriptionProvider, null, page);
        page = React.createElement(AuthProvider, null, page);
      }
      if (route.path === '/privacy-policy') page = React.createElement(AnalyticsConsentProvider, null, page);

      const pageMarkup = renderToStaticMarkup(
        React.createElement(
          StaticRouter,
          { location: route.path },
          React.createElement(MotionConfig, { initial: false }, page),
        ),
      );
      const headingCount = (pageMarkup.match(/<h1(?:\s|>)/gi) || []).length;
      const visibleText = pageMarkup.replace(/<[^>]*>/g, ' ').replace(/&(?:#\d+|#x[\da-f]+|[a-z]+);/gi, ' ').replace(/\s+/g, ' ').trim();
      if (headingCount !== 1 || visibleText.length < 250) {
        throw new Error(`${route.path} prerender must contain one H1 and meaningful public text (h1=${headingCount}, chars=${visibleText.length}).`);
      }

      renderedPages.set(route.path, `<main data-resumeats-prerender="${escapeHtml(route.path)}">${pageMarkup}</main>`);
      console.log(`PASS prerender ${route.path} h1=${headingCount} textChars=${visibleText.length}`);
    }

    return renderedPages;
  } finally {
    await vite.close();
  }
};

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

const writeRouteHtml = async (route, html, renderedPages) => {
  let routeHtml = upsertMeta(html, route);
  const renderedPage = renderedPages.get(route.path);
  if (renderedPage) {
    const emptyRoot = '<div id="root"></div>';
    if (!routeHtml.includes(emptyRoot)) throw new Error(`Expected an empty app root while prerendering ${route.path}.`);
    routeHtml = routeHtml.replace(emptyRoot, `<div id="root">${renderedPage}</div>`);
  }

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
  const renderedPages = await renderPublicPages();
  await Promise.all(routes.map((route) => writeRouteHtml(route, indexHtml, renderedPages)));
  await fs.writeFile(path.join(distDir, '404.html'), upsertMeta(indexHtml, notFoundRoute));
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
