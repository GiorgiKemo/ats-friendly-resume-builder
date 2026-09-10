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

test('marketing CTA uses semantic link navigation for the primary conversion path', () => {
  const cta = read('src/components/home/CTASection.jsx');
  assert.match(cta, /<Button[\s\S]*as="link"[\s\S]*to=\{user \? '\/new' : '\/signup'\}/);
  assert.doesNotMatch(cta, /useNavigate|handleGetStarted/);
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
