import { test } from 'node:test';
import assert from 'node:assert';
import { createActor } from '../actor.js';

const SAMPLE_INPUT = {
  questions: [
    {
      question: 'Which effort tier?',
      header: 'Effort',
      options: [
        { label: 'Low' },
        { label: 'Medium (Recommended)' },
        { label: 'High' },
      ],
      multiSelect: false,
    },
  ],
};

test('default policy: auto-selects the option labeled (Recommended)', async () => {
  const actor = createActor();
  const result = await actor('AskUserQuestion', SAMPLE_INPUT, {});
  assert.strictEqual(result.behavior, 'allow');
  assert.strictEqual(result.updatedInput.answers['Which effort tier?'], 'Medium (Recommended)');
});

test('answerOverrides: a matching override takes priority over the default', async () => {
  const actor = createActor({ answerOverrides: [{ match: 'effort tier', answer: 'High' }] });
  const result = await actor('AskUserQuestion', SAMPLE_INPUT, {});
  assert.strictEqual(result.updatedInput.answers['Which effort tier?'], 'High');
});

test('non-AskUserQuestion tools are allowed unmodified', async () => {
  const actor = createActor();
  const result = await actor('Read', { file_path: '/tmp/x' }, {});
  assert.deepStrictEqual(result, { behavior: 'allow', updatedInput: { file_path: '/tmp/x' } });
});

test('falls back to the first option when none is marked (Recommended)', async () => {
  const actor = createActor();
  const input = { questions: [{ question: 'Pick one', header: 'X', options: [{ label: 'A' }, { label: 'B' }] }] };
  const result = await actor('AskUserQuestion', input, {});
  assert.strictEqual(result.updatedInput.answers['Pick one'], 'A');
});
