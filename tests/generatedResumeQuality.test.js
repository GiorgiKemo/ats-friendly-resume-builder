import test from 'node:test';
import assert from 'node:assert/strict';

import { hardenGeneratedResumeForAts } from '../src/utils/generatedResumeQuality.js';

test('hardenGeneratedResumeForAts removes parser-hostile formatting and preserves AI keyword analysis', () => {
  const resume = hardenGeneratedResumeForAts({
    selectedTemplate: 'modern',
    selectedFont: 'Comic Sans MS',
    personalInfo: {
      fullName: '<b>Giorgi Kemoklidze</b>',
      email: 'giorgi@example.com',
      jobTitle: '# Software Engineer',
      summary: 'I am a React engineer with 4+ years of experience. I have built accessible product interfaces for SaaS teams.',
    },
    skills: ['React', 'React', 'C#', 'TypeScript | JavaScript'],
    workExperience: [
      {
        title: 'Frontend Developer',
        company: 'Example Co',
        startDate: 'January 2022',
        endDate: 'January 2024',
        description: '<ul><li>Responsible for developing React dashboards.</li><li>Worked on TypeScript components.</li></ul>',
      },
    ],
    keywordAnalysis: {
      source: 'ai',
      keywords: ['React', 'ATS', 'React'],
      technical_skills: ['TypeScript', 'C#'],
      soft_skills: ['collaboration'],
      ats_tips: ['Use truthful keywords.'],
    },
  }, {
    jobDescription: 'We need React, TypeScript, C#, ATS-friendly resume parsing experience.',
    length: 'standard',
  });

  assert.equal(resume.selectedTemplate, 'ats-friendly');
  assert.equal(resume.selectedFont, 'Arial');
  assert.equal(resume.keywordAnalysis.source, 'ai');
  assert.deepEqual(resume.keywordAnalysis.keywords, ['React', 'ATS']);
  // Formatting must not turn a stated responsibility into a completed accomplishment.
  assert.ok(resume.workExperience[0].description.startsWith('- Responsible for developing React dashboards.'));
  assert.ok(!resume.workExperience[0].description.includes('<li>'));
  assert.ok(!resume.workExperience[0].description.includes('|'));
  assert.ok(resume.personalInfo.summary.startsWith('I am a React engineer'));
  assert.ok(resume.atsQuality.score >= 75);
});

test('hardenGeneratedResumeForAts ranks real skills by job relevance without inventing missing skills', () => {
  const resume = hardenGeneratedResumeForAts({
    personalInfo: {
      fullName: 'Giorgi Kemoklidze',
      email: 'giorgi@example.com',
      jobTitle: 'Software Engineer',
      summary: 'Software engineer with 4+ years of experience building web applications.',
    },
    skills: ['Figma', 'Cooking', 'JavaScript', 'React'],
    workExperience: [
      {
        title: 'Frontend Developer',
        company: 'Example Co',
        startDate: 'January 2022',
        description: 'Built React applications. Improved JavaScript performance.',
      },
    ],
    keywordAnalysis: {
      source: 'ai',
      keywords: ['React', 'JavaScript', 'Node.js'],
      technical_skills: ['Node.js'],
    },
  }, {
    jobDescription: 'React JavaScript Node.js role.',
    length: 'concise',
  });

  assert.deepEqual(resume.skills.slice(0, 2), ['JavaScript', 'React']);
  assert.ok(!resume.skills.includes('Node.js'));
  assert.ok(resume.atsQuality.missingKeywords.includes('Node.js'));
});

test('hardenGeneratedResumeForAts drops unsupported AI-added sections but keeps profile languages', () => {
  const resume = hardenGeneratedResumeForAts({
    personalInfo: {
      fullName: 'Giorgi Kemoklidze',
      email: 'giorgi@example.com',
      jobTitle: 'Software Engineer',
      summary: 'Software engineer with 4+ years of experience building web applications.',
    },
    skills: ['React', 'JavaScript'],
    additionalSections: [
      {
        title: 'Publications',
        content: 'Invented publication that was not in the profile.',
      },
    ],
  }, {
    jobDescription: 'React engineer role.',
    sourceProfile: {
      languages: [
        { name: 'English', level: 'Fluent' },
        { language: 'Georgian', proficiency: 'Native' },
      ],
    },
  });

  assert.deepEqual(resume.additionalSections, [
    { title: 'Languages', content: 'English - Fluent, Georgian - Native' },
  ]);
});

test('ATS hardening preserves international skills and does not split decimals or technical names', () => {
  const resume = hardenGeneratedResumeForAts({
    skills: ['日本語', 'ქართული', 'C', 'C#', 'C++'],
    workExperience: [{
      title: 'Engineer', company: 'Example',
      description: 'Built Node.js APIs. Reduced latency by 25.5% using .NET.',
    }],
    keywordAnalysis: { keywords: ['C', 'C#', 'C++', '.NET', 'Node.js', 'SQL'] },
  });
  assert.deepEqual(resume.skills, ['C', 'C#', 'C++', '日本語', 'ქართული']);
  assert.equal(resume.workExperience[0].description, '- Built Node.js APIs.\n- Reduced latency by 25.5% using .NET.');
  assert.deepEqual(resume.atsQuality.matchedKeywords, ['C', 'C#', 'C++', '.NET', 'Node.js']);
});

test('keyword matching respects technical word boundaries and does not claim C from C++', () => {
  const resume = hardenGeneratedResumeForAts({
    skills: ['C++', 'SQLAlchemy', '.NETFramework'],
    keywordAnalysis: { keywords: ['C', 'SQL', '.NET'] },
  });
  assert.deepEqual(resume.atsQuality.matchedKeywords, []);
});

test('generated profile flags cannot authorize unsupported additional sections', () => {
  const resume = hardenGeneratedResumeForAts({
    additionalSections: [{ title: 'Awards', content: 'Invented award', fromProfile: true }],
  }, { sourceProfile: {} });
  assert.deepEqual(resume.additionalSections, []);
});
