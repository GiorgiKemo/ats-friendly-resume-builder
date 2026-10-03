import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
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
    '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', 'ff02::1', '2001:1::1', '2001:db8::1',
    '2002:7f00:1::', '3f00::1', '3ffe:831f::1', '3fff::1', '2:::1', '2001:gggg::1',
  ]) assert.equal(isPublicAddress(address), false, address);
  for (const address of ['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111', '2001:4860:4860::8888']) {
    assert.equal(isPublicAddress(address), true, address);
  }
});

const loadFetch = ({ resolveDns = async (_hostname, type) => type === 'A' ? ['8.8.8.8'] : [], responses = [], onLookup = () => {} } = {}) => {
  const requests = [];
  const https = {
    request(options, callback) {
      const request = new EventEmitter();
      request.end = () => {
        assert.equal(options.agent, false, 'Pinned requests must not reuse an unrelated pooled connection');
        assert.equal(options.servername, options.hostname, 'TLS verification and SNI must retain the validated host');
        assert.equal(options.port, 443);
        assert.equal(typeof options.lookup, 'function', 'The transport must not perform its own DNS resolution');
        options.lookup(options.hostname, { all: true }, (error, addresses) => {
          if (error) {
            request.emit('error', error);
            return;
          }
          requests.push({ options, addresses });
          onLookup({ options, addresses });
          const responseData = responses.shift() || { statusCode: 200, chunks: [] };
          const response = Readable.from((responseData.chunks || []).map((chunk) => Buffer.from(chunk)));
          response.statusCode = responseData.statusCode;
          response.headers = responseData.headers || {};
          callback(response);
        });
      };
      return request;
    },
  };
  const fetchPublicWebpage = loadEdgeFunction('supabase/functions/_shared/publicWebFetch.ts', {
    resolveDns,
    imports: { 'node:https': https },
  }).exports.fetchPublicWebpage;
  return { fetchPublicWebpage, requests };
};
const publicDns = async (_hostname, type) => type === 'A' ? ['8.8.8.8'] : [];

test('public-looking DNS names resolving to private IPs never reach the HTTPS transport', async () => {
  const { fetchPublicWebpage, requests } = loadFetch({ resolveDns: async () => ['10.0.0.1'] });
  await assert.rejects(fetchPublicWebpage('https://rebind.example.org/'), /public addresses/);
  assert.equal(requests.length, 0);
});

test('insecure HTTP destinations and HTTPS-to-HTTP redirects never reach the HTTPS transport', async () => {
  const insecure = loadFetch({
    resolveDns: publicDns,
  });

  await assert.rejects(insecure.fetchPublicWebpage('http://jobs.example.org/apply'), /public web destinations/);
  assert.equal(insecure.requests.length, 0);

  const fetchWithDowngrade = loadFetch({
    responses: [{ statusCode: 302, headers: { location: 'http://jobs.example.org/apply' } }],
  });
  await assert.rejects(fetchWithDowngrade.fetchPublicWebpage('https://jobs.example.org/apply'), /public web destinations/);
  assert.equal(fetchWithDowngrade.requests.length, 1);
});

test('mixed public/private DNS answers fail closed', async () => {
  const { fetchPublicWebpage, requests } = loadFetch({ resolveDns: async (_host, type) => type === 'A' ? ['8.8.8.8'] : ['::1'] });
  await assert.rejects(fetchPublicWebpage('https://rebind.example.org/'), /public addresses/);
  assert.equal(requests.length, 0);
});

test('redirects to private addresses are rejected before following them', async () => {
  const { fetchPublicWebpage, requests } = loadFetch({
    responses: [{ statusCode: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' } }],
  });
  await assert.rejects(fetchPublicWebpage('https://jobs.example.org/'), /public web destinations/);
  assert.equal(requests.length, 1);
});

test('redirect DNS is checked independently even when the original URL is public', async () => {
  const { fetchPublicWebpage, requests } = loadFetch({
    resolveDns: async (hostname, type) => type === 'A' ? [hostname === 'jobs.example.org' ? '8.8.8.8' : '192.168.1.1'] : [],
    responses: [{ statusCode: 302, headers: { location: 'https://internal.example.org/' } }],
  });
  await assert.rejects(fetchPublicWebpage('https://jobs.example.org/'), /public addresses/);
  assert.equal(requests.length, 1);
});

test('the request is pinned to validated DNS answers even if a subsequent lookup would rebind', async () => {
  let addressQueries = 0;
  const { fetchPublicWebpage, requests } = loadFetch({
    resolveDns: async (_hostname, type) => {
      if (type === 'AAAA') return [];
      addressQueries++;
      return [addressQueries === 1 ? '8.8.8.8' : '127.0.0.1'];
    },
    onLookup: ({ addresses }) => assert.deepEqual(JSON.parse(JSON.stringify(addresses)), [{ address: '8.8.8.8', family: 4 }]),
    responses: [{ statusCode: 200, chunks: ['<p>Safe</p>'] }],
  });
  assert.equal((await fetchPublicWebpage('https://company.example.org/jobs')).text, '<p>Safe</p>');
  assert.equal(addressQueries, 1, 'DNS is queried once per address family, then the request uses the pinned answer');
  assert.equal(requests.length, 1);
});

test('the pinned resolver only returns validated addresses for the requested family and hostname', async () => {
  const selected = {};
  const { fetchPublicWebpage } = loadFetch({
    resolveDns: async (_hostname, type) => type === 'A' ? ['8.8.8.8'] : ['2606:4700:4700::1111'],
    onLookup: ({ options }) => {
      options.lookup(options.hostname, { family: 4 }, (error, address, family) => {
        assert.equal(error, null);
        selected.v4 = [address, family];
      });
      options.lookup(options.hostname, { family: 6 }, (error, address, family) => {
        assert.equal(error, null);
        selected.v6 = [address, family];
      });
      options.lookup('attacker.example.org', { family: 4 }, (error) => {
        selected.mismatch = error?.message;
      });
    },
  });
  await fetchPublicWebpage('https://company.example.org/');
  assert.deepEqual(selected, {
    v4: ['8.8.8.8', 4],
    v6: ['2606:4700:4700::1111', 6],
    mismatch: 'Pinned DNS hostname mismatch',
  });
});

test('public relative redirects work and HTML response size is bounded', async () => {
  const redirected = loadFetch({
    resolveDns: publicDns,
    responses: [
      { statusCode: 302, headers: { location: '/careers' } },
      { statusCode: 200, chunks: ['<p>Careers</p>'] },
    ],
  });
  assert.equal((await redirected.fetchPublicWebpage('https://company.example.org/jobs')).text, '<p>Careers</p>');
  assert.equal(redirected.requests.length, 2);
  assert.equal(redirected.requests[1].options.path, '/careers');

  const oversized = loadFetch({ responses: [{ statusCode: 200, chunks: ['x'.repeat(1024 * 1024 + 1)] }] });
  await assert.rejects(oversized.fetchPublicWebpage('https://company.example.org/'), /too large/);
});
