export class RequestValidationError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const encoder = new TextEncoder();

export const MAX_AI_BODY_BYTES = 256 * 1024;
export const MAX_AI_MESSAGES = 20;
export const MAX_AI_MESSAGE_CHARS = 60_000;
export const MAX_AI_TOTAL_CHARS = 120_000;
export const MAX_KEYWORD_TEXT_CHARS = 60_000;

export const assertContentLength = (req: Request, maxBytes = MAX_AI_BODY_BYTES) => {
  const contentLength = Number(req.headers.get('Content-Length') || '0');
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new RequestValidationError(413, 'Payload too large');
  }
};

const estimateTextSize = (value: unknown): number => {
  if (typeof value === 'string') return value.length;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value).length;
  if (!value) return 0;
  if (Array.isArray(value)) return value.reduce((total, item) => total + estimateTextSize(item), 0);
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>)
      .reduce<number>((total, item) => total + estimateTextSize(item), 0);
  }
  return 0;
};

export const assertBodyByteSize = (body: unknown, maxBytes = MAX_AI_BODY_BYTES) => {
  let bytes = maxBytes + 1;
  try {
    bytes = encoder.encode(JSON.stringify(body ?? null)).length;
  } catch {
    throw new RequestValidationError(400, 'Invalid request payload');
  }

  if (bytes > maxBytes) {
    throw new RequestValidationError(413, 'Payload too large');
  }
};

export const validateChatMessages = (messages: unknown[]) => {
  if (messages.length > MAX_AI_MESSAGES) {
    throw new RequestValidationError(400, `AI requests are limited to ${MAX_AI_MESSAGES} messages.`);
  }

  let totalChars = 0;
  for (const message of messages) {
    const messageChars = estimateTextSize(message);
    if (messageChars > MAX_AI_MESSAGE_CHARS) {
      throw new RequestValidationError(400, 'One AI message is too large.');
    }
    totalChars += messageChars;
  }

  if (totalChars > MAX_AI_TOTAL_CHARS) {
    throw new RequestValidationError(400, 'AI request text is too large.');
  }
};

export const validateTextInput = (name: string, value: string, maxChars = MAX_KEYWORD_TEXT_CHARS) => {
  if (value.length > maxChars) {
    throw new RequestValidationError(400, `${name} is too large.`);
  }
};
