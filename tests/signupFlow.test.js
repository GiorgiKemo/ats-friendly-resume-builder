import test from 'node:test';
import assert from 'node:assert/strict';
import { componentHarness, find, textContent } from './helpers/componentHarness.js';

const defaultModule = (value) => ({ __esModule: true, default: value });

function loadSignUp({ response, planIntent = null } = {}) {
  const navigations = [];
  const successMessages = [];
  const component = componentHarness('src/components/auth/SignUp.jsx', {
    props: { planIntent },
    imports: {
      'react-router-dom': { Link: 'Link', useNavigate: () => (path, options) => navigations.push({ path, options }) },
      '../../context/AuthContext': { useAuth: () => ({ signUp: async () => response }) },
      '../ui/Input': defaultModule('Input'),
      '../ui/Button': defaultModule('Button'),
      'react-hot-toast': defaultModule({ success: (message) => successMessages.push(message), error() {} }),
      'framer-motion': { motion: { div: 'motion-div', svg: 'motion-svg', span: 'motion-span' } },
      '../../utils/animationVariants': { staggerContainer: {}, staggerItem: {} },
      './PasswordStrengthIndicator': defaultModule('PasswordStrengthIndicator'),
    },
  });
  return { component, navigations, successMessages };
}

async function submitSignUp(component) {
  let tree = component.render();
  find(tree, (node) => node.props?.id === 'email-desktop').props.onChange({ target: { value: 'candidate@example.com' } });
  find(tree, (node) => node.props?.id === 'password-desktop').props.onChange({ target: { value: 'valid-password' } });
  find(tree, (node) => node.props?.id === 'confirmPassword-desktop').props.onChange({ target: { value: 'valid-password' } });
  tree = component.render();
  await find(tree, (node) => node.props?.method === 'post').props.onSubmit({ preventDefault() {} });
  return component.render();
}

test('auto-confirmed Premium signup opens the selected plan checkout route', async () => {
  const { component, navigations, successMessages } = loadSignUp({
    planIntent: { planId: 'premium_yearly', label: 'Premium AI+ — Yearly' },
    response: { user: { id: 'account-a' }, session: { access_token: 'fixture-token' } },
  });

  await submitSignUp(component);

  assert.equal(navigations.length, 1);
  assert.equal(navigations[0].path, '/pricing?plan=premium_yearly');
  assert.equal(navigations[0].options.replace, true);
  assert.deepEqual(successMessages, ['Your account is ready.']);
});

test('auto-confirmed free signup continues to the signed-in dashboard', async () => {
  const { component, navigations } = loadSignUp({
    planIntent: { planId: 'free', label: 'Basic (Free)' },
    response: { user: { id: 'account-a' }, session: { access_token: 'fixture-token' } },
  });

  await submitSignUp(component);

  assert.equal(navigations.length, 1);
  assert.equal(navigations[0].path, '/dashboard');
});

test('confirmation-required signup explains email activation without navigating into the app', async () => {
  const { component, navigations } = loadSignUp({
    planIntent: { planId: 'premium_monthly', label: 'Premium AI+ — Monthly' },
    response: { user: { identities: [{ id: 'new-email' }] }, session: null },
  });

  const tree = await submitSignUp(component);
  const text = textContent(tree);

  assert.deepEqual(navigations, []);
  assert.match(text, /A confirmation email has been sent to candidate@example\.com/);
  assert.match(text, /After confirming your email, return to pricing/);
});

test('duplicate-email response does not falsely claim a confirmation email was sent', async () => {
  const { component, navigations } = loadSignUp({
    response: { user: { identities: [] }, session: null },
  });

  const tree = await submitSignUp(component);
  const text = textContent(tree);

  assert.deepEqual(navigations, []);
  assert.match(text, /If an account can be created with candidate@example\.com, check your inbox for next steps/);
  assert.doesNotMatch(text, /A confirmation email has been sent/);
});

test('signed-in users returning to signup with a Premium plan land on that plan', () => {
  const page = componentHarness('src/pages/SignUpPage.jsx', {
    imports: {
      'react-router-dom': {
        Navigate: 'Navigate',
        useSearchParams: () => [new URLSearchParams('plan=premium_yearly')],
      },
      'framer-motion': { motion: { div: 'motion-div' } },
      '../components/auth/SignUp': defaultModule('SignUp'),
      '../context/AuthContext': { useAuth: () => ({ user: { id: 'account-a' }, loading: false }) },
      '../components/ui': { PageHero: 'PageHero' },
      '../utils/animationVariants': { fadeInUp: {} },
      '../config/stripePlans': { getStripePlanConfig: (planId) => ({ planId, label: 'Yearly' }) },
    },
  });

  const tree = page.render();
  assert.equal(tree.type, 'Navigate');
  assert.equal(tree.props.to, '/pricing?plan=premium_yearly');
});
