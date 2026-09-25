import { serve } from 'std/http/server.ts';
import { createClient } from 'supabase';
import { getCorsHeaders, isOriginAllowed } from '../_shared/cors.ts';
import { readBoundedBodyText } from '../_shared/boundedBody.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('API_URL') || '';
const anonKey = Deno.env.get('SB_PUBLISHABLE_KEY') ||
  Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ||
  Deno.env.get('SUPABASE_ANON_KEY') ||
  Deno.env.get('ANON_KEY') || '';
const serviceRoleKey = Deno.env.get('SB_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  Deno.env.get('SERVICE_ROLE_KEY') || '';
const supportAttachmentBucket = 'support-attachments';
const serviceClient = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

const jsonResponse = (body: Record<string, unknown>, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...getCorsHeaders(origin) },
  });

const actionNames = new Set([
  'start',
  'routing',
  'send',
  'handoff',
  'take',
  'resolve',
  'reopen',
  'triage',
  'feedback',
  'feedbackList',
  'feedbackTags',
  'improvementList',
  'improvementCreate',
  'improvementUpdate',
  'knowledgeList',
  'knowledgeDraft',
  'knowledgePublish',
  'knowledgeRollback',
  'send',
  'read',
  'markRead',
  'queue',
  'presence',
  'note',
  'legacyInquiries',
  'linkLegacyInquiry',
  'emailPreferenceGet',
  'emailPreferenceSet',
  'attachmentPrepare',
  'attachmentFinalize',
  'attachmentDownload',
]);

const SUPPORT_AAL2_ACTIONS = new Set([
  'take',
  'resolve',
  'reopen',
  'triage',
  'feedbackList',
  'feedbackTags',
  'improvementList',
  'improvementCreate',
  'improvementUpdate',
  'knowledgeList',
  'knowledgeDraft',
  'knowledgePublish',
  'knowledgeRollback',
  'send',
  'read',
  'markRead',
  'queue',
  'presence',
  'note',
  'legacyInquiries',
  'linkLegacyInquiry',
]);

const LEGACY_INQUIRY_ACTIONS = new Set(['legacyInquiries', 'linkLegacyInquiry']);
const EMAIL_PREFERENCE_ACTIONS = new Set(['emailPreferenceGet', 'emailPreferenceSet']);

const rateBuckets = new Map<string, { windowStartedAt: number; count: number }>();
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 30;

const stringValue = (value: unknown, maxLength: number) => (
  typeof value === 'string' && value.trim().length <= maxLength ? value.trim() : ''
);

const uuidValue = (value: unknown) => (
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : ''
);

