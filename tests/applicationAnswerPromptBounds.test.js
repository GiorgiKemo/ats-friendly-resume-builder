import test, { before } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';

let bundled;
before(async () => {
  const result = await build({
    entryPoints: ['src/services/applicationAnswerService.js'], bundle: true, write: false, format: 'cjs', platform: 'node',
    define: { 'import.meta.env': JSON.stringify({ DEV: false }) },
    plugins: [{ name: 'isolated-application-answer-bounds', setup(builder) {
      builder.onResolve({ filter: /^\.\/supabase$/ }, () => ({ path: 'mock-supabase', namespace: 'isolated' }));
      builder.onLoad({ filter: /.*/, namespace: 'isolated' }, () => ({ contents: 'export const supabase = globalThis.testSupabase;', loader: 'js' }));
    } }],
  });
  bundled = result.outputFiles[0].text;
});

function service(responseText) {
  const prompts = [];
  const module = { exports: {} };
  vm.runInNewContext(bundled, {
    module, exports: module.exports, setTimeout, clearTimeout, AbortController, TextEncoder,
    console: { log() {}, warn() {}, error() {} },
    testSupabase: { functions: { invoke: async (_name, request) => {
      prompts.push(request.body.messages[0].content);
      return { data: { choices: [{ message: { content: responseText } }] } };
    } } },
  });
  return { module, prompts };
}

test('application answer prompts bound profile, job, and scraped form input before provider dispatch', async () => {
  const app = service('{"answers":[]}');
  const tailValues = [
    'PROFILE_NAME_TAIL', 'PROFILE_ANSWER_TAIL', 'PROFILE_SKILL_TAIL',
    'JOB_TITLE_TAIL', 'JOB_DESCRIPTION_TAIL', 'QUESTION_LABEL_TAIL', 'OPTION_TAIL',
  ];
  const long = (char, tail) => `${char.repeat(7000)}${tail}`;

  await app.module.exports.generateApplicationAnswers({
    profile: {
      candidate: { fullName: long('P', tailValues[0]), email: long('E', 'EMAIL_TAIL') },
      answers: { heardAbout: long('A', tailValues[1]) },
      skills: [long('S', tailValues[2])],
      experience: [{ title: long('X', 'EXPERIENCE_TITLE_TAIL'), description: long('D', 'EXPERIENCE_DESCRIPTION_TAIL') }],
    },
    job: { title: long('J', tailValues[3]), description: long('D', tailValues[4]), url: long('U', 'JOB_URL_TAIL') },
    questions: [{
      id: long('I', 'QUESTION_ID_TAIL'),
      label: long('L', tailValues[5]),
      options: [long('O', tailValues[6])],
      placeholder: long('H', 'PLACEHOLDER_TAIL'),
      currentValue: long('V', 'CURRENT_VALUE_TAIL'),
    }],
  });

  assert.equal(app.prompts.length, 1);
  tailValues.forEach((tail) => assert.doesNotMatch(app.prompts[0], new RegExp(tail)));
  assert.match(app.prompts[0], /\.\.\./);
});

test('application answer responses are limited to requested fields and bounded confidence/output', async () => {
  const app = service(JSON.stringify({ answers: [
    { id: 'field-1', answer: 'A'.repeat(3000), confidence: 'invalid' },
    { id: 'unrequested', answer: 'Do not return this.' },
    { id: 'field-1', answer: 'Duplicate should be dropped.', confidence: 'high' },
  ] }));

  const result = await app.module.exports.generateApplicationAnswers({
    profile: {},
    job: {},
    questions: [{ id: 'field-1', label: 'Why this role?' }, { id: 'field-2', label: 'Location?' }],
  });

  assert.equal(result.answers.length, 1);
  assert.equal(result.answers[0].id, 'field-1');
  assert.equal(result.answers[0].answer, `${'A'.repeat(2000)}...`);
  assert.equal(result.answers[0].confidence, 'medium');
});
