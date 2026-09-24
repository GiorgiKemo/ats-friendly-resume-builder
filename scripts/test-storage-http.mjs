import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';
import { URL } from 'node:url';
import console from 'node:console';
import { createClient } from '@supabase/supabase-js';
import { localSupabaseEnvironment } from '../tests/local-supabase-environment.mjs';

const status = localSupabaseEnvironment();
const apiUrl = new URL(status.API_URL || '');
if (apiUrl.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(apiUrl.hostname)) {
  throw new Error('Refusing to run Storage HTTP fixtures against any non-loopback Supabase target.');
}
for (const key of ['ANON_KEY', 'SERVICE_ROLE_KEY']) {
  if (typeof status[key] !== 'string' || !status[key]) {
    throw new Error(`Local Supabase status is missing ${key}.`);
  }
}

const authOptions = { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } };
const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, authOptions);
const anonymous = createClient(status.API_URL, status.ANON_KEY, authOptions);
const runId = randomUUID();
const emailFor = (label) => `codex-storage-${label}-${runId}@example.test`;
const passwordFor = () => `LocalStorage-${randomUUID()}-QA!`;
const fileBytes = Buffer.from('%PDF-1.7\nSynthetic local Storage authorization fixture.\n');
const resumePaths = [];
const attachmentPaths = [];
const conversationIds = [];
const guestSessionIds = [];
const userIds = [];
let testError = null;
const supportOrigin = 'http://localhost:5176';
const fetchLocal = globalThis.fetch;
const observedDenialStatuses = {};

const requireSuccess = (result, action) => {
  if (result.error) throw new Error(`${action} failed: ${result.error.message}`);
  return result.data;
};

const createTestUser = async (label) => {
  const password = passwordFor();
  const created = requireSuccess(await service.auth.admin.createUser({
    email: emailFor(label),
    password,
    email_confirm: true,
  }), `Create synthetic ${label} user`);
  if (!created.user?.id) throw new Error('Supabase Auth did not return the synthetic user id.');
  userIds.push(created.user.id);
  const client = createClient(status.API_URL, status.ANON_KEY, authOptions);
  const signedIn = requireSuccess(await client.auth.signInWithPassword({
    email: emailFor(label),
    password,
  }), `Sign in synthetic ${label} user`);
  if (!signedIn.session?.access_token) throw new Error('Supabase Auth did not issue the synthetic user a session.');
  return { id: created.user.id, client, accessToken: signedIn.session.access_token };
};

