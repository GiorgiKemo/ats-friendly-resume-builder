import * as https from 'node:https';

// External job feeds are untrusted. Restrict outbound probes to public web
// destinations, including every redirect, and bound their time and body size.
export class UnsafeWebDestinationError extends Error {}

export const isPublicAddress = (address: string): boolean => {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(address)) {
    const [a, b, c, d] = address.split('.').map(Number);
    if ([a, b, c, d].some((part) => part < 0 || part > 255)) return false;
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113));
  }
  // Accept only globally allocated unicast space; keep IETF protocol,
  // transition, former 6bone and documentation prefixes out.
  let normalized: string;
  try { normalized = new URL(`https://[${address}]/`).hostname.slice(1, -1); } catch { return false; }
  const [firstText, secondText = '0'] = normalized.split(':');
  const first = Number.parseInt(firstText, 16);
  const second = Number.parseInt(secondText || '0', 16);
  return first >= 0x2000 && first < 0x3f00 &&
    !(first === 0x2001 && second <= 0x01ff) &&
    !(first === 0x2001 && second === 0x0db8) &&
    first !== 0x2002;
};

export const parsePublicWebUrl = (value: string): URL => {
  let url: URL;
  try { url = new URL(value); } catch { throw new UnsafeWebDestinationError('Invalid web URL'); }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (url.protocol !== 'https:' || url.username || url.password ||
    (url.port && url.port !== '443') ||
    !hostname.includes('.') || /^[\d.]+$/.test(hostname) || hostname.includes(':') ||
    !/^[a-z0-9.-]+$/.test(hostname) ||
    /(?:^|\.)(?:localhost|local|internal|intranet|home|lan|corp|test|invalid|example|onion|arpa)$/.test(hostname)) {
    throw new UnsafeWebDestinationError('Only public web destinations over HTTPS are allowed');
  }
  url.hostname = hostname;
  return url;
};

type ResolvedAddress = { address: string; family: 4 | 6 };

const resolvePublicDns = async (hostname: string, signal: AbortSignal): Promise<ResolvedAddress[]> => {
  signal.throwIfAborted();
  const lookup = Promise.allSettled([
    Deno.resolveDns(hostname, 'A'),
    Deno.resolveDns(hostname, 'AAAA'),
  ]);
  const results = await Promise.race([
    lookup,
    new Promise<never>((_, reject) => signal.addEventListener('abort', () => reject(new Error('DNS lookup timed out')), { once: true })),
  ]);
  const addresses = results.flatMap((result) => result.status === 'fulfilled' ? result.value : []);
  if (!addresses.length || addresses.some((address) => !isPublicAddress(address))) {
    throw new UnsafeWebDestinationError('Destination did not resolve exclusively to public addresses');
  }
  return [...new Set(addresses)].map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
};

type PinnedHttpsResponse = {
  statusCode?: number;
  headers: { location?: string | string[] };
  destroy: () => void;
  [Symbol.asyncIterator]: () => AsyncIterator<Uint8Array>;
};

const requestPinnedHttps = (
  url: URL,
  method: 'GET' | 'HEAD',
  addresses: ResolvedAddress[],
  signal: AbortSignal,
): Promise<PinnedHttpsResponse> => new Promise((resolve, reject) => {
  const lookup = (
    hostname: string,
    options: { all?: boolean; family?: number },
    callback: (error: Error | null, address: string | ResolvedAddress[], family?: number) => void,
  ) => {
    if (hostname.toLowerCase() !== url.hostname) {
      callback(new Error('Pinned DNS hostname mismatch'), '');
      return;
    }
    const candidates = options.family
      ? addresses.filter((entry) => entry.family === options.family)
      : addresses;
    if (!candidates.length) {
      callback(new Error('No validated address for requested IP family'), '');
      return;
    }
    if (options.all) callback(null, candidates);
    else callback(null, candidates[0].address, candidates[0].family);
  };

  const request = https.request({
    hostname: url.hostname,
    servername: url.hostname,
    port: 443,
    path: `${url.pathname}${url.search}`,
    method,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ResumeATS/1.0)', Accept: 'text/html' },
    agent: false,
    lookup,
    signal,
  }, resolve);
  request.on('error', reject);
  request.end();
});

export const fetchPublicWebpage = async (value: string, method: 'GET' | 'HEAD' = 'GET') => {
  let url = parsePublicWebUrl(value);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  const MAX_BYTES = 1024 * 1024;
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      const addresses = await resolvePublicDns(url.hostname, controller.signal);
      const response = await requestPinnedHttps(url, method, addresses, controller.signal);
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400) {
        const location = typeof response.headers.location === 'string' ? response.headers.location : null;
        response.destroy();
        if (!location || redirects === 3) throw new UnsafeWebDestinationError('Invalid or excessive redirects');
        url = parsePublicWebUrl(new URL(location, url).href);
        continue;
      }

      let text = '';
      const ok = status >= 200 && status < 300;
      if (method === 'GET' && ok) {
        const decoder = new TextDecoder();
        let bytes = 0;
        try {
          for await (const chunk of response) {
            bytes += chunk.byteLength;
            if (bytes > MAX_BYTES) throw new Error('External page is too large');
            text += decoder.decode(chunk, { stream: true });
          }
          text += decoder.decode();
        } finally {
          response.destroy();
        }
      } else {
        response.destroy();
      }
      return { ok, status, text };
    }
    throw new UnsafeWebDestinationError('Too many redirects');
  } finally {
    clearTimeout(timeout);
  }
};
