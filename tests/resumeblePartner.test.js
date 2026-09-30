import test from 'node:test';
import assert from 'node:assert/strict';
import { getResumebleReferralUrl } from '../src/config/resumeblePartner.js';
import { componentHarness, find } from './helpers/componentHarness.js';
import { loadEdgeFunction } from './helpers/loadEdgeFunction.js';

test('Resumeble referrals retain the approved merchant, publisher, and destination for every placement', () => {
  for (const source of ['home', 'pricing', 'learn', 'guide']) {
    const url = new URL(getResumebleReferralUrl(source));
    assert.equal(url.origin, 'https://www.awin1.com');
    assert.equal(url.pathname, '/cread.php');
    assert.equal(url.searchParams.get('awinmid'), '81719');
    assert.equal(url.searchParams.get('awinaffid'), '3110649');
    assert.equal(url.searchParams.get('ued'), 'https://www.resumeble.com/');
    assert.equal(url.searchParams.get('clickref'), `resumeats_${source}`);
    assert.deepEqual([...url.searchParams.keys()].sort(), ['awinaffid', 'awinmid', 'clickref', 'ued']);
  }
});

test('partner links remain native sponsored links and only emit optional analytics with consent', () => {
  for (const consent of ['unknown', 'denied', 'granted']) {
    const gaCalls = [];
    const analytics = loadEdgeFunction('src/services/analyticsService.js', {
      imports: { './supabase.js': { supabase: { rpc: () => { throw new Error('Referral must not call the database'); } } } },
      globals: {
        window: {
          localStorage: { getItem: () => consent },
          location: { hostname: 'www.resumeats.cv', pathname: '/learn' },
          gtag: (...args) => gaCalls.push(args),
        },
      },
    }).exports;
    const app = componentHarness('src/components/partners/ResumebleLink.jsx', {
      imports: {
        '../../config/resumeblePartner': { getResumebleReferralUrl },
        '../../services/analyticsService': analytics,
      },
      props: { source: 'learn' },
    });
    const anchor = find(app.render(), (node) => node.type === 'a');
    assert.equal(anchor.props.href, getResumebleReferralUrl('learn'));
    assert.equal(anchor.props.target, '_blank');
    assert.equal(anchor.props.rel, 'sponsored noopener noreferrer');
    assert.doesNotThrow(() => anchor.props.onClick());
    assert.equal(gaCalls.length, consent === 'granted' ? 1 : 0);
    if (consent === 'granted') {
      assert.deepEqual([...gaCalls[0]].slice(0, 2), ['event', 'affiliate_outbound_click']);
      assert.deepEqual({ ...gaCalls[0][2] }, { partner: 'resumeble', source: 'learn' });
    }
  }
});
