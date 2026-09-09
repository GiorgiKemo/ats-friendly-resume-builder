import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { publicRoutes, routes, routeMatchesPath } from '../routeManifest';

// Vercel serves the public site on the www host; keep canonicals and social
// URLs on that final URL so crawlers do not have to follow the apex redirect.
const SITE_ORIGIN = (import.meta.env.VITE_SITE_URL || 'https://www.resumeats.cv').replace(/\/+$/, '');
const SITE_NAME = 'ResumeATS';
const SITE_LOGO = `${SITE_ORIGIN}/favicon.svg`;
const SITE_IMAGE = `${SITE_ORIGIN}/resume-illustration-desktop.svg`;

const defaultMetadata = {
  title: 'ResumeATS - ATS-Friendly Resume Builder',
  description: 'Create clear, ATS-friendly resumes with optional AI assistance, practical templates, and export tools.',
};

const notFoundMetadata = {
  title: 'Page Not Found - ResumeATS',
  description: 'The ResumeATS page you requested could not be found.',
};

const routeMetadata = routes.map((route) => ({
  ...route,
  match: (path) => routeMatchesPath(route.path, path),
}));

const INDEXABLE_PUBLIC_PATHS = new Set(publicRoutes.map(({ path }) => path));

const getOrCreateMeta = (selector, createAttributes) => {
  let element = document.head.querySelector(selector);

  if (!element) {
    element = document.createElement('meta');
    Object.entries(createAttributes).forEach(([key, value]) => {
      element.setAttribute(key, value);
    });
    document.head.appendChild(element);
  }

  return element;
};

const setMetaContent = (selector, createAttributes, content) => {
  const element = getOrCreateMeta(selector, createAttributes);
  element.setAttribute('content', content);
};

const getCanonicalPath = (pathname) => (pathname === '/' ? '/' : pathname.replace(/\/+$/, ''));

const getStructuredData = (canonicalUrl, metadata) => ({
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${SITE_ORIGIN}/#website`,
      url: `${SITE_ORIGIN}/`,
      name: SITE_NAME,
      description: defaultMetadata.description,
      publisher: { '@id': `${SITE_ORIGIN}/#organization` },
    },
    {
      '@type': 'Organization',
      '@id': `${SITE_ORIGIN}/#organization`,
      name: SITE_NAME,
      url: `${SITE_ORIGIN}/`,
      logo: {
        '@type': 'ImageObject',
        url: SITE_LOGO,
      },
    },
    {
      '@type': 'WebPage',
      '@id': `${canonicalUrl}#webpage`,
      url: canonicalUrl,
      name: metadata.title,
      description: metadata.description,
      isPartOf: { '@id': `${SITE_ORIGIN}/#website` },
      publisher: { '@id': `${SITE_ORIGIN}/#organization` },
    },
  ],
});

const setStructuredData = (data) => {
  let script = document.head.querySelector('script[data-resumeats-structured-data]');

  if (!data) {
    script?.remove();
    return;
  }

  if (!script) {
    script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute('data-resumeats-structured-data', 'true');
    document.head.appendChild(script);
  }

  script.textContent = JSON.stringify(data);
};

const Seo = () => {
  const location = useLocation();

  useEffect(() => {
    const metadata = routeMetadata.find((item) => item.match(location.pathname)) || notFoundMetadata;
    const canonicalPath = getCanonicalPath(location.pathname);
    const canonicalUrl = `${SITE_ORIGIN}${canonicalPath}`;
    const isIndexablePublicPage = INDEXABLE_PUBLIC_PATHS.has(canonicalPath);

    document.title = metadata.title;
    setMetaContent('meta[name="description"]', { name: 'description' }, metadata.description);
    setMetaContent('meta[name="robots"]', { name: 'robots' }, isIndexablePublicPage ? 'index,follow' : 'noindex,follow');
    setMetaContent('meta[property="og:title"]', { property: 'og:title' }, metadata.title);
    setMetaContent('meta[property="og:description"]', { property: 'og:description' }, metadata.description);
    setMetaContent('meta[property="og:type"]', { property: 'og:type' }, 'website');
    setMetaContent('meta[property="og:site_name"]', { property: 'og:site_name' }, SITE_NAME);
    setMetaContent('meta[property="og:image"]', { property: 'og:image' }, SITE_IMAGE);
    setMetaContent('meta[name="twitter:card"]', { name: 'twitter:card' }, 'summary_large_image');
    setMetaContent('meta[name="twitter:title"]', { name: 'twitter:title' }, metadata.title);
    setMetaContent('meta[name="twitter:description"]', { name: 'twitter:description' }, metadata.description);
    setMetaContent('meta[name="twitter:image"]', { name: 'twitter:image' }, SITE_IMAGE);

    if (isIndexablePublicPage) {
      setMetaContent('meta[property="og:url"]', { property: 'og:url' }, canonicalUrl);
      let canonical = document.head.querySelector('link[rel="canonical"]');
      if (!canonical) {
        canonical = document.createElement('link');
        canonical.setAttribute('rel', 'canonical');
        document.head.appendChild(canonical);
      }
      canonical.setAttribute('href', canonicalUrl);
      setStructuredData(getStructuredData(canonicalUrl, metadata));
    } else {
      document.head.querySelector('meta[property="og:url"]')?.remove();
      document.head.querySelector('link[rel="canonical"]')?.remove();
      setStructuredData(null);
    }
  }, [location.pathname]);

  return null;
};

export default Seo;
