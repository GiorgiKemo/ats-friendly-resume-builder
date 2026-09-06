import test from 'node:test';
import assert from 'node:assert/strict';
import { componentHarness, find, visit, textContent } from './helpers/componentHarness.js';
import { filterFaqItems } from '../src/utils/faqSearch.js';

const setup = () => componentHarness('src/pages/FAQ.jsx', {
  imports: {
    '../components/ui/Button': { default: 'Button' },
    '../components/ui': { PageHero: 'PageHero' },
    '../utils/faqSearch': { filterFaqItems },
  },
});
const questionButtons = (tree) => visit(tree, (node) => node.type === 'button' && node.props['aria-controls']);

test('FAQ keeps the expanded question identity when filtering changes positions', () => {
  const app = setup();
  let tree = app.render();
  const first = questionButtons(tree)[0];
  first.props.onClick();
  tree = app.render();
  assert.equal(questionButtons(tree)[0].props['aria-expanded'], true);
  find(tree, (node) => node.type === 'input').props.onChange({ target: { value: 'cancel' } });
  tree = app.render();
  assert.equal(questionButtons(tree).length, 1);
  assert.match(textContent(questionButtons(tree)[0]), /cancel/);
  assert.equal(questionButtons(tree)[0].props['aria-expanded'], false, 'A different first result must not inherit expansion');
  questionButtons(tree)[0].props.onClick();
  const cancellationId = questionButtons(tree)[0].props.id;
  find(tree, (node) => node.type === 'input').props.onChange({ target: { value: '' } });
  tree = app.render();
  const expanded = questionButtons(tree).filter((button) => button.props['aria-expanded']);
  assert.equal(expanded.length, 1);
  assert.equal(expanded[0].props.id, cancellationId);
  assert.match(textContent(expanded[0]), /cancel/);
});

test('FAQ hides collapsed content and exposes one semantic support link', () => {
  const app = setup();
  let tree = app.render();
  assert.ok(visit(tree, (node) => node.props?.role === 'region').every((region) => region.props.hidden && region.props.className.includes('hidden')));
  const button = questionButtons(tree)[0];
  button.props.onClick();
  tree = app.render();
  const region = find(tree, (node) => node.props?.id === button.props['aria-controls']);
  assert.equal(region.props.hidden, false);
  assert.equal(region.props['aria-labelledby'], button.props.id);
  const support = find(tree, (node) => node.type === 'Button');
  assert.equal(support.props.as, 'link');
  assert.equal(support.props.to, '/contact');
});
