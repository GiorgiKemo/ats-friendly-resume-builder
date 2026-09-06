import test from 'node:test';
import assert from 'node:assert/strict';
import { enforceAuthenticResumeSections } from '../src/utils/resumeAuthenticity.js';

const source = {
  personal: { fullName: 'Alex Morgan', summary: 'Designer building accessible products.' },
  workExperience: [
    { id: '40', title: 'Designer', company: 'Northstar', description: 'Built an accessible onboarding flow.' },
    { title: 'Designer', company: 'Fieldwork', description: 'Reduced support tickets by 25%.' },
  ],
  projects: [{ title: 'Portfolio', description: 'Created a React portfolio.' }],
  certifications: [{ name: 'Design course', issuer: 'School' }],
};

test('new numeric achievements cannot be borrowed from another job, metadata, or the target job', () => {
  for (const quantity of ['40%', '25%', '40', '$500', '10']) {
    const result = enforceAuthenticResumeSections({ workExperience: [{
      title: 'Designer', company: 'Northstar', description: `Improved outcomes by ${quantity}.`,
    }] }, source, { description: `Requires ${quantity} results.` });
    assert.equal(result.workExperience[0].description, source.workExperience[0].description);
    assert.equal(result.workExperience[0].responsibilities, source.workExperience[0].description);
  }
});

test('supported numeric and nonnumeric rewrites remain available', () => {
  const result = enforceAuthenticResumeSections({ workExperience: [
    { title: 'Designer', company: 'Northstar', description: 'Delivered an accessible onboarding experience.' },
    { title: 'Designer', company: 'Fieldwork', description: 'Cut support tickets by 25% with clearer workflows.' },
  ] }, source);
  assert.equal(result.workExperience[0].description, 'Delivered an accessible onboarding experience.');
  assert.equal(result.workExperience[1].description, 'Cut support tickets by 25% with clearer workflows.');
});

test('legacy position and employer fields retain their source identity through authenticity checks', () => {
  const result = enforceAuthenticResumeSections({ workExperience: [{
    jobTitle: 'Engineer', company: 'Northstar', description: 'Maintained production systems.',
  }] }, { workExperience: [{ position: 'Engineer', employer: 'Northstar', responsibilities: 'Maintained systems.' }] });
  assert.equal(result.workExperience[0].jobTitle, 'Engineer');
  assert.equal(result.workExperience[0].company, 'Northstar');
  assert.equal(result.workExperience[0].description, 'Maintained production systems.');
});

test('unsupported summary and project metrics retain the candidate source wording', () => {
  const result = enforceAuthenticResumeSections({
    personalInfo: { summary: 'Designer with 10 years of experience delivering 50% growth.' },
    projects: [{ title: 'Portfolio', description: 'Reached 50000 visitors.' }],
    certifications: [{ name: 'Design course', issuer: 'School', description: 'Top 1% graduate.' }],
  }, source);
  assert.equal(result.personalInfo.summary, source.personal.summary);
  assert.equal(result.projects[0].description, source.projects[0].description);
  assert.equal(result.certifications[0].description, '');
});

test('summary may reuse documented career metrics but percent and currency units are not interchangeable', () => {
  const valid = enforceAuthenticResumeSections({ personalInfo: { summary: 'Designer who reduced support tickets by 25%.' } }, source);
  assert.equal(valid.personalInfo.summary, 'Designer who reduced support tickets by 25%.');
  const invalid = enforceAuthenticResumeSections({ workExperience: [{
    title: 'Designer', company: 'Fieldwork', description: 'Saved $25 per customer.',
  }] }, source);
  assert.equal(invalid.workExperience[1].description, source.workExperience[1].description);
});
