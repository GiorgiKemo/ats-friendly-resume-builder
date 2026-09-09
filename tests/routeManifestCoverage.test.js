import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { publicRoutes, routes } from '../scripts/route-manifest.mjs';
import { routeMatchesPath } from '../src/routeManifest.js';

const appSource = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const sitemapSource = fs.readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8');

const appRouteFamilies = [...appSource.matchAll(/<Route\s+path="([^"]+)"/g)]
  .map(([, path]) => path)
  .filter((path) => path !== '*')
  .map((path) => path.replace(/\/:([^/]+)$/, ''));

test('route manifest covers every concrete React route family exactly once', () => {
  const manifestPaths = routes.map(({ path }) => path);
  const appFamilies = new Set(appRouteFamilies);
  const manifestFamilies = new Set(manifestPaths);

  assert.equal(manifestPaths.length, manifestFamilies.size, 'route manifest contains duplicate paths');

  for (const path of appFamilies) {
    assert.ok(manifestFamilies.has(path), `React route ${path} is missing from scripts/route-manifest.mjs`);
  }

  for (const path of manifestFamilies) {
    assert.ok(appFamilies.has(path), `manifest route ${path} is missing from src/App.jsx`);
  }

  assert.equal(routeMatchesPath('/builder', '/builder/resume-123'), true);
  assert.equal(routeMatchesPath('/builder', '/builder'), true);
  assert.equal(routeMatchesPath('/builder', '/builder-other'), false);

  const sitemapPaths = [...sitemapSource.matchAll(/<loc>https:\/\/www\.resumeats\.cv([^<]*)<\/loc>/g)]
    .map(([, path]) => path || '/');
  const manifestPublicPaths = publicRoutes.map(({ path }) => path);
  assert.equal(sitemapPaths.length, new Set(sitemapPaths).size, 'sitemap contains duplicate URLs');
  assert.deepEqual([...sitemapPaths].sort(), [...manifestPublicPaths].sort(), 'sitemap must contain exactly the indexable public route list');
});
