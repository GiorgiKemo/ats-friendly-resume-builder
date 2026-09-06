import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEdgeFunction, queryResult } from './helpers/loadEdgeFunction.js';

const updatedAt = '2026-09-04T14:00:00.123456+00:00';
const saved = (resumeId = 'resume-1', revision = 1) => ({ resume_id: resumeId, revision, updated_at: updatedAt });
const loaded = (revision = 1) => ({ id: 'resume-1', user_id: 'account-a', title: 'Engineer', revision, updated_at: updatedAt,
  personal_info: { fullName: 'Candidate' }, work_experience: [{ position: 'Engineer', company: 'Example' }] });

function setup({ rpc = async () => ({ data: saved() }), rows = [] } = {}) {
  const calls = [];
  const { exports } = loadEdgeFunction('src/services/supabaseService.js', {
    imports: {
      './supabase': { supabase: {
        auth: { getUser: async () => { calls.push(['auth']); return { data: { user: { id: 'account-a' } } }; } },
        rpc: (...args) => { calls.push(['rpc', ...args]); return rpc(...args); },
        from: (table) => { calls.push(['from', table]); return queryResult({ data: rows, error: null }, calls); },
      } },
      '../utils/resumeTitle.js': { deriveResumeTitle: (resume) => resume.title || 'Resume' },
    },
  });
  return { ...exports, calls };
}

test('new resumes use only the versioned create RPC and return server metadata unchanged', async () => {
  const service = setup();
  const input = { title: 'Engineer', revision: 42, personalInfo: { fullName: 'Candidate' } };
  const result = await service.saveResume(input, null, 'account-a');
  assert.deepEqual(JSON.parse(JSON.stringify(result)), saved());
  assert.equal(service.calls.length, 2);
  assert.equal(service.calls[1][1], 'save_resume_versioned');
  assert.equal(service.calls[1][2].p_expected_revision, null);
  assert.equal(service.calls[1][2].p_resume_id, null);
  assert.equal(service.calls[1][2].p_user_id, 'account-a');
  assert.equal(input.revision, 42, 'The service must not mutate caller data or infer the create version from it');
});

test('updates submit the explicit branch revision without reading a newer record first', async () => {
  const service = setup({ rpc: async () => ({ data: saved('resume-1', 4) }) });
  const result = await service.saveResume({ title: 'Newer local draft', revision: 99 }, 'resume-1', 'account-a', 3);
  assert.equal(result.revision, 4);
  assert.equal(result.updated_at, updatedAt);
  assert.deepEqual(service.calls.map((call) => call[0]), ['auth', 'rpc']);
  assert.equal(service.calls[1][2].p_expected_revision, 3);
  assert.equal(service.calls[1][2].p_title, 'Newer local draft');
});

test('updates with missing or invalid revisions fail before authentication or any network operation', async () => {
  for (const revision of [undefined, null, 0, -1, '1', 1.5, NaN, Infinity, 2147483648, Number.MAX_SAFE_INTEGER + 1]) {
    const service = setup();
    await assert.rejects(service.saveResume({ revision: 8 }, 'resume-1', 'account-a', revision), (error) => error.code === 'RESUME_VERSION_REQUIRED');
    assert.deepEqual(service.calls, []);
  }
});

test('a new create cannot accidentally use an existing branch revision', async () => {
  const service = setup();
  await assert.rejects(service.saveResume({}, null, 'account-a', 3), (error) => error.code === 'RESUME_VERSION_REQUIRED');
  assert.deepEqual(service.calls, []);
});

test('stale server revisions produce a typed conflict without reads, retries, or fallback writes', async () => {
  const serverError = { code: 'PT409', message: 'RESUME_CONFLICT' };
  const service = setup({ rpc: async () => ({ data: null, error: serverError }) });
  await assert.rejects(service.saveResume({}, 'resume-1', 'account-a', 1), (error) =>
    error instanceof service.ResumeConflictError && error.code === 'RESUME_CONFLICT' && error.cause === serverError);
  assert.deepEqual(service.calls.map((call) => call[0]), ['auth', 'rpc']);
});

test('concurrent clients with the same loaded revision cannot silently overwrite the first save', async () => {
  let revision = 1;
  let serverTitle = 'Original';
  const rpc = async (_name, args) => {
    if (args.p_expected_revision !== revision) return { error: { code: 'PT409', message: 'RESUME_CONFLICT' } };
    revision += 1;
    serverTitle = args.p_title;
    return { data: saved('resume-1', revision) };
  };
  const first = setup({ rpc });
  const second = setup({ rpc });
  await first.saveResume({ title: 'First device' }, 'resume-1', 'account-a', 1);
  await assert.rejects(second.saveResume({ title: 'Second device' }, 'resume-1', 'account-a', 1), (error) => error.code === 'RESUME_CONFLICT');
  assert.equal(serverTitle, 'First device');
  assert.equal(revision, 2);
  assert.deepEqual(second.calls.map((call) => call[0]), ['auth', 'rpc']);
});

