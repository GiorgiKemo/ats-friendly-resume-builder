import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('public marketing copy does not promise hiring outcomes', () => {
  const publicCopy = [
    read('src/pages/Pricing.jsx'),
    read('src/components/home/FeaturesSection.jsx'),
    read('src/components/home/HeroSection.jsx'),
    read('src/components/home/PremiumFeatures.jsx'),
    read('src/components/home/CTASection.jsx'),
    read('src/components/resume/TemplateSelector.jsx'),
    read('src/components/Seo.jsx'),
    read('index.html'),
    read('src/pages/AboutUs.jsx'),
    read('src/pages/Learn.jsx'),
    read('src/pages/FAQ.jsx'),
    read('src/utils/promptTemplates.js'),
    read('src/services/enhancedOpenaiService.js'),
    read('src/pages/SimpleResumeFlow.jsx'),
    read('src/components/ats/AtsCheckerDisplay.jsx'),
    read('src/services/atsRulesEngine.ts'),
    read('src/components/resume/EducationSection.jsx'),
    read('src/components/resume/WorkExperienceSection.jsx'),
    read('src/components/resume/CertificationsSection.jsx'),
    read('src/components/resume/ProjectsSection.jsx'),
    read('src/components/resume/EnhancedAIGenerator.jsx'),
    read('src/utils/resumeExportReadiness.js'),
    read('src/utils/generatedResumeQuality.js'),
    read('scripts/prerender-public-routes.mjs'),
  ].join('\n');

  assert.doesNotMatch(publicCopy, /job-winning resume/i);
  assert.doesNotMatch(publicCopy, /maximize your interview chances/i);
  assert.doesNotMatch(publicCopy, /land more interviews|get more interviews|get you noticed|impress employers|accelerate your job search|supercharge your (job hunt|results)|passes applicant tracking systems/i);
  assert.doesNotMatch(publicCopy, /deliver ATS-readable PDF and Word copies within two business days/i);
  assert.doesNotMatch(publicCopy, /ATS-compatible/i);
  assert.doesNotMatch(publicCopy, /ATS-optimized|boost ATS compatibility|pass through applicant tracking systems with high scores|Maximized for applicant tracking systems/i);
  assert.doesNotMatch(publicCopy, /Best for ATS|safest text-native parsing|pass through ATS filters|almost certainly|automatically discarded/i);
  assert.match(publicCopy, /clear, ATS-friendly resume/i);
  assert.match(publicCopy, /Industry-aware AI guidance/i);
  assert.match(publicCopy, /Target-location context/i);
});

test('privacy deletion guidance exposes a reviewed support path without promising immediate erasure', () => {
  const privacy = read('src/pages/PrivacyPolicy.jsx');
  const contact = read('src/pages/Contact.jsx');
  assert.match(privacy, /contact\?request=privacy-deletion/);
  assert.match(privacy, /does not delete an account immediately/);
  assert.match(contact, /privacy_deletion_request/);
  assert.match(contact, /Deletion requests are reviewed by support/);
});

test('public support forms expose the same field limits as the engagement endpoint', () => {
  const contact = read('src/pages/Contact.jsx');
  const footer = read('src/components/layout/Footer.jsx');
  assert.match(contact, /name="name"[\s\S]*maxLength=\{200\}/);
  assert.match(contact, /name="email"[\s\S]*maxLength=\{320\}/);
  assert.match(contact, /name="subject"[\s\S]*maxLength=\{200\}/);
  assert.match(contact, /name="message"[\s\S]*maxLength=\{5000\}/);
  assert.match(footer, /id="newsletter-email"[\s\S]*maxLength=\{320\}/);
});

test('newsletter results are announced accessibly instead of relying on toast visuals', () => {
  const footer = read('src/components/layout/Footer.jsx');
  assert.match(footer, /id="newsletter-feedback"/);
  assert.match(footer, /role=\{newsletterFeedback\.type === 'error' \? 'alert' : 'status'\}/);
  assert.match(footer, /aria-live=\{newsletterFeedback\.type === 'error' \? 'assertive' : 'polite'\}/);
});

