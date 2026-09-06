import test from 'node:test';
import assert from 'node:assert/strict';
import { enforceAuthenticResumeSections } from '../src/utils/resumeAuthenticity.js';

const repeated = [
  { id: 'inventory', title: 'Analyst', company: 'Oak', startDate: '2018', endDate: '2019', description: 'Maintained inventory records.' },
  { id: 'payroll', title: 'Analyst', company: 'Oak', startDate: '2023', endDate: '2024', description: 'Prepared payroll reports.' },
];
const mergeWork = (generated, source = repeated) => enforceAuthenticResumeSections({ workExperience: generated }, { workExperience: source }).workExperience;

test('reordered repeated roles match their own dates instead of sharing the first generated description', () => {
  const result = mergeWork([
    { title: 'Analyst', company: 'Oak', startDate: '2023', endDate: '2024', description: 'Produced payroll reports.' },
    { position: 'Analyst', employer: 'Oak', startDate: '2018', endDate: '2019', description: 'Kept inventory records current.' },
  ]);
  assert.equal(result[0].description, 'Kept inventory records current.');
  assert.equal(result[1].description, 'Produced payroll reports.');
  assert.equal(result[0].startDate, '2018');
  assert.equal(result[1].startDate, '2023');
});

test('ambiguous repeated roles without identifying dates retain each original description', () => {
  const result = mergeWork([{ title: 'Analyst', company: 'Oak', description: 'Produced payroll reports.' }]);
  assert.deepEqual(result.map((role) => role.description), repeated.map((role) => role.description));
});

test('a unique source and generated record ID can disambiguate repeated titles without generated dates', () => {
  const result = mergeWork([{ id: 'payroll', title: 'Analyst', company: 'Oak', description: 'Produced payroll reports.' }]);
  assert.equal(result[0].description, repeated[0].description);
  assert.equal(result[1].description, 'Produced payroll reports.');
});

test('conflicting IDs or date identity cannot transfer a rewrite to another tenure', () => {
  for (const generated of [
    { id: 'payroll', title: 'Analyst', company: 'Oak', startDate: '2018', endDate: '2019', description: 'Misattributed payroll.' },
    { id: 'invented', title: 'Analyst', company: 'Oak', startDate: '2018', endDate: '2019', description: 'Misattributed payroll.' },
  ]) {
    const result = mergeWork([generated]);
    assert.deepEqual(result.map((role) => role.description), repeated.map((role) => role.description));
  }
});

test('duplicate generated identities and ambiguous partial dates fail closed', () => {
  const result = mergeWork([
    { id: 'payroll', title: 'Analyst', company: 'Oak', description: 'First candidate rewrite.' },
    { id: 'payroll', title: 'Analyst', company: 'Oak', description: 'Second candidate rewrite.' },
  ]);
  assert.deepEqual(result.map((role) => role.description), repeated.map((role) => role.description));
  const sameStart = repeated.map((role) => ({ ...role, startDate: '2018' }));
  const partial = mergeWork([{ title: 'Analyst', company: 'Oak', startDate: '2018', description: 'Ambiguous rewrite.' }], sameStart);
  assert.deepEqual(partial.map((role) => role.description), sameStart.map((role) => role.description));
});

test('duplicate source IDs require uniquely identifying dates rather than being treated as reliable IDs', () => {
  const source = repeated.map((role) => ({ ...role, id: 'duplicate' }));
  const ambiguous = mergeWork([{ id: 'duplicate', title: 'Analyst', company: 'Oak', description: 'Produced payroll reports.' }], source);
  assert.deepEqual(ambiguous.map((role) => role.description), source.map((role) => role.description));
  const dated = mergeWork([{ id: 'duplicate', title: 'Analyst', company: 'Oak', startDate: '2023', endDate: '2024', description: 'Produced payroll reports.' }], source);
  assert.equal(dated[0].description, source[0].description);
  assert.equal(dated[1].description, 'Produced payroll reports.');
});

test('unique title/employer rewrites remain available when generated dates and IDs are omitted', () => {
  const result = mergeWork([{ title: 'Analyst', company: 'Oak', description: 'Kept inventory records current.' }], [repeated[0]]);
  assert.equal(result[0].description, 'Kept inventory records current.');
});

test('blank work, education, project and certification descriptions cannot acquire generated prose', () => {
  const result = enforceAuthenticResumeSections({
    workExperience: [{ title: 'Analyst', company: 'Oak', description: 'Managed the organisation.', responsibilities: 'Directed all staff.' }],
    education: [{ institution: 'School', degree: 'BSc', description: 'Graduated with honours.' }],
    projects: [{ title: 'Portfolio', description: 'Operated a global service.' }],
    certifications: [{ name: 'Course', issuer: 'School', description: 'Licensed professional.' }],
  }, {
    workExperience: [{ title: 'Analyst', company: 'Oak', description: '  ' }],
    education: [{ institution: 'School', degree: 'BSc' }],
    projects: [{ title: 'Portfolio' }],
    certifications: [{ name: 'Course', issuer: 'School' }],
  });
  assert.equal(result.workExperience[0].description, '');
  assert.equal(result.workExperience[0].responsibilities, '');
  assert.equal(result.education[0].description, '');
  assert.equal(result.projects[0].description, '');
  assert.equal(result.certifications[0].description, '');
});