const tokenClaimsFromToken = (token: string) => {
  try {
    const encoded = token.split('.')[1];
    if (!encoded) return null;
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(encoded.length / 4) * 4, '=');
    return JSON.parse(atob(normalized)) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const sessionIdFromToken = (token: string) => uuidValue(tokenClaimsFromToken(token)?.session_id);
const aalFromToken = (token: string) => tokenClaimsFromToken(token)?.aal === 'aal2' ? 'aal2' : 'aal1';

const attachmentIdValues = (value: unknown) => {
  if (value === undefined) return [] as string[];
  if (!Array.isArray(value) || value.length > 3) throw new Error('Invalid attachment request');
  const ids = value.map(uuidValue);
  if (ids.some((id) => !id)) throw new Error('Invalid attachment request');
  return ids;
};

const attachmentInputs = (body: Record<string, unknown>) => {
  const conversationId = uuidValue(body.conversationId);
  const attachmentId = uuidValue(body.attachmentId) || crypto.randomUUID();
  const originalName = stringValue(body.originalName, 255);
  const declaredMime = stringValue(body.declaredMime, 80);
  const byteSize = typeof body.byteSize === 'number' && Number.isSafeInteger(body.byteSize) ? body.byteSize : 0;
  if (!conversationId || !attachmentId || !originalName || !['image/jpeg', 'image/png', 'application/pdf'].includes(declaredMime) || byteSize < 1 || byteSize > 10 * 1024 * 1024) {
    throw new Error('Invalid attachment request');
  }
  return {
    conversationId,
    attachmentId,
    storagePath: `${conversationId}/${attachmentId}`,
    originalName,
    declaredMime,
    byteSize,
    uploadExpiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  };
};

const nonNegativeInteger = (value: unknown, fallback: number) => (
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : fallback
);

const getBearer = (req: Request) => {
  const authorization = req.headers.get('Authorization');
  return authorization?.startsWith('Bearer ') ? authorization : '';
};

const getGuestToken = (req: Request) => {
  const token = req.headers.get('x-support-guest-token') || '';
  return token.length >= 32 && token.length <= 256 ? token : '';
};

const hashGuestToken = async (token: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const createGuestToken = () => `${crypto.randomUUID()}${crypto.randomUUID()}`;

const getUser = async (req: Request) => {
  const authorization = getBearer(req);
  if (!authorization || !supabaseUrl || !anonKey) return null;
  const token = authorization.slice('Bearer '.length);
  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const { data, error } = await authClient.auth.getUser(token);
  return error || !data.user ? null : {
    ...data.user,
    sessionId: sessionIdFromToken(token),
    aal: aalFromToken(token),
  };
};

const rpcForAction = (action: string, body: Record<string, unknown>) => {
  switch (action) {
    case 'start':
      return ['support_start_conversation', {
        p_subject: stringValue(body.subject, 200),
        p_body: stringValue(body.body, 8000),
        p_client_request_id: stringValue(body.clientRequestId, 200),
      }] as const;
    case 'send':
      {
        const attachmentIds = attachmentIdValues(body.attachmentIds);
        return [attachmentIds.length ? 'support_send_message_with_attachments' : 'support_send_message', {
          p_conversation_id: uuidValue(body.conversationId),
          p_body: stringValue(body.body, 8000),
          p_client_message_id: stringValue(body.clientMessageId, 200),
          p_reply_to_message_id: uuidValue(body.replyToMessageId) || null,
          ...(attachmentIds.length ? { p_attachment_ids: attachmentIds } : {}),
        }] as const;
      }
    case 'handoff':
      return ['support_request_handoff', {
        p_conversation_id: uuidValue(body.conversationId),
        p_client_request_id: stringValue(body.clientRequestId, 200),
        p_reason: stringValue(body.reason, 500) || null,
      }] as const;
    case 'take':
      return ['support_take_conversation', {
        p_conversation_id: uuidValue(body.conversationId),
        p_client_request_id: stringValue(body.clientRequestId, 200),
      }] as const;
    case 'resolve':
      return ['support_resolve_conversation', {
        p_conversation_id: uuidValue(body.conversationId),
        p_client_request_id: stringValue(body.clientRequestId, 200),
        p_reason: stringValue(body.reason, 500) || null,
      }] as const;
    case 'reopen':
      return ['support_reopen_conversation', {
        p_conversation_id: uuidValue(body.conversationId),
        p_client_request_id: stringValue(body.clientRequestId, 200),
      }] as const;
    case 'triage': {
      const tags = Array.isArray(body.tags) ? body.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 20) : [];
      return ['support_triage_conversation', {
        p_conversation_id: uuidValue(body.conversationId),
        p_expected_revision: nonNegativeInteger(body.expectedRevision, -1),
        p_priority: stringValue(body.priority, 20) || 'normal',
        p_tags: tags,
      }] as const;
    }
    case 'feedback':
      return ['support_submit_feedback', {
        p_conversation_id: uuidValue(body.conversationId),
        p_rating: typeof body.rating === 'number' && Number.isSafeInteger(body.rating) ? body.rating : 0,
        p_category: stringValue(body.category, 30) || 'support',
        p_comment: stringValue(body.comment, 2000) || null,
        p_client_request_id: stringValue(body.clientRequestId, 200),
      }] as const;
    case 'feedbackList':
      return ['support_list_feedback', {
        p_limit: typeof body.limit === 'number' && Number.isSafeInteger(body.limit) ? body.limit : 50,
        p_before: typeof body.before === 'string' ? body.before : null,
      }] as const;
    case 'feedbackTags': {
      const tags = Array.isArray(body.tags) ? body.tags.filter((tag): tag is string => typeof tag === 'string').slice(0, 8) : [];
      return ['support_update_feedback_tags', {
        p_feedback_id: uuidValue(body.feedbackId),
        p_tags: tags,
        p_client_request_id: stringValue(body.clientRequestId, 200),
      }] as const;
    }
    case 'improvementList':
      return ['support_list_improvement_items', {
        p_status: stringValue(body.status, 30) || 'all',
        p_limit: typeof body.limit === 'number' && Number.isSafeInteger(body.limit) ? body.limit : 50,
      }] as const;
    case 'improvementCreate':
      return ['support_create_improvement_item', {
        p_title: stringValue(body.title, 160),
        p_sanitized_summary: stringValue(body.sanitizedSummary, 2000),
        p_category: stringValue(body.category, 30) || 'other',
        p_impact: stringValue(body.impact, 20) || 'unknown',
        p_priority: stringValue(body.priority, 20) || 'normal',
        p_source_feedback_id: uuidValue(body.sourceFeedbackId) || null,
        p_client_request_id: stringValue(body.clientRequestId, 200),
      }] as const;
    case 'improvementUpdate':
      return ['support_update_improvement_item', {
        p_improvement_id: uuidValue(body.improvementId),
        p_status: stringValue(body.status, 30),
        p_priority: stringValue(body.priority, 20),
        p_owner_user_id: uuidValue(body.ownerUserId) || null,
        p_outcome: stringValue(body.outcome, 2000) || null,
        p_client_request_id: stringValue(body.clientRequestId, 200),
      }] as const;
    case 'knowledgeList':
      return ['support_list_knowledge', {
        p_locale: stringValue(body.locale, 10) || null,
        p_status: stringValue(body.status, 20) || 'all',
        p_limit: typeof body.limit === 'number' && Number.isSafeInteger(body.limit) ? body.limit : 50,
      }] as const;
    case 'knowledgeDraft':
      return ['support_create_knowledge_draft', {
        p_slug: stringValue(body.slug, 120),
        p_locale: stringValue(body.locale, 10) || 'en',
        p_title: stringValue(body.title, 200),
        p_body: stringValue(body.body, 20000),
        p_source_ref: stringValue(body.sourceRef, 500),
        p_client_request_id: stringValue(body.clientRequestId, 200),
      }] as const;
    case 'knowledgePublish':
      return ['support_publish_knowledge', {
        p_article_id: uuidValue(body.articleId),
        p_version_id: uuidValue(body.versionId),
        p_client_request_id: stringValue(body.clientRequestId, 200),
      }] as const;
    case 'knowledgeRollback':
      return ['support_rollback_knowledge', {
        p_article_id: uuidValue(body.articleId),
        p_version_id: uuidValue(body.versionId),
        p_client_request_id: stringValue(body.clientRequestId, 200),
      }] as const;
    case 'read':
      return ['support_read_conversation', {
        p_conversation_id: uuidValue(body.conversationId),
        p_after_sequence: nonNegativeInteger(body.afterSequence, 0),
        p_limit: typeof body.limit === 'number' && Number.isSafeInteger(body.limit) ? body.limit : 100,
      }] as const;
    case 'markRead':
      return ['support_mark_read', {
        p_conversation_id: uuidValue(body.conversationId),
        p_last_read_sequence: nonNegativeInteger(body.lastReadSequence, -1),
      }] as const;
    case 'queue':
      return ['support_list_queue', {
        p_status: stringValue(body.status, 30) || 'open',
        p_limit: typeof body.limit === 'number' && Number.isSafeInteger(body.limit) ? body.limit : 50,
        p_before: typeof body.before === 'string' ? body.before : null,
        p_search: stringValue(body.search, 120) || null,
      }] as const;
    case 'presence':
      return [body.list === true ? 'support_list_presence' : 'support_set_presence', body.list === true ? {} : {
        p_status: stringValue(body.status, 20) || 'available',
        p_ttl_seconds: typeof body.ttlSeconds === 'number' && Number.isSafeInteger(body.ttlSeconds) ? body.ttlSeconds : 90,
      }] as const;
    case 'note':
      return ['support_add_internal_note', {
        p_conversation_id: uuidValue(body.conversationId),
        p_body: stringValue(body.body, 8000),
        p_client_note_id: stringValue(body.clientNoteId, 200),
      }] as const;
    case 'attachmentPrepare': {
      const input = attachmentInputs(body);
      return ['support_prepare_attachment', {
        p_conversation_id: input.conversationId,
        p_attachment_id: input.attachmentId,
        p_storage_path: input.storagePath,
        p_original_name: input.originalName,
        p_declared_mime: input.declaredMime,
        p_byte_size: input.byteSize,
        p_upload_expires_at: input.uploadExpiresAt,
      }] as const;
    }
    default:
      return null;
  }
};

const guestRpcForAction = (action: string, body: Record<string, unknown>, tokenHash: string) => {
  switch (action) {
    case 'start':
      return ['support_start_guest_conversation', {
        p_subject: stringValue(body.subject, 200),
        p_body: stringValue(body.body, 8000),
        p_client_request_id: stringValue(body.clientRequestId, 200),
        p_token_hash: tokenHash,
        p_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }] as const;
    case 'send':
      {
        const attachmentIds = attachmentIdValues(body.attachmentIds);
        return [attachmentIds.length ? 'support_guest_send_message_with_attachments' : 'support_guest_send_message', {
          p_conversation_id: uuidValue(body.conversationId),
          p_body: stringValue(body.body, 8000),
          p_client_message_id: stringValue(body.clientMessageId, 200),
          p_token_hash: tokenHash,
          p_reply_to_message_id: uuidValue(body.replyToMessageId) || null,
          ...(attachmentIds.length ? { p_attachment_ids: attachmentIds } : {}),
        }] as const;
      }
    case 'handoff':
      return ['support_guest_request_handoff', {
        p_conversation_id: uuidValue(body.conversationId),
        p_client_request_id: stringValue(body.clientRequestId, 200),
        p_token_hash: tokenHash,
        p_reason: stringValue(body.reason, 500) || null,
      }] as const;
    case 'feedback':
      return ['support_submit_guest_feedback', {
        p_conversation_id: uuidValue(body.conversationId),
        p_rating: typeof body.rating === 'number' && Number.isSafeInteger(body.rating) ? body.rating : 0,
        p_category: stringValue(body.category, 30) || 'support',
        p_comment: stringValue(body.comment, 2000) || null,
        p_client_request_id: stringValue(body.clientRequestId, 200),
        p_token_hash: tokenHash,
      }] as const;
    case 'read':
      return ['support_guest_read_conversation', {
        p_conversation_id: uuidValue(body.conversationId),
        p_after_sequence: nonNegativeInteger(body.afterSequence, 0),
        p_limit: typeof body.limit === 'number' && Number.isSafeInteger(body.limit) ? body.limit : 100,
        p_token_hash: tokenHash,
      }] as const;
    case 'attachmentPrepare': {
      const input = attachmentInputs(body);
      return ['support_prepare_guest_attachment', {
        p_conversation_id: input.conversationId,
        p_attachment_id: input.attachmentId,
        p_storage_path: input.storagePath,
        p_original_name: input.originalName,
        p_declared_mime: input.declaredMime,
        p_byte_size: input.byteSize,
        p_upload_expires_at: input.uploadExpiresAt,
        p_token_hash: tokenHash,
      }] as const;
    }
    default:
      return null;
  }
};

const isActiveAuthSession = async (userId: string, sessionId: string) => {
  if (!uuidValue(sessionId)) return false;
  const { data, error } = await serviceClient.rpc('admin_auth_session_is_active', {
    p_user_id: userId,
    p_session_id: sessionId,
  });
  return !error && data === true;
};

const hasSupportMembership = async (userId: string) => {
  const { data, error } = await serviceClient
    .from('admin_members')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .in('role', ['owner', 'admin', 'support'])
    .maybeSingle();
  return !error && Boolean(data);
};

const isSupportOperator = async (userId: string, aal: string) => aal === 'aal2' && await hasSupportMembership(userId);

const getVerifiedConversationEmail = async (conversationId: string) => {
  const { data: conversation, error: conversationError } = await serviceClient
    .from('support_conversations')
    .select('id,customer_user_id')
    .eq('id', conversationId)
    .maybeSingle();
  if (conversationError) throw new Error('Legacy inquiry lookup failed');
  if (!conversation?.customer_user_id) return '';

  const { data: authResult, error: authError } = await serviceClient.auth.admin.getUserById(conversation.customer_user_id);
  const authUser = authResult?.user;
  if (authError || !authUser?.email || !authUser.email_confirmed_at) return '';
  return `${authUser.email}`.trim().toLowerCase();
};

const serializeLegacyInquiry = (inquiry: Record<string, unknown>, link: Record<string, unknown> | null, conversationId: string) => ({
  id: inquiry.id,
  name: inquiry.name,
  email: inquiry.email,
  subject: inquiry.subject,
  message: inquiry.message,
  source: inquiry.source,
  status: inquiry.status,
  sourceCreatedAt: inquiry.created_at,
  linkedAt: link?.linked_at || null,
  linkedBy: link?.linked_by || null,
  linkedToCurrentConversation: link?.conversation_id === conversationId,
});

const listLegacyInquiries = async (conversationId: string) => {
  const email = await getVerifiedConversationEmail(conversationId);
  if (!email) return { items: [] };

  const { data: inquiries, error: inquiryError } = await serviceClient
    .from('contact_inquiries')
    .select('id,name,email,subject,message,source,status,created_at')
    .eq('email_normalized', email)
    .order('created_at', { ascending: false })
    .limit(100);
  if (inquiryError) throw new Error('Legacy inquiry lookup failed');
  if (!Array.isArray(inquiries) || inquiries.length === 0) return { items: [] };

  const { data: links, error: linksError } = await serviceClient
    .from('support_legacy_inquiry_links')
    .select('contact_inquiry_id,conversation_id,linked_by,linked_at')
    .in('contact_inquiry_id', inquiries.map((inquiry) => inquiry.id));
  if (linksError) throw new Error('Legacy inquiry lookup failed');
  const linkByInquiryId = new Map((Array.isArray(links) ? links : []).map((link) => [link.contact_inquiry_id, link]));
  return {
    items: inquiries
      .filter((inquiry) => {
        const link = linkByInquiryId.get(inquiry.id);
        return !link || link.conversation_id === conversationId;
      })
      .map((inquiry) => serializeLegacyInquiry(inquiry, linkByInquiryId.get(inquiry.id) || null, conversationId)),
  };
};

const linkLegacyInquiry = async (conversationId: string, inquiryId: string, userId: string) => {
  const email = await getVerifiedConversationEmail(conversationId);
  if (!email) return { status: 404, body: { error: 'No eligible historical inquiry is available for this conversation.' } };

  const { data: inquiry, error: inquiryError } = await serviceClient
    .from('contact_inquiries')
    .select('id,name,email,subject,message,source,status,created_at')
    .eq('id', inquiryId)
    .eq('email_normalized', email)
    .maybeSingle();
  if (inquiryError) throw new Error('Legacy inquiry lookup failed');
  if (!inquiry) return { status: 404, body: { error: 'No eligible historical inquiry is available for this conversation.' } };

  const { data: inserted, error: insertError } = await serviceClient
    .from('support_legacy_inquiry_links')
    .insert({ contact_inquiry_id: inquiryId, conversation_id: conversationId, linked_by: userId })
    .select('contact_inquiry_id,conversation_id,linked_by,linked_at')
    .maybeSingle();
  let link = inserted;
  let alreadyLinked = false;
  if (insertError?.code === '23505') {
    const { data: existing, error: existingError } = await serviceClient
      .from('support_legacy_inquiry_links')
      .select('contact_inquiry_id,conversation_id,linked_by,linked_at')
      .eq('contact_inquiry_id', inquiryId)
      .maybeSingle();
    if (existingError) throw new Error('Legacy inquiry lookup failed');
    if (existing?.conversation_id !== conversationId) {
      return { status: 409, body: { error: 'This historical inquiry is already linked.' } };
    }
    link = existing;
    alreadyLinked = true;
  } else if (insertError || !inserted) {
    throw new Error('Legacy inquiry link failed');
  }

  return {
    status: 200,
    body: {
      ok: true,
      data: {
        item: serializeLegacyInquiry(inquiry, link, conversationId),
        alreadyLinked,
      },
    },
  };
};

const findAttachmentForFinalize = async (attachmentId: string, user: { id: string; sessionId: string; aal: string } | null, guestToken: string) => {
  const { data: attachment, error } = await serviceClient
    .from('support_attachments')
    .select('id,conversation_id,uploader_user_id,guest_session_id,storage_path,status')
    .eq('id', attachmentId)
    .maybeSingle();
  if (error || !attachment) throw new Error('Attachment not found');

  if (user) {
    if (!await isActiveAuthSession(user.id, user.sessionId)) throw new Error('Support session required');
    const allowed = attachment.uploader_user_id === user.id || await isSupportOperator(user.id, user.aal);
    if (!allowed) throw new Error('Attachment access required');
  } else {
    if (!guestToken) throw new Error('Support session required');
    const tokenHash = await hashGuestToken(guestToken);
    const { data: session, error: sessionError } = await serviceClient
      .from('support_guest_sessions')
      .select('id')
      .eq('id', attachment.guest_session_id)
      .eq('token_hash', tokenHash)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (sessionError || !session) throw new Error('Support session required');
  }
  return attachment;
};

const finalizeAttachment = async (attachmentId: string, user: { id: string; sessionId: string; aal: string } | null, guestToken: string) => {
  const attachment = await findAttachmentForFinalize(attachmentId, user, guestToken);
  const parts = String(attachment.storage_path).split('/');
  const directory = parts[0];
  const fileName = parts[1];
  const { data: objects, error: listError } = await serviceClient.storage
    .from(supportAttachmentBucket)
    .list(directory, { limit: 10, search: fileName });
  if (listError) throw new Error('Attachment upload could not be verified');
  const object = (objects || []).find((item) => item.name === fileName);
  if (!object) throw new Error('Attachment upload is not complete');
  const metadata = (object.metadata || {}) as Record<string, unknown>;
  const actualSize = Number(metadata.size || metadata.sizeBytes);
  const actualMime = typeof metadata.mimetype === 'string' ? metadata.mimetype : (typeof metadata.contentType === 'string' ? metadata.contentType : null);
  const { data, error } = await serviceClient.rpc('support_finalize_attachment', {
    p_attachment_id: attachment.id,
    p_actual_size: Number.isSafeInteger(actualSize) ? actualSize : null,
    p_actual_mime: actualMime,
  });
  if (error) throw new Error('Attachment could not be finalized');
  return data;
};

const downloadAttachment = async (attachmentId: string, user: { id: string; sessionId: string; aal: string } | null, guestToken: string) => {
  const attachment = await findAttachmentForFinalize(attachmentId, user, guestToken);
  if (attachment.status !== 'clean') throw new Error('Attachment is awaiting safety review');
  const { data, error } = await serviceClient.storage
    .from(supportAttachmentBucket)
    .createSignedUrl(attachment.storage_path, 300, { download: attachment.original_name });
  if (error || !data?.signedUrl) throw new Error('Attachment download is temporarily unavailable');
  return { attachmentId: attachment.id, signedUrl: data.signedUrl, expiresInSeconds: 300 };
};

const enrichSupportRead = async (data: Record<string, unknown>, conversationId: string) => {
  const messages = Array.isArray(data?.messages) ? data.messages as Array<Record<string, unknown>> : [];
  const messageIds = messages.map((message) => uuidValue(message.id)).filter(Boolean);
  const [attachmentsResult, feedbackResult, conversationResult] = await Promise.all([
    messageIds.length
      ? serviceClient
        .from('support_attachments')
        .select('id,message_id,original_name,declared_mime,byte_size,status,scan_code,created_at')
        .eq('conversation_id', conversationId)
        .in('message_id', messageIds)
      : Promise.resolve({ data: [], error: null }),
    serviceClient
      .from('customer_feedback')
      .select('id,rating,category,comment,created_at')
      .eq('conversation_id', conversationId)
      .maybeSingle(),
    serviceClient
      .from('support_conversations')
      .select('id,priority,tags,first_response_due_at,first_responded_at')
      .eq('id', conversationId)
      .maybeSingle(),
  ]);
  if (attachmentsResult.error && feedbackResult.error && conversationResult.error) return data;
  const byMessage = new Map<string, Array<Record<string, unknown>>>();
  for (const attachment of attachmentsResult.data || []) {
    const list = byMessage.get(String(attachment.message_id)) || [];
    list.push({
      id: attachment.id,
      originalName: attachment.original_name,
      declaredMime: attachment.declared_mime,
      byteSize: attachment.byte_size,
      status: attachment.status,
      scanCode: attachment.scan_code || null,
      createdAt: attachment.created_at,
    });
    byMessage.set(String(attachment.message_id), list);
  }
  return {
    ...data,
    conversation: conversationResult.data && data.conversation && typeof data.conversation === 'object'
      ? {
        ...(data.conversation as Record<string, unknown>),
        priority: conversationResult.data.priority,
        tags: conversationResult.data.tags || [],
        firstResponseDueAt: conversationResult.data.first_response_due_at,
        firstRespondedAt: conversationResult.data.first_responded_at,
      }
      : data.conversation,
    messages: messages.map((message) => ({
      ...message,
      attachments: byMessage.get(String(message.id)) || [],
    })),
    feedback: feedbackResult.data ? {
      id: feedbackResult.data.id,
      rating: feedbackResult.data.rating,
      category: feedbackResult.data.category,
      comment: feedbackResult.data.comment,
      createdAt: feedbackResult.data.created_at,
    } : null,
  };
};

const getErrorStatus = (message: string) => {
  if (/not found|access required/i.test(message)) return 404;
  if (/another agent|already assigned|conflict|conversation changed/i.test(message)) return 409;
  if (/authentication required|support session required/i.test(message)) return 401;
  return 422;
};

const getErrorMessage = (message: string) => {
  if (/not found|access required/i.test(message)) return 'Support conversation not found';
  if (/another agent|already assigned|conflict|conversation changed/i.test(message)) return 'That support conversation changed. Refresh and try again.';
  if (/authentication required|support session required/i.test(message)) return 'Authentication required';
  if (/invalid|too long|too large/i.test(message)) return 'Support request is invalid';
  return 'Support request could not be completed';
};

const getRateKey = (req: Request, token: string) => {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return token ? `guest:${token}` : `ip:${forwarded || req.headers.get('x-real-ip') || 'unknown'}`;
};

const consumeRateLimit = (key: string) => {
  const now = Date.now();
  const existing = rateBuckets.get(key);
  if (!existing || now - existing.windowStartedAt >= RATE_WINDOW_MS) {
    rateBuckets.set(key, { windowStartedAt: now, count: 1 });
    return true;
  }
  if (existing.count >= RATE_LIMIT) return false;
  existing.count += 1;
  return true;
};

serve(async (req: Request) => {
  const origin = req.headers.get('Origin');
  if (!isOriginAllowed(origin)) return jsonResponse({ error: 'Origin not allowed' }, 403, origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: getCorsHeaders(origin) });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, origin);
  if (!supabaseUrl || !anonKey) return jsonResponse({ error: 'Support service is not configured' }, 503, origin);

  try {
    const contentLength = Number(req.headers.get('Content-Length') || '0');
    if (contentLength > 20 * 1024) return jsonResponse({ error: 'Payload too large' }, 413, origin);
    const rawBody = await readBoundedBodyText(req, 20 * 1024);
    const body = (rawBody ? JSON.parse(rawBody) : {}) as Record<string, unknown>;
    const action = stringValue(body.action, 40);
    if (!actionNames.has(action)) return jsonResponse({ error: 'Unsupported support action' }, 422, origin);
    const suppliedGuestToken = getGuestToken(req);
    if (!consumeRateLimit(getRateKey(req, suppliedGuestToken))) {
      return new Response(JSON.stringify({ error: 'Too many support requests. Please wait and retry.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': '60', ...getCorsHeaders(origin) },
      });
    }
    const user = await getUser(req);
    if (user && !consumeRateLimit(`user:${user.id}`)) {
      return new Response(JSON.stringify({ error: 'Too many support requests. Please wait and retry.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': '60', ...getCorsHeaders(origin) },
      });
    }
    if (user && SUPPORT_AAL2_ACTIONS.has(action)) {
      if (!await isActiveAuthSession(user.id, user.sessionId)) {
        return jsonResponse({ error: 'Authentication required' }, 401, origin);
      }
      if (user.aal !== 'aal2' && await hasSupportMembership(user.id)) {
        return jsonResponse({ error: 'Verify your authenticator in Admin Settings before using support tools.' }, 403, origin);
      }
    }
    if (EMAIL_PREFERENCE_ACTIONS.has(action)) {
      if (!user) return jsonResponse({ error: 'Authentication required' }, 401, origin);
      if (!user.sessionId || !await isActiveAuthSession(user.id, user.sessionId)) {
        return jsonResponse({ error: 'Authentication required' }, 401, origin);
      }
      if (!serviceRoleKey) return jsonResponse({ error: 'Support service is not configured' }, 503, origin);
      if (action === 'emailPreferenceSet' && typeof body.enabled !== 'boolean') {
        return jsonResponse({ error: 'Email preference must be true or false' }, 422, origin);
      }

      const { data, error } = await serviceClient.rpc(
        action === 'emailPreferenceGet'
          ? 'support_get_email_notification_preference'
          : 'support_set_email_notification_preference',
        {
          p_user_id: user.id,
          ...(action === 'emailPreferenceSet' ? { p_enabled: body.enabled } : {}),
        },
      );
      if (error || !data || typeof data.emailRepliesEnabled !== 'boolean') {
        return jsonResponse({ error: 'Email notification preference could not be saved' }, 503, origin);
      }
      return jsonResponse({ ok: true, data: { emailRepliesEnabled: data.emailRepliesEnabled } }, 200, origin);
    }
    if (LEGACY_INQUIRY_ACTIONS.has(action)) {
      if (!user) return jsonResponse({ error: 'Authentication required' }, 401, origin);
      if (!await isSupportOperator(user.id, user.aal)) {
        return jsonResponse({ error: 'Support operator access required' }, 403, origin);
      }
      if (!serviceRoleKey) return jsonResponse({ error: 'Support service is not configured' }, 503, origin);
      const conversationId = uuidValue(body.conversationId);
      if (!conversationId) return jsonResponse({ error: 'Invalid conversation' }, 422, origin);
      if (action === 'legacyInquiries') {
        return jsonResponse({ ok: true, data: await listLegacyInquiries(conversationId) }, 200, origin);
      }
      const inquiryId = uuidValue(body.inquiryId);
      if (!inquiryId) return jsonResponse({ error: 'Invalid historical inquiry' }, 422, origin);
      const result = await linkLegacyInquiry(conversationId, inquiryId, user.id);
      return jsonResponse(result.body, result.status, origin);
    }
    if (action === 'routing') {
      if (!serviceRoleKey) return jsonResponse({ error: 'Support service is not configured' }, 503, origin);
      const { data: routingContext, error: routingError } = await serviceClient.rpc('support_get_routing_context');
      if (routingError || !routingContext) return jsonResponse({ error: 'Support availability is temporarily unavailable' }, 503, origin);
      return jsonResponse({ ok: true, data: routingContext }, 200, origin);
    }
    let guestToken = suppliedGuestToken;
    let rpc;
    let client;
    if (user) {
      if (suppliedGuestToken) return jsonResponse({ error: 'Use one support identity at a time' }, 422, origin);
      rpc = rpcForAction(action, body);
      client = createClient(supabaseUrl, anonKey, {
        auth: { persistSession: false },
        global: { headers: { Authorization: getBearer(req) } },
      });
    } else {
      if (!serviceRoleKey) return jsonResponse({ error: 'Guest support is not configured' }, 503, origin);
      if (!guestToken && action !== 'start') return jsonResponse({ error: 'Support session required' }, 401, origin);
      if (!guestToken) guestToken = createGuestToken();
      rpc = guestRpcForAction(action, body, await hashGuestToken(guestToken));
      client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    }
    if (action === 'attachmentFinalize') {
      const attachmentId = uuidValue(body.attachmentId);
      if (!attachmentId) return jsonResponse({ error: 'Invalid attachment request' }, 422, origin);
      const data = await finalizeAttachment(attachmentId, user, guestToken);
      return jsonResponse({ ok: true, data, ...(user ? {} : { guestToken }) }, 200, origin);
    }
    if (action === 'attachmentDownload') {
      const attachmentId = uuidValue(body.attachmentId);
      if (!attachmentId) return jsonResponse({ error: 'Invalid attachment request' }, 422, origin);
      const data = await downloadAttachment(attachmentId, user, guestToken);
      return jsonResponse({ ok: true, data, ...(user ? {} : { guestToken }) }, 200, origin);
    }
    if (!rpc) return jsonResponse({ error: 'Unsupported support action for this identity' }, 422, origin);
    const { data, error } = await client.rpc(rpc[0], rpc[1]);
    if (error) {
      const message = typeof error.message === 'string' ? error.message : 'Support request failed';
      return jsonResponse({ error: getErrorMessage(message) }, getErrorStatus(message), origin);
    }
    if (action === 'attachmentPrepare') {
      const input = attachmentInputs(body);
      const { data: signedUpload, error: signedUploadError } = await serviceClient.storage
        .from(supportAttachmentBucket)
        .createSignedUploadUrl(input.storagePath, { upsert: false });
      if (signedUploadError || !signedUpload?.token) {
        return jsonResponse({ error: 'Attachment upload is temporarily unavailable' }, 503, origin);
      }
      return jsonResponse({
        ok: true,
        data: {
          attachmentId: input.attachmentId,
          path: input.storagePath,
          token: signedUpload.token,
          expiresAt: input.uploadExpiresAt,
          status: data?.status || 'pending',
        },
        ...(user ? {} : { guestToken }),
      }, 200, origin);
    }
    if (user && (action === 'start' || action === 'resolve')) {
      const eventName = action === 'start' ? 'support_started' : 'support_resolved';
      const conversationId = typeof data?.conversationId === 'string' ? data.conversationId : uuidValue(body.conversationId);
      if (conversationId) {
        try {
          await client.rpc('record_analytics_event', {
            p_event_key: `support:${action}:${conversationId}:${data?.revision || 'initial'}`,
            p_event_name: eventName,
            p_properties: { source: 'support_api' },
          });
        } catch {
          // Analytics is best effort and must not block support operations.
        }
      }
    }
    let routingContext = null;
    if (action === 'start') {
      const routingResult = await serviceClient.rpc('support_get_routing_context');
      if (!routingResult.error && routingResult.data) routingContext = routingResult.data;
    }
    const responseData = action === 'read'
      ? await enrichSupportRead(data as Record<string, unknown>, uuidValue(body.conversationId))
      : routingContext ? { ...(data || {}), routing: routingContext } : data;
    return jsonResponse({ ok: true, data: responseData, ...(user ? {} : { guestToken }) }, 200, origin);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    return jsonResponse({ error: getErrorMessage(message) }, getErrorStatus(message), origin);
  }
});
