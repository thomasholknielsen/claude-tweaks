import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateInitFixture } from '../scripts/generate-init-fixture.js';

const WORK_BACKEND_QUESTION = 'How should claude-tweaks store work records (captured ideas, specs, and everything /claude-tweaks:backlog, /claude-tweaks:dispatch, and /claude-tweaks:tidy act on)?';

// Captures the actor's resolved answer to the work-backend question, so this
// test can assert the answer_override actually resolves to "Local record
// files" rather than silently falling through to the actor's default
// pickRecommended behavior. Neither of /init's two real option labels
// contains the literal "(Recommended)" substring the default picker looks
// for ("GitHub issues (Recommended when a GitHub remote is available)" has
// text between "(Recommended" and the closing paren, so the exact-substring
// regex /\(Recommended\)/i does NOT match it) — so a wrong or stale `match`
// string in the script would silently produce the wrong answer with no
// error. This is the single most fragile detail of this script.
let capturedAnswer = null;
async function* fakeInitQuery({ prompt, options }) {
  const result = await options.canUseTool('AskUserQuestion', {
    questions: [{
      question: WORK_BACKEND_QUESTION,
      header: 'Work-record backend',
      multiSelect: false,
      options: [
        { label: 'GitHub issues (Recommended when a GitHub remote is available)', description: 'x' },
        { label: 'Local record files', description: 'y' },
      ],
    }],
  }, {});
  capturedAnswer = result.updatedInput.answers[WORK_BACKEND_QUESTION];

  fs.writeFileSync(path.join(options.cwd, 'CLAUDE.md'), '# Fake CLAUDE.md\n\nwork-backend: local-files\n');
  fs.mkdirSync(path.join(options.cwd, '.claude', 'rules'), { recursive: true });
  fs.writeFileSync(path.join(options.cwd, '.claude', 'rules', 'example.md'), '# Example rule\n');

  yield { type: 'assistant', message: { content: [{ type: 'text', text: 'Bootstrapped CLAUDE.md.' }] } };
  yield { type: 'result', total_cost_usd: 0.01, usage: { input_tokens: 10, output_tokens: 20 } };
}

test('generateInitFixture: the work-backend answer_override resolves to "Local record files", and the resulting CLAUDE.md + rules get copied into outputDir', async () => {
  const outputDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-init-fixture-')), 'init-baseline');
  capturedAnswer = null;

  const result = await generateInitFixture({ queryFn: fakeInitQuery, outputDir });

  assert.strictEqual(capturedAnswer, 'Local record files', 'the answer_override must resolve to "Local record files", not the actor default fallback');
  assert.strictEqual(result.outputDir, outputDir);
  assert.strictEqual(result.rulesCopied, 1);
  assert.strictEqual(result.costUsd, 0.01);
  assert.ok(result.toolCallCount >= 1);

  const claudeMd = fs.readFileSync(path.join(outputDir, 'CLAUDE.md'), 'utf8');
  assert.match(claudeMd, /work-backend: local-files/);
  const ruleFile = fs.readFileSync(path.join(outputDir, '.claude', 'rules', 'example.md'), 'utf8');
  assert.match(ruleFile, /Example rule/);
});

test('generateInitFixture: throws a clear error when /init does not produce a CLAUDE.md', async () => {
  async function* fakeQueryNoOutput({ options }) {
    await options.canUseTool('Read', { file_path: path.join(options.cwd, 'package.json') }, {});
    yield { type: 'assistant', message: { content: [{ type: 'text', text: 'Nothing written.' }] } };
    yield { type: 'result', total_cost_usd: 0.01, usage: { input_tokens: 10, output_tokens: 20 } };
  }
  const outputDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-init-fixture-')), 'init-baseline');

  await assert.rejects(
    () => generateInitFixture({ queryFn: fakeQueryNoOutput, outputDir }),
    /did not produce a CLAUDE\.md/
  );
});

test('generateInitFixture: does not copy a rules directory when /init created none', async () => {
  async function* fakeQueryNoRules({ options }) {
    fs.writeFileSync(path.join(options.cwd, 'CLAUDE.md'), '# Fake CLAUDE.md\n\nwork-backend: local-files\n');
    yield { type: 'assistant', message: { content: [{ type: 'text', text: 'Bootstrapped CLAUDE.md.' }] } };
    yield { type: 'result', total_cost_usd: 0.01, usage: { input_tokens: 10, output_tokens: 20 } };
  }
  const outputDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-init-fixture-')), 'init-baseline');

  const result = await generateInitFixture({ queryFn: fakeQueryNoRules, outputDir });

  assert.strictEqual(result.rulesCopied, 0);
  assert.strictEqual(fs.existsSync(path.join(outputDir, '.claude', 'rules')), false);
});
