/* global process, URL, console */
import fs from 'node:fs/promises';
import path from 'node:path';
import { Packer } from 'docx';
import { buildTextPdf } from '../src/services/resumePdfDocument.js';
import { createResumeDocxDocument } from '../src/services/docxService.js';

// Local-only exporter verification. No accounts, AI providers, or storage calls.
const outputDir = path.resolve(process.argv[2] || 'playwright-audit/resume-exports');
await fs.mkdir(outputDir, { recursive: true });
const fontData = await fs.readFile(new URL('../src/assets/fonts/DejaVuSans.ttf', import.meta.url), 'base64');
const resume = {
  personalInfo: {
    fullName: 'José Müller გიორგი', jobTitle: 'Software Engineer',
    email: 'jose@example.com', location: 'Tbilisi, Georgia',
    summary: 'Software engineer building reliable tools for multilingual teams.',
  },
  workExperience: [{
    jobTitle: 'Software Engineer', company: 'Example', startDate: '2022-01', current: true,
    description: Array.from({ length: 7 }, (_, index) => `- Achievement ${index + 1}: improved an existing product workflow.`).join('\n'),
  }],
  education: [{ institution: 'University', degree: 'Computer Science', startDate: '2018', endDate: '2022' }],
  skills: ['C#', 'C++', 'Node.js'],
  projects: [{ title: 'Portfolio', technologies: ['React', 'Node.js'], startDate: '2023', endDate: '2024', description: 'Built a searchable catalogue.' }],
  additionalSections: [{ title: 'Languages', content: 'English, ქართული' }],
};
const { pdf } = await buildTextPdf(resume, fontData);
await fs.writeFile(path.join(outputDir, 'resume-unicode.pdf'), new Uint8Array(pdf.output('arraybuffer')));
await fs.writeFile(path.join(outputDir, 'resume-unicode.docx'), await Packer.toBuffer(createResumeDocxDocument(resume)));
console.log(`Created PDF and DOCX verification fixtures in ${outputDir}`);
