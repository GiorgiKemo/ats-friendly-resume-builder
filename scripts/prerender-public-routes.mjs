import fs from 'node:fs/promises';
import path from 'node:path';

const distDir = path.resolve('dist');
const baseUrl = (process.env.VITE_SITE_URL || 'https://resumeats.cv').replace(/\/+$/, '');

const routes = [
  {
    path: '/',
    title: 'ResumeATS - ATS-Friendly Resume Builder',
    description: 'Create professional, ATS-optimized resumes with AI assistance. Start free and build a resume that passes applicant tracking systems.',
  },
  {
    path: '/learn',
    title: 'ATS Resume Guide - ResumeATS',
    description: 'Learn how applicant tracking systems read resumes and how to write clean, keyword-aware resume sections that recruiters can scan.',
  },
  {
    path: '/pricing',
    title: 'Pricing - ResumeATS',
    description: 'Compare free and Premium AI+ resume-building plans for templates, AI generation, exports, and job-search tools.',
  },
  {
    path: '/about',
    title: 'About ResumeATS',
    description: 'Learn about ResumeATS and our approach to practical, ATS-friendly resume building for modern job seekers.',
  },
  {
    path: '/terms',
    title: 'Terms of Service - ResumeATS',
    description: 'Read the ResumeATS terms of service for account use, subscriptions, user content, and acceptable use.',
  },
  {
    path: '/privacy-policy',
    title: 'Privacy Policy - ResumeATS',
    description: 'Read how ResumeATS collects, stores, protects, and processes account, resume, payment, and AI-generation data.',
  },
  {
    path: '/faq',
    title: 'FAQ - ResumeATS',
    description: 'Find answers about ResumeATS accounts, resume exports, AI generation, billing, subscriptions, and ATS-friendly templates.',
  },
  {
    path: '/contact',
    title: 'Contact Support - ResumeATS',
    description: 'Contact ResumeATS for product support, billing questions, export issues, extension help, or resume workflow feedback.',
  },
];

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
      description: 'Create professional, ATS-optimized resumes with AI assistance, recruiter-approved templates, and export tools.',
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
  const canonical = `${baseUrl}${route.path}`;

  let output = html.replace(/<title>.*?<\/title>/i, `<title>${title}</title>`);
  output = upsertMetaTag(output, /<meta name="description"[^>]*>/i, `<meta name="description" content="${description}" />`);
  output = upsertMetaTag(output, /<meta name="robots"[^>]*>/i, '<meta name="robots" content="index,follow" />');
  output = upsertMetaTag(output, /<meta property="og:title"[^>]*>/i, `<meta property="og:title" content="${title}" />`);
  output = upsertMetaTag(output, /<meta property="og:description"[^>]*>/i, `<meta property="og:description" content="${description}" />`);
  output = upsertMetaTag(output, /<meta property="og:type"[^>]*>/i, '<meta property="og:type" content="website" />');
  output = upsertMetaTag(output, /<meta property="og:site_name"[^>]*>/i, '<meta property="og:site_name" content="ResumeATS" />');
  output = upsertMetaTag(output, /<meta property="og:url"[^>]*>/i, `<meta property="og:url" content="${canonical}" />`);
  output = upsertMetaTag(output, /<meta property="og:image"[^>]*>/i, `<meta property="og:image" content="${baseUrl}/resume-illustration-desktop.svg" />`);
  output = upsertMetaTag(output, /<meta name="twitter:card"[^>]*>/i, '<meta name="twitter:card" content="summary_large_image" />');
  output = upsertMetaTag(output, /<meta name="twitter:title"[^>]*>/i, `<meta name="twitter:title" content="${title}" />`);
  output = upsertMetaTag(output, /<meta name="twitter:description"[^>]*>/i, `<meta name="twitter:description" content="${description}" />`);
  output = upsertMetaTag(output, /<meta name="twitter:image"[^>]*>/i, `<meta name="twitter:image" content="${baseUrl}/resume-illustration-desktop.svg" />`);

  if (/<link rel="canonical"/i.test(output)) {
    output = output.replace(/<link rel="canonical"[^>]*>/i, `<link rel="canonical" href="${canonical}" />`);
  } else {
    output = output.replace('</head>', `  <link rel="canonical" href="${canonical}" />\n</head>`);
  }

  output = output.replace('</head>', `  <script type="application/ld+json" data-resumeats-structured-data="true">${structuredDataFor(route, canonical)}</script>\n</head>`);

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
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