test('pointer focus frames stay hidden without removing keyboard focus indicators', () => {
  const css = read('src/index.css');
  assert.match(css, /\*:\s*focus:not\(:focus-visible\)\s*\{[\s\S]*outline:\s*none\s*!important;/);
  assert.match(css, /\*:\s*focus:not\(:focus-visible\)\s*\{[\s\S]*--tw-ring-offset-shadow:\s*0 0 #0000\s*!important;/);
  assert.match(css, /\*:\s*focus:not\(:focus-visible\)\s*\{[\s\S]*--tw-ring-shadow:\s*0 0 #0000\s*!important;/);
  assert.match(css, /:where\(h1, h2, h3, h4, h5, h6, p, span, small, strong, em, li, dt, dd, blockquote, figcaption, code, pre, label, \[tabindex='-1'\]\):focus/);
  assert.match(css, /:focus-visible/);
});

test('marketing CTA uses semantic link navigation for the primary conversion path', () => {
  const cta = read('src/components/home/CTASection.jsx');
  assert.match(cta, /<Button[\s\S]*as="link"[\s\S]*to=\{user \? '\/new' : '\/signup'\}/);
  assert.doesNotMatch(cta, /useNavigate|handleGetStarted/);
});

test('hero CTA preserves native link behavior for the primary conversion path', () => {
  const hero = read('src/components/home/HeroSection.jsx');
  assert.match(hero, /<TouchLink[\s\S]*to=\{user \? '\/new' : '\/signup'\}/);
  assert.doesNotMatch(hero, /useNavigate|handleStartBuilding|preventDefault\(\)/);
});

test('pricing conversion controls use semantic links for navigation-only paths', () => {
  const pricing = read('src/pages/Pricing.jsx');
  assert.match(pricing, /useSearchParams/);
  assert.match(pricing, /requestedPlanId === 'premium_yearly' \|\| requestedPlanId === 'premium_monthly'/);
  assert.match(pricing, /<Button[\s\S]*as="link"[\s\S]*to=\{user \? '\/builder' : '\/signup\?plan=free'\}/);
  assert.match(pricing, /to=\{`\/signup\?plan=\$\{selectedPremiumPlan\.planId\}`\}/);
  assert.doesNotMatch(pricing, /useNavigate|handleFreePlanClick/);
});

test('signup preserves a validated pricing plan intent without invoking billing', () => {
  const signupPage = read('src/pages/SignUpPage.jsx');
  const signup = read('src/components/auth/SignUp.jsx');
  assert.match(signupPage, /useSearchParams/);
  assert.match(signupPage, /planId === 'free'/);
  assert.match(signupPage, /premium_monthly.*premium_yearly/);
  assert.match(signup, /aria-label="Selected plan"/);
  assert.match(signup, /Payment is not taken on this form/);
  assert.match(signup, /pricing\?plan=/);
  assert.doesNotMatch(signup, /StripeCheckout|PayPalCheckout/);
});

test('authenticated fallback navigation uses semantic dashboard links', () => {
  for (const path of [
    'src/pages/ResumePreview.jsx',
    'src/pages/ResumeBuilder.jsx',
    'src/pages/NewResume.jsx',
    'src/components/resume/EnhancedAIGenerator.jsx',
  ]) {
    const source = read(path);
    assert.match(source, /<Button[\s\S]*as="link"[\s\S]*to="\/dashboard"/);
  }
});

test('dashboard action controls cannot submit an enclosing form', () => {
  const dashboard = read('src/pages/Dashboard.jsx');
  assert.match(dashboard, /<motion\.button\s+type="button"\s+onClick=\{refreshSubscriptionStatus\}/);
  assert.match(dashboard, /<motion\.button\s+type="button"\s+className="text-gray-400/);
});

test('dashboard premium callouts use valid non-list wrappers', () => {
  const dashboard = read('src/pages/Dashboard.jsx');
  assert.doesNotMatch(dashboard, /<StaggeredContainer[\s\S]*<li className="flex items-center"/);
  assert.match(dashboard, /<StaggeredContainer[\s\S]*<div className="flex items-center"/);
});

test('recovery and contextual navigation use native links', () => {
  const stripeReturn = read('src/pages/StripeReturnPage.jsx');
  assert.match(stripeReturn, /<Link[\s\S]*to="\/subscription\/manage"[\s\S]*>\s*Check Subscription Status/);
  assert.match(stripeReturn, /<Link[\s\S]*to="\/pricing"[\s\S]*>\s*Return to Pricing/);

  const simpleFlow = read('src/pages/SimpleResumeFlow.jsx');
  assert.match(simpleFlow, /<Link[\s\S]*to="\/applications"[\s\S]*>\s*View Applications/);

  const newResume = read('src/pages/NewResume.jsx');
  assert.match(newResume, /<Link[\s\S]*to="\/pricing"[\s\S]*>\s*View plans/);

  const errorBoundary = read('src/components/ErrorBoundary.jsx');
  assert.match(errorBoundary, /<Link[\s\S]*to="\/"[\s\S]*>\s*Go to Home Page/);
});

test('pricing billing selector exposes an accessible exclusive choice', () => {
  const pricing = read('src/pages/Pricing.jsx');
  assert.match(pricing, /role="radiogroup"/);
  assert.match(pricing, /aria-label="Choose Premium billing period"/);
  assert.match(pricing, /role="radio"/);
  assert.match(pricing, /aria-checked=\{isSelected\}/);
  assert.match(pricing, /ArrowLeft/);
  assert.match(pricing, /ArrowRight/);
});

test('template chooser uses real previews and native pressed controls', () => {
  const selector = read('src/components/resume/TemplateSelector.jsx');
  for (const template of ['ATSFriendlyTemplate', 'BasicTemplate', 'MinimalistTemplate', 'TraditionalTemplate', 'ModernTemplate']) {
    assert.match(selector, new RegExp(`import ${template}`));
  }
  assert.match(selector, /<TemplatePreview template=\{template\.value\} \/>/);
  assert.match(selector, /<button[\s\S]*aria-pressed=\{currentResume\.selectedTemplate === template\.value\}/);
  assert.doesNotMatch(selector, /Optimized for ATS systems|maximum ATS compatibility/i);
});
