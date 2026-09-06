import test from 'node:test';
import assert from 'node:assert/strict';
import { componentHarness, textContent, find as findNode } from './helpers/componentHarness.js';
import { getResumeDisplayJobTitle } from '../src/utils/resumePresentation.js';

function dashboardHarness(headline, resumeState = {}) {
  const app = componentHarness('src/pages/Dashboard.jsx', { imports: {
    'react-router-dom': { useNavigate: () => () => {} },
    '../context/AuthContext': { useAuth: () => ({ user: { id: 'qa-owner' } }) },
    '../context/ResumeContext': { useResume: () => ({
      resumes: [{ id: 'qa-resume', personalInfo: { fullName: 'Alex Candidate', jobTitle: headline } }],
      fetchUserResumes: () => {},
      ...resumeState,
    }) },
    '../context/SubscriptionContext': { useSubscription: () => ({
      isPremium: true, getRemainingAIGenerations: () => 10,
      subscriptionData: { aiGenerationsLimit: 50 },
    }) },
    '../components/ui': { TouchLink: 'TouchLink', Button: 'Button', Pagination: 'Pagination' },
    'react-hot-toast': { default: { success() {}, error() {} } },
    'date-fns': { format: () => 'Sep 4, 2026' },
    'framer-motion': { motion: { div: 'div' } },
    '../components/ui/AnimatedElement': { default: 'AnimatedElement' },
    '../components/ui/StaggeredContainer': { default: 'StaggeredContainer' },
    '../components/ui/StaggeredItem': { default: 'StaggeredItem' },
    '../utils/animationVariants': { fadeInUp: {}, scaleIn: {} },
    '../utils/resumePresentation.js': { getResumeDisplayJobTitle },
  } });
  return app;
}

const renderDashboard = (headline) => textContent(dashboardHarness(headline).render());

test('dashboard preserves an explicitly labeled target without doubling its prefix', () => {
  const text = renderDashboard('Target role: CEO');
  assert.ok(text.includes('Target role: CEO'));
  assert.ok(!text.includes('Target role: Target role:'));
});

test('dashboard does not relabel a manual professional headline as an inferred target', () => {
  const text = renderDashboard('Product Designer');
  assert.ok(text.includes('Product Designer'));
  assert.ok(!text.includes('Target role: Product Designer'));
});

test('failed resume loading offers a working retry without claiming the account is empty', () => {
  let fetches = 0;
  const app = dashboardHarness('', { resumes: [], error: 'Failed to load your resumes. Please try again.',
    fetchUserResumes: () => { fetches += 1; } });
  const tree = app.render();
  const text = textContent(tree);
  assert.ok(text.includes('We couldn’t load your resumes'));
  assert.ok(!text.includes('Create your first resume'));
  assert.ok(!text.includes('No resumes yet'));
  assert.equal(fetches, 0, 'The provider owns initial fetching; the dashboard must not duplicate it');
  const retry = findNode(tree, (node) => node.props?.ariaLabel === 'Try again');
  assert.ok(retry);
  retry.props.onClick();
  assert.equal(fetches, 1);
  assert.ok(findNode(tree, (node) => node.props?.role === 'alert'));
});
