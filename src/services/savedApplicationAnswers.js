import { getUserProfile, saveUserProfile } from './userProfileService';
import { getSafeExternalUrl } from '../utils/urlSafety.js';

export async function saveApplicationAnswers({ jobUrl, answers, expectedUserId, signal }) {
  const safeUrl = getSafeExternalUrl(jobUrl);
  if (!safeUrl || !Array.isArray(answers)) throw new Error('An application and its answers are required.');
  const hostname = new URL(safeUrl).hostname;
  const entries = answers.filter(entry => typeof entry?.question === 'string' && typeof entry.answer === 'string'
    && entry.question.trim() && entry.answer.trim()).slice(0, 20)
    .map(entry => ({ question: entry.question.trim().slice(0, 500), answer: entry.answer.trim().slice(0, 4000), hostname }));
  if (!entries.length) throw new Error('Enter at least one answer before saving.');
  const assertCurrent = () => { if (signal?.aborted) throw new Error('Your account changed. Reopen the original profile to check its saved answers.'); };
  assertCurrent();
  const profile = await getUserProfile(expectedUserId);
  assertCurrent();
  if (!profile) throw new Error('Complete your career profile before saving application answers.');
  const existing = Array.isArray(profile.applicationProfile?.reusableAnswers) ? profile.applicationProfile.reusableAnswers : [];
  const key = entry => `${entry.hostname || ''}:${String(entry.question || '').trim().toLowerCase()}`;
  const merged = new Map(existing.map(entry => [key(entry), entry]));
  entries.forEach(entry => merged.set(key(entry), entry));
  if (merged.size > 100) throw new Error('Your answer library is full. Remove an unused answer from your career profile.');
  // Preserve the loaded version so a concurrent profile edit fails with a conflict.
  const next = { ...profile, applicationProfile: { ...profile.applicationProfile, reusableAnswers: [...merged.values()] } };
  const saved = await saveUserProfile(next, expectedUserId);
  assertCurrent();
  return { ...next, id: saved.profile_id, revision: saved.revision, updated_at: saved.updated_at };
}
