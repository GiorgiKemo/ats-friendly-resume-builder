import test from 'node:test';
import assert from 'node:assert/strict';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

const profileId = '10000000-0000-4000-8000-000000000001';
const otherProfileId = '10000000-0000-4000-8000-000000000002';
const timestamp = '2026-09-04T14:00:00Z';
const row = (overrides = {}) => ({ id: profileId, user_id: 'user-a', revision: 3, updated_at: timestamp, ...overrides });

function setup(data = [], { saveResult, error, user = { id: 'user-a' } } = {}) {
  const calls = [];
  let authCalls = 0;
  const { exports: service } = loadEdgeFunction('src/services/userProfileService.js', {
    imports: { './supabase': { supabase: {
      auth: { getUser: async () => { authCalls++; return { data: { user } }; } },
      rpc: async (name, params) => {
        calls.push({ name, params });
        return { data: name === 'save_user_profile_versioned'
          ? saveResult === undefined ? { profile_id: params.p_expected_profile_id || profileId, revision: (params.p_expected_revision || 0) + 1, updated_at: timestamp } : saveResult
          : data, error: error || null };
      },
    } } },
  });
  return { ...service, calls, get authCalls() { return authCalls; } };
}

test('profile service refuses to read or save another account payload before RPC', async () => {
  const service = setup();
  await assert.rejects(service.getUserProfile('user-b'), /account changed/);
  await assert.rejects(service.saveUserProfile({ personal: { fullName: 'B' } }, 'user-b'), /account changed/);
  assert.equal(service.calls.length, 0);
});

test('profile save handles nullable data and honors explicit reference clearing', async () => {
  const service = setup();
  await service.saveUserProfile({ personal: null, applicationProfile: null, reference_list: [], references: [{ name: 'Old' }] }, 'user-a');
  assert.equal(service.calls[0].params.p_user_id, 'user-a');
  assert.deepEqual(JSON.parse(JSON.stringify(service.calls[0].params.p_personal)), { applicationProfile: {} });
  assert.equal(service.calls[0].params.p_reference_list.length, 0);
  await assert.rejects(service.saveUserProfile(null), /valid profile/);
});

test('profile load normalizes nullable/malformed arrays without dropping supported fields', async () => {
  const service = setup([row({ personal: { fullName: 'Candidate', applicationProfile: null }, work_experience: {}, education: null, skills: ['C++'] })]);
  const profile = await service.getUserProfile('user-a');
  assert.equal(profile.personal.fullName, 'Candidate');
  assert.equal(profile.workExperience.length, 0);
  assert.equal(profile.education.length, 0);
  assert.equal(profile.skills[0], 'C++');
  assert.deepEqual(JSON.parse(JSON.stringify(profile.applicationProfile)), {});
});

test('legacy profile work titles and prose remain visible and survive a save round trip', async () => {
  const source = { position: 'Designer', employer: 'Northstar Studio', description: ['Built the onboarding flow.', 'Maintained the design system.'], startDate: '2021-03', customMetadata: 'retain me' };
  const service = setup([row({ work_experience: [source] })]);
  const profile = await service.getUserProfile('user-a');
  assert.equal(profile.workExperience[0].title, 'Designer');
  assert.equal(profile.workExperience[0].company, 'Northstar Studio');
  assert.equal(profile.workExperience[0].responsibilities, 'Built the onboarding flow.\nMaintained the design system.');
  await service.saveUserProfile(profile, 'user-a');
  const saved = service.calls[1].params.p_work_experience[0];
  assert.equal(saved.title, 'Designer');
  assert.equal(saved.position, source.position);
  assert.equal(saved.customMetadata, 'retain me');
  assert.deepEqual(Array.from(saved.description), source.description);
});

test('versioned profile load returns identity, revision and timestamp from the same owner snapshot', async () => {
  const service = setup([row({ personal: { applicationProfile: { requiresSponsorship: 'Yes' } } })]);
  const profile = await service.getUserProfile('user-a');
  assert.equal(profile.id, profileId);
  assert.equal(profile.revision, 3);
  assert.equal(profile.updatedAt, timestamp);
  assert.equal(profile.applicationProfile.requiresSponsorship, 'Yes');
  assert.equal(service.calls[0].name, 'get_user_profile_versioned');
  assert.equal(await setup().getUserProfile('user-a'), null);
});

