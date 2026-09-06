import test from 'node:test';
import assert from 'node:assert/strict';
import { componentHarness, find, visit, textContent } from './helpers/componentHarness.js';

for (const [section, item, field] of [
  ['Education', { institution: 'University', degree: 'BSc', fieldOfStudy: 'Design', startDate: '2020-09' }, 'institution'],
  ['Certifications', { name: 'Certificate', issuer: 'Institute', issueDate: '2020-09' }, 'name'],
  ['WorkExperience', { title: 'Engineer', company: 'Company', startDate: '2020-09' }, 'title'],
  ['Projects', { title: 'Project' }, 'title'],
]) {
  test(`${section} rejects empty entries and keeps editing the correct record after deletion`, () => {
    let data = [{ ...item, [field]: 'First' }, { ...item, [field]: 'Second' }, { ...item, [field]: 'Third' }];
    const onChange = (next) => { data = next; };
    const app = componentHarness(`src/components/profile/${section}Section.jsx`, {
      props: { data, onChange }, globals: { window: { confirm: () => true } },
      imports: { '../ui/Input': { default: 'Input' }, '../ui/Textarea': { default: 'Textarea' }, '../ui/Button': { default: 'Button' } },
    });
    const render = () => app.setProps({ data, onChange });
    find(render(), (node) => node.type === 'Button' && textContent(node).startsWith('Add')).props.onClick();
    assert.equal(data.length, 3);
    assert.ok(find(render(), (node) => node.props?.role === 'alert'));
    visit(render(), (node) => node.type === 'button' && textContent(node) === 'Edit')[1].props.onClick();
    find(render(), (node) => node.type === 'Input' && node.props.name === field).props.onChange({ target: { name: field, value: 'Changed second' } });
    visit(render(), (node) => node.type === 'button' && textContent(node) === 'Delete')[0].props.onClick();
    find(render(), (node) => node.type === 'Button' && textContent(node).startsWith('Update')).props.onClick();
    assert.equal(data.length, 2);
    assert.equal(data[0][field], 'Changed second');
    assert.equal(data[1][field], 'Third');
    visit(render(), (node) => node.type === 'button' && textContent(node) === 'Edit')[0].props.onClick();
    visit(render(), (node) => node.type === 'button' && textContent(node) === 'Delete')[0].props.onClick();
    assert.ok(find(render(), (node) => node.type === 'Button' && textContent(node).startsWith('Add')), 'Deleting the edited record resets the form');
  });
}

test('profile skill editor shows legacy strings and untyped skills without losing their removal index', () => {
  let data = ['C++', { name: 'React' }, { name: 'Teamwork', type: 'soft' }];
  const app = componentHarness('src/components/profile/SkillsSection.jsx', {
    props: { data, onChange: (next) => { data = next; } },
    imports: { '../ui/Input': { default: 'Input' }, '../ui/Button': { default: 'Button' } },
  });
  const tree = app.render();
  assert.match(textContent(tree), /C\+\+/);
  assert.match(textContent(tree), /React/);
  find(tree, (node) => node.props?.['aria-label'] === 'Remove React').props.onClick();
  assert.equal(data.length, 2);
  assert.equal(data[0], 'C++');
  assert.equal(data[1].name, 'Teamwork');
});
