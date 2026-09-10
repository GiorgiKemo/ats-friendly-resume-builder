const encoder = new TextEncoder();

export const DEFAULT_MAX_BODY_BYTES = 256 * 1024;

export class BodyTooLargeError extends Error {
  constructor() {
    super('Payload too large');
    this.name = 'BodyTooLargeError';
  }
}

export const readBoundedBodyText = async (
  body: Request | Response,
  maxBytes = DEFAULT_MAX_BODY_BYTES,
) => {
  const contentLength = Number(body.headers.get('Content-Length') || '0');
  if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new BodyTooLargeError();

  if (!body.body) {
    const text = await body.text();
    if (encoder.encode(text).byteLength > maxBytes) throw new BodyTooLargeError();
    return text;
  }

  const reader = body.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new BodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
};
