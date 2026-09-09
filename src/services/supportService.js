import { supabase } from './supabase';

const SUPPORT_SESSION_KEY = 'resumeats.support.session';

const readStoredSession = () => {
  try {
    const raw = window.sessionStorage.getItem(SUPPORT_SESSION_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      guestToken: typeof parsed.guestToken === 'string' ? parsed.guestToken : '',
      conversationId: typeof parsed.conversationId === 'string' ? parsed.conversationId : '',
    };
  } catch {
    return { guestToken: '', conversationId: '' };
  }
};

const storedSession = readStoredSession();
let guestToken = storedSession.guestToken;
let activeConversationId = storedSession.conversationId;

const persistSession = () => {
  try {
    if (!guestToken && !activeConversationId) {
      window.sessionStorage.removeItem(SUPPORT_SESSION_KEY);
      return;
    }
    window.sessionStorage.setItem(SUPPORT_SESSION_KEY, JSON.stringify({ guestToken, conversationId: activeConversationId }));
  } catch {
    // Private browsing or a blocked storage policy should not break support.
  }
};

const createClientId = (prefix) => {
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}-${id}`;
};

const invokeSupport = async (action, payload = {}) => {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = !session && guestToken ? { 'x-support-guest-token': guestToken } : undefined;
  const { data, error } = await supabase.functions.invoke('support-api', {
    body: { action, ...payload },
    headers,
  });

  if (error || data?.ok === false) {
    throw new Error(data?.error || error?.message || 'Support request failed. Please try again.');
  }

  if (data?.guestToken) {
    guestToken = data.guestToken;
    persistSession();
  }
  return data?.data;
};

export const startSupportConversation = async ({ subject, body }) => {
  const response = await invokeSupport('start', {
    subject: `${subject || ''}`.trim(),
    body: `${body || ''}`.trim(),
    clientRequestId: createClientId('support-start'),
  });
  activeConversationId = response?.conversationId || '';
  persistSession();
  return response;
};

export const getSupportRoutingContext = () => invokeSupport('routing');

export const sendSupportMessage = async (body, conversationId = activeConversationId, attachmentIds = []) => {
  const response = await invokeSupport('send', {
    conversationId,
    body: `${body || ''}`.trim(),
    clientMessageId: createClientId('support-message'),
    attachmentIds: Array.isArray(attachmentIds) ? attachmentIds : [],
  });
  activeConversationId = response?.conversationId || conversationId;
  persistSession();
  return response;
};

export const prepareSupportAttachment = async (file, conversationId = activeConversationId) => {
  if (!file || !conversationId) throw new Error('A support conversation and file are required.');
  const response = await invokeSupport('attachmentPrepare', {
    conversationId,
    attachmentId: createClientId('attachment').replace(/^attachment-/, ''),
    originalName: file.name,
    declaredMime: file.type,
    byteSize: file.size,
  });
  const { data, error } = await supabase.storage
    .from('support-attachments')
    .uploadToSignedUrl(response.path, response.token, file);
  if (error || !data) throw new Error('The attachment could not be uploaded.');
  const finalized = await invokeSupport('attachmentFinalize', { attachmentId: response.attachmentId });
  if (finalized?.status !== 'quarantined' && finalized?.status !== 'clean') {
    throw new Error('The attachment was blocked before it could be sent.');
  }
  return response.attachmentId;
};

export const downloadSupportAttachment = (attachmentId) => invokeSupport('attachmentDownload', { attachmentId });

export const readSupportConversation = async (conversationId = activeConversationId, afterSequence = 0) => {
  const response = await invokeSupport('read', {
    conversationId,
    afterSequence,
    limit: 100,
  });
  activeConversationId = response?.conversation?.id || conversationId;
  persistSession();
  return response;
};

export const requestSupportHandoff = (conversationId = activeConversationId, reason = '') => invokeSupport('handoff', {
  conversationId,
  reason,
  clientRequestId: createClientId('support-handoff'),
});

export const listSupportQueue = ({ status = 'open', before = null, search = '' } = {}) => invokeSupport('queue', {
  status,
  before,
  search: `${search || ''}`.trim(),
  limit: 100,
});

export const triageSupportConversation = (conversationId, expectedRevision, priority, tags = []) => invokeSupport('triage', {
  conversationId,
  expectedRevision,
  priority,
  tags,
});

export const reopenSupportConversation = (conversationId) => invokeSupport('reopen', {
  conversationId,
  clientRequestId: createClientId('support-reopen'),
});

export const setSupportPresence = (status = 'available', ttlSeconds = 90) => invokeSupport('presence', {
  status,
  ttlSeconds,
});

export const listSupportPresence = () => invokeSupport('presence', { list: true });

export const listSupportFeedback = ({ before = null } = {}) => invokeSupport('feedbackList', {
  before,
  limit: 100,
});

export const updateSupportFeedbackTags = ({ feedbackId, tags = [] }) => invokeSupport('feedbackTags', {
  feedbackId,
  tags,
  clientRequestId: createClientId('feedback-tags'),
});

export const listSupportImprovementItems = ({ status = 'all' } = {}) => invokeSupport('improvementList', {
  status,
  limit: 100,
});

export const createSupportImprovementItem = ({ title, sanitizedSummary, category = 'other', impact = 'unknown', priority = 'normal', sourceFeedbackId = null }) => invokeSupport('improvementCreate', {
  title,
  sanitizedSummary,
  category,
  impact,
  priority,
  sourceFeedbackId,
  clientRequestId: createClientId('improvement-create'),
});

export const updateSupportImprovementItem = ({ improvementId, status, priority, ownerUserId = null, outcome = null }) => invokeSupport('improvementUpdate', {
  improvementId,
  status,
  priority,
  ownerUserId,
  outcome,
  clientRequestId: createClientId('improvement-update'),
});

export const listSupportKnowledge = ({ locale = null, status = 'all' } = {}) => invokeSupport('knowledgeList', {
  locale,
  status,
  limit: 100,
});

export const createSupportKnowledgeDraft = ({ slug, locale = 'en', title, body, sourceRef }) => invokeSupport('knowledgeDraft', {
  slug,
  locale,
  title,
  body,
  sourceRef,
  clientRequestId: createClientId('knowledge-draft'),
});

export const publishSupportKnowledge = ({ articleId, versionId }) => invokeSupport('knowledgePublish', {
  articleId,
  versionId,
  clientRequestId: createClientId('knowledge-publish'),
});

export const rollbackSupportKnowledge = ({ articleId, versionId }) => invokeSupport('knowledgeRollback', {
  articleId,
  versionId,
  clientRequestId: createClientId('knowledge-rollback'),
});

export const addSupportInternalNote = (conversationId, body) => invokeSupport('note', {
  conversationId,
  body: `${body || ''}`.trim(),
  clientNoteId: createClientId('support-note'),
});

export const takeSupportConversation = (conversationId) => invokeSupport('take', {
  conversationId,
  clientRequestId: createClientId('support-take'),
});

export const resolveSupportConversation = (conversationId, reason = '') => invokeSupport('resolve', {
  conversationId,
  reason,
  clientRequestId: createClientId('support-resolve'),
});

export const submitSupportFeedback = (conversationId, rating, category = 'support', comment = '') => invokeSupport('feedback', {
  conversationId,
  rating,
  category,
  comment: `${comment || ''}`.trim(),
  clientRequestId: createClientId('support-feedback'),
});

export const markSupportConversationRead = (conversationId, lastReadSequence) => invokeSupport('markRead', {
  conversationId,
  lastReadSequence,
});

export const getActiveSupportConversationId = () => activeConversationId;

export const clearSupportSession = () => {
  guestToken = '';
  activeConversationId = '';
  persistSession();
};
