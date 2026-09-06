import test from 'node:test';
import assert from 'node:assert/strict';
import { parseJobDescription, formatJobExperience } from '../src/utils/jobDescriptionParser.js';

test('application call-to-action text is never used as the employer name', () => {
  for (const action of ['Apply', 'Apply now', 'Apply for this job']) {
    assert.equal(parseJobDescription(`Graduate Frontend Engineer - React/TypeScript\n${action}\nRequirements\nBuild accessible React interfaces.`).company, '');
  }
});

// Synthetic metadata probes, not a claim that free-text job interpretation is complete.
const titleCases = [
  {
    name: 'leading title/company sentence is not swallowed into a 120-character prose title',
    text: 'Product Designer at Cedar Studio. Design thoughtful onboarding experiences, collaborate with engineering and customer support, and present your research to the director.',
    title: 'Product Designer', company: 'Cedar Studio', category: 'designer', level: 'unknown',
  },
  {
    name: 'imported title wins over body references to other teams and reporting lines',
    text: 'Job Title: Product Designer\nCompany: Cedar Studio\nLocation: Remote\nEmployment Type: Contract\nJob Description:\nWork closely with software engineering, customer support, and the marketing director. This is not a management position.',
    title: 'Product Designer', company: 'Cedar Studio', category: 'designer', level: 'unknown',
  },
  {
    name: 'labeled support role is not reclassified by collaborating engineers',
    text: 'Role: Customer Support Specialist\nCompany: Cedar Studio\nCollaborate with senior software engineers and report to the director of operations.',
    title: 'Customer Support Specialist', company: 'Cedar Studio', category: 'customer_service', level: 'unknown',
  },
  {
    name: 'explicit senior developer title wins over customer-service body mentions',
    text: 'Senior Software Engineer\nCedar Labs\nBuild accessible software and collaborate with customer service. Present progress to the chief technology officer.',
    title: 'Senior Software Engineer', company: 'Cedar Labs', category: 'developer', level: 'senior',
  },
  {
    name: 'account executive is a sales role rather than executive seniority',
    text: 'Job Title: Account Executive\nCompany: Cedar Studio\nPartner with support and engineering teams, reporting to the sales director.',
    title: 'Account Executive', company: 'Cedar Studio', category: 'sales', level: 'unknown',
  },
  {
    name: 'a director title is explicit seniority instead of merely a body mention',
    text: 'Job Title: Director of Engineering\nCompany: Cedar Labs\nSupport our customers and mentor engineers.',
    title: 'Director of Engineering', company: 'Cedar Labs', category: 'developer', level: 'executive',
  },
];

for (const example of titleCases) {
  test(example.name, () => {
    const result = parseJobDescription(example.text);
    assert.equal(result.title, example.title);
    assert.equal(result.company, example.company);
    assert.equal(result.roleCategory, example.category);
    assert.equal(result.experience.level, example.level);
    assert.equal(result.experience.years, null);
  });
}

for (const separator of [' - ', ' | ', ' @ ', ' at ', ' — ']) {
  test(`title/company separator ${JSON.stringify(separator)} preserves C++ and .NET`, () => {
    const result = parseJobDescription(`Senior C++ / .NET Developer${separator}Cedar Labs\nDevelop desktop software and partner with customer support.`);
    assert.equal(result.title, 'Senior C++ / .NET Developer');
    assert.equal(result.company, 'Cedar Labs');
    assert.equal(result.roleCategory, 'developer');
    assert.equal(result.experience.level, 'senior');
  });
}

test('a labeled .NET title is preserved without interpreting its period as a sentence boundary', () => {
  const result = parseJobDescription('Job Title: .NET Developer\nCompany: Cedar Labs\nBuild C++ integrations.');
  assert.equal(result.title, '.NET Developer');
  assert.equal(result.company, 'Cedar Labs');
});

