import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';
import { deferred } from './helpers/componentHarness.js';

test('an account switch during resume authentication cannot save an earlier account snapshot', async () => {
  const auth = deferred();
  const calls = [];
  const { exports: { saveResume } } = loadEdgeFunction('src/services/supabaseService.js', {
    imports: {
      './supabase': { supabase: {
        auth: { getUser: () => auth.promise },
        rpc: async (...args) => { calls.push(args); return { data: { resume_id: 'saved-resume', revision: 1, updated_at: '2026-09-04T12:00:00Z' } }; },
      } },
      '../utils/resumeTitle.js': { deriveResumeTitle: () => 'Resume' },
    },
  });
  const pending = saveResume({ personalInfo: { fullName: 'Private A' } }, null, 'user-a');
  auth.resolve({ data: { user: { id: 'user-b' } } });
  await assert.rejects(pending, /Account changed/);
  assert.equal(calls.length, 0);
});

test('matching account resume saves preserve an explicit owner through RPC', async () => {
  const calls = [];
  const { exports: { saveResume } } = loadEdgeFunction('src/services/supabaseService.js', {
    imports: {
      './supabase': { supabase: {
        auth: { getUser: async () => ({ data: { user: { id: 'user-a' } } }) },
        rpc: async (...args) => { calls.push(args); return { data: { resume_id: 'saved-resume', revision: 1, updated_at: '2026-09-04T12:00:00Z' } }; },
      } },
      '../utils/resumeTitle.js': { deriveResumeTitle: () => 'Resume' },
    },
  });
  await saveResume({ personalInfo: { fullName: 'Candidate' } }, null, 'user-a');
  assert.equal(calls[0][1].p_user_id, 'user-a');
});
