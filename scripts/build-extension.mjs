/* global console, process */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const sourceDir = path.join(repoRoot, 'browser-agent');
const productionHosts = [
  'https://resumeats.cv/*',
  'https://www.resumeats.cv/*',
];

const targets = [
  {
    id: 'chromium',
    outputDir: path.join(repoRoot, 'dist-extension'),
    readmeLines: [
      '# ResumeATS Browser Agent',
      '',
      'This folder is the Chromium-family production package.',
      '',
      'Load this `dist-extension` folder in Chromium, Edge, Brave, or Opera, or pack that folder for distribution.',
      '',
      'The production package keeps only the live ResumeATS hosts in the app bridge manifest and strips local development bridge hosts from the built extension files.',
      '',
    ],
    transformManifest: (manifest) => {
      const nextManifest = JSON.parse(JSON.stringify(manifest));
      nextManifest.content_scripts = nextManifest.content_scripts.map((entry) => {
        if (Array.isArray(entry.js) && entry.js.includes('content-app-bridge.js')) {
          return {
            ...entry,
            matches: productionHosts,
          };
        }

        return entry;
      });
      return nextManifest;
    },
  },
  {
    id: 'firefox',
    outputDir: path.join(repoRoot, 'dist-extension-firefox'),
    readmeLines: [
      '# ResumeATS Browser Agent (Firefox)',
      '',
      'This folder is the Firefox-targeted production package.',
      '',
      'Load this `dist-extension-firefox` folder in Firefox via `about:debugging`, or package it as a Firefox build artifact.',
      '',
      'It swaps Chromium side-panel wiring for Firefox sidebar support and keeps only the live ResumeATS hosts in the app bridge manifest.',
      '',
    ],
    transformManifest: (manifest) => {
      const nextManifest = JSON.parse(JSON.stringify(manifest));
      nextManifest.permissions = (nextManifest.permissions || []).filter((permission) => permission !== 'sidePanel');
      delete nextManifest.side_panel;
      nextManifest.sidebar_action = {
        default_title: nextManifest.name || 'ResumeATS Browser Agent',
        default_panel: 'sidepanel.html',
      };
      nextManifest.background = {
        scripts: ['background.js'],
        type: 'module',
      };
      nextManifest.browser_specific_settings = {
        gecko: {
          id: 'browser-agent@resumeats.cv',
          strict_min_version: '121.0',
        },
      };
      nextManifest.content_scripts = nextManifest.content_scripts.map((entry) => {
        if (Array.isArray(entry.js) && entry.js.includes('content-app-bridge.js')) {
          return {
            ...entry,
            matches: productionHosts,
          };
        }

        return entry;
      });
      return nextManifest;
    },
  },
];

const copyDirectory = async (source, destination) => {
  await fs.mkdir(destination, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, destinationPath);
      continue;
    }

    await fs.copyFile(sourcePath, destinationPath);
  }
};

const stripDevHostsFromFile = async (outputDir, relativePath) => {
  const filePath = path.join(outputDir, relativePath);
  const source = await fs.readFile(filePath, 'utf8');
  const cleaned = source
    .replace(/^\s*\/\^localhost\$\/i,\r?\n/gm, '')
    .replace(/^\s*\/\^127\\\.0\\\.0\\\.1\$\/i,\r?\n/gm, '')
    .replace(/^\s*&& !\/\^localhost\$\/i\.test\(host\)\r?\n/gm, '')
    .replace(/^\s*&& !\/\^127\\\.0\\\.0\\\.1\$\/i\.test\(host\)\r?\n/gm, '');
  await fs.writeFile(filePath, cleaned, 'utf8');
};

const verifyNoLocalhosts = async (outputDir) => {
  const verifyTargets = await fs.readdir(outputDir);
  for (const entry of verifyTargets) {
    const filePath = path.join(outputDir, entry);
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) continue;
    const verifyText = await fs.readFile(filePath, 'utf8');
    if (/localhost|127\.0\.0\.1/i.test(verifyText)) {
      throw new Error(`Production extension file still contains localhost references: ${entry}`);
    }
  }
};

const buildTarget = async (target) => {
  await fs.rm(target.outputDir, { recursive: true, force: true });
  await copyDirectory(sourceDir, target.outputDir);

  const manifestPath = path.join(target.outputDir, 'manifest.json');
  const sourceManifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const manifest = target.transformManifest(sourceManifest);
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  await stripDevHostsFromFile(target.outputDir, 'background.js');
  await stripDevHostsFromFile(target.outputDir, 'content-job-board.js');
  await stripDevHostsFromFile(target.outputDir, 'popup.js');

  await fs.writeFile(path.join(target.outputDir, 'README.md'), target.readmeLines.join('\n'), 'utf8');
  await verifyNoLocalhosts(target.outputDir);
};

const main = async () => {
  for (const target of targets) {
    await buildTarget(target);
  }

  console.log(`Production extension written to ${targets[0].outputDir}`);
  console.log(`Firefox extension written to ${targets[1].outputDir}`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