test('malformed source objects do not count as prose or authorize invented descriptions', () => {
  const result = enforceAuthenticResumeSections({
    workExperience: [{ title: 'Analyst', company: 'Oak', description: 'Directed all company operations.' }],
    education: [{ institution: 'School', degree: 'BSc', description: 'Graduated with honours.' }],
    projects: [{ title: 'Portfolio', description: 'Operated global infrastructure.' }],
    certifications: [{ name: 'Course', issuer: 'School', description: 'Licensed professional.' }],
  }, {
    workExperience: [{ title: 'Analyst', company: 'Oak', description: '', responsibilities: '', achievements: { id: 90 } }],
    education: [{ institution: 'School', degree: 'BSc', description: {} }],
    projects: [{ title: 'Portfolio', description: {}, details: '' }],
    certifications: [{ name: 'Course', issuer: 'School', description: [{ id: 20 }] }],
  });
  for (const section of ['workExperience', 'education', 'projects', 'certifications']) assert.equal(result[section][0].description, '');
});

test('real legacy prose is used when another source description alias is malformed', () => {
  const result = mergeWork([{ title: 'Analyst', company: 'Oak', description: 'Kept inventory records current.' }], [{
    title: 'Analyst', company: 'Oak', description: {}, responsibilities: ['Maintained inventory records.'],
  }]);
  assert.equal(result[0].description, 'Kept inventory records current.');
});

test('documented legacy prose can still be rewritten and a blank summary may synthesize career evidence', () => {
  const result = enforceAuthenticResumeSections({
    personalInfo: { summary: 'Analyst maintaining accurate inventory records.' },
    workExperience: [{ title: 'Analyst', company: 'Oak', description: 'Kept inventory records current.' }],
    projects: [{ title: 'Portfolio', description: 'Created a personal portfolio.' }],
  }, {
    personal: { fullName: 'Synthetic Candidate' },
    workExperience: [{ title: 'Analyst', company: 'Oak', responsibilities: 'Maintained inventory records.' }],
    projects: [{ title: 'Portfolio', details: 'Built a personal portfolio.' }],
  });
  assert.equal(result.personalInfo.summary, 'Analyst maintaining accurate inventory records.');
  assert.equal(result.workExperience[0].description, 'Kept inventory records current.');
  assert.equal(result.projects[0].description, 'Created a personal portfolio.');
});

test('structured IDs, titles, employers, dates and technologies are not numeric achievement evidence', () => {
  const role = { id: '10', title: 'Engineer 20', company: 'Studio 30', startDate: '2001', endDate: '2009', technologies: 'Tool 40', description: 'Maintained internal services.' };
  for (const quantity of ['10', '20', '30', '2001', '2009', '40']) {
    const result = enforceAuthenticResumeSections({
      personalInfo: { summary: `Led ${quantity} engineers.` },
      workExperience: [{ title: role.title, company: role.company, description: `Led ${quantity} engineers.` }],
    }, { personal: { summary: 'Engineer maintaining internal services.' }, workExperience: [role] });
    assert.equal(result.workExperience[0].description, role.description);
    assert.equal(result.personalInfo.summary, 'Engineer maintaining internal services.');
  }
});

test('numeric prose evidence does not collect metadata inside malformed object values', () => {
  const result = mergeWork([{ title: 'Analyst', company: 'Oak', description: 'Led 90 staff.' }], [{
    title: 'Analyst', company: 'Oak', description: 'Maintained records.', achievements: { id: 90 },
  }]);
  assert.equal(result[0].description, 'Maintained records.');
});

test('equivalent percent spelling is normalized in both directions without changing units or values', () => {
  for (const [sourceQuantity, generatedQuantity] of [['25%', '25 percent'], ['25 percent', '25%'], ['25.5 per cent', '25.5%']]) {
    const result = mergeWork([{ title: 'Analyst', company: 'Oak', description: `Reduced errors by ${generatedQuantity}.` }], [{
      title: 'Analyst', company: 'Oak', description: `Reduced errors by ${sourceQuantity}.`,
    }]);
    assert.equal(result[0].description, `Reduced errors by ${generatedQuantity}.`);
  }
  for (const generatedQuantity of ['26 percent', '$25', '25', '25‰']) {
    const result = mergeWork([{ title: 'Analyst', company: 'Oak', description: `Saved ${generatedQuantity}.` }], [{
      title: 'Analyst', company: 'Oak', description: 'Reduced errors by 25 percent.',
    }]);
    assert.equal(result[0].description, 'Reduced errors by 25 percent.');
  }
});
