import test from 'node:test';
import assert from 'node:assert/strict';
import { mapResumeData } from '../src/utils/resumeDataMapper.js';
import { getResumeExportReadiness } from '../src/utils/resumeExportReadiness.js';
import { buildResumeBuilderSections, getResumeBuilderProgress, getNextRecommendedBuilderAction } from '../src/utils/resumeBuilderProgress.js';
import {
  parseResumeDate, formatResumeDate, calculateDurationInMonths, ensureEducationWorkConsistency,
} from '../src/utils/dateUtils.js';

test('mapping a root summary does not mutate the source personal information', () => {
  const source = { summary: 'Original summary', personalInfo: { fullName: 'Person' } };
  const mapped = mapResumeData(source);
  assert.equal(mapped.personalInfo.summary, 'Original summary');
  assert.equal(source.personalInfo.summary, undefined);
});

test('legacy job title aliases normalize without losing source metadata', () => {
  const source = { workExperience: [{ position: 'Engineer', company: 'Example', responsibilities: 'Built apps.', custom: 'Retain me' }] };
  const mapped = mapResumeData(source);
  assert.equal(mapped.workExperience[0].jobTitle, 'Engineer');
  assert.equal(mapped.workExperience[0].title, 'Engineer');
  assert.equal(mapped.workExperience[0].description, 'Built apps.');
  assert.equal(mapped.workExperience[0].custom, 'Retain me');
  assert.equal(source.workExperience[0].jobTitle, undefined);
});

test('education and employment can overlap without invented timeline changes', () => {
  const source = [{ institution: 'University', startDate: '2024-09', endDate: '2028-06', current: true }];
  const expected = structuredClone(source);
  const result = ensureEducationWorkConsistency(source, [{ startDate: '2025-01', current: true }]);
  assert.deepEqual(result, expected);
  assert.deepEqual(source, expected);
});

test('resume dates validate calendar dates and reject malformed inputs', () => {
  for (const invalid of ['13/2024', '2024-02-30', '02/30/2024', '2024-00', {}, 123]) {
    assert.equal(parseResumeDate(invalid), null, `${JSON.stringify(invalid)} should be invalid`);
  }
  for (const valid of ['2024-02', 'February 2024', 'Feb 2024', '02/2024']) {
    const date = parseResumeDate(valid);
    assert.equal(date.getFullYear(), 2024);
    assert.equal(date.getMonth(), 1);
    assert.equal(date.getDate(), 1);
  }
  assert.equal(parseResumeDate('2024-02-29').getDate(), 29);
  assert.equal(formatResumeDate('  Present  '), 'Present');
  assert.equal(formatResumeDate('2024'), '2024');
  assert.equal(calculateDurationInMonths('2025-01', '2024-01'), 0);
});

test('export readiness never calls missing contact information ready', () => {
  const resume = {
    personalInfo: { jobTitle: 'Engineer' },
    workExperience: [{ jobTitle: 'Engineer', company: 'Company' }],
    skills: ['React', 'JavaScript', 'CSS'],
  };
  assert.equal(getResumeExportReadiness(resume).readyToExport, false);
  resume.personalInfo.fullName = 'Person';
  resume.personalInfo.email = 'not-an-email';
  assert.equal(getResumeExportReadiness(resume).readyToExport, false);
});

test('export readiness accepts entry-level evidence and counts unique skills', () => {
  const resume = {
    personalInfo: { fullName: 'Person', email: 'person@example.com', jobTitle: 'Engineer' },
    education: [{ institution: 'University', degree: 'Computer Science' }],
    skills: ['React', 'JavaScript', 'CSS'],
  };
  assert.equal(getResumeExportReadiness(resume).readyToExport, true);
  assert.equal(getResumeExportReadiness({ ...resume, skills: ['React', 'react', ' React '] })
    .checks.find((check) => check.id === 'skills').complete, false);
  assert.equal(getResumeExportReadiness({
    ...resume, workExperience: [{ title: 'Engineer', company: 'Company' }],
  }).checks.find((check) => check.id === 'experience').complete, true);
});

test('builder progress accepts work OR education OR project evidence without forcing empty optional sections', () => {
  const base = {
    personalInfo: { fullName: 'Person', email: 'person@example.com', jobTitle: 'Engineer' },
    skills: ['React', 'JavaScript', 'CSS'], selectedTemplate: 'basic',
  };
  const evidence = [
    { workExperience: [{ position: 'Engineer', company: 'Example' }] },
    { education: [{ institution: 'University', degree: 'Computer Science' }] },
    { projects: [{ title: 'Portfolio', description: 'Built a portfolio.' }] },
  ];
  for (const section of evidence) {
    const sections = buildResumeBuilderSections({ ...base, ...section });
    assert.equal(getResumeBuilderProgress(sections).progress, 100);
    assert.equal(getNextRecommendedBuilderAction(sections).type, 'preview');
  }
  assert.ok(getResumeBuilderProgress(buildResumeBuilderSections(base)).progress < 100);
});

test('a deliberately blank headline does not block contact completion or recommend adding a target title', () => {
  const resume = {
    personalInfo: { fullName: 'Person', email: 'person@example.com', jobTitle: '' },
    education: [{ institution: 'University', degree: 'Computer Science' }],
    skills: ['React', 'JavaScript', 'CSS'], selectedTemplate: 'basic',
  };
  const sections = buildResumeBuilderSections(resume);
  const contact = sections.find(({ id }) => id === 'personalInfo');
  assert.equal(contact.complete, true);
  assert.equal(contact.detail, 'Name and email are ready.');
  assert.equal(getResumeBuilderProgress(sections).progress, 100);
  assert.equal(getNextRecommendedBuilderAction(sections).type, 'preview');
  assert.equal(getResumeExportReadiness(resume).readyToExport, true);
});

test('a headline cannot substitute for missing or invalid required contact details', () => {
  for (const personalInfo of [
    { jobTitle: 'Target role: CEO' },
    { fullName: 'Person', email: 'invalid', jobTitle: 'Target role: CEO' },
    { email: 'person@example.com', jobTitle: 'Target role: CEO' },
  ]) {
    const contact = buildResumeBuilderSections({ personalInfo }).find(({ id }) => id === 'personalInfo');
    assert.equal(contact.complete, false);
    assert.match(contact.detail, /^[01]\/2 essentials added$/);
  }
});
