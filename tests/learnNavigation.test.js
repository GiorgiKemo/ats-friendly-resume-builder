import test from 'node:test';
import assert from 'node:assert/strict';
import { componentHarness, find, visit, textContent } from './helpers/componentHarness.js';

test('guide section links preserve the HashRouter route and target real sections', () => {
  const app = componentHarness('src/pages/Learn.jsx', {
    imports: {
      'react-router-dom': { Link: 'Link' },
      'framer-motion': { motion: { div: 'div' } },
      '../components/ui': { TouchLink: 'TouchLink', PageHero: 'PageHero' },
      '../components/ui/AnimatedElement': { default: 'AnimatedElement' },
      '../components/ui/StaggeredContainer': { default: 'StaggeredContainer' },
      '../components/ui/StaggeredItem': { default: 'StaggeredItem' },
      '../utils/animationVariants': { fadeInUp: {} },
    },
  });
  const tree = app.render();
  const navigation = find(tree, (node) => node.props?.['aria-label'] === 'Guide sections');
  const links = visit(navigation, (node) => node.type === 'Link');
  assert.equal(links.length, 3);
  for (const link of links) {
    assert.match(link.props.to, /^\/learn#/);
    assert.ok(find(tree, (node) => node.props?.id === link.props.to.split('#')[1]));
  }
  assert.doesNotMatch(textContent(tree), /75%|99%/);
  assert.match(textContent(tree), /not a test of an employer's ATS/);
  assert.ok(find(tree, (node) => node.type === 'a' && node.props.href.startsWith('https://support.greenhouse.io/')));
});
