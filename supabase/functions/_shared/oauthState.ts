const encoder = new TextEncoder();
const decoder = new TextDecoder();

export type GmailOAuthStatePayload = {
  userId: string;
  origin: string;
  ts: number;
};

const base64UrlEncode = (bytes: Uint8Array) => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
};

const base64UrlDecode = (value: string) => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

const importHmacKey = (secret: string) =>
  crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );

const assertStateSecret = (secret: string) => {
  if (!secret) {
    throw new Error('Gmail OAuth state secret is not configured');
  }
};

export const createSignedOAuthState = async (
  payload: GmailOAuthStatePayload,
  secret: string,
) => {
  assertStateSecret(secret);
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const key = await importHmacKey(secret);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));
  return `${body}.${base64UrlEncode(signature)}`;
};

export const verifySignedOAuthState = async (
  state: string,
  secret: string,
  maxAgeMs: number,
): Promise<GmailOAuthStatePayload | null> => {
  assertStateSecret(secret);

  const parts = state.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  const [body, signature] = parts;
  const key = await importHmacKey(secret);
  const isValid = await crypto.subtle.verify(
    'HMAC',
    key,
    base64UrlDecode(signature),
    encoder.encode(body),
  );

  if (!isValid) return null;

  const parsed = JSON.parse(decoder.decode(base64UrlDecode(body))) as Partial<GmailOAuthStatePayload>;
  const now = Date.now();

  if (
    typeof parsed.userId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.userId) ||
    typeof parsed.origin !== 'string' ||
    typeof parsed.ts !== 'number' ||
    !Number.isFinite(parsed.ts) ||
    parsed.ts > now + 60_000 ||
    now - parsed.ts > maxAgeMs
  ) {
    return null;
  }

  return {
    userId: parsed.userId,
    origin: parsed.origin,
    ts: parsed.ts,
  };
};