test('profile create and update send the caller version without pre-reading or mutating the input', async () => {
  const service = setup();
  const created = await service.saveUserProfile({ personal: { fullName: 'Created' } }, 'user-a');
  assert.equal(created.revision, 1);
  assert.equal(service.calls[0].params.p_expected_profile_id, null);
  assert.equal(service.calls[0].params.p_expected_revision, null);
  const input = { id: profileId, revision: 3, updatedAt: timestamp, personal: { fullName: 'Edited' } };
  const saved = await service.saveUserProfile(input, 'user-a');
  assert.equal(saved.profile_id, profileId);
  assert.equal(saved.revision, 4);
  assert.equal(input.revision, 3);
  assert.equal(service.calls[1].params.p_expected_profile_id, profileId);
  assert.equal(service.calls[1].params.p_expected_revision, 3);
  assert.deepEqual(service.calls.map((call) => call.name), ['save_user_profile_versioned', 'save_user_profile_versioned']);
});

test('missing or invalid loaded profile versions fail before authentication and all network calls', async () => {
  for (const input of [
    { id: profileId }, { revision: 1 }, { id: '', revision: null }, { id: 'not-a-uuid', revision: 1 },
    ...[null, 0, -1, 1.5, '1', 2147483648, NaN].map((revision) => ({ id: profileId, revision })),
  ]) {
    const service = setup();
    await assert.rejects(service.saveUserProfile(input, 'user-a'), { code: 'PROFILE_VERSION_REQUIRED' });
    assert.equal(service.authCalls, 0);
    assert.equal(service.calls.length, 0);
  }
});

test('typed profile conflicts never retry or fall back to unversioned writes', async () => {
  const cause = { code: 'PT409', message: 'PROFILE_CONFLICT' };
  const service = setup([], { error: cause });
  await assert.rejects(service.saveUserProfile({ id: profileId, revision: 3 }, 'user-a'), (error) => {
    assert.ok(error instanceof service.ProfileConflictError);
    assert.equal(error.code, 'PROFILE_CONFLICT');
    assert.equal(error.cause, cause);
    return true;
  });
  assert.equal(service.calls.length, 1);
  assert.equal(service.calls[0].name, 'save_user_profile_versioned');
});

test('server version requirements retain a stable code without treating all errors as conflicts', async () => {
  for (const [cause, code] of [
    [{ code: '22023', message: 'PROFILE_VERSION_REQUIRED' }, 'PROFILE_VERSION_REQUIRED'],
    [{ code: 'PT409', message: 'A different error' }, 'PT409'],
    [{ code: '42501', message: 'Private database details' }, '42501'],
  ]) {
    const service = setup([], { error: cause });
    await assert.rejects(service.saveUserProfile({ id: profileId, revision: 3 }, 'user-a'), (error) => {
      assert.equal(error.code, code);
      assert.equal(error instanceof service.ProfileConflictError, false);
      assert.doesNotMatch(error.message, /Private database details/);
      return true;
    });
    assert.equal(service.calls.length, 1);
  }
});

test('unconfirmed profile acknowledgments cannot mark stale or malformed responses as saved', async () => {
  const valid = { profile_id: profileId, revision: 4, updated_at: timestamp };
  for (const saveResult of [null, [], profileId, {}, { ...valid, profile_id: otherProfileId },
    { ...valid, revision: 3 }, { ...valid, revision: 5 }, { ...valid, revision: '4' },
    { ...valid, updated_at: 'invalid' }, { ...valid, updated_at: null }]) {
    const service = setup([], { saveResult });
    await assert.rejects(service.saveUserProfile({ id: profileId, revision: 3 }, 'user-a'), { code: 'PROFILE_SAVE_UNCONFIRMED' });
    assert.equal(service.calls.length, 1);
  }
  const create = setup([], { saveResult: valid });
  await assert.rejects(create.saveUserProfile({}, 'user-a'), { code: 'PROFILE_SAVE_UNCONFIRMED' });
});

test('malformed or wrong-owner profile loads fail closed instead of returning an empty writable profile', async () => {
  for (const data of [null, {}, [null], [row(), row()], [row({ id: 'invalid' })], [row({ user_id: 'user-b' })]]) {
    await assert.rejects(setup(data).getUserProfile('user-a'), { code: 'PROFILE_LOAD_INVALID' });
  }
  for (const data of [[row({ revision: null })], [row({ revision: 0 })], [row({ revision: '3' })], [row({ updated_at: 'invalid' })]]) {
    await assert.rejects(setup(data).getUserProfile('user-a'), { code: 'PROFILE_VERSION_UNAVAILABLE' });
  }
});

test('unauthenticated profile saves and loads cannot reach either RPC', async () => {
  const service = setup([], { user: null });
  await assert.rejects(service.saveUserProfile({}, 'user-a'), /not authenticated/);
  await assert.rejects(service.getUserProfile('user-a'), /not authenticated/);
  assert.equal(service.calls.length, 0);
});
