import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import process from 'node:process';
import vm from 'node:vm';
import { parseJobDescription } from '../src/utils/jobDescriptionParser.js';

const execute = promisify(execFile);
const helperName = 'vacancy-experience.js';
const helperPath = new URL(`../browser-agent/${helperName}`, import.meta.url);
const sharedSource = readFileSync(helperPath, 'utf8');
const classicContext = vm.createContext({});
vm.runInContext(sharedSource, classicContext);
const extract = classicContext.ResumeATSVacancyExperience.extractExperienceRequirement;
const cases = [
  ['required range minimum', 'Requirements: 3-5 years of experience.', 3],
  ['zero with preference', 'No experience required.\nPreferred: 1-2 years of experience.', 0],
  ['one inclusive minimum', 'At least 3.5 years of experience required.', 3.5],
  ['optional-only duration', '• Preferred Qualifications:\n8 years of experience.', null],
  ['company collective tenure', 'Our company has 20 years of combined experience.', null],
  ['different requirements', 'Requirements:\n3 years of Java experience\n5 years of management experience', null],
  ['equal numbers with distinct scopes', 'Requirements:\n3 years of Java experience\n3 years of management experience', null],
  ['distinct scopes on one line', '3 years of Java experience and 3 years of management experience', null],
  ['repeated identical requirement', 'Requirements:\n3 years of Java experience\n3 years of Java experience', 3],
  ['strict lower bound', 'More than 3 years of experience required.', null],
  ['upper bound', 'Maximum of 3 years of experience.', null],
  ['invalid inverted range', '5-3 years of experience required.', null],
  ['negative number is not a bullet', '-3 years of experience.', null],
  ['normal list bullet', '- 3 years of experience required.', 3],
  ['numeric token is not an exponent suffix', '1e2 years of experience.', null],
  ['company introduction is not candidate evidence', 'With 20 years of experience, Cedar Labs builds software.', null],
  ['company possessive is not candidate evidence even with a reader reference', 'At Cedar Labs, our 20 years of experience help you succeed.', null],
  ['company background ends at required heading', 'About us:\n20 years of experience serving customers.\nRequirements:\n3 years of experience.', 3],
  ['explicit candidate requirement within background context', 'About us:\nCandidates must have 3 years of experience.', 3],
  ['explicit candidate subject after with introduction', 'With 3 years of experience, you can join our team.', 3],
];

for (const [label, description, expectedYears] of cases) {
  test(`classic extension and app share experience semantics: ${label}`, () => {
    const classic = extract(description);
    const app = parseJobDescription(description).experience;
    assert.equal(classic.years, expectedYears);
    assert.equal(app.years, expectedYears);
    assert.equal(app.requirementText, classic.requirementText);
  });
}

test('shared parser namespace is narrow, immutable, non-enumerable and has no browser dependencies', () => {
  assert.deepEqual(Object.keys(classicContext), []);
  assert.deepEqual(Object.keys(classicContext.ResumeATSVacancyExperience), ['extractExperienceRequirement']);
  assert.equal(Object.isFrozen(classicContext.ResumeATSVacancyExperience), true);
  for (const input of [undefined, null, 3, {}, '']) {
    assert.equal(extract(input).years, null);
    assert.equal(extract(input).requirementText, '');
  }
});

const assertLoadOrder = (manifest) => {
  const entry = manifest.content_scripts.find(script => script.js.includes('content-job-board.js'));
  assert.ok(entry, 'Vacancy content script exists');
  assert.notEqual(entry.world, 'MAIN', 'Helper is isolated from employer page globals');
  assert.ok(entry.js.indexOf(helperName) >= 0, 'Shared parser is declared');
  assert.ok(entry.js.indexOf(helperName) < entry.js.indexOf('content-job-board.js'), 'Shared parser runs before its consumer');
};

test('unpacked extension loads the authoritative classic parser before its consumer', () => {
  assertLoadOrder(JSON.parse(readFileSync(new URL('../browser-agent/manifest.json', import.meta.url), 'utf8')));
});

test('real Chrome and Firefox package builds include byte-identical shared parser and correct load order', { timeout: 30000 }, async () => {
  // Exercise the actual packaging script in a uniquely owned temporary repo, not shared dist output.
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), 'resumeats-experience-packages-'));
  try {
    await cp(fileURLToPath(new URL('../browser-agent/', import.meta.url)), path.join(fixtureRoot, 'browser-agent'), { recursive: true });
    await mkdir(path.join(fixtureRoot, 'scripts'));
    await cp(fileURLToPath(new URL('../scripts/build-extension.mjs', import.meta.url)), path.join(fixtureRoot, 'scripts/build-extension.mjs'));
    await execute(process.execPath, [path.join(fixtureRoot, 'scripts/build-extension.mjs')], { timeout: 20000, windowsHide: true });
    for (const directory of ['dist-extension', 'dist-extension-firefox']) {
      const output = path.join(fixtureRoot, directory);
      const manifest = JSON.parse(await readFile(path.join(output, 'manifest.json'), 'utf8'));
      assertLoadOrder(manifest);
      const emittedSource = await readFile(path.join(output, helperName), 'utf8');
      assert.equal(emittedSource, sharedSource, `${directory} has no generated parser drift`);
      const context = vm.createContext({});
      vm.runInContext(emittedSource, context);
      assert.equal(context.ResumeATSVacancyExperience.extractExperienceRequirement('3-5 years of experience required.').years, 3);
    }
  } finally {
    // Only remove the exact fresh test directory after validating its resolved parent/name.
    assert.equal(path.dirname(path.resolve(fixtureRoot)), path.resolve(tmpdir()));
    assert.ok(path.basename(fixtureRoot).startsWith('resumeats-experience-packages-'));
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test('Vite retains and executes the shared side-effect parser in minified app output', { timeout: 30000 }, async () => {
  const { build } = await import('vite');
  const result = await build({
    configFile: false, envFile: false, logLevel: 'silent',
    build: {
      write: false, minify: 'terser',
      lib: { entry: fileURLToPath(new URL('../src/utils/jobDescriptionParser.js', import.meta.url)), formats: ['es'] },
    },
  });
  const chunks = result[0].output.filter(item => item.type === 'chunk');
  const entry = chunks.find(chunk => chunk.isEntry);
  assert.ok(chunks.some(chunk => Object.entries(chunk.modules).some(([id, details]) => id.endsWith(`/browser-agent/${helperName}`) && details.renderedLength > 0)));
  const compiled = await import(`data:text/javascript;base64,${Buffer.from(entry.code).toString('base64')}`);
  assert.equal(compiled.parseJobDescription('Requirements: 3-5 years of experience.').experience.years, 3);
  assert.equal(compiled.parseJobDescription('Preferred: 8 years of experience.').experience.years, null);
});
