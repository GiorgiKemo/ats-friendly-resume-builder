import test from 'node:test';
import assert from 'node:assert/strict';
import { componentHarness, find, visit, textContent } from './helpers/componentHarness.js';
import { isProfileEntryDraftPending } from '../src/hooks/useProfileEntryDraft.js';

const setup = (section, initialData = []) => {
  let data = initialData;
  let draft = null;
  let app;
  const onChange = (next) => { data = next; };
  const onDraftChange = (next) => { draft = next; };
  const props = () => ({ data, draft, onChange, onDraftChange });
  const mount = () => {
    app = componentHarness(`src/components/profile/${section}Section.jsx`, {
      props: props(), globals: { window: { confirm: () => true } },
      imports: { '../ui/Input': { default: 'Input' }, '../ui/Textarea': { default: 'Textarea' }, '../ui/Button': { default: 'Button' } },
    });
  };
  mount();
  const render = () => app.setProps(props());
  return {
    render,
    get data() { return data; },
    get draft() { return draft; },
    input: (name, value) => find(render(), (node) => ['Input', 'Textarea'].includes(node.type) && node.props.name === name)
      .props.onChange({ target: { name, value, type: 'text' } }),
    click: (label) => find(render(), (node) => ['Button', 'button'].includes(node.type) && textContent(node) === label).props.onClick(),
    remount: () => { app.unmount(); mount(); return render(); },
  };
};

const entries = [
  { section: 'WorkExperience', field: 'title', partial: { title: 'Designer' }, required: { company: 'Studio', startDate: '2020-09' }, add: 'Add Experience', update: 'Update Experience' },
  { section: 'Education', field: 'institution', partial: { institution: 'University' }, required: { degree: 'BSc', fieldOfStudy: 'Design', startDate: '2020-09' }, add: 'Add This Qualification', update: 'Update This Qualification' },
  { section: 'Projects', field: 'title', partial: { description: 'Prototype with source details' }, required: { title: 'Accessible app' }, add: 'Add Project', update: 'Update Project' },
  { section: 'Certifications', field: 'name', partial: { name: 'Certificate' }, required: { issuer: 'Institute', issueDate: '2020-09' }, add: 'Add Certification', update: 'Update Certification' },
];

for (const { section, field, partial, required, add, update } of entries) {
  test(`${section} keeps an incomplete draft and its validation across section unmount, then commits only on Add`, () => {
    const app = setup(section);
    for (const [name, value] of Object.entries(partial)) app.input(name, value);
    assert.equal(isProfileEntryDraftPending(app.draft), true);
    app.click(add);
    assert.equal(app.data.length, 0);
    assert.ok(app.draft.formError);
    app.remount();
    for (const [name, value] of Object.entries(partial)) {
      assert.equal(find(app.render(), (node) => ['Input', 'Textarea'].includes(node.type) && node.props.name === name).props.value, value);
    }
    assert.ok(find(app.render(), (node) => node.props?.role === 'alert'));
    assert.equal(app.data.length, 0);
    for (const [name, value] of Object.entries(required)) app.input(name, value);
    assert.equal(app.data.length, 0, 'Valid typing still does not silently add an entry');
    app.click(add);
    assert.equal(app.data.length, 1);
    assert.equal(app.draft, null);
    assert.equal(isProfileEntryDraftPending(app.draft), false);
    app.remount();
    assert.equal(find(app.render(), (node) => node.type === 'Input' && node.props.name === field).props.value, '');
  });

  test(`${section} preserves the edited record and unknown metadata across unmount and index changes`, () => {
    const entry = { ...partial, ...required };
    const app = setup(section, [{ ...entry, [field]: 'First' }, { ...entry, [field]: 'Second', id: 'stable-id', sourceNote: 'Do not lose me' }]);
    visit(app.render(), (node) => node.type === 'button' && textContent(node) === 'Edit')[1].props.onClick();
    app.input(field, 'Revised second');
    assert.equal(app.draft.editIndex, 1);
    app.remount();
    assert.equal(find(app.render(), (node) => node.type === 'Input' && node.props.name === field).props.value, 'Revised second');
    visit(app.render(), (node) => node.type === 'button' && textContent(node) === 'Delete')[0].props.onClick();
    assert.equal(app.draft.editIndex, 0);
    app.remount();
    app.click(update);
    assert.equal(app.data.length, 1);
    assert.equal(app.data[0][field], 'Revised second');
    assert.equal(app.data[0].id, 'stable-id');
    assert.equal(app.data[0].sourceNote, 'Do not lose me');
    assert.equal(app.draft, null);
    app.input(field, 'A new uncommitted draft');
    app.click('Discard draft');
    app.remount();
    assert.equal(app.draft, null);
    assert.equal(app.data.length, 1);
    assert.equal(app.data[0][field], 'Revised second');
  });
}

test('Skills keeps its name, type and level across unmount and does not add until explicitly committed', () => {
  const app = setup('Skills');
  assert.equal(isProfileEntryDraftPending(app.draft), false);
  app.input('newSkill', 'React');
  find(app.render(), (node) => node.type === 'select').props.onChange({ target: { value: 'soft' } });
  find(app.render(), (node) => node.props?.['aria-label'] === 'Set proficiency to expert').props.onClick();
  app.remount();
  assert.equal(find(app.render(), (node) => node.type === 'Input').props.value, 'React');
  assert.equal(find(app.render(), (node) => node.type === 'select').props.value, 'soft');
  assert.equal(find(app.render(), (node) => node.props?.['aria-label'] === 'Set proficiency to expert').props['aria-pressed'], true);
  assert.equal(app.data.length, 0);
  assert.equal(isProfileEntryDraftPending(app.draft), true);
  app.click('Add Skill');
  assert.equal(app.data.length, 1);
  assert.equal(app.data[0].name, 'React');
  assert.equal(app.data[0].type, 'soft');
  assert.equal(app.data[0].level, 'expert');
  assert.equal(app.draft, null);
});

test('Skills defaults do not count as a draft, changed selectors do, and clearing its name discards the entry', () => {
  const app = setup('Skills');
  app.render();
  assert.equal(isProfileEntryDraftPending(app.draft), false);
  find(app.render(), (node) => node.type === 'select').props.onChange({ target: { value: 'soft' } });
  assert.equal(isProfileEntryDraftPending(app.draft), true);
  app.click('Add Skill');
  assert.equal(app.data.length, 0);
  assert.match(app.draft.formError, /skill name/);
  app.click('Discard draft');
  assert.equal(app.draft, null);
  app.input('newSkill', 'React');
  find(app.render(), (node) => node.props?.['aria-label'] === 'Set proficiency to advanced').props.onClick();
  app.input('newSkill', '');
  assert.equal(app.draft, null);
  assert.equal(isProfileEntryDraftPending(app.draft), false);
  app.remount();
  assert.equal(find(app.render(), (node) => node.type === 'Input').props.value, '');
  assert.equal(find(app.render(), (node) => node.type === 'select').props.value, 'technical');
  assert.equal(app.data.length, 0);
});