const experienceCases = [
  ['hyphenated required range uses its minimum rather than also matching the upper endpoint', '3-5 years of experience required.', 3],
  ['en-dash required range uses its minimum', '3–5 yrs of experience required.', 3],
  ['word-delimited required range uses its minimum', '3 to 5 years of experience required.', 3],
  ['required experience outranks a larger preferred figure', 'Requirements:\n3+ years of experience required.\nPreferred Qualifications:\n5+ years of experience preferred.', 3],
  ['preference order does not make preferred experience required', 'Preferred Qualifications:\n5+ years of experience preferred.\nRequirements:\n3+ years of experience required.', 3],
  ['same-line preferred figure does not replace the explicit required minimum', '3 years of experience required; 5 years of experience preferred.', 3],
  ['preferred-only experience is not advertised as a mandatory minimum', 'Preferred Qualifications:\n5+ years of experience preferred.', null],
  ['no experience requirement remains zero despite a preferred range', 'No experience required.\nPreferred: 1-2 years of experience.', 0],
  ['company age is not candidate experience', 'Cedar Labs has 20 years of experience building software.', null],
];

for (const [name, details, years] of experienceCases) {
  test(name, () => {
    const result = parseJobDescription(`Job Title: Software Engineer\nCompany: Cedar Labs\n${details}`);
    assert.equal(result.experience.years, years);
    if (years === null) assert.equal(result.experience.level, 'unknown');
    if (years === 0) assert.equal(result.experience.level, 'entry');
  });
}

test('years of experience alone do not invent an executive title or level', () => {
  const result = parseJobDescription('Job Title: Software Engineer\nCompany: Cedar Labs\n12+ years of experience required.');
  assert.equal(result.experience.years, 12);
  assert.notEqual(result.experience.level, 'executive');
});

test('a body without a role header does not turn its team references into a target title', () => {
  const result = parseJobDescription('Responsibilities\nYou will collaborate with engineering and support teams and send updates to a director.\nBenefits\nWe support flexible schedules.');
  assert.equal(result.title, '');
  assert.equal(result.company, '');
  assert.equal(result.roleCategory, 'general');
  assert.equal(result.experience.level, 'unknown');
});

test('unknown fields remain empty or explicitly unknown, without invented mid-level seniority', () => {
  const result = parseJobDescription('Job Title: Product Designer\nCreate accessible experiences.');
  for (const field of ['company', 'location', 'employmentType', 'salary']) assert.equal(result[field], '');
  assert.equal(result.experience.years, null);
  assert.equal(result.experience.level, 'unknown');
});

test('blank-input results have independent nested experience objects', () => {
  const first = parseJobDescription('');
  first.experience.level = 'executive';
  first.experience.years = 99;
  for (const input of ['', '   ', null, undefined]) {
    const result = parseJobDescription(input);
    assert.equal(result.title, '');
    assert.equal(result.roleCategory, 'general');
    assert.equal(result.experience.years, null);
    assert.equal(result.experience.level, 'unknown');
  }
});

test('experience display preserves explicit range wording instead of inventing an open-ended minimum', () => {
  const result = parseJobDescription('Job Title: Software Engineer\nRequirements: 3–5 years of experience.');
  assert.match(result.experience.requirementText, /3\s*[–-]\s*5/);
  const display = formatJobExperience(result.experience);
  assert.match(display, /3\s*[–-]\s*5/);
  assert.doesNotMatch(display, /(?:3|5)\+\s*years/);
});

test('experience formatter shows unknown as Not specified and supports legacy numeric fixtures conservatively', () => {
  assert.equal(formatJobExperience({ level: 'unknown', years: null, requirementText: '' }), 'Not specified');
  assert.equal(formatJobExperience(undefined), 'Not specified');
  assert.match(formatJobExperience({ level: 'senior', years: 4 }), /4.*years/i);
  assert.doesNotMatch(formatJobExperience({ level: 'senior', years: 4 }), /4\+|required/i);
  assert.match(formatJobExperience({ level: 'entry', years: 0, requirementText: 'No experience required' }), /No experience required/);
});

test('incidental role label in responsibilities cannot override the actual leading title', () => {
  const result = parseJobDescription('Product Designer\nCedar Studio\nResponsibilities\nDescribe your previous role: Engineering Director\nCollaborate on research.');
  assert.equal(result.title, 'Product Designer');
  assert.equal(result.company, 'Cedar Studio');
  assert.equal(result.experience.level, 'unknown');
});

