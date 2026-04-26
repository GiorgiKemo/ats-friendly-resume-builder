import test from 'node:test';
import assert from 'node:assert/strict';

import {
  enforceAuthenticResumeSections,
  sanitizeTargetJobTitle,
} from '../src/utils/resumeAuthenticity.js';
import { deriveResumeTitle } from '../src/utils/resumeTitle.js';

test('sanitizeTargetJobTitle removes target company and location context', () => {
  assert.equal(
    sanitizeTargetJobTitle('Graduate software engineer, Meetup (Warsaw)'),
    'Graduate software engineer'
  );

  assert.equal(
    sanitizeTargetJobTitle('Full-stack Developer - micro1 | Remote'),
    'Full-stack Developer'
  );
});

test('enforceAuthenticResumeSections strips invented work history and certifications', () => {
  const generated = {
    personalInfo: {
      fullName: 'Giorgi Kemoklidze',
      jobTitle: 'Graduate software engineer, Meetup (Warsaw)',
      location: 'Tbilisi, Georgia',
      summary: 'Tailored summary',
    },
    workExperience: [
      {
        title: 'Graduate software engineer, Meetup (Warsaw)',
        company: 'Silknet',
        location: 'Tbilisi, Georgia',
        startDate: 'January 2026',
        endDate: 'April 2026',
        description: 'Invented role',
      },
    ],
    certifications: [
      { name: 'AWS Certified Developer - Associate', issuer: 'Amazon Web Services', date: 'November 2025' },
    ],
    projects: [
      { title: 'MeetUpClone - Community Event Platform', description: 'Invented project' },
    ],
    skills: ['React', 'TypeScript'],
  };

  const sanitized = enforceAuthenticResumeSections(
    generated,
    {
      personal: {
        fullName: 'Giorgi Kemoklidze',
        email: 'gegakemoklidze@gmail.com',
        location: 'Tbilisi, Georgia',
      },
      workExperience: [],
      certifications: [],
      projects: [],
      skills: ['React'],
    },
    {
      title: 'Graduate software engineer, Meetup (Warsaw)',
      company: 'Meetup',
      location: 'Warsaw',
    }
  );

  assert.equal(sanitized.personalInfo.jobTitle, 'Graduate software engineer');
  assert.deepEqual(sanitized.workExperience, []);
  assert.deepEqual(sanitized.certifications, []);
  assert.deepEqual(sanitized.projects, []);
  assert.deepEqual(sanitized.skills, ['React']);
});

test('enforceAuthenticResumeSections preserves real work identity while allowing tailored descriptions', () => {
  const sanitized = enforceAuthenticResumeSections(
    {
      workExperience: [
        {
          title: 'Graduate software engineer',
          company: 'Meetup',
          location: 'Warsaw',
          description: 'Built event discovery UI with React and TypeScript.',
        },
      ],
    },
    {
      workExperience: [
        {
          title: 'Frontend Developer',
          company: 'Giorgi Codes',
          location: 'Tbilisi, Georgia',
          startDate: 'January 2025',
          endDate: 'April 2026',
          description: 'Built React applications.',
        },
      ],
    },
    { title: 'Graduate software engineer', company: 'Meetup', location: 'Warsaw' }
  );

  assert.equal(sanitized.workExperience[0].title, 'Frontend Developer');
  assert.equal(sanitized.workExperience[0].jobTitle, 'Frontend Developer');
  assert.equal(sanitized.workExperience[0].company, 'Giorgi Codes');
  assert.equal(sanitized.workExperience[0].location, 'Tbilisi, Georgia');
  assert.equal(sanitized.workExperience[0].description, 'Built event discovery UI with React and TypeScript.');
});

test('deriveResumeTitle uses a clean target role plus company', () => {
  const title = deriveResumeTitle(
    {},
    [
      'Job Title: Graduate software engineer, Meetup (Warsaw)',
      'Company: Meetup',
      'Location: Warsaw, Poland',
      'Job Description:',
      'Build consumer event discovery features.',
    ].join('\n')
  );

  assert.equal(title, 'Graduate software engineer - Meetup');
});
