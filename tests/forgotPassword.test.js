import test from 'node:test';
import assert from 'node:assert/strict';
import { componentHarness, deferred, find, textContent } from './helpers/componentHarness.js';

function setup() {
  const request = deferred();
  const calls = [];
  const app = componentHarness('src/components/auth/ForgotPassword.jsx', {
    globals: { window: { location: { origin: 'http://127.0.0.1:5175' } } },
    imports: {
      'react-router-dom': { Link: 'Link' },
      '../../services/supabase': { supabase: { auth: { resetPasswordForEmail: (...args) => { calls.push(args); return request.promise; } } } },
      '../ui/Input': { default: 'Input' }, '../ui/Button': { default: 'Button' },
    },
  });
  const submit = () => find(app.render(), (node) => node.type === 'form').props.onSubmit({ preventDefault() {} });
  return { ...app, request, calls, submit };
}

test('recovery form submits once and uses a non-enumerating, accessible success message', async () => {
  const app = setup();
  const input = find(app.render(), (node) => node.type === 'Input');
  assert.equal(input.props.autoComplete, 'email');
  input.props.onChange({ target: { value: 'person@example.com' } });
  const pending = app.submit();
  await app.submit();
  assert.equal(app.calls.length, 1);
  assert.equal(app.calls[0][0], 'person@example.com');
  app.request.resolve({ error: null });
  await pending;
  const tree = app.render();
  assert.ok(find(tree, (node) => node.type === 'h1'));
  assert.match(textContent(find(tree, (node) => node.props?.role === 'status')), /If an account uses this email/);
});

test('recovery provider errors are errors, not green success notifications', async () => {
  const app = setup();
  const pending = app.submit();
  app.request.resolve({ error: { message: 'Please wait before retrying.' } });
  await pending;
  const alert = find(app.render(), (node) => node.props?.role === 'alert');
  assert.equal(textContent(alert), 'Please wait before retrying.');
  assert.match(alert.props.className, /text-red/);
});

test('recovery response after unmount does not update status', async () => {
  const app = setup();
  const pending = app.submit();
  app.unmount();
  app.request.resolve({ error: null });
  await pending;
  assert.ok(!find(app.render(), (node) => node.props?.role === 'status'));
});
