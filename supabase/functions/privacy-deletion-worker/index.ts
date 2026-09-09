import { serve } from 'std/http/server.ts';
import { createClient } from 'supabase';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('API_URL') || '';
const serviceRoleKey = Deno.env.get('SB_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  Deno.env.get('SERVICE_ROLE_KEY') || '';
const workerSecret = Deno.env.get('PRIVACY_DELETION_WORKER_SECRET') || '';
const maxBatch = 10;
const maxBodyBytes = 16_384;

type JsonRecord = Record<string, unknown>;
type Candidate = { id: string };
type Claim = { claimed?: boolean; jobId?: string; targetUserId?: string; step?: string; reason?: string };

const jsonResponse = (body: JsonRecord, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const safeCode = (value: unknown, fallback: string) => {
  const code = typeof value === 'string'
    ? value.trim().replace(/[^a-zA-Z0-9_.:-]/g, '_')
    : '';
  return code.slice(0, 120) || fallback;
};

const asPaths = (value: unknown) => (
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0 && item.length <= 500 && !item.includes('..')).slice(0, 1000)
    : []
);

const removeStoragePaths = async (
  client: ReturnType<typeof createClient>,
  bucket: string,
  paths: string[],
) => {
  if (paths.length === 0) return;
  const { error } = await client.storage.from(bucket).remove(paths);
  if (error) throw new Error(`storage_${bucket.replace(/[^a-z0-9_-]/gi, '_')}_remove_failed`);
};

const removeResumeStorage = async (
  client: ReturnType<typeof createClient>,
  userId: string,
) => {
  const { data: objects, error: listError } = await client.storage.from('resumes').list(userId, { limit: 1000, offset: 0 });
  if (listError) throw new Error('resume_storage_list_failed');
  const paths = (objects || [])
    .map((item) => (item && typeof item.name === 'string' ? `${userId}/${item.name}` : ''))
    .filter((path) => path.length > userId.length + 1 && !path.includes('..'));
  await removeStoragePaths(client, 'resumes', paths);
};

const deleteAuthUser = async (
  client: ReturnType<typeof createClient>,
  userId: string,
) => {
  const { data, error: lookupError } = await client.auth.admin.getUserById(userId);
  if (lookupError && !/not found|not_found|404/i.test(lookupError.message || '')) {
    throw new Error('auth_lookup_failed');
  }
  if (!data?.user) return;
  const { error: deleteError } = await client.auth.admin.deleteUser(userId);
  if (deleteError) throw new Error('auth_delete_failed');
};

const runJob = async (
  client: ReturnType<typeof createClient>,
  workerId: string,
  jobId: string,
) => {
  const { data: claim, error: claimError } = await client.rpc('privacy_claim_deletion_execution', {
    p_job_id: jobId,
    p_worker_id: workerId,
    p_lock_seconds: 900,
  });
  if (claimError) throw new Error('deletion_claim_failed');
  const typedClaim = (claim || {}) as Claim;
  if (typedClaim.claimed !== true || typeof typedClaim.targetUserId !== 'string') {
    return { status: 'skipped', reason: typeof typedClaim.reason === 'string' ? typedClaim.reason : 'not_claimed' };
  }

  try {
    let step = typedClaim.step || 'delete_data';
    if (step === 'delete_data') {
      const { data: artifacts, error: artifactsError } = await client.rpc('privacy_get_deletion_artifacts', {
        p_job_id: jobId,
        p_worker_id: workerId,
      });
      if (artifactsError) throw new Error('deletion_artifacts_failed');
      const record = (artifacts || {}) as JsonRecord;
      await removeStoragePaths(client, 'support-attachments', asPaths(record.attachmentPaths));
      await removeStoragePaths(client, 'privacy-exports', asPaths(record.exportPaths));
      await removeResumeStorage(client, typedClaim.targetUserId);

      const { data: deleted, error: dataError } = await client.rpc('privacy_delete_user_data', {
        p_job_id: jobId,
        p_worker_id: workerId,
      });
      if (dataError || !(deleted as JsonRecord | null)?.authUserId) throw new Error('deletion_data_failed');
      step = 'delete_auth';
    }

    if (step === 'delete_auth') {
      await deleteAuthUser(client, typedClaim.targetUserId);
      const { error: markedError } = await client.rpc('privacy_mark_auth_deleted', {
        p_job_id: jobId,
        p_worker_id: workerId,
      });
      if (markedError) throw new Error('deletion_auth_confirmation_failed');
    }

    const { error: completeError } = await client.rpc('privacy_complete_deletion_job', {
      p_job_id: jobId,
      p_worker_id: workerId,
    });
    if (completeError) throw new Error('deletion_completion_failed');
    return { status: 'completed' };
  } catch (error) {
    await client.rpc('privacy_release_deletion_job', {
      p_job_id: jobId,
      p_worker_id: workerId,
      p_retry: true,
      p_failure_code: safeCode(error instanceof Error ? error.message : '', 'deletion_failed'),
    });
    return { status: 'failed' };
  }
};

serve(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  if (!workerSecret || req.headers.get('x-privacy-deletion-secret') !== workerSecret) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ error: 'Privacy deletion worker is not configured' }, 503);

  let limit = maxBatch;
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > maxBodyBytes) return jsonResponse({ error: 'Request too large' }, 413);
    if (raw) {
      const body = JSON.parse(raw) as JsonRecord;
      if (typeof body.limit === 'number' && Number.isSafeInteger(body.limit)) limit = body.limit;
    }
  } catch {
    return jsonResponse({ error: 'Invalid request' }, 422);
  }
  limit = Math.max(1, Math.min(maxBatch, limit));

  const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const workerId = `privacy-deletion:${crypto.randomUUID()}`;
  const { data: candidates, error: candidateError } = await client
    .from('privacy_deletion_jobs')
    .select('id')
    .in('status', ['pending', 'waiting_owner_approval', 'waiting_hold', 'waiting_provider_cancellation', 'processing'])
    .order('next_attempt_at', { ascending: true })
    .limit(limit);
  if (candidateError) return jsonResponse({ error: 'Privacy deletion queue is unavailable' }, 503);

  let completed = 0;
  let failed = 0;
  let skipped = 0;
  for (const candidate of (candidates || []) as Candidate[]) {
    if (!candidate?.id) { skipped += 1; continue; }
    const result = await runJob(client, workerId, candidate.id);
    if (result.status === 'completed') completed += 1;
    else if (result.status === 'failed') failed += 1;
    else skipped += 1;
  }
  return jsonResponse({ ok: failed === 0, claimed: completed + failed, completed, failed, skipped }, 200);
});
