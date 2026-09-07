import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('public SEO URLs use the final www production host', () => {
  const sitemap = read('public/sitemap.xml');
  const robots = read('public/robots.txt');
  const seo = read('src/components/Seo.jsx');
  const prerender = read('scripts/prerender-public-routes.mjs');

  assert.match(robots, /Sitemap:\s+https:\/\/www\.resumeats\.cv\/sitemap\.xml/);
  assert.doesNotMatch(robots, /Sitemap:\s+https:\/\/resumeats\.cv\//);
  assert.match(sitemap, /<loc>https:\/\/www\.resumeats\.cv\//);
  assert.doesNotMatch(sitemap, /<loc>https:\/\/resumeats\.cv\//);
  assert.match(seo, /import\.meta\.env\.VITE_SITE_URL \|\| 'https:\/\/www\.resumeats\.cv'/);
  assert.match(prerender, /process\.env\.VITE_SITE_URL \|\| 'https:\/\/www\.resumeats\.cv'/);
});
