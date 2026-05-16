const encoder = new TextEncoder();

export const timingSafeEqual = (actual: string, expected: string) => {
  const actualBytes = encoder.encode(actual);
  const expectedBytes = encoder.encode(expected);
  let diff = actualBytes.length ^ expectedBytes.length;
  const length = Math.max(actualBytes.length, expectedBytes.length);

  for (let i = 0; i < length; i += 1) {
    diff |= (actualBytes[i] || 0) ^ (expectedBytes[i] || 0);
  }

  return diff === 0;
};

export const verifyBearerSecret = (req: Request, expectedSecret: string) => {
  if (!expectedSecret) return false;
  const authHeader = req.headers.get('Authorization') || '';
  const prefix = 'Bearer ';

  if (!authHeader.startsWith(prefix)) return false;

  return timingSafeEqual(authHeader.slice(prefix.length), expectedSecret);
};

const isPlausibleIp = (value: string) => (
  /^[0-9a-fA-F:.]{3,45}$/.test(value) &&
  (value.includes('.') || value.includes(':'))
);

export const getClientIp = (req: Request) => {
  const candidates = [
    req.headers.get('cf-connecting-ip'),
    req.headers.get('x-real-ip'),
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim(),
    req.headers.get('forwarded')?.match(/for="?([^;,"]+)/i)?.[1],
  ];

  return candidates.find((candidate) => candidate && isPlausibleIp(candidate)) || 'unknown';
};

export const hashValue = async (value: string) => {
  const bytes = encoder.encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};
