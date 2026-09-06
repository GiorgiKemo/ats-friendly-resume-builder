import { gzipSync } from 'node:zlib';
import { writeFile } from 'node:fs/promises';
import { buildProduction } from './build-production.mjs';

const outputPath = process.argv[2] || 'docs/audit-2026-09-04/production-loading-after-version-bound-email.json';
const result = await buildProduction({ logLevel: 'silent', build: { write: false } });
const chunks = result.output.filter((item) => item.type === 'chunk');
const byFile = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
const toBytes = (value) => Buffer.isBuffer(value) ? value : Buffer.from(value);
const packageName = (moduleId) => {
  const normalized = moduleId.replace(/\\/g, '/');
  const marker = '/node_modules/';
  const index = normalized.lastIndexOf(marker);
  if (index < 0) return null;
  const path = normalized.slice(index + marker.length);
  const parts = path.split('/');
  return parts[0]?.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0] || null;
};
const packagesFor = (chunk) => [...new Set(Object.keys(chunk.modules).map(packageName).filter(Boolean))].sort();
const size = (value) => {
  const bytes = toBytes(value);
  return { rawBytes: bytes.byteLength, gzipBytes: gzipSync(bytes).byteLength };
};

const records = chunks.map((chunk) => ({
  file: chunk.fileName,
  isEntry: Boolean(chunk.isEntry),
  imports: [...chunk.imports],
  dynamicImports: [...chunk.dynamicImports],
  ...size(chunk.code),
  packages: packagesFor(chunk),
}));
const entry = chunks.find((chunk) => chunk.isEntry && chunk.facadeModuleId?.replace(/\\/g, '/').endsWith('/index.html'));
if (!entry) throw new Error('Could not identify the application HTML entry chunk.');
const initialFiles = [];
const visit = (file) => {
  if (initialFiles.includes(file)) return;
  const chunk = byFile.get(file);
  if (!chunk) throw new Error(`Initial dependency does not resolve: ${file}`);
  initialFiles.push(file);
  chunk.imports.forEach(visit);
};
visit(entry.fileName);
const initialRecords = initialFiles.map((file) => records.find((record) => record.file === file));
const assets = result.output
  .filter((item) => item.type === 'asset' && /^assets\/(?:css|ttf)\//.test(item.fileName))
  .map((asset) => ({ file: asset.fileName, ...size(asset.source) }));

await writeFile(outputPath, JSON.stringify({
  label: 'After final local hardening: main production asset snapshot',
  comparison: 'Current reproducible snapshot; prior production-loading snapshots remain unchanged',
  initial: {
    files: initialFiles,
    rawBytes: initialRecords.reduce((sum, record) => sum + record.rawBytes, 0),
    gzipBytes: initialRecords.reduce((sum, record) => sum + record.gzipBytes, 0),
  },
  chunks: records,
  assets,
}, null, 2) + '\n');
console.log(`Wrote ${outputPath}`);
