import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';
import { deferred } from './helpers/componentHarness.js';
import { createResumeTailoringReview, keepOriginalResumeTailoring } from '../src/utils/resumeTailoringReview.js';

function loadDelivery({ getUser = async () => ({ data: { user: { id: 'account-a' } } }), render, save } = {}) {
  const downloads = [];
  const renders = [];
  const remoteCalls = [];
  const artifact = { pdf: { save: (filename) => { save?.(); downloads.push(filename); } }, blob: new Blob(['pdf']) };
  const { exports } = loadEdgeFunction('src/services/pdfService.js', {
    imports: {
      jspdf: {}, html2canvas: {},
      './resumePdfDocument.js': { buildTextPdf: async (resume) => { renders.push(resume); await render?.(); return artifact; } },
      './supabase': { supabase: {
        auth: { getUser: () => { remoteCalls.push('auth'); return getUser(); } },
        storage: { from: (bucket) => ({ upload: async (...args) => { remoteCalls.push({ bucket, args }); return { error: null }; } }) },
      } },
    },
  });
  return { ...exports, downloads, renders, remoteCalls };
}

const savedResume = () => ({ id: 'resume-a', user_id: 'account-a', revision: 1, personalInfo: { fullName: 'José' } });
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('a clean saved PDF download performs no Auth or Storage call', async () => {
  const app = loadDelivery();
  const resume = savedResume();
  assert.equal(await app.downloadResumePdf(null, resume, 'José_Resume'), true);
  await settle();
  assert.deepEqual(app.downloads, ['José_Resume.pdf']);
  assert.equal(app.renders[0], resume);
  assert.deepEqual(app.remoteCalls, []);
});

test('a stale saved revision remains a local snapshot and cannot overwrite a newer remote PDF', async () => {
  const app = loadDelivery();
  const resume = Object.freeze({ ...savedResume(), revision: 1 });
  assert.equal(await app.downloadResumePdf(null, resume, 'old-snapshot'), true);
  await settle();
  assert.equal(app.renders[0].revision, 1, 'Download renders the selected local snapshot without fetching/rebasing');
  assert.deepEqual(app.remoteCalls, [], 'Even same-owner stale exports must not upsert a fixed cloud PDF key');
});

test('draft, missing-owner, foreign-owner, and signed-out downloads do not consult account state', async () => {
  for (const resume of [
    { ...savedResume(), id: '' },
    { ...savedResume(), user_id: undefined },
    { ...savedResume(), user_id: 'other-account' },
    savedResume(),
  ]) {
    const app = loadDelivery({ getUser: async () => ({ data: { user: null } }) });
    assert.equal(await app.downloadResumePdf(null, resume), true);
    await settle();
    assert.deepEqual(app.downloads, ['resume.pdf']);
    assert.deepEqual(app.remoteCalls, []);
  }
});

test('account change during an already-started local render never causes an Auth check or cloud write', async () => {
  for (const nextUser of ['account-b', null]) {
    const rendering = deferred();
    let userId = 'account-a';
    const app = loadDelivery({
      getUser: async () => ({ data: { user: userId ? { id: userId } : null } }),
      render: () => rendering.promise,
    });
    const pending = app.downloadResumePdf(null, savedResume(), 'Private_A');
    userId = nextUser;
    rendering.resolve();
    assert.equal(await pending, true);
    await settle();
    assert.deepEqual(app.downloads, ['Private_A.pdf']);
    assert.deepEqual(app.remoteCalls, []);
  }
});

test('local render and browser dispatch failures retain their exact error and never touch remote services', async () => {
  for (const stage of ['render', 'save']) {
    const error = new Error('Exact ' + stage + ' failure');
    const app = loadDelivery({ [stage]: () => { throw error; } });
    await assert.rejects(app.downloadResumePdf(null, savedResume()), (actual) => actual === error);
    assert.deepEqual(app.downloads, []);
    assert.deepEqual(app.remoteCalls, []);
  }
});

test('pending and self-labelled reviewed envelopes cannot reach PDF rendering or download', async () => {
  const review = createResumeTailoringReview({ baseResume: savedResume(), candidateResume: { ...savedResume(), personalInfo: { fullName: 'José', summary: 'Unsupported candidate prose' } } });
  for (const value of [review, { ...review, reviewed: true }, { ...review, approved: true }]) {
    const app = loadDelivery();
    await assert.rejects(app.downloadResumePdf(null, value), (error) => error.code === 'TAILORING_REVIEW_REQUIRED');
    assert.deepEqual(app.renders, []);
    assert.deepEqual(app.downloads, []);
    assert.deepEqual(app.remoteCalls, []);
  }
  const app = loadDelivery();
  assert.equal(await app.downloadResumePdf(null, keepOriginalResumeTailoring(review)), true);
  assert.deepEqual(app.remoteCalls, []);
});

test('the unused dedicated cloud PDF upload API is removed', () => {
  assert.equal(loadDelivery().uploadResumePdfToStorage, undefined);
});

test('the ordinary PDF module can load without importing a Supabase client', () => {
  const imports = { jspdf: {}, html2canvas: {}, './resumePdfDocument.js': {} };
  Object.defineProperty(imports, './supabase', { get: () => { throw new Error('Local PDF download must not initialize Supabase'); } });
  assert.doesNotThrow(() => loadEdgeFunction('src/services/pdfService.js', { imports }));
});

test('certification-only resumes use the text renderer instead of a canvas screenshot', async () => {
  const app = loadDelivery();
  const resume = { ...savedResume(), personalInfo: {}, certifications: [{ name: 'AWS Certified Developer' }] };

  assert.equal(await app.downloadResumePdf(null, resume, 'certification-only'), true);
  assert.equal(app.renders.length, 1);
  assert.equal(app.renders[0], resume);
  assert.deepEqual(app.downloads, ['certification-only.pdf']);
});

test('the defensive canvas PDF fallback keeps the text renderer US Letter geometry', async () => {
  const pdfs = [];
  class FakeJsPDF {
    constructor(options) {
      this.options = options;
      this.images = [];
      this.saveCalls = [];
      pdfs.push(this);
    }

    addImage(...args) {
      this.images.push(args);
    }

    output(type) {
      return type === 'blob' ? { size: 1 } : '';
    }

    save(filename) {
      this.saveCalls.push(filename);
    }
  }

  const canvas = {
    width: 1024,
    height: 640,
    toDataURL: () => 'data:image/jpeg;base64,fixture',
  };
  const document = {
    body: {
      appendChild() {},
    },
    createElement: () => ({
      getContext: () => ({
        fillStyle: '',
        fillRect() {},
        drawImage() {},
      }),
      toDataURL: () => 'data:image/jpeg;base64,fixture',
    }),
  };
  const element = {
    cloneNode: () => ({ style: {} }),
  };

  const { exports } = loadEdgeFunction('src/services/pdfService.js', {
    imports: {
      jspdf: { jsPDF: FakeJsPDF },
      html2canvas: { default: async () => canvas },
      './resumePdfDocument.js': { buildTextPdf: async () => { throw new Error('text renderer should not run'); } },
    },
    globals: { document },
  });

  await exports.downloadResumePdf(element, { languages: ['English'] }, 'partial');

  assert.equal(pdfs.length, 1);
  assert.equal(pdfs[0].options.format, 'letter');
  assert.equal(pdfs[0].options.unit, 'mm');
  assert.equal(pdfs[0].images[0][4], 215.9);
  assert.equal(pdfs[0].images[0][5], 134.9375);
  assert.deepEqual(pdfs[0].saveCalls, ['partial.pdf']);
});
