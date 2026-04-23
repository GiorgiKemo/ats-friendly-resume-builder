/* global console */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const cwd = process.cwd();
const extensionArg = process.argv.find((value) => value.startsWith('--extension-path='));
const extensionPath = path.resolve(cwd, extensionArg ? extensionArg.split('=')[1] : 'dist-extension');
const manifestPath = path.join(extensionPath, 'manifest.json');
const reportPath = path.join(cwd, 'playwright-artifacts-extension-firefox-compat.json');

const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

const blockers = [];

if (manifest.manifest_version !== 3) {
  blockers.push('Manifest is not MV3, which invalidates this audit.');
}

if (manifest.permissions?.includes('sidePanel')) {
  blockers.push('Uses Chromium-only "sidePanel" permission.');
}

if (manifest.side_panel) {
  blockers.push('Uses Chromium-only "side_panel" manifest entry.');
}

if (manifest.background?.service_worker) {
  blockers.push('Uses MV3 background service worker, which is not a drop-in Firefox target for this bundle.');
}

if (!manifest.background?.scripts?.includes('background.js')) {
  blockers.push('Firefox-targeted build should declare background.scripts for the background document path.');
}

const report = {
  auditedAt: new Date().toISOString(),
  extensionPath,
  firefoxReady: blockers.length === 0,
  blockers,
};

await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`Firefox compatibility report written to ${reportPath}`);
if (blockers.length > 0) {
  console.log(JSON.stringify(report, null, 2));
}
