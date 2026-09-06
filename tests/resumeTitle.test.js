import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJobDescription } from '../src/utils/jobDescriptionParser.js';
import { deriveResumeTitle, extractCompanyFromJobDescription } from '../src/utils/resumeTitle.js';

test('resume titles and tracker company extraction cannot promote a mentioned tool into an unknown employer', () => {
  const description = 'Job Title: Designer\nExperience working with Figma, Sketch and other design tools.';
  assert.equal(parseJobDescription(description).company, '');
  assert.equal(extractCompanyFromJobDescription(description), '');
  assert.equal(deriveResumeTitle({}, description), 'Designer Resume');
});

for (const [description, company, title] of [
  ['Job Title: Designer\nCompany: Figma\nUse accessible design practices.', 'Figma', 'Designer - Figma'],
  ['Product Designer at Cedar Studio. Build thoughtful experiences.', 'Cedar Studio', 'Product Designer - Cedar Studio'],
  ['Software Engineer - Support Technologies\nBuild services.', 'Support Technologies', 'Software Engineer - Support Technologies'],
  ["We're hiring a Product Designer at Cedar Studio. Build thoughtful experiences.", 'Cedar Studio', 'Product Designer - Cedar Studio'],
]) {
  test(`genuine parsed employer remains available for resume titles: ${company} / ${description.split('\n')[0]}`, () => {
    assert.equal(extractCompanyFromJobDescription(description), company);
    assert.equal(deriveResumeTitle({}, description), title);
  });
}

test('an unknown employer keeps source-based naming and never overwrites an explicit resume title', () => {
  assert.equal(extractCompanyFromJobDescription(''), '');
  assert.equal(extractCompanyFromJobDescription(null), '');
  assert.equal(deriveResumeTitle({ personalInfo: { fullName: 'Candidate' } }), 'Candidate Resume');
  assert.equal(deriveResumeTitle({ title: 'My chosen role portfolio' }, 'Job Title: Designer\nCompany: Cedar Studio'), 'My chosen role portfolio');
});
