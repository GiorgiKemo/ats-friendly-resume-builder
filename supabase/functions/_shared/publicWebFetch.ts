// External job feeds are untrusted. Restrict outbound probes to public web
// destinations, including every redirect, and bound their time and body size.
// DNS preflight is defense in depth, not DNS pinning: production must also
// enforce private-address egress restrictions to close DNS-rebinding races.
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
  // Accept only global-unicast IPv6; reject mapped IPv4, transition protocols,
  // loopback, link-local, unique-local, multicast and documentation ranges.
  const normalized = address.toLowerCase();
  return /^[23][0-9a-f]{3}:[0-9a-f:]+$/.test(normalized) &&
    !/^2001:0*(?:0|2|10|20|db8):/.test(normalized) &&
    !/^(?:2002|3fff):/.test(normalized);
};

export const parsePublicWebUrl = (value: string): URL => {
  let url: URL;
  try { url = new URL(value); } catch { throw new UnsafeWebDestinationError('Invalid web URL'); }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password ||
    (url.port && url.port !== (url.protocol === 'https:' ? '443' : '80')) ||
    !hostname.includes('.') || /^[\d.]+$/.test(hostname) || hostname.includes(':') ||
    !/^[a-z0-9.-]+$/.test(hostname) ||
    /(?:^|\.)(?:localhost|local|internal|intranet|home|lan|corp|test|invalid|example|onion|arpa)$/.test(hostname)) {
    throw new UnsafeWebDestinationError('Only public web destinations are allowed');
  }
  url.hostname = hostname;
  return url;
};

const assertPublicDns = async (hostname: string, signal: AbortSignal) => {
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
};

export const fetchPublicWebpage = async (value: string, method: 'GET' | 'HEAD' = 'GET') => {
  let url = parsePublicWebUrl(value);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  const MAX_BYTES = 1024 * 1024;
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      await assertPublicDns(url.hostname, controller.signal);
      const response = await fetch(url.href, {
        method,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ResumeATS/1.0)', Accept: 'text/html' },
        redirect: 'manual',
        signal: controller.signal,
      });
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        const location = response.headers.get('Location');
        if (!location || redirects === 3) throw new UnsafeWebDestinationError('Invalid or excessive redirects');
        url = parsePublicWebUrl(new URL(location, url).href);
        continue;
      }

      let text = '';
      if (method === 'GET' && response.ok && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let bytes = 0;
        try {
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            bytes += chunk.value.byteLength;
            if (bytes > MAX_BYTES) throw new Error('External page is too large');
            text += decoder.decode(chunk.value, { stream: true });
          }
          text += decoder.decode();
        } finally {
          await reader.cancel();
        }
      } else {
        await response.body?.cancel();
      }
      return { ok: response.ok, status: response.status, text };
    }
    throw new UnsafeWebDestinationError('Too many redirects');
  } finally {
    clearTimeout(timeout);
  }
};
