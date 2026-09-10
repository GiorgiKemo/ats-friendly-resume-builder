import { serve } from 'std/http/server.ts';
import { createClient } from 'supabase';
import { readBoundedBodyText } from '../_shared/boundedBody.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('API_URL') || '';
const serviceRoleKey = Deno.env.get('SB_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  Deno.env.get('SERVICE_ROLE_KEY') || '';
const workerSecret = Deno.env.get('PRIVACY_WORKER_SECRET') || '';
const exportBucket = 'privacy-exports';
const maxExportBytes = 50 * 1024 * 1024;

type ExportJob = {
  jobId: string;
  targetUserId: string;
  attempt: number;
};

const createServiceClient = () => createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

const jsonResponse = (body: Record<string, unknown>, status: number) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const safeCode = (value: unknown, fallback: string) => {
  const code = typeof value === 'string' ? value.trim().replace(/[^a-zA-Z0-9_.:-]/g, '_') : '';
  return code.slice(0, 120) || fallback;
};

const rowsForUser = async (
  client: ReturnType<typeof createServiceClient>,
  table: string,
  columns: string,
  column: string,
  userId: string,
) => {
  const { data, error } = await client.from(table).select(columns).eq(column, userId);
  if (error) throw new Error(`export_${table}_unavailable`);
  return data || [];
};

const buildExport = async (client: ReturnType<typeof createServiceClient>, userId: string) => {
  const { data: account, error: accountError } = await client
    .from('users')
    .select('id,email,full_name,avatar_url,is_premium,ai_generations_limit,premium_plan,premium_until,premium_updated_at,created_at,updated_at')
    .eq('id', userId)
    .maybeSingle();
  if (accountError || !account) throw new Error('export_account_unavailable');

  const [profiles, resumes, applications, aiGenerations, entitlements, manualGrants, paypalCheckouts, analyticsEvents, conversations, feedback] = await Promise.all([
    rowsForUser(client, 'user_profiles', 'id,user_id,personal,work_experience,education,skills,certifications,projects,languages,interests,reference_list,created_at,updated_at,revision', 'user_id', userId),
    rowsForUser(client, 'resumes', 'id,user_id,title,description,selected_template,selected_font,is_public,last_accessed_at,created_at,updated_at,revision', 'user_id', userId),
    rowsForUser(client, 'job_applications', 'id,user_id,resume_id,company,position,job_url,status,applied_at,response_at,notes,job_description,salary_range,location,created_at,updated_at', 'user_id', userId),
    rowsForUser(client, 'ai_generations', 'id,resume_id,prompt,result,created_at', 'user_id', userId),
    rowsForUser(client, 'billing_entitlements', 'provider,subscription_id,active,paid_until,plan,ai_limit,observed_at', 'user_id', userId),
    rowsForUser(client, 'manual_access_grants', 'id,plan,ai_limit,starts_at,expires_at,revoked_at,reason,created_at,updated_at', 'user_id', userId),
    rowsForUser(client, 'paypal_checkouts', 'request_id,plan,subscription_id,created_at', 'user_id', userId),
    rowsForUser(client, 'analytics_events', 'id,event_key,event_name,event_version,provider,properties,occurred_at,created_at', 'actor_user_id', userId),
    rowsForUser(client, 'support_conversations', 'id,subject,status,mode,priority,last_message_at,created_at,updated_at', 'customer_user_id', userId),
    rowsForUser(client, 'customer_feedback', 'id,conversation_id,rating,category,comment,created_at', 'customer_user_id', userId),
  ]);

  const resumeIds = resumes.map((resume) => resume.id).filter((id): id is string => typeof id === 'string');
  const conversationIds = conversations.map((conversation) => conversation.id).filter((id): id is string => typeof id === 'string');
  const [resumeContents, messages, attachments] = await Promise.all([
    resumeIds.length
      ? client.from('resume_content').select('id,resume_id,personal_info,work_experience,education,skills,certifications,projects,additional_sections,created_at,updated_at').in('resume_id', resumeIds)
      : Promise.resolve({ data: [], error: null }),
    conversationIds.length
      ? client.from('support_messages').select('id,conversation_id,sequence_no,sender_user_id,sender_type,body,reply_to_message_id,created_at').in('conversation_id', conversationIds)
      : Promise.resolve({ data: [], error: null }),
    conversationIds.length
      ? client.from('support_attachments').select('id,conversation_id,message_id,original_name,declared_mime,byte_size,status,scan_code,created_at').in('conversation_id', conversationIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (resumeContents.error || messages.error || attachments.error) throw new Error('export_content_unavailable');

  return {
    exportVersion: 1,
    generatedAt: new Date().toISOString(),
    account,
    profile: profiles,
    resumes: resumes.map((resume) => ({
      ...resume,
      content: (resumeContents.data || []).filter((content) => content.resume_id === resume.id),
    })),
    applications,
    aiGenerations,
    billing: { entitlements, manualGrants, paypalCheckouts },
    support: {
      conversations,
      feedback,
      messages: messages.data || [],
      attachments: attachments.data || [],
    },
    analyticsEvents,
    excluded: [
      'auth credentials and tokens',
      'Gmail connection tokens',
      'internal support notes',
      'raw provider webhook payloads',
    ],
  };
};

const itemCount = (payload: Record<string, unknown>) => {
  const countArray = (value: unknown) => Array.isArray(value) ? value.length : 0;
  const collections = [payload.profile, payload.resumes, payload.applications, payload.aiGenerations, payload.analyticsEvents];
  const billing = payload.billing as Record<string, unknown>;
  const support = payload.support as Record<string, unknown>;
  return collections.reduce<number>((total, value) => total + countArray(value), 0)
    + Object.values(billing || {}).reduce<number>((total, value) => total + countArray(value), 0)
    + Object.values(support || {}).reduce<number>((total, value) => total + countArray(value), 0)
    + 1;
};

const processExport = async (client: ReturnType<typeof createServiceClient>, workerId: string, job: ExportJob) => {
  const payload = await buildExport(client, job.targetUserId) as Record<string, unknown>;
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  if (bytes.byteLength > maxExportBytes) throw new Error('export_too_large');
  const storagePath = `${job.targetUserId}/${job.jobId}.json`;
  const { error: uploadError } = await client.storage.from(exportBucket).upload(storagePath, bytes, {
    contentType: 'application/json',
    cacheControl: '300',
    upsert: true,
  });
  if (uploadError) throw new Error('export_upload_failed');
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const { error: completeError } = await client.rpc('privacy_complete_export_job', {
    p_job_id: job.jobId,
    p_worker_id: workerId,
    p_storage_path: storagePath,
    p_item_count: itemCount(payload),
    p_expires_at: expiresAt,
  });
  if (completeError) throw new Error('export_completion_failed');
};

serve(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  if (!workerSecret || req.headers.get('x-privacy-worker-secret') !== workerSecret) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ error: 'Privacy worker is not configured' }, 503);

  let limit = 3;
  try {
    const raw = await readBoundedBodyText(req, 16 * 1024);
    if (raw) {
      const body = JSON.parse(raw) as Record<string, unknown>;
      if (typeof body.limit === 'number' && Number.isSafeInteger(body.limit)) limit = body.limit;
    }
  } catch {
    return jsonResponse({ error: 'Invalid request' }, 422);
  }
  limit = Math.max(1, Math.min(10, limit));
  const client = createServiceClient();
  const workerId = `privacy-worker:${crypto.randomUUID()}`;

  const { data: expired, error: expiryError } = await client.rpc('privacy_expire_exports', { p_limit: 100 });
  if (expiryError) return jsonResponse({ error: 'Privacy expiry queue is unavailable' }, 503);
  let cleanupFailures = 0;
  for (const item of (Array.isArray(expired) ? expired : [])) {
    if (!item?.storagePath) continue;
    const { error } = await client.storage.from(exportBucket).remove([item.storagePath]);
    if (error) cleanupFailures += 1;
  }

  const { data: claimed, error: claimError } = await client.rpc('privacy_claim_export_jobs', {
    p_worker_id: workerId,
    p_limit: limit,
    p_lease_seconds: 600,
  });
  if (claimError) return jsonResponse({ error: 'Privacy export queue is unavailable' }, 503);

  const jobs = Array.isArray(claimed) ? claimed as ExportJob[] : [];
  let completed = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      await processExport(client, workerId, job);
      completed += 1;
    } catch (error) {
      await client.rpc('privacy_release_export_job', {
        p_job_id: job.jobId,
        p_worker_id: workerId,
        p_retry: job.attempt < 5,
        p_failure_code: safeCode(error instanceof Error ? error.message : '', 'export_failed'),
      });
      failed += 1;
    }
  }
  return jsonResponse({ ok: true, claimed: jobs.length, completed, failed, expired: Array.isArray(expired) ? expired.length : 0, cleanupFailures }, 200);
});
