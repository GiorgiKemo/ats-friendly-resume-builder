import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

function setup({ controller, conflict = false } = {}) {
  const writes = [];
  const profile = { id: 'profile-a', revision: 4, personal: { fullName: 'Alex Morgan' }, workExperience: [{ company: 'Existing employer' }],
    applicationProfile: { noticePeriod: 'Two weeks', reusableAnswers: [{ question: 'Start date?', answer: 'Later', hostname: 'other.example' }] } };
  const { exports } = loadEdgeFunction('src/services/savedApplicationAnswers.js', { imports: {
    './userProfileService': { getUserProfile: async () => { controller?.abort(); return profile; }, saveUserProfile: async (value, owner) => {
      writes.push({ value, owner });
      if (conflict) throw new Error('Profile changed. Reload it before saving.');
      return { profile_id: 'profile-a', revision: 5, updated_at: '2026-09-07T00:00:00Z' };
    } },
  } });
  return { ...exports, writes, profile };
}

const request = { jobUrl: 'https://careers.example/job/1', expectedUserId: 'account-a', answers: [{ question: 'Start date?', answer: 'Two weeks' }] };
test('saved application answers retain the loaded profile version, other employers and career history', async () => {
  const app = setup();
  const result = await app.saveApplicationAnswers(request);
  assert.equal(app.writes[0].owner, 'account-a');
  assert.equal(app.writes[0].value.revision, 4);
  assert.deepEqual(app.writes[0].value.workExperience, app.profile.workExperience);
  assert.equal(result.revision, 5);
  assert.equal(result.applicationProfile.reusableAnswers.length, 2);
  assert.equal(result.applicationProfile.reusableAnswers[1].hostname, 'careers.example');
});
test('account cancellation during profile load prevents the save', async () => {
  const controller = new AbortController();
  const app = setup({ controller });
  await assert.rejects(app.saveApplicationAnswers({ ...request, signal: controller.signal }), /account changed/);
  assert.equal(app.writes.length, 0);
});
test('profile conflicts are surfaced without overwriting or retrying stale data', async () => {
  const app = setup({ conflict: true });
  await assert.rejects(app.saveApplicationAnswers(request), /Profile changed/);
  assert.equal(app.writes.length, 1);
});
