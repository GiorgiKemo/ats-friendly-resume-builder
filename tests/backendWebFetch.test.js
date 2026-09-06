import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPublicAddress, parsePublicWebUrl } from '../supabase/functions/_shared/publicWebFetch.ts';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

test('external URL policy rejects private literals, alternate IP encodings, local hosts and non-web schemes', () => {
  for (const url of [
    'file:///etc/passwd', 'ftp://jobs.example.org/', 'http://localhost/', 'http://metadata.google.internal/',
    'http://127.0.0.1/', 'http://127.1/', 'http://2130706433/', 'http://0x7f000001/',
    'http://169.254.169.254/', 'http://[::1]/', 'http://[::ffff:127.0.0.1]/',
    'https://example.org:8443/', 'https://user:password@example.org/', 'https://company.local/',
  ]) assert.throws(() => parsePublicWebUrl(url), undefined, url);
  assert.equal(parsePublicWebUrl('https://Careers.Example.org./jobs/1').hostname, 'careers.example.org');
});

test('DNS address policy blocks private, reserved, metadata and transition addresses', () => {
  for (const address of [
    '0.0.0.0', '10.2.3.4', '127.0.0.1', '100.64.0.1', '169.254.169.254', '172.31.255.255',
    '192.168.1.1', '192.0.0.1', '192.0.2.1', '198.18.0.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '255.255.255.255',
    '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', 'ff02::1', '2001:db8::1', '2002:7f00:1::', '3fff::1',
  ]) assert.equal(isPublicAddress(address), false, address);
  for (const address of ['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111', '2001:4860:4860::8888']) {
    assert.equal(isPublicAddress(address), true, address);
  }
});

const loadFetch = (options) => loadEdgeFunction('supabase/functions/_shared/publicWebFetch.ts', options).exports.fetchPublicWebpage;
const publicDns = async (_hostname, type) => type === 'A' ? ['8.8.8.8'] : [];

test('public-looking DNS names resolving to private IPs never reach fetch', async () => {
  let requests = 0;
  const fetchPublicWebpage = loadFetch({ resolveDns: async () => ['10.0.0.1'], fetch: async () => { requests++; } });
  await assert.rejects(fetchPublicWebpage('https://rebind.example.org/'), /public addresses/);
  assert.equal(requests, 0);
});

test('mixed public/private DNS answers fail closed', async () => {
  const fetchPublicWebpage = loadFetch({ resolveDns: async (_host, type) => type === 'A' ? ['8.8.8.8'] : ['::1'] });
  await assert.rejects(fetchPublicWebpage('https://rebind.example.org/'), /public addresses/);
});

test('redirects to private addresses are rejected before following them', async () => {
  let requests = 0;
  const fetchPublicWebpage = loadFetch({
    resolveDns: publicDns,
    fetch: async (_url, options) => {
      requests++;
      assert.equal(options.redirect, 'manual');
      return new Response(null, { status: 302, headers: { Location: 'http://169.254.169.254/latest/meta-data/' } });
    },
  });
  await assert.rejects(fetchPublicWebpage('https://jobs.example.org/'), /public web destinations/);
  assert.equal(requests, 1);
});

test('redirect DNS is checked independently even when the original URL is public', async () => {
  let requests = 0;
  const fetchPublicWebpage = loadFetch({
    resolveDns: async (hostname, type) => type === 'A' ? [hostname === 'jobs.example.org' ? '8.8.8.8' : '192.168.1.1'] : [],
    fetch: async () => { requests++; return new Response(null, { status: 302, headers: { Location: 'https://internal.example.org/' } }); },
  });
  await assert.rejects(fetchPublicWebpage('https://jobs.example.org/'), /public addresses/);
  assert.equal(requests, 1);
});

test('public relative redirects work and HTML response size is bounded', async () => {
  const fetchPublicWebpage = loadFetch({
    resolveDns: publicDns,
    fetch: async (url) => url.endsWith('/jobs')
      ? new Response(null, { status: 302, headers: { Location: '/careers' } })
      : new Response('<p>Careers</p>'),
  });
  assert.equal((await fetchPublicWebpage('https://company.example.org/jobs')).text, '<p>Careers</p>');
  const oversized = loadFetch({ resolveDns: publicDns, fetch: async () => new Response('x'.repeat(1024 * 1024 + 1)) });
  await assert.rejects(oversized('https://company.example.org/'), /too large/);
});
