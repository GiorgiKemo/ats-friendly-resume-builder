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

  assert.equal(sanitized.personalInfo.jobTitle, 'Target role: Graduate software engineer');
  assert.deepEqual(sanitized.workExperience, []);
  assert.deepEqual(sanitized.certifications, []);
  assert.deepEqual(sanitized.projects, []);
  assert.deepEqual(sanitized.skills, ['React']);
});

test('enforceAuthenticResumeSections does not attach an unrelated generated role description to real work', () => {
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
  assert.equal(sanitized.workExperience[0].description, 'Built React applications.');
});

test('authenticity preserves distinct technical and international skills and rejects unsupported skills', () => {
  const generated = { skills: ['Kubernetes', 'AWS'] };
  assert.deepEqual(enforceAuthenticResumeSections(generated, { skills: [] }).skills, []);
  assert.deepEqual(enforceAuthenticResumeSections(generated, {
    skills: ['C', 'C#', 'C++', 'C#', '日本語', 'ქართული'],
  }).skills, ['C', 'C#', 'C++', '日本語', 'ქართული']);
});

test('authenticity takes contact identity and links exclusively from the source profile', () => {
  const result = enforceAuthenticResumeSections({
    personalInfo: {
      fullName: 'Invented Name', email: 'invented@example.com', phone: '555-9999',
      location: 'Invented City', linkedin: 'https://linkedin.com/in/invented',
      github: 'https://github.com/invented',
    },
  }, {
    personal: { fullName: 'Real Name', professionalLinks: { linkedin: 'https://linkedin.com/in/real' } },
  });
  assert.equal(result.personalInfo.fullName, 'Real Name');
  assert.equal(result.personalInfo.email, '');
  assert.equal(result.personalInfo.phone, '');
  assert.equal(result.personalInfo.location, '');
  assert.equal(result.personalInfo.linkedin, 'https://linkedin.com/in/real');
  assert.equal(result.personalInfo.github, '');
});

test('authenticity matches reordered work with aliased titles and keeps tailored descriptions', () => {
  const result = enforceAuthenticResumeSections({
    workExperience: [
      { title: 'Engineer', company: 'Second', description: 'Tailored second role.' },
      { title: 'Engineer', company: 'First', description: 'Tailored first role.' },
    ],
  }, {
    workExperience: [
      { jobTitle: 'Engineer', company: 'First', description: 'Original first role.' },
      { jobTitle: 'Engineer', company: 'Second', description: 'Original second role.' },
    ],
  });
  assert.equal(result.workExperience[0].description, 'Tailored first role.');
  assert.equal(result.workExperience[1].description, 'Tailored second role.');
});

test('authenticity tolerates malformed generated sections and preserves project technologies', () => {
  const result = enforceAuthenticResumeSections({
    workExperience: { title: 'Invented' },
    projects: [{ title: 'Portfolio', technologies: 'AWS', description: 'Tailored portfolio.' }],
  }, {
    workExperience: [{ jobTitle: 'Engineer', company: 'First', description: 'Original role.' }],
    projects: [{ title: 'Portfolio', technologies: 'React', description: 'Original portfolio.' }],
  });
  assert.equal(result.workExperience[0].description, 'Original role.');
  assert.equal(result.projects[0].technologies, 'React');
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
