import process from 'node:process';
import { publicRoutes, privateRoutes } from './route-manifest.mjs';

const baseUrl = (process.env.PRODUCTION_BASE_URL || 'https://www.resumeats.cv').replace(/\/+$/, '');
const appOrigin = new URL(baseUrl).origin;
const backendBaseUrl = (process.env.PRODUCTION_SUPABASE_URL || 'https://onuxzcectniowxqtmjpg.supabase.co').replace(/\/+$/, '');
const timeoutMs = Number(process.env.PRODUCTION_HTTP_TIMEOUT_MS || 10000);
const obsoleteThemeHash = 'sha256-mMpkovCzzuFysqxeZ2iwkN+VEcAgKZxWGZro5Y/sTeQ=';
const forbiddenPublicClaims = [
  /ATS-optimized/i,
  /passes applicant tracking systems/i,
  /recruiter-approved/i,
  /job-winning resume/i,
];

const edgeFunctionRoutes = [
  'public-engagement',
  'support-api',
  'report-client-error',
];

const parseTag = (html, pattern) => pattern.exec(html)?.[1]?.trim() || null;
const parseAttribute = (html, tagPattern, attribute) => {
  const tag = tagPattern.exec(html)?.[0] || '';
  return new RegExp(`${attribute}=["']([^"']+)["']`, 'i').exec(tag)?.[1] || null;
};

const extractLocalAssetPaths = (html) => [...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/gi)]
  .map((match) => match[1])
  .filter((path, index, paths) => paths.indexOf(path) === index);

const extractJavascriptChunkPaths = (body) => [...body.matchAll(/([A-Za-z0-9._-]+-[A-Za-z0-9_-]{6,}\.js)/g)]
  .map((match) => `/assets/js/${match[1]}`)
  .filter((path, index, paths) => paths.indexOf(path) === index);

