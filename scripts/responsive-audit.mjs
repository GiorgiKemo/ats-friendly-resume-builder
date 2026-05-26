/**
 * Responsive audit for ATS Resume Builder marketing/auth pages.
 *
 * Visits each route at multiple viewport sizes, screenshots above-the-fold
 * + full-page, and reports horizontal overflow & content clipped under the
 * fixed header.
 *
 * Usage:
 *   npm run dev   (must already be running on http://localhost:5174)
 *   node scripts/responsive-audit.mjs [--label=before|after]
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const BASE_URL = process.env.AUDIT_BASE_URL ?? 'http://localhost:5174';
const args = new Set(process.argv.slice(2));
const labelArg = [...args].find((a) => a.startsWith('--label='));
const LABEL = labelArg ? labelArg.split('=')[1] : 'audit';
const OUT_DIR = path.resolve(process.cwd(), 'playwright-audit', LABEL);

const ROUTES = [
  { path: '/#/', name: 'home' },
  { path: '/#/learn', name: 'learn' },
  { path: '/#/pricing', name: 'pricing' },
  { path: '/#/about', name: 'about' },
  { path: '/#/faq', name: 'faq' },
  { path: '/#/contact', name: 'contact' },
  { path: '/#/signin', name: 'signin' },
  { path: '/#/signup', name: 'signup' },
  { path: '/#/terms', name: 'terms' },
  { path: '/#/privacy-policy', name: 'privacy' },
];

const VIEWPORTS = [
  { label: 'mobile-375', width: 375, height: 667 },
  { label: 'mobile-390', width: 390, height: 844 },
  { label: 'tablet-768', width: 768, height: 1024 },
  { label: 'laptop-1280', width: 1280, height: 800 },
  { label: 'laptop-1440', width: 1440, height: 900 },
  { label: 'desktop-1920', width: 1920, height: 1080 },
];

const sanitize = (s) => s.replace(/[^a-z0-9-_]/gi, '-');

async function auditPage(page, route, viewport, results) {
  const url = `${BASE_URL}${route.path}`;
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  try {
    // Vite dev server keeps a HMR WebSocket open, so networkidle never fires.
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    // Wait until react has rendered the page <main>.
    await page.waitForSelector('main#main-content :is(h1, h2)', { timeout: 10000 });
  } catch (err) {
    results.push({
      route: route.name,
      viewport: viewport.label,
      error: `goto failed: ${err.message}`,
    });
    return;
  }
  // Wait a beat for framer-motion / hydration to settle.
  await page.waitForTimeout(650);
  // Scroll back to top in case any earlier audit left it scrolled.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);

  const slug = `${sanitize(route.name)}_${viewport.label}`;
  const aboveFold = path.join(OUT_DIR, `${slug}_above-fold.png`);
  const fullPage = path.join(OUT_DIR, `${slug}_full-page.png`);

  await page.screenshot({ path: aboveFold, fullPage: false });
  await page.screenshot({ path: fullPage, fullPage: true });

  // Collect layout diagnostics.
  const diag = await page.evaluate(() => {
    const html = document.documentElement;
    const body = document.body;
    const scrollWidth = Math.max(html.scrollWidth, body.scrollWidth);
    const clientWidth = html.clientWidth;
    const horizontalOverflow = scrollWidth - clientWidth;
    const headerEl = document.querySelector('header.app-header');
    const headerRect = headerEl ? headerEl.getBoundingClientRect() : null;
    const headerHeight = headerRect ? Math.round(headerRect.height) : null;
    // Find the first heading and report its top position relative to header bottom.
    const heading = document.querySelector('main h1, main h2');
    const headingRect = heading ? heading.getBoundingClientRect() : null;
    const headingTop = headingRect ? Math.round(headingRect.top) : null;
    const headingGapFromHeader =
      headingTop !== null && headerHeight !== null
        ? headingTop - headerHeight
        : null;
    // Detect if anything is overlapping or being clipped at the top of main.
    return {
      scrollWidth,
      clientWidth,
      horizontalOverflow,
      headerHeight,
      headingTop,
      headingGapFromHeader,
      bodyBg: window.getComputedStyle(body).backgroundColor,
    };
  });

  results.push({
    route: route.name,
    viewport: viewport.label,
    ...diag,
    aboveFold: path.relative(process.cwd(), aboveFold).replace(/\\/g, '/'),
    fullPage: path.relative(process.cwd(), fullPage).replace(/\\/g, '/'),
  });
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`Audit label: ${LABEL}`);
  console.log(`Saving screenshots to ${OUT_DIR}`);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    // Force light mode by default so screenshots are consistent.
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();

  const results = [];
  let count = 0;
  const total = ROUTES.length * VIEWPORTS.length;
  for (const route of ROUTES) {
    for (const viewport of VIEWPORTS) {
      count += 1;
      const tag = `[${String(count).padStart(2, '0')}/${total}] ${route.name} @ ${viewport.label}`;
      process.stdout.write(`${tag} ... `);
      try {
        await auditPage(page, route, viewport, results);
        process.stdout.write('ok\n');
      } catch (err) {
        process.stdout.write(`FAIL: ${err.message}\n`);
        results.push({ route: route.name, viewport: viewport.label, error: err.message });
      }
    }
  }

  await browser.close();

  const reportPath = path.join(OUT_DIR, 'report.json');
  await writeFile(reportPath, JSON.stringify(results, null, 2), 'utf8');

  // Friendly summary.
  console.log('\n=== Summary ===');
  const issues = results.filter(
    (r) => r.error || (r.horizontalOverflow !== undefined && r.horizontalOverflow > 0),
  );
  if (issues.length === 0) {
    console.log('No horizontal overflow detected. No errors.');
  } else {
    for (const issue of issues) {
      if (issue.error) {
        console.log(`[ERR ] ${issue.route} @ ${issue.viewport} -> ${issue.error}`);
      } else {
        console.log(
          `[OVF ] ${issue.route} @ ${issue.viewport} -> overflow ${issue.horizontalOverflow}px (scroll=${issue.scrollWidth}, client=${issue.clientWidth})`,
        );
      }
    }
  }

  // Spotlight pages where the first heading is suspiciously far below or above the header.
  const layoutFlags = results.filter((r) => {
    if (r.headingGapFromHeader == null) return false;
    return r.headingGapFromHeader < 0 || r.headingGapFromHeader > 220;
  });
  if (layoutFlags.length > 0) {
    console.log('\n=== Heading distance from header bottom (px) ===');
    for (const r of layoutFlags) {
      console.log(
        `${r.headingGapFromHeader < 0 ? '[CLIP]' : '[GAP ]'} ${r.route} @ ${r.viewport} -> ${r.headingGapFromHeader}px (header=${r.headerHeight}, headingTop=${r.headingTop})`,
      );
    }
  }

  console.log(`\nReport written to ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