test('version-required and other server errors preserve their distinction and never call legacy RPCs', async () => {
  for (const [serverError, code] of [
    [{ code: '22023', message: 'RESUME_VERSION_REQUIRED' }, 'RESUME_VERSION_REQUIRED'],
    [{ code: '42501', message: 'Access denied' }, '42501'],
    [{ code: 'PGRST202', message: 'Function not deployed' }, 'PGRST202'],
    [{ code: 'PT409', message: 'Unrelated conflict' }, 'PT409'],
  ]) {
    const service = setup({ rpc: async () => ({ error: serverError }) });
    await assert.rejects(service.saveResume({}, 'resume-1', 'account-a', 1), (error) => error.code === code);
    assert.equal(service.calls.filter((call) => call[0] === 'rpc').length, 1);
    assert.equal(service.calls.at(-1)[1], 'save_resume_versioned');
    assert.ok(!service.calls.some((call) => call[0] === 'from'));
  }
});

test('malformed create acknowledgements never fall back to the latest created resume', async () => {
  for (const data of ['legacy-resume-id', null, {}, [], [saved()], { ...saved(), revision: 2 }, { ...saved(), updated_at: 'invalid' }]) {
    const service = setup({ rpc: async () => ({ data }), rows: [loaded()] });
    await assert.rejects(service.saveResume({}, null, 'account-a'), (error) => error.code === 'RESUME_SAVE_UNCONFIRMED');
    assert.deepEqual(service.calls.map((call) => call[0]), ['auth', 'rpc']);
  }
});

test('update acknowledgement must match the requested resume and exactly the next revision', async () => {
  for (const data of [saved('different-resume', 2), saved('resume-1', 1), saved('resume-1', 3), { ...saved('resume-1', 2), updated_at: null }]) {
    const service = setup({ rpc: async () => ({ data }) });
    await assert.rejects(service.saveResume({}, 'resume-1', 'account-a', 1), (error) => error.code === 'RESUME_SAVE_UNCONFIRMED');
    assert.deepEqual(service.calls.map((call) => call[0]), ['auth', 'rpc']);
  }
});

test('load returns content, revision, and timestamp from the same versioned RPC snapshot', async () => {
  const record = loaded(7);
  const service = setup({ rpc: async () => ({ data: [record] }) });
  const result = await service.getResumeById('resume-1');
  assert.equal(result.revision, 7);
  assert.equal(result.updated_at, updatedAt);
  assert.equal(result.work_experience[0].position, 'Engineer');
  assert.deepEqual(service.calls.map((call) => call[0]), ['auth', 'rpc']);
  assert.equal(service.calls[1][1], 'get_resume_versioned');
});

test('versioned loads reject missing metadata, wrong owner, or wrong resume without an old-RPC fallback', async () => {
  for (const record of [{ ...loaded(), revision: undefined }, { ...loaded(), updated_at: null }, { ...loaded(), user_id: 'account-b' }, { ...loaded(), id: 'resume-other' }]) {
    const service = setup({ rpc: async () => ({ data: [record] }) });
    await assert.rejects(service.getResumeById('resume-1'));
    assert.deepEqual(service.calls.map((call) => call[0]), ['auth', 'rpc']);
  }
  const missing = setup({ rpc: async () => ({ data: [] }) });
  assert.equal(await missing.getResumeById('resume-1'), null);
});

test('resume lists request and preserve server version metadata', async () => {
  const service = setup({ rows: [loaded(12)] });
  const result = await service.getUserResumes();
  assert.equal(result[0].revision, 12);
  assert.equal(result[0].updated_at, updatedAt);
  assert.ok(service.calls.find((call) => call[0] === 'select')[1].split(',').map((field) => field.trim()).includes('revision'));
});

test('resume lists reject malformed responses and deduplicate repeated rows', async () => {
  const duplicate = loaded(12);
  const service = setup({ rows: [duplicate, { ...duplicate, title: 'Stale duplicate' }] });
  const result = await service.getUserResumes();
  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'Engineer');

  const malformed = setup({ rows: null });
  await assert.rejects(malformed.getUserResumes(), (error) => error.code === 'RESUME_LIST_INVALID');
});
