// supabase/functions/_shared/gmailSend.ts
// Shared helper to send email via the Gmail API using a user's OAuth tokens.
// Supports PDF attachment and proper UTF-8 encoding.
import { isSingleEmailAddress } from './emailSafety.ts';

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID') || '';
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET') || '';

interface SendViaGmailParams {
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  htmlContent: string;
  textContent: string;
  replyTo?: string;
  // Optional PDF attachment (base64 encoded)
  attachmentBase64?: string;
  attachmentFilename?: string;
}

interface SendViaGmailResult {
  success: boolean;
  messageId?: string;
  threadId?: string;
  newAccessToken?: string;
  newExpiresAt?: string;
  error?: string;
}

async function refreshGoogleToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresAt: string;
} | null> {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!res.ok) {
      console.error('Gmail token refresh failed with status:', res.status);
      return null;
    }

    const data = await res.json();
    const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();
    return { accessToken: data.access_token, expiresAt };
  } catch {
    console.error('Gmail token refresh request failed');
    return null;
  }
}

/**
 * Encode a UTF-8 subject line using RFC 2047 encoded-word syntax.
 * This prevents garbled characters like Ã¢Â€Â" for em dashes.
 */
function encodeSubject(subject: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(subject);
  const binary = Array.from(bytes).map((b) => String.fromCharCode(b)).join('');
  const base64 = btoa(binary);
  return `=?UTF-8?B?${base64}?=`;
}

function base64UrlEncode(str: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  const binary = Array.from(bytes).map((b) => String.fromCharCode(b)).join('');
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildRawMessage(params: {
  from: string;
  to: string;
  subject: string;
  htmlContent: string;
  textContent: string;
  replyTo?: string;
  attachmentBase64?: string;
  attachmentFilename?: string;
}): string {
  const date = new Date().toUTCString();
  const hasAttachment = !!(params.attachmentBase64 && params.attachmentFilename);

  const headers = [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Subject: ${encodeSubject(params.subject)}`,
    `Date: ${date}`,
    `MIME-Version: 1.0`,
  ];

  if (params.replyTo) {
    headers.push(`Reply-To: ${params.replyTo}`);
  }

  if (hasAttachment) {
    // Mixed message: body + attachment
    const mixedBoundary = `mixed_${crypto.randomUUID().replace(/-/g, '')}`;
    const altBoundary = `alt_${crypto.randomUUID().replace(/-/g, '')}`;

    headers.push(`Content-Type: multipart/mixed; boundary="${mixedBoundary}"`);

    return [
      headers.join('\r\n'),
      '',
      `--${mixedBoundary}`,
      `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
      '',
      `--${altBoundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      btoa(unescape(encodeURIComponent(params.textContent))),
      '',
      `--${altBoundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      btoa(unescape(encodeURIComponent(params.htmlContent))),
      '',
      `--${altBoundary}--`,
      '',
      `--${mixedBoundary}`,
      `Content-Type: application/pdf; name="${params.attachmentFilename}"`,
      `Content-Disposition: attachment; filename="${params.attachmentFilename}"`,
      'Content-Transfer-Encoding: base64',
      '',
      // Split base64 into 76-char lines per RFC 2045
      ...(params.attachmentBase64!.match(/.{1,76}/g) || []),
      '',
      `--${mixedBoundary}--`,
    ].join('\r\n');
  } else {
    // Simple multipart/alternative (no attachment)
    const altBoundary = `alt_${crypto.randomUUID().replace(/-/g, '')}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);

    return [
      headers.join('\r\n'),
      '',
      `--${altBoundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      btoa(unescape(encodeURIComponent(params.textContent))),
      '',
      `--${altBoundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      btoa(unescape(encodeURIComponent(params.htmlContent))),
      '',
      `--${altBoundary}--`,
    ].join('\r\n');
  }
}

export async function sendViaGmail(params: SendViaGmailParams): Promise<SendViaGmailResult> {
  if (
    !isSingleEmailAddress(params.fromEmail) ||
    !isSingleEmailAddress(params.toEmail) ||
    (params.replyTo && !isSingleEmailAddress(params.replyTo))
  ) {
    return { success: false, error: 'A valid single sender, recipient, and reply-to email is required' };
  }
  if (params.attachmentFilename && (/[\r\n"\\]/.test(params.attachmentFilename) || params.attachmentFilename.includes('\0'))) {
    return { success: false, error: 'Invalid attachment filename' };
  }

  let { accessToken } = params;
  let newAccessToken: string | undefined;
  let newExpiresAt: string | undefined;

  // Refresh token if expired or expiring within 60s
  const expiresAt = new Date(params.tokenExpiresAt);
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date(Date.now() + 60_000)) {
    const refreshed = await refreshGoogleToken(params.refreshToken);
    if (!refreshed) {
      return { success: false, error: 'Failed to refresh Gmail access token' };
    }
    accessToken = refreshed.accessToken;
    newAccessToken = refreshed.accessToken;
    newExpiresAt = refreshed.expiresAt;
  }

  const rawMessage = buildRawMessage({
    from: params.fromEmail,
    to: params.toEmail,
    subject: params.subject,
    htmlContent: params.htmlContent,
    textContent: params.textContent,
    replyTo: params.replyTo,
    attachmentBase64: params.attachmentBase64,
    attachmentFilename: params.attachmentFilename,
  });

  const encodedMessage = base64UrlEncode(rawMessage);

  try {
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: encodedMessage }),
    });

    if (!res.ok) {
      console.error('Gmail send failed with status:', res.status);
      return { success: false, error: `Gmail API error ${res.status}`, newAccessToken, newExpiresAt };
    }

    const data = await res.json();
    return { success: true, messageId: data.id, threadId: data.threadId, newAccessToken, newExpiresAt };
  } catch {
    console.error('Gmail send request failed');
    return { success: false, error: 'Gmail request failed. Please try again.', newAccessToken, newExpiresAt };
  }
}
