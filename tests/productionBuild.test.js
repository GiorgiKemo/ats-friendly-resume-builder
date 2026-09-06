import assert from 'node:assert/strict';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { buildProduction } from '../scripts/build-production.mjs';

const fixtureDirectory = fileURLToPath(new URL('./fixtures/build-mode/', import.meta.url));
const restoreEnvironment = () => {
  const keys = ['NODE_ENV', 'VITE_USER_NODE_ENV'];
  const original = new Map(keys.map(key => [key, process.env[key]]));
  return () => {
    for (const [key, value] of original) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
};

test('ordinary development retains development branches with a local development env file', async () => {
  const restore = restoreEnvironment();
  try {
    process.env.NODE_ENV = 'development';
    const { resolveConfig } = await import('vite');
    const config = await resolveConfig({ mode: 'fixture', envDir: fixtureDirectory, logLevel: 'silent' }, 'serve');
    assert.equal(config.isProduction, false);
    assert.equal(config.env.DEV, true);
    assert.equal(config.env.PROD, false);
    assert.equal(config.esbuild.jsxDev, true);
  } finally {
    restore();
  }
});

test('direct development-mode release builds fail closed instead of emitting a development runtime', async () => {
  const restore = restoreEnvironment();
  try {
    const { resolveConfig } = await import('vite');
    for (const inherited of [undefined, 'development']) {
      if (inherited === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = inherited;
      delete process.env.VITE_USER_NODE_ENV;
      await assert.rejects(
        resolveConfig({ mode: 'fixture', envDir: fixtureDirectory, logLevel: 'silent' }, 'build', 'production', 'production'),
        /Refusing a development-mode release build/,
      );
    }
  } finally {
    restore();
  }
});

test('release output compiles production branches and keeps complete export dependency graphs off initial loading', { timeout: 120000 }, async () => {
  const restore = restoreEnvironment();
  try {
    process.env.NODE_ENV = 'development';
    const result = await buildProduction({
      logLevel: 'silent',
      mode: 'fixture',
      envDir: fixtureDirectory,
      build: {
        write: false,
        rollupOptions: {
          input: {
            app: 'index.html',
            modeProbe: fileURLToPath(new URL('./fixtures/build-mode/probe.js', import.meta.url)),
          },
        },
      },
    });
    const chunks = result.output.filter(item => item.type === 'chunk');
    const byFile = new Map(chunks.map(chunk => [chunk.fileName, chunk]));
    const app = chunks.find(chunk => chunk.isEntry && chunk.facadeModuleId?.endsWith('/index.html'));
    const probe = chunks.find(chunk => chunk.isEntry && chunk.name === 'modeProbe');
    assert.ok(app && probe, 'Both actual app and branch probe were emitted');
    assert.match(probe.code, /MODE_PROBE_PROD/);
    assert.match(probe.code, /NODE_PROBE_PROD/);
    assert.doesNotMatch(probe.code, /MODE_PROBE_DEV|NODE_PROBE_DEV/);

    const allModules = chunks.flatMap(chunk => Object.entries(chunk.modules).filter(([, module]) => module.renderedLength > 0).map(([id]) => id));
    assert.ok(allModules.some(id => /react-dom\/cjs\/react-dom\.production\.min\.js/.test(id)), 'Actual production React DOM is bundled');
    assert.ok(!allModules.some(id => /\/(?:react|react-dom|scheduler)\/.*\.development\.js/.test(id)), 'No rendered React development runtime');
    assert.ok(allModules.some(id => id.replace(/\\/g, '/').endsWith('/browser-agent/vacancy-experience.js')), 'The shared vacancy parser side effect is retained in the actual production app');
    const initial = new Set();
    const visit = file => {
      if (initial.has(file)) return;
      initial.add(file);
      assert.ok(byFile.has(file), `Initial import resolves: ${file}`);
      byFile.get(file).imports.forEach(visit);
    };
    visit(app.fileName);
    const initialModules = [...initial].flatMap(file => Object.keys(byFile.get(file).modules));
    const exportOnly = /node_modules\/(?:jspdf|html2canvas|docx|file-saver|canvg|dompurify|pako|fast-png|iobuffer|fflate|svg-pathdata|stackblur-canvas|rgbcolor|core-js)\//;
    assert.deepEqual(initialModules.filter(id => exportOnly.test(id)), [], 'PDF/Word transitive libraries are not initially imported');

    for (const chunk of chunks) {
      for (const dependency of [...chunk.imports, ...chunk.dynamicImports]) {
        assert.ok(byFile.has(dependency), `Emitted dependency resolves: ${chunk.fileName} -> ${dependency}`);
      }
    }
    const pdf = chunks.find(chunk => chunk.name === 'pdf');
    const docx = chunks.find(chunk => chunk.name === 'docx');
    assert.ok(pdf && docx, 'Export libraries are retained for explicit downloads');
    assert.ok(!initial.has(pdf.fileName) && !initial.has(docx.fileName));
    const html = result.output.find(item => item.fileName === 'index.html').source;
    assert.ok(!html.includes(pdf.fileName) && !html.includes(docx.fileName), 'Initial HTML does not preload exports');
    assert.doesNotMatch(html, /<link[^>]+rel=["'](?:preconnect|dns-prefetch)["'][^>]+https?:\/\//i, 'HTML does not contact a hardcoded external backend before configuration');
    for (const name of ['ResumeBuilder', 'ResumePreview', 'SimpleResumeFlow']) {
      const caller = chunks.find(chunk => chunk.name === name);
      assert.ok(caller, `${name} route exists`);
      assert.ok(caller.dynamicImports.some(file => byFile.get(file).name === 'pdfService'), `${name} keeps PDF lazy`);
      assert.ok(caller.dynamicImports.some(file => byFile.get(file).name === 'docxService'), `${name} keeps Word lazy`);
      assert.ok(caller.code.includes(pdf.fileName), `${name} preloads the PDF dependency on explicit lazy import`);
      assert.ok(caller.code.includes(docx.fileName), `${name} preloads the Word dependency on explicit lazy import`);
    }
  } finally {
    restore();
  }
});
