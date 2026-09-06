import { supabase } from './supabase';
import { getResumeById } from './supabaseService.js';
import { mapResumeData } from '../utils/resumeDataMapper.js';
import { assertCommittedResume } from '../utils/resumeTailoringReview.js';

export const MAX_RESUME_ARTIFACT_BYTES = 1024 * 1024;
export const MAX_RESUME_ARTIFACT_BASE64_LENGTH = 4 * Math.ceil(MAX_RESUME_ARTIFACT_BYTES / 3);
export const MAX_RESUME_ARTIFACT_RESPONSE_BYTES = 1.5 * 1024 * 1024;
const RENDERER_VERSION = 'resumeats-text-pdf-v1';

const fail = (code, message) => Object.assign(new Error(message), { code });
const validId = (value) => typeof value === 'string' && /^[a-zA-Z0-9._:-]{1,128}$/.test(value);
const validRevision = (value) => Number.isSafeInteger(value) && value > 0 && value <= 2147483647;

const validateSelection = ({ resumeId, expectedRevision, expectedUserId }, requireRevision = false) => {
  if (!validId(resumeId) || !validId(expectedUserId)) {
    throw fail('RESUME_SELECTION_INVALID', 'A saved resume and connected account are required. Choose the resume again.');
  }
  if ((requireRevision || expectedRevision !== undefined) && !validRevision(expectedRevision)) {
    throw fail('RESUME_VERSION_REQUIRED', 'A valid saved revision is required. Preview and choose the resume again.');
  }
};

// Observe changes as well as verifying with Auth: an old getUser response must
// not revive a request after logout or an A -> B -> A account transition.
const createAccountGuard = (expectedUserId) => {
  let changed = false;
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || session?.user?.id !== expectedUserId) changed = true;
  });
  const assert = async () => {
    if (changed) throw fail('RESUME_ACCOUNT_CHANGED', 'Your account changed. Reconnect the extension and choose the resume again.');
    const { data, error } = await supabase.auth.getUser();
    if (changed || error || data?.user?.id !== expectedUserId) {
      throw fail('RESUME_ACCOUNT_CHANGED', 'Your account changed or could not be verified. Reconnect the extension and choose the resume again.');
    }
  };
  return { assert, dispose: () => subscription.unsubscribe() };
};

const loadSelectedSnapshot = async (selection, guard) => {
  await guard.assert();
  const saved = await getResumeById(selection.resumeId);
  await guard.assert();
  if (!saved || saved.id !== selection.resumeId || saved.user_id !== selection.expectedUserId) {
    throw fail('RESUME_SELECTION_UNAVAILABLE', 'The selected resume is no longer available for this account. Choose another saved resume.');
  }
  if (!validRevision(saved.revision) || (selection.expectedRevision !== undefined && saved.revision !== selection.expectedRevision)) {
    throw fail('RESUME_CONFLICT', 'This resume changed since it was selected. Preview its current version and choose it again.');
  }
  assertCommittedResume(saved);
  const snapshot = JSON.parse(JSON.stringify(saved));
  const personal = snapshot.personalInfo ?? snapshot.personal_info ?? {};
  return mapResumeData({
    ...snapshot,
    personalInfo: {
      ...personal,
      fullName: personal.fullName ?? personal.full_name ?? '',
      jobTitle: personal.jobTitle ?? personal.job_title ?? '',
    },
    additionalSections: snapshot.additionalSections ?? snapshot.additional_sections ?? [],
    selectedTemplate: snapshot.selectedTemplate ?? snapshot.selected_template ?? 'basic',
    selectedFont: snapshot.selectedFont ?? snapshot.selected_font ?? 'Arial',
    certifications: (snapshot.certifications ?? []).map((item) => ({ ...item, date: item.date ?? item.issueDate ?? '' })),
  });
};

export const loadBrowserAgentSavedResume = async (selection = {}) => {
  validateSelection(selection);
  const guard = createAccountGuard(selection.expectedUserId);
  try {
    return await loadSelectedSnapshot(selection, guard);
  } finally {
    guard.dispose();
  }
};

export const validateBrowserAgentSavedResume = async (selection = {}) => {
  validateSelection(selection, true);
  const saved = await loadBrowserAgentSavedResume(selection);
  return { ownerId: saved.user_id, resumeId: saved.id, revision: saved.revision };
};

export const prepareBrowserAgentSavedResumeArtifact = async (request = {}) => {
  validateSelection(request, true);
  if (!validId(request.handoffId) || typeof request.jobKey !== 'string'
    || !request.jobKey || request.jobKey.length > 8192
    || [...request.jobKey].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    throw fail('RESUME_HANDOFF_INVALID', 'The job handoff is missing or invalid. Start a new selection from the extension.');
  }
  try {
    const target = new URL(request.jobKey);
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw new Error('Invalid target');
  } catch {
    throw fail('RESUME_HANDOFF_INVALID', 'The job handoff target is invalid. Start a new selection from the extension.');
  }
  const guard = createAccountGuard(request.expectedUserId);
  try {
    const snapshot = await loadSelectedSnapshot(request, guard);
    const { buildTextPdf } = await import('./resumePdfDocument.js');
    await guard.assert();
    // Never fill omissions from today's profile or call the URL/upload helper.
    const { blob } = await buildTextPdf(snapshot);
    if (blob?.type !== 'application/pdf' || !Number.isSafeInteger(blob?.size) || blob.size < 5) {
      throw fail('RESUME_ARTIFACT_INVALID', 'The PDF could not be prepared. Download it and attach it manually.');
    }
    if (blob.size > MAX_RESUME_ARTIFACT_BYTES) {
      throw fail('RESUME_ARTIFACT_TOO_LARGE', 'This PDF exceeds the 1 MiB extension limit. Download it and attach it manually.');
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (bytes.length !== blob.size || String.fromCharCode(...bytes.subarray(0, 5)) !== '%PDF-') {
      throw fail('RESUME_ARTIFACT_INVALID', 'The PDF could not be prepared. Download it and attach it manually.');
    }
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 8192) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    }
    const base64 = btoa(binary);
    if (base64.length > MAX_RESUME_ARTIFACT_BASE64_LENGTH) {
      throw fail('RESUME_ARTIFACT_TOO_LARGE', 'This PDF exceeds the extension transport limit. Attach it manually.');
    }
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) => byte.toString(16).padStart(2, '0')).join('');
    // A save/deletion/account change while rendering requires a fresh selection.
    await loadSelectedSnapshot(request, guard);
    const title = typeof snapshot.title === 'string' && snapshot.title.trim() ? snapshot.title.trim().slice(0, 240) : 'Resume';
    const filenameTitle = title.normalize('NFKD').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 72) || 'Resume';
    const response = {
      status: 'ready', handoffId: request.handoffId, jobKey: request.jobKey, ownerId: request.expectedUserId,
      resume: { id: snapshot.id, revision: snapshot.revision, title },
      document: {
        artifactId: `sha256:${sha256}`, mimeType: 'application/pdf',
        filename: `${filenameTitle}_v${snapshot.revision}.pdf`,
        byteLength: bytes.length, sha256, base64, rendererVersion: RENDERER_VERSION,
      },
    };
    if (new TextEncoder().encode(JSON.stringify(response)).length > MAX_RESUME_ARTIFACT_RESPONSE_BYTES) {
      throw fail('RESUME_ARTIFACT_TOO_LARGE', 'This PDF exceeds the extension transport limit. Attach it manually.');
    }
    return response;
  } finally {
    guard.dispose();
  }
};