test('incidental application title phrase is not a labeled job title', () => {
  const result = parseJobDescription('In your application title: Senior Director\nWe value curiosity.');
  assert.equal(result.title, '');
  assert.equal(result.experience.level, 'unknown');
});

for (const title of ['Vice President - Engineering', 'Senior Software Engineer - Backend', 'Product Designer - Platform']) {
  test(`department qualifier remains part of ${JSON.stringify(title)} instead of becoming an employer`, () => {
    const result = parseJobDescription(`${title}\nCedar Labs`);
    assert.equal(result.title, title);
    assert.equal(result.company, 'Cedar Labs');
  });
}

for (const header of ['Software Engineer - Support Technologies', 'Support Technologies | Software Engineer']) {
  test(`explicit employer header containing a role word is preserved: ${header}`, () => {
    const result = parseJobDescription(`${header}\nBuild services.`);
    assert.equal(result.title, 'Software Engineer');
    assert.equal(result.company, 'Support Technologies');
  });
}

test('an unlabeled Support Engineer is a role, not a sentence starting with the verb support', () => {
  const result = parseJobDescription('Support Engineer\nCedar Labs\nHelp customers resolve technical issues.');
  assert.equal(result.title, 'Support Engineer');
  assert.equal(result.company, 'Cedar Labs');
});

test('a tools sentence is neither the employer nor the location', () => {
  const result = parseJobDescription('Job Title: Designer\nExperience working with Figma, Sketch and other design tools.');
  assert.equal(result.company, '');
  assert.equal(result.location, '');
});

for (const heading of ['  Preferred Qualifications:', '- Preferred Qualifications:', '• Preferred Qualifications:']) {
  test(`optional section context survives heading formatting ${JSON.stringify(heading)}`, () => {
    const result = parseJobDescription(`Job Title: Software Engineer\n${heading}\n5 years of experience`);
    assert.equal(result.experience.years, null);
    assert.equal(formatJobExperience(result.experience), 'Not specified');
  });
}

test('different scoped requirements do not collapse to one confidently inferred minimum', () => {
  const result = parseJobDescription('Job Title: Software Engineer\nRequirements:\n3 years of Java experience\n5 years of software experience');
  assert.equal(result.experience.years, null);
  assert.equal(formatJobExperience(result.experience), 'Not specified');
});

test('At least qualifier remains visible instead of becoming an exact-duration claim', () => {
  const result = parseJobDescription('Job Title: Software Engineer\nAt least 3 years of experience required.');
  assert.equal(result.experience.years, 3);
  assert.match(formatJobExperience(result.experience), /At least 3 years/);
});

for (const qualifier of ['At most', 'Up to', 'More than']) {
  test(`${qualifier} experience constraint is displayed without inventing an inclusive minimum`, () => {
    const result = parseJobDescription(`Job Title: Software Engineer\n${qualifier} 3 years of experience.`);
    assert.equal(result.experience.years, null);
    assert.equal(result.experience.level, 'unknown');
    assert.ok(formatJobExperience(result.experience).includes(`${qualifier} 3 years`));
  });
}

test('Executive Assistant is not assigned executive seniority from its role name', () => {
  const result = parseJobDescription('Job Title: Executive Assistant\nCompany: Cedar Studio\nSupport the chief executive officer.');
  assert.equal(result.title, 'Executive Assistant');
  assert.equal(result.experience.level, 'unknown');
});

test('a Registered Nurse header is a profession rather than the inferred employer', () => {
  const result = parseJobDescription('Registered Nurse\nCedar Hospital\nProvide patient care.');
  assert.equal(result.title, 'Registered Nurse');
  assert.equal(result.company, 'Cedar Hospital');
});

test('a hiring statement separates its role from the named employer', () => {
  const result = parseJobDescription("We're hiring a Product Designer at Cedar Studio. Build thoughtful experiences.");
  assert.equal(result.title, 'Product Designer');
  assert.equal(result.company, 'Cedar Studio');
  assert.equal(result.experience.level, 'unknown');
});

test('legacy reversed experience word order retains its stated open-ended requirement', () => {
  const result = parseJobDescription('Job Title: Software Engineer\nRequirements: Experience of 3+ years required.');
  assert.equal(result.experience.years, 3);
  assert.match(formatJobExperience(result.experience), /3\+ years/);
});
