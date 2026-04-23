/* global console, process */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const sourceDir = path.join(repoRoot, 'browser-agent');
const outputDir = path.join(repoRoot, 'dist-extension');
const productionHosts = [
  'https://resumeats.cv/*',
  'https://www.resumeats.cv/*',
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

const main = async () => {
  await fs.rm(outputDir, { recursive: true, force: true });
  await copyDirectory(sourceDir, outputDir);

  const manifestPath = path.join(outputDir, 'manifest.json');
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));

  manifest.content_scripts = manifest.content_scripts.map((entry) => {
    if (Array.isArray(entry.js) && entry.js.includes('content-app-bridge.js')) {
      return {
        ...entry,
        matches: productionHosts,
      };
    }

    return entry;
  });

  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const stripDevHostsFromFile = async (relativePath) => {
    const filePath = path.join(outputDir, relativePath);
    const source = await fs.readFile(filePath, 'utf8');
    const cleaned = source
      .replace(/^\s*\/\^localhost\$\/i,\r?\n/gm, '')
      .replace(/^\s*\/\^127\\\.0\\\.0\\\.1\$\/i,\r?\n/gm, '')
      .replace(/^\s*&& !\/\^localhost\$\/i\.test\(host\)\r?\n/gm, '')
      .replace(/^\s*&& !\/\^127\\\.0\\\.0\\\.1\$\/i\.test\(host\)\r?\n/gm, '');
    await fs.writeFile(filePath, cleaned, 'utf8');
  };

  await stripDevHostsFromFile('background.js');
  await stripDevHostsFromFile('content-job-board.js');
  await stripDevHostsFromFile('popup.js');

  const productionReadme = [
    '# ResumeATS Browser Agent',
    '',
    'This folder is the production-ready extension package.',
    '',
    'Load this `dist-extension` folder in `chrome://extensions`, or pack it for distribution.',
    '',
    'The production package keeps only the live ResumeATS hosts in the app bridge manifest and strips local development bridge hosts from the built extension files.',
    '',
  ].join('\n');
  await fs.writeFile(path.join(outputDir, 'README.md'), productionReadme, 'utf8');

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

  console.log(`Production extension written to ${outputDir}`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
