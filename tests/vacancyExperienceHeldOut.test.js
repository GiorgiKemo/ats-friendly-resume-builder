import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the real extension entry point, loading its shared classic script
// when present. No cloned parser expressions or live browser/provider calls.
const source = readFileSync(new URL('../browser-agent/content-job-board.js', import.meta.url), 'utf8');
const parsed = ts.createSourceFile('content-job-board.js', source, ts.ScriptTarget.Latest, true);
let wrapper;
const visit = node => {
  if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === 'extractExperienceYears') wrapper = node.initializer.getText(parsed);
  ts.forEachChild(node, visit);
};
visit(parsed);
assert.ok(wrapper, 'Actual extension requirement entry point is present');
const context = vm.createContext({});
const helperPath = new URL('../browser-agent/vacancy-experience.js', import.meta.url);
if (existsSync(helperPath)) vm.runInContext(readFileSync(helperPath, 'utf8'), context);
const extract = vm.runInContext(`(${wrapper})`, context);

const cases = [
  ['required range uses lower bound, not preferred maximum', 'Required qualifications:\n3–5 years of experience developing software.\nPreferred qualifications:\n8+ years of experience leading teams.', 3],
  ['ASCII range has one lower bound', 'Minimum requirements: 4-7 years of experience.', 4],
  ['word range has one lower bound', 'Required: 2 to 4 years of experience.', 2],
  ['zero-ended junior range remains zero', 'Required: 0–2 years of experience.', 0],
  ['fractional required years stay fractional', 'Required: 1.5 years of experience.', 1.5],
  ['required plus preserves its lower bound', 'Requirements: 6+ years of relevant experience.', 6],
  ['preferred-only years do not become mandatory', 'Preferred qualifications:\n9 years of experience.', null],
  ['inline preferred years are excluded', '3 years of experience required; 8 years of experience preferred.', 3],
  ['optional heading applies through indented bullets', '  Nice-to-have:\n- 8+ years of experience.\n- Familiarity with Go.', null],
  ['later required heading resets preferred context', 'Preferred:\n8 years of experience.\nMinimum requirements:\n2 years of experience.', 2],
  ['company history is not candidate experience', 'Our company has 40 years of experience serving local businesses.', null],
  ['collective team experience is not a requirement', 'Our team brings 25 years of combined experience.', null],
  ['history plus a real requirement uses only candidate evidence', 'Our company has 40 years of experience.\nRequirements:\n3 years of experience.', 3],
  ['different scoped requirements remain ambiguous', 'Required: 5 years of engineering experience and 2 years of management experience.', null],
  ['equal numeric values with distinct scopes remain ambiguous', 'Required: 3 years of backend experience and 3 years of frontend experience.', null],
  ['two unlabeled distinct requirements cannot be merged', 'Required:\n4 years of experience in accounting.\n2 years of experience in management.', null],
  ['exact duplicate evidence does not invent ambiguity', 'Required:\n3 years of experience.\n3 years of experience.', 3],
  ['explicit no-experience requirement stays zero despite preferred history', 'No prior experience required.\nPreferred:\n3 years of experience.', 0],
  ['upper bound is not a minimum threshold', 'At most 5 years of experience.', null],
  ['strict lower bound is not an inclusive threshold', 'More than 5 years of experience.', null],
  ['reversed range is invalid rather than a maximum', 'Required: 7–3 years of experience.', null],
  ['calendar years and opening counts do not establish tenure', 'Founded in 1995. We have 12 openings. Join our growing team.', null],
  ['non-year duration is not silently converted', 'Required: 18 months of experience.', null],
  ['blank posting stays unknown', '', null],
  ['company introductory experience is not candidate tenure', 'With 20 years of experience, Cedar Labs builds software.', null],
  ['inline about-us experience is not a requirement', 'About us: 20 years of experience serving customers.', null],
  ['company possessive experience is not candidate tenure', 'At Cedar Labs, our 20 years of experience benefit every customer.', null],
  ['about-us heading does not imply a candidate requirement', 'About us:\n20 years of experience serving customers.', null],
  ['requirements heading resets company background scope', 'About us:\n20 years of experience serving customers.\nRequirements:\n3 years of experience.', 3],
  ['explicit candidate requirement is not excluded by have', 'Minimum requirements: You must have 3 years of experience.', 3],
];

for (const [label, posting, expected] of cases) {
  test(`held-out vacancy experience ${label}`, () => {
    assert.equal(extract(posting), expected, posting);
  });
}
