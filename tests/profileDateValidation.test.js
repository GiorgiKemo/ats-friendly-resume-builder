import test from 'node:test';
import assert from 'node:assert/strict';
import { componentHarness, find, textContent } from './helpers/componentHarness.js';

const sections = [
  { name: 'WorkExperience', identity: { title: 'Engineer', company: 'Company' }, start: 'startDate', end: 'endDate', ongoing: 'current', required: true },
  { name: 'Education', identity: { institution: 'University', degree: 'BSc', fieldOfStudy: 'Design' }, start: 'startDate', end: 'endDate', ongoing: 'current', required: true },
  { name: 'Projects', identity: { title: 'Project' }, start: 'startDate', end: 'endDate', ongoing: 'current', required: false },
  { name: 'Certifications', identity: { name: 'Certificate', issuer: 'Institute' }, start: 'issueDate', end: 'expirationDate', ongoing: 'noExpiration', required: true },
];

function setup(section, initial = []) {
  const changes = [];
  const app = componentHarness(`src/components/profile/${section.name}Section.jsx`, {
    props: { data: initial, onChange: (data) => changes.push(data) },
    imports: { '../ui/Input': { default: 'Input' }, '../ui/Textarea': { default: 'Textarea' }, '../ui/Button': { default: 'Button' } },
  });
  const fill = (fields) => {
    for (const [name, value] of Object.entries(fields)) {
      find(app.render(), (node) => node.props?.name === name).props.onChange({ target: {
        name, value, type: typeof value === 'boolean' ? 'checkbox' : 'month', checked: value,
      } });
    }
  };
  const save = () => find(app.render(), (node) => node.type === 'Button' && /^(Add|Update)/.test(textContent(node))).props.onClick();
  const alert = () => find(app.render(), (node) => node.props?.role === 'alert');
  return { ...app, changes, fill, save, alert };
}

for (const section of sections) {
  if (section.required) test(`${section.name} enforces its marked required date without losing the unfinished entry`, () => {
    const app = setup(section);
    app.fill(section.identity);
    app.save();
    assert.equal(app.changes.length, 0);
    assert.match(textContent(app.alert()), /date|month/i);
    for (const [name, value] of Object.entries(section.identity)) {
      assert.equal(find(app.render(), (node) => node.props?.name === name).props.value, value);
    }
    app.fill({ [section.start]: '2024-06' });
    app.save();
    assert.equal(app.changes.length, 1);
    assert.equal(app.changes[0][0][section.start], '2024-06');
  });

  test(`${section.name} rejects malformed entered months instead of persisting them`, () => {
    for (const invalid of ['2024-00', '2024-13', '2024', '2024-2', '0000-01', 'not-a-date']) {
      for (const field of [section.start, section.end]) {
        const app = setup(section);
        app.fill({ ...section.identity, [section.start]: '2024-06', [field]: invalid });
        app.save();
        assert.equal(app.changes.length, 0, `${field}=${invalid}`);
        assert.ok(app.alert());
      }
    }
  });

  test(`${section.name} rejects reversed chronology but accepts matching start and end months`, () => {
    const app = setup(section);
    app.fill({ ...section.identity, [section.start]: '2024-06', [section.end]: '2024-05' });
    app.save();
    assert.equal(app.changes.length, 0);
    assert.match(textContent(app.alert()), /before/i);
    app.fill({ [section.end]: '2024-06' });
    app.save();
    assert.equal(app.changes.length, 1);
    assert.equal(app.changes[0][0][section.end], '2024-06');
  });

  test(`${section.name} retains optional end dates and does not validate disabled ongoing fields`, () => {
    const optional = setup(section);
    optional.fill({ ...section.identity, [section.start]: '2030-06' });
    optional.save();
    assert.equal(optional.changes.length, 1, 'No unrequested past/future or missing-end restriction');
    assert.equal(optional.changes[0][0][section.end], '');
    const ongoing = setup(section);
    ongoing.fill({ ...section.identity, [section.start]: '2024-06', [section.end]: '2023-01', [section.ongoing]: true });
    ongoing.save();
    assert.equal(ongoing.changes.length, 1);
    assert.equal(ongoing.changes[0][0][section.ongoing], true);
    assert.equal(ongoing.changes[0][0][section.end], '2023-01', 'An inactive value must not be silently replaced with an invented date');
  });

  test(`${section.name} cannot overwrite an existing row with invalid updated dates`, () => {
    const original = { ...section.identity, [section.start]: '2024-06', [section.end]: '2024-08' };
    const app = setup(section, [original]);
    find(app.render(), (node) => node.type === 'button' && textContent(node) === 'Edit').props.onClick();
    app.fill({ [section.end]: '2023-01' });
    app.save();
    assert.equal(app.changes.length, 0);
    assert.equal(original[section.end], '2024-08');
    assert.ok(app.alert());
  });
}

test('Projects deliberately permits omitted dates and a known end month without an invented start', () => {
  const section = sections.find((item) => item.name === 'Projects');
  for (const dates of [{}, { endDate: '2024-06' }]) {
    const app = setup(section);
    app.fill({ ...section.identity, ...dates });
    app.save();
    assert.equal(app.changes.length, 1);
    assert.equal(app.changes[0][0].startDate, '');
    assert.equal(app.changes[0][0].endDate, dates.endDate || '');
  }
});

test('Education checks its declared required field of study before committing an entry', () => {
  const section = sections.find((item) => item.name === 'Education');
  const app = setup(section);
  app.fill({ institution: 'University', degree: 'BSc', startDate: '2024-06', fieldOfStudy: ' ' });
  app.save();
  assert.equal(app.changes.length, 0);
  assert.match(textContent(app.alert()), /field of study/i);
  app.fill({ fieldOfStudy: 'Design' });
  app.save();
  assert.equal(app.changes[0][0].fieldOfStudy, 'Design');
});