const callSupport = async (body, { accessToken, guestToken } = {}) => {
  const headers = {
    apikey: status.ANON_KEY,
    'Content-Type': 'application/json',
    Origin: supportOrigin,
  };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (guestToken) headers['x-support-guest-token'] = guestToken;
  const response = await fetchLocal(`${status.API_URL}/functions/v1/support-api`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  return { status: response.status, payload };
};

const createConversation = async (customerUserId, subject) => {
  const conversation = requireSuccess(await service.from('support_conversations').insert({
    customer_user_id: customerUserId,
    subject,
  }).select('id').single(), 'Create synthetic support conversation');
  conversationIds.push(conversation.id);
  return conversation.id;
};

const prepareAttachment = async ({ conversationId, attachmentId, byteSize, accessToken, guestToken }) => {
  const result = await callSupport({
    action: 'attachmentPrepare',
    conversationId,
    attachmentId,
    originalName: 'local-storage-qa.pdf',
    declaredMime: 'application/pdf',
    byteSize,
  }, { accessToken, guestToken });
  return result;
};

try {
  const supportBucket = requireSuccess(await service.storage.getBucket('support-attachments'), 'Read local support bucket metadata');
  assert.equal(supportBucket.public, false, 'Support attachments must remain private');
  assert.equal(supportBucket.file_size_limit, 10485760, 'Support attachment size limit must remain 10 MiB');
  assert.deepEqual(supportBucket.allowed_mime_types, ['image/jpeg', 'image/png', 'application/pdf']);
  const resumesBucket = requireSuccess(await service.storage.getBucket('resumes'), 'Read local resume bucket metadata');
  assert.equal(resumesBucket.public, false, 'Resume files must remain private');

  const userA = await createTestUser('a');
  const userB = await createTestUser('b');
  const ownConversationId = await createConversation(userA.id, 'Synthetic authenticated attachment QA');
  const ownResumePath = `${userA.id}/${runId}.pdf`;
  const crossUserResumePath = `${userA.id}/${runId}-cross-user.pdf`;
  const supportPath = `${runId}/${randomUUID()}.pdf`;
  resumePaths.push(ownResumePath, crossUserResumePath);
  attachmentPaths.push(supportPath);

  requireSuccess(await userA.client.storage.from('resumes').upload(ownResumePath, fileBytes, {
    contentType: 'application/pdf',
    upsert: false,
  }), 'Upload own private resume');

  const ownDownload = requireSuccess(await userA.client.storage.from('resumes').download(ownResumePath), 'Download own private resume');
  assert.deepEqual(Buffer.from(await ownDownload.arrayBuffer()), fileBytes, 'Owner download must return the uploaded bytes');

  const otherUserDownload = await userB.client.storage.from('resumes').download(ownResumePath);
  assert.ok(otherUserDownload.error, 'Another authenticated user must not download the resume');
  assert.equal(otherUserDownload.data, null);

  const anonymousDownload = await anonymous.storage.from('resumes').download(ownResumePath);
  assert.ok(anonymousDownload.error, 'Anonymous clients must not download a private resume');
  assert.equal(anonymousDownload.data, null);

  const crossUserUpload = await userB.client.storage.from('resumes').upload(crossUserResumePath, fileBytes, {
    contentType: 'application/pdf',
    upsert: false,
  });
  assert.ok(crossUserUpload.error, 'A user must not upload into another user id folder');
  assert.equal(crossUserUpload.data, null);

  const directSupportUpload = await userA.client.storage.from('support-attachments').upload(supportPath, fileBytes, {
    contentType: 'application/pdf',
    upsert: false,
  });
  assert.ok(directSupportUpload.error, 'Support attachment writes must go through the authorized signed-upload flow');
  assert.equal(directSupportUpload.data, null);

  const validAttachmentId = randomUUID();
  const prepared = await prepareAttachment({
    conversationId: ownConversationId,
    attachmentId: validAttachmentId,
    byteSize: fileBytes.length,
    accessToken: userA.accessToken,
  });
  assert.equal(prepared.status, 200, `Authorized attachment prepare failed: ${JSON.stringify(prepared.payload)}`);
  assert.equal(prepared.payload?.data?.status, 'pending');
  assert.equal(prepared.payload?.data?.path, `${ownConversationId}/${validAttachmentId}`);
  assert.equal(typeof prepared.payload?.data?.token, 'string');
  assert.ok(prepared.payload.data.token.length > 0, 'Authorized prepare must issue a signed upload token');
  attachmentPaths.push(prepared.payload.data.path);

  const crossUserPrepare = await prepareAttachment({
    conversationId: ownConversationId,
    attachmentId: randomUUID(),
    byteSize: fileBytes.length,
    accessToken: userB.accessToken,
  });
  assert.equal(crossUserPrepare.status, 404, 'Another user must not prepare attachments for the conversation');
  assert.equal(crossUserPrepare.payload?.data, undefined);

  const wrongPathUpload = await userA.client.storage.from('support-attachments').uploadToSignedUrl(
    `${prepared.payload.data.path}-other`,
    prepared.payload.data.token,
    fileBytes,
    { contentType: 'application/pdf', upsert: false },
  );
  assert.ok(wrongPathUpload.error, 'A signed upload token must not authorize a different object path');

  requireSuccess(await userA.client.storage.from('support-attachments').uploadToSignedUrl(
    prepared.payload.data.path,
    prepared.payload.data.token,
    fileBytes,
    { contentType: 'application/pdf', upsert: false },
  ), 'Upload support attachment with the authorized signed token');

  const crossUserFinalize = await callSupport({ action: 'attachmentFinalize', attachmentId: validAttachmentId }, {
    accessToken: userB.accessToken,
  });
  observedDenialStatuses.crossUserFinalize = crossUserFinalize.status;
  assert.equal(crossUserFinalize.status, 404,
    `Another user must be denied finalization: ${JSON.stringify(crossUserFinalize.payload)}`);
  assert.equal(crossUserFinalize.payload?.data, undefined, 'A denied finalize must not reveal attachment metadata');
  assert.equal(crossUserFinalize.payload?.signedUrl, undefined, 'A denied finalize must not reveal an object URL');

  const finalized = await callSupport({ action: 'attachmentFinalize', attachmentId: validAttachmentId }, {
    accessToken: userA.accessToken,
  });
  assert.equal(finalized.status, 200, `Attachment finalize failed: ${JSON.stringify(finalized.payload)}`);
  assert.equal(finalized.payload?.data?.status, 'quarantined', 'Uploaded files must remain quarantined pending a scanner verdict');
  assert.equal(finalized.payload?.data?.scanCode, 'awaiting_scan');

  const quarantinedDownload = await callSupport({ action: 'attachmentDownload', attachmentId: validAttachmentId }, {
    accessToken: userA.accessToken,
  });
  assert.notEqual(quarantinedDownload.status, 200, 'Quarantined files must not receive a download URL');
  assert.equal(quarantinedDownload.payload?.data?.signedUrl, undefined);

  const directOwnerRead = await userA.client.storage.from('support-attachments').download(prepared.payload.data.path);
  assert.ok(directOwnerRead.error, 'Even the uploader must not directly read quarantined support objects');
  const directAnonymousRead = await anonymous.storage.from('support-attachments').download(prepared.payload.data.path);
  assert.ok(directAnonymousRead.error, 'Anonymous clients must not read support objects');

  const mismatchedSizeAttachmentId = randomUUID();
  const mismatchedSizePrepare = await prepareAttachment({
    conversationId: ownConversationId,
    attachmentId: mismatchedSizeAttachmentId,
    byteSize: fileBytes.length + 1,
    accessToken: userA.accessToken,
  });
  assert.equal(mismatchedSizePrepare.status, 200, `Mismatch fixture prepare failed: ${JSON.stringify(mismatchedSizePrepare.payload)}`);
  attachmentPaths.push(mismatchedSizePrepare.payload.data.path);
  requireSuccess(await userA.client.storage.from('support-attachments').uploadToSignedUrl(
    mismatchedSizePrepare.payload.data.path,
    mismatchedSizePrepare.payload.data.token,
    fileBytes,
    { contentType: 'application/pdf', upsert: false },
  ), 'Upload size-mismatch attachment fixture');
  const mismatchedSizeFinalize = await callSupport({ action: 'attachmentFinalize', attachmentId: mismatchedSizeAttachmentId }, {
    accessToken: userA.accessToken,
  });
  assert.equal(mismatchedSizeFinalize.status, 200, `Size-mismatch finalize failed: ${JSON.stringify(mismatchedSizeFinalize.payload)}`);
  assert.equal(mismatchedSizeFinalize.payload?.data?.status, 'blocked', 'Declared/actual size mismatch must fail closed');
  assert.equal(mismatchedSizeFinalize.payload?.data?.scanCode, 'metadata_mismatch');

  const oversizedPrepare = await prepareAttachment({
    conversationId: ownConversationId,
    attachmentId: randomUUID(),
    byteSize: 10 * 1024 * 1024 + 1,
    accessToken: userA.accessToken,
  });
  observedDenialStatuses.oversizedPrepare = oversizedPrepare.status;
  assert.equal(oversizedPrepare.status, 422,
    `The support API must reject an oversized attachment before issuing a token: ${JSON.stringify(oversizedPrepare.payload)}`);
  assert.equal(oversizedPrepare.payload?.data?.token, undefined, 'An oversized attachment must not receive an upload token');

  const guestToken = `${randomUUID()}${randomUUID()}`;
  const guestSession = requireSuccess(await service.from('support_guest_sessions').insert({
    token_hash: createHash('sha256').update(guestToken).digest('hex'),
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  }).select('id').single(), 'Create synthetic guest support session');
  guestSessionIds.push(guestSession.id);
  const guestConversation = requireSuccess(await service.from('support_conversations').insert({
    guest_session_id: guestSession.id,
    subject: 'Synthetic guest attachment QA',
  }).select('id').single(), 'Create synthetic guest support conversation');
  conversationIds.push(guestConversation.id);
  requireSuccess(await service.from('support_guest_sessions').update({ conversation_id: guestConversation.id }).eq('id', guestSession.id), 'Link synthetic guest conversation');

  const guestAttachmentId = randomUUID();
  const guestPrepared = await prepareAttachment({
    conversationId: guestConversation.id,
    attachmentId: guestAttachmentId,
    byteSize: fileBytes.length,
    guestToken,
  });
  assert.equal(guestPrepared.status, 200, `Guest attachment prepare failed: ${JSON.stringify(guestPrepared.payload)}`);
  assert.equal(guestPrepared.payload?.data?.status, 'pending');
  attachmentPaths.push(guestPrepared.payload.data.path);
  requireSuccess(await anonymous.storage.from('support-attachments').uploadToSignedUrl(
    guestPrepared.payload.data.path,
    guestPrepared.payload.data.token,
    fileBytes,
    { contentType: 'application/pdf', upsert: false },
  ), 'Upload guest support attachment with its signed token');
  const guestFinalized = await callSupport({ action: 'attachmentFinalize', attachmentId: guestAttachmentId }, { guestToken });
  assert.equal(guestFinalized.status, 200, `Guest attachment finalize failed: ${JSON.stringify(guestFinalized.payload)}`);
  assert.equal(guestFinalized.payload?.data?.status, 'quarantined');
  const wrongGuestFinalize = await callSupport({ action: 'attachmentFinalize', attachmentId: guestAttachmentId }, {
    guestToken: `${randomUUID()}${randomUUID()}`,
  });
  observedDenialStatuses.wrongGuestFinalize = wrongGuestFinalize.status;
  assert.equal(wrongGuestFinalize.status, 401,
    `A different guest session must be denied finalization: ${JSON.stringify(wrongGuestFinalize.payload)}`);
  assert.equal(wrongGuestFinalize.payload?.data, undefined, 'A denied guest finalize must not reveal attachment metadata');
  assert.equal(wrongGuestFinalize.payload?.signedUrl, undefined, 'A denied guest finalize must not reveal an object URL');
} catch (error) {
  testError = error;
}

const cleanupErrors = [];
if (resumePaths.length) {
  const { error } = await service.storage.from('resumes').remove(resumePaths);
  if (error) cleanupErrors.push('resume fixture objects');
}
if (attachmentPaths.length) {
  const { error } = await service.storage.from('support-attachments').remove(attachmentPaths);
  if (error) cleanupErrors.push('support attachment fixture objects');
}
for (const conversationId of [...conversationIds].reverse()) {
  const { error } = await service.from('support_conversations').delete().eq('id', conversationId);
  if (error) cleanupErrors.push('synthetic support conversations');
}
for (const guestSessionId of [...guestSessionIds].reverse()) {
  const { error } = await service.from('support_guest_sessions').delete().eq('id', guestSessionId);
  if (error) cleanupErrors.push('synthetic guest support sessions');
}
for (const userId of [...userIds].reverse()) {
  const { error } = await service.auth.admin.deleteUser(userId);
  if (error) cleanupErrors.push('synthetic Auth users');
}

if (testError && cleanupErrors.length) {
  throw new AggregateError([testError, new Error(`Cleanup failed for ${[...new Set(cleanupErrors)].join(', ')}.`)], 'Storage HTTP QA failed and cleanup needs attention.');
}
if (testError) throw testError;
if (cleanupErrors.length) throw new Error(`Storage HTTP QA passed, but cleanup failed for ${[...new Set(cleanupErrors)].join(', ')}.`);

console.log(`PASS local Storage/support HTTP: private bucket metadata, owner resume access, signed support uploads, path scoping, customer/guest ownership, quarantine/metadata-mismatch denial, anonymous and direct-object denial, synthetic-data cleanup; denial HTTP statuses ${JSON.stringify(observedDenialStatuses)}`);