const readAsset = async (assetPath) => {
  try {
    const response = await fetch(`${baseUrl}${assetPath}`, {
      headers: { accept: '*/*' },
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await response.text();
    return {
      path: assetPath,
      status: response.status,
      contentType: response.headers.get('content-type'),
      isHtml: /<!doctype\s+html|<html[\s>]/i.test(body),
      bodyBytes: Buffer.byteLength(body),
      forbiddenPublicClaims: assetPath.endsWith('.js')
        ? forbiddenPublicClaims.filter((pattern) => pattern.test(body)).map((pattern) => pattern.source)
        : [],
      body,
    };
  } catch (error) {
    return { path: assetPath, error: error instanceof Error ? error.message : String(error) };
  }
};

const readRoute = async (route) => {
  const url = `${baseUrl}${route}`;
  try {
    const response = await fetch(url, {
      headers: { accept: 'text/html,application/xhtml+xml' },
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await response.text();
    return {
      route,
      status: response.status,
      location: response.headers.get('location'),
      contentType: response.headers.get('content-type'),
      title: parseTag(body, /<title[^>]*>([\s\S]*?)<\/title>/i),
      robots: parseAttribute(body, /<meta[^>]+name=["']robots["'][^>]*>/i, 'content'),
      canonical: parseAttribute(body, /<link[^>]+rel=["']canonical["'][^>]*>/i, 'href'),
      xRobotsTag: response.headers.get('x-robots-tag'),
      obsoleteThemeHash: response.headers.get('content-security-policy')?.includes(obsoleteThemeHash) || false,
      isHtml: /<!doctype\s+html|<html[\s>]/i.test(body),
      bodyBytes: Buffer.byteLength(body),
    };
  } catch (error) {
    return {
      route,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const readFunctionHealth = async (name) => {
  try {
    const response = await fetch(`${backendBaseUrl}/functions/v1/${name}`, {
      method: 'GET',
      headers: { Origin: appOrigin },
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    return {
      name,
      status: response.status,
      contentType: response.headers.get('content-type'),
      allowOrigin: response.headers.get('access-control-allow-origin'),
    };
  } catch (error) {
    return { name, error: error instanceof Error ? error.message : String(error) };
  }
};

const report = {
  checkedAt: new Date().toISOString(),
  baseUrl,
  public: await Promise.all(publicRoutes.map(({ path }) => readRoute(path))),
  private: await Promise.all(privateRoutes.map(({ path }) => readRoute(path))),
  unknown: await readRoute('/__resumeats-audit-missing-route__'),
  themeBootstrap: await readRoute('/theme-bootstrap.js'),
  functions: await Promise.all(edgeFunctionRoutes.map(readFunctionHealth)),
};

const rootHtml = await fetch(`${baseUrl}/`, {
  headers: { accept: 'text/html,application/xhtml+xml' },
  redirect: 'manual',
  signal: AbortSignal.timeout(timeoutMs),
}).then((response) => response.text()).catch(() => '');

report.assets = await Promise.all(extractLocalAssetPaths(rootHtml).map(readAsset));

const rootScript = report.assets.find((asset) => /\/assets\/index-[^/]+\.js$/i.test(asset.path));
const dynamicChunkPaths = rootScript?.body ? extractJavascriptChunkPaths(rootScript.body) : [];
report.dynamicAssets = await Promise.all(dynamicChunkPaths
  .filter((assetPath) => !report.assets.some((asset) => asset.path === assetPath))
  .map(readAsset));

for (const asset of report.assets.concat(report.dynamicAssets)) delete asset.body;

const failures = [];
for (const result of report.public) {
  const expected = publicRoutes.find(({ path }) => path === result.route)?.title;
  if (result.status !== 200) failures.push(`${result.route}: expected HTTP 200, got ${result.status ?? result.error}`);
  if (result.title !== expected) failures.push(`${result.route}: expected title ${JSON.stringify(expected)}, got ${JSON.stringify(result.title)}`);
  if (result.robots !== 'index,follow') failures.push(`${result.route}: expected index,follow, got ${JSON.stringify(result.robots)}`);
  if (result.canonical !== `${baseUrl}${result.route}`) failures.push(`${result.route}: canonical drift (${JSON.stringify(result.canonical)})`);
}
for (const result of report.private) {
  const expected = privateRoutes.find(({ path }) => path === result.route)?.title;
  if (result.status !== 200) failures.push(`${result.route}: expected HTTP 200, got ${result.status ?? result.error}`);
  if (result.title !== expected) failures.push(`${result.route}: expected private title ${JSON.stringify(expected)}, got ${JSON.stringify(result.title)}`);
  if (result.robots !== 'noindex,follow') failures.push(`${result.route}: expected noindex,follow, got ${JSON.stringify(result.robots)}`);
  if (result.xRobotsTag !== 'noindex,follow') failures.push(`${result.route}: expected X-Robots-Tag noindex,follow, got ${JSON.stringify(result.xRobotsTag)}`);
  if (result.canonical) failures.push(`${result.route}: private route must not expose a canonical URL (${result.canonical})`);
}
if (report.unknown.status !== 404) failures.push(`unknown route: expected HTTP 404, got ${report.unknown.status ?? report.unknown.error}`);
if (report.unknown.robots !== 'noindex,follow') failures.push(`unknown route: expected noindex,follow, got ${JSON.stringify(report.unknown.robots)}`);
if (report.themeBootstrap.status !== 200) failures.push(`theme bootstrap: expected HTTP 200, got ${report.themeBootstrap.status ?? report.themeBootstrap.error}`);
if (!report.themeBootstrap.contentType?.toLowerCase().includes('javascript')) failures.push(`theme bootstrap: expected JavaScript content type, got ${JSON.stringify(report.themeBootstrap.contentType)}`);
if (report.themeBootstrap.isHtml) failures.push('theme bootstrap: JavaScript path returned an HTML document');
for (const asset of report.assets.concat(report.dynamicAssets)) {
  if (asset.status !== 200) failures.push(`${asset.path}: expected HTTP 200, got ${asset.status ?? asset.error}`);
  if (asset.isHtml) failures.push(`${asset.path}: referenced asset returned an HTML document`);
  if (asset.path.endsWith('.js') && !asset.contentType?.toLowerCase().includes('javascript')) {
    failures.push(`${asset.path}: expected JavaScript content type, got ${JSON.stringify(asset.contentType)}`);
  }
  if (asset.path.endsWith('.css') && !asset.contentType?.toLowerCase().includes('text/css')) {
    failures.push(`${asset.path}: expected CSS content type, got ${JSON.stringify(asset.contentType)}`);
  }
  if (asset.forbiddenPublicClaims?.length) {
    failures.push(`${asset.path}: deployed JavaScript contains forbidden public copy (${asset.forbiddenPublicClaims.join(', ')})`);
  }
}
for (const fn of report.functions) {
  if (fn.status !== 405) failures.push(`edge function ${fn.name}: expected GET health response 405, got ${fn.status ?? fn.error}`);
  if (fn.allowOrigin !== appOrigin) failures.push(`edge function ${fn.name}: expected CORS allow-origin ${appOrigin}, got ${JSON.stringify(fn.allowOrigin)}`);
}
if (report.public.concat(report.private, report.unknown).some((result) => result.obsoleteThemeHash)) {
  failures.push('CSP still advertises the removed inline theme bootstrap hash');
}

console.log(JSON.stringify({ ...report, failures }, null, 2));
if (failures.length) process.exitCode = 1;
