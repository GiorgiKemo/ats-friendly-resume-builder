import fs from 'node:fs/promises';
import path from 'node:path';

const distDir = path.resolve('dist');
const baseUrl = process.env.VITE_SITE_URL || 'https://resumeats.cv';

const routes = [
  {
    path: '/',
    title: 'ResumeATS | ATS-Friendly Resume Builder',
    description: 'Create professional, ATS-optimized resumes with AI assistance, clean templates, and PDF or DOCX export.',
  },
  {
    path: '/learn',
    title: 'ATS Resume Guide | ResumeATS',
    description: 'Learn how to build resumes that applicant tracking systems can parse correctly.',
  },
  {
    path: '/pricing',
    title: 'Pricing | ResumeATS',
    description: 'Compare ResumeATS free and premium plans for ATS-friendly resumes and AI resume generation.',
  },
  {
    path: '/about',
    title: 'About ResumeATS',
    description: 'Learn about ResumeATS and the tools built to help job seekers create clearer, stronger resumes.',
  },
  {
    path: '/terms',
    title: 'Terms of Service | ResumeATS',
    description: 'Read the ResumeATS terms of service.',
  },
  {
    path: '/privacy-policy',
    title: 'Privacy Policy | ResumeATS',
    description: 'Read how ResumeATS handles account, resume, billing, and support data.',
  },
  {
    path: '/faq',
    title: 'FAQ | ResumeATS',
    description: 'Find answers about ATS resumes, exports, billing, subscriptions, AI tools, and support.',
  },
  {
    path: '/contact',
    title: 'Contact ResumeATS Support',
    description: 'Contact ResumeATS support for account, billing, resume, or product questions.',
  },
];

const escapeHtml = (value) => value
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

const upsertMeta = (html, route) => {
  const title = escapeHtml(route.title);
  const description = escapeHtml(route.description);
  const canonical = `${baseUrl}${route.path === '/' ? '' : route.path}`;

  let output = html.replace(/<title>.*?<\/title>/i, `<title>${title}</title>`);
  output = output.replace(
    /<meta name="description"[^>]*>/i,
    `<meta name="description" content="${description}" />`,
  );
  output = output.replace(
    /<meta property="og:title"[^>]*>/i,
    `<meta property="og:title" content="${title}" />`,
  );
  output = output.replace(
    /<meta property="og:description"[^>]*>/i,
    `<meta property="og:description" content="${description}" />`,
  );

  if (/<link rel="canonical"/i.test(output)) {
    output = output.replace(/<link rel="canonical"[^>]*>/i, `<link rel="canonical" href="${canonical}" />`);
  } else {
    output = output.replace('</head>', `  <link rel="canonical" href="${canonical}" />\n</head>`);
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
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
