import { buildTextPdfCore } from '../_shared/resume/pdfCore.js';
import { buildResumeTextLines } from '../_shared/resume/exportText.js';
import { assertCommittedResume } from '../_shared/resume/committedResume.js';

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(
  value && typeof value === 'object' && !Array.isArray(value),
);

const attachmentError = (code: string, message: string) => Object.assign(new Error(message), { code });
const MAX_RESUME_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const freezeDeep = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
};

const getPublicKey = () => Deno.env.get('SB_PUBLISHABLE_KEY') ||
  Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ||
  Deno.env.get('SUPABASE_ANON_KEY') ||
  Deno.env.get('ANON_KEY') || '';

const assertBearer = (authorization: string) => {
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    throw attachmentError('RESUME_AUTHORIZATION_REQUIRED', 'A verified resume authorization is required.');
  }
};

const validateSnapshot = (data: unknown, resumeId: string, userId: string) => {
  const rows = Array.isArray(data) ? data : [];
  if (rows.length !== 1 || !isRecord(rows[0])) {
    throw attachmentError('RESUME_SNAPSHOT_UNAVAILABLE', 'The selected resume could not be loaded for this account.');
  }
  const snapshot = rows[0];
  if (snapshot.id !== resumeId || snapshot.user_id !== userId) {
    throw attachmentError('RESUME_SNAPSHOT_OWNER_MISMATCH', 'The selected resume no longer belongs to this account.');
  }
  if (!Number.isInteger(snapshot.revision) || Number(snapshot.revision) < 1) {
    throw attachmentError('RESUME_SNAPSHOT_INVALID', 'The selected resume has no valid saved revision.');
  }
  if (typeof snapshot.updated_at !== 'string' || Number.isNaN(Date.parse(snapshot.updated_at))) {
    throw attachmentError('RESUME_SNAPSHOT_INVALID', 'The selected resume has no valid saved timestamp.');
  }
  const contentFields = ['personal_info', 'work_experience', 'education', 'skills', 'certifications', 'projects', 'additional_sections'];
  if (contentFields.some((field) => !Object.hasOwn(snapshot, field))) {
    throw attachmentError('RESUME_SNAPSHOT_INVALID', 'The selected resume content is incomplete.');
  }
  assertCommittedResume(snapshot);
  // RPC rows are JSON data; clone before freezing so the caller cannot mutate
  // the exact snapshot that feeds both text and PDF preparation.
  return freezeDeep(JSON.parse(JSON.stringify(snapshot)));
};

export const loadOwnedResumeSnapshot = async ({
  createClient,
  supabaseUrl,
  publicKey,
  authorization,
  resumeId,
  userId,
}: {
  createClient: (url: string, key: string, options: Record<string, unknown>) => { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error?: unknown }> };
  supabaseUrl: string;
  publicKey: string;
  authorization: string;
  resumeId: string;
  userId: string;
}) => {
  assertBearer(authorization);
  if (!supabaseUrl || !publicKey || !resumeId || !userId) {
    throw attachmentError('RESUME_SNAPSHOT_UNAVAILABLE', 'A saved resume and authenticated account are required.');
  }
  const reader = createClient(supabaseUrl, publicKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await reader.rpc('get_resume_versioned', { p_resume_id: resumeId });
  if (error) throw attachmentError('RESUME_SNAPSHOT_UNAVAILABLE', 'The selected resume could not be loaded.');
  return validateSnapshot(data, resumeId, userId);
};

const toBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  }
  return btoa(binary);
};

let fontDataPromise: Promise<string> | undefined;

// The Edge function packages this asset next to the handler. Keep the read
// lazy so discovery-only runs that do not send outreach never touch a PDF
// asset, while every attachment uses the exact same pinned font bytes.
export const loadResumeFontData = () => {
  if (!fontDataPromise) {
    fontDataPromise = Deno.readFile(new URL('./assets/DejaVuSans.ttf', import.meta.url))
      .then(toBase64)
      .catch((error) => {
        fontDataPromise = undefined;
        throw error;
      });
  }
  return fontDataPromise;
};

const cleanFilename = (value: string) => (value || 'Resume')
  .replace(/[^\p{L}\p{N}._-]+/gu, '_')
  .replace(/^_+|_+$/g, '') || 'Resume';

export const createResumeAttachmentPackage = async ({
  snapshot,
  fontData,
  renderer = buildTextPdfCore,
  filename,
}: {
  snapshot: Record<string, unknown>;
  fontData: string;
  renderer?: (resume: Record<string, unknown>, fontData: string) => Promise<{ blob: Blob }>;
  filename?: string;
}) => {
  assertCommittedResume(snapshot);
  const lines = buildResumeTextLines(snapshot);
  let rendered: { blob: Blob };
  try {
    rendered = await renderer(snapshot, fontData);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) throw error;
    throw attachmentError('RESUME_ATTACHMENT_UNAVAILABLE', 'The saved resume could not be rendered safely.');
  }
  if (!rendered?.blob || typeof rendered.blob.arrayBuffer !== 'function') {
    throw attachmentError('RESUME_ATTACHMENT_UNAVAILABLE', 'The saved resume renderer returned no PDF.');
  }
  const bytes = new Uint8Array(await rendered.blob.arrayBuffer());
  if (!bytes.length) throw attachmentError('RESUME_ATTACHMENT_UNAVAILABLE', 'The saved resume renderer returned an empty PDF.');
  if (bytes.byteLength > MAX_RESUME_ATTACHMENT_BYTES) {
    throw attachmentError('RESUME_ATTACHMENT_TOO_LARGE', 'The saved resume PDF is too large to attach safely. Download it locally instead.');
  }
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') {
    throw attachmentError('RESUME_ATTACHMENT_UNAVAILABLE', 'The saved resume renderer returned an invalid PDF.');
  }
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const sha256 = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return freezeDeep({
    resumeId: snapshot.id,
    userId: snapshot.user_id,
    revision: snapshot.revision,
    updatedAt: snapshot.updated_at || null,
    resumeText: lines.join('\n'),
    attachmentBase64: toBase64(bytes),
    attachmentFilename: `${cleanFilename(filename || String((snapshot.personal_info as Record<string, unknown> | undefined)?.fullName || (snapshot.personal_info as Record<string, unknown> | undefined)?.full_name || 'Resume'))}_Resume.pdf`,
    byteLength: bytes.byteLength,
    sha256,
  });
};

export const assertResumePackageCurrent = (
  packageData: Record<string, unknown>,
  snapshot: Record<string, unknown>,
) => {
  if (!isRecord(packageData) || packageData.resumeId !== snapshot.id
    || packageData.userId !== snapshot.user_id || packageData.revision !== snapshot.revision) {
    throw attachmentError('RESUME_SNAPSHOT_CHANGED', 'The saved resume changed before sending. Choose its current version again.');
  }
};

export { getPublicKey, validateSnapshot };
