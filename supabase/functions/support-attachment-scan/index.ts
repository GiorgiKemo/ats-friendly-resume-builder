import { serve } from 'std/http/server.ts';
import { createClient } from 'supabase';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || Deno.env.get('API_URL') || '';
const serviceRoleKey = Deno.env.get('SB_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SECRET_KEY') ||
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
  Deno.env.get('SERVICE_ROLE_KEY') || '';
const workerSecret = Deno.env.get('SUPPORT_ATTACHMENT_SCANNER_SECRET') || '';
const scannerUrl = Deno.env.get('ATTACHMENT_SCANNER_URL') || '';
const scannerToken = Deno.env.get('ATTACHMENT_SCANNER_TOKEN') || '';
const bucket = 'support-attachments';

type ClaimedAttachment = {
  attachmentId: string;
  storagePath: string;
  originalName: string;
  declaredMime: string;
  byteSize: number;
  scanAttempts: number;
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

const isMagicMatch = (bytes: Uint8Array, mime: string) => {
  if (mime === 'application/pdf') return new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-';
  if (mime === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === 'image/png') return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  return false;
};

const scannerResult = async (attachment: ClaimedAttachment, bytes: ArrayBuffer) => {
  const response = await fetch(scannerUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${scannerToken}`,
      'Content-Type': attachment.declaredMime,
      'X-Attachment-Id': attachment.attachmentId,
      'X-Attachment-Name': attachment.originalName,
      'X-Attachment-Mime': attachment.declaredMime,
    },
    body: bytes,
  });
  if (!response.ok) throw new Error(`scanner_http_${response.status}`);
  let result: Record<string, unknown>;
  try {
    result = await response.json() as Record<string, unknown>;
  } catch {
    throw new Error('scanner_invalid_response');
  }
  if (typeof result.clean !== 'boolean') throw new Error('scanner_missing_verdict');
  return {
    status: result.clean ? 'clean' : 'blocked',
    code: safeCode(result.code, result.clean ? 'scanner_clean' : 'scanner_blocked'),
  } as const;
};

const processAttachment = async (client: ReturnType<typeof createServiceClient>, workerId: string, attachment: ClaimedAttachment) => {
  const { data: file, error: downloadError } = await client.storage.from(bucket).download(attachment.storagePath);
  if (downloadError || !file) throw new Error('storage_download_failed');
  const bytes = await file.arrayBuffer();
  if (bytes.byteLength !== Number(attachment.byteSize)) {
    const { error } = await client.rpc('support_complete_attachment_scan', {
      p_attachment_id: attachment.attachmentId,
      p_worker_id: workerId,
      p_status: 'blocked',
      p_scan_code: 'size_mismatch',
    });
    if (error) throw new Error('scan_result_persist_failed');
    return 'blocked';
  }
  if (!isMagicMatch(new Uint8Array(bytes), attachment.declaredMime)) {
    const { error } = await client.rpc('support_complete_attachment_scan', {
      p_attachment_id: attachment.attachmentId,
      p_worker_id: workerId,
      p_status: 'blocked',
      p_scan_code: 'magic_mismatch',
    });
    if (error) throw new Error('scan_result_persist_failed');
    return 'blocked';
  }

  const result = await scannerResult(attachment, bytes);
  const { error } = await client.rpc('support_complete_attachment_scan', {
    p_attachment_id: attachment.attachmentId,
    p_worker_id: workerId,
    p_status: result.status,
    p_scan_code: result.code,
  });
  if (error) throw new Error('scan_result_persist_failed');
  return result.status;
};

serve(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);
  if (!workerSecret || req.headers.get('x-support-attachment-scanner-secret') !== workerSecret) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }
  if (!supabaseUrl || !serviceRoleKey || !scannerUrl || !scannerToken) {
    return jsonResponse({ error: 'Attachment scanner is not configured' }, 503);
  }
  const client = createServiceClient();

  let requestedLimit = 10;
  try {
    const raw = await req.text();
    if (raw) {
      const body = JSON.parse(raw) as Record<string, unknown>;
      if (typeof body.limit === 'number' && Number.isSafeInteger(body.limit)) requestedLimit = body.limit;
    }
  } catch {
    return jsonResponse({ error: 'Invalid request' }, 422);
  }
  requestedLimit = Math.max(1, Math.min(25, requestedLimit));
  const workerId = `attachment-scan:${crypto.randomUUID()}`;
  const { data: claimed, error: claimError } = await client.rpc('support_claim_attachment_scan', {
    p_worker_id: workerId,
    p_limit: requestedLimit,
    p_lease_seconds: 300,
  });
  if (claimError) return jsonResponse({ error: 'Attachment scan queue is unavailable' }, 503);

  const attachments = Array.isArray(claimed) ? claimed as ClaimedAttachment[] : [];
  const counts = { clean: 0, blocked: 0, failed: 0 };
  for (const attachment of attachments) {
    try {
      const status = await processAttachment(client, workerId, attachment);
      if (status === 'clean') counts.clean += 1;
      else counts.blocked += 1;
    } catch (error) {
      const code = safeCode(error instanceof Error ? error.message : '', 'scanner_failed');
      await client.rpc('support_release_attachment_scan', {
        p_attachment_id: attachment.attachmentId,
        p_worker_id: workerId,
        p_retry: attachment.scanAttempts < 5,
        p_scan_code: code,
      });
      counts.failed += 1;
    }
  }
  return jsonResponse({ ok: true, claimed: attachments.length, ...counts }, 200);
});
