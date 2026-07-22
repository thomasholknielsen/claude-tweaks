import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runScenarioWith } from '../runner.js';

// A fake queryFn matching the shape runner.js expects: given a single
// { prompt, options } argument (matching the real SDK's query() signature),
// returns an async generator yielding SDKMessage-shaped objects, ending with a
// result message. Built as a real async generator function (not a pre-built
// array), so each call produces fresh output rather than a shared, eagerly-
// evaluated fixture.
async function* fakeQuery({ prompt, options }) {
  await options.canUseTool('Read', { file_path: '/tmp/x' }, {});
  yield { type: 'assistant', message: { content: [{ type: 'text', text: 'No findings — code is clean.' }] } };
  yield { type: 'result', total_cost_usd: 0.01, usage: { input_tokens: 100, output_tokens: 50 } };
}

// A multi-message fake matching real /claude-tweaks:review shape: a findings
// table appears in an early assistant message, followed by later narrative
// messages (e.g. Implementation Hindsight, Simplify, or a cascaded next
// skill) that also carry text but no table. Regression coverage for the bug
// Task 6's real run uncovered: resultText must accumulate every assistant
// text message, not just keep the last one — otherwise a later message with
// no table silently erases the earlier one that had it.
async function* fakeQueryMultiMessage({ prompt, options }) {
  await options.canUseTool('Read', { file_path: '/tmp/x' }, {});
  yield {
    type: 'assistant',
    message: {
      content: [{
        type: 'text',
        text: [
          '### Code Review Findings (confirmed)',
          '| Category | Finding | Severity | Action |',
          '|----------|---------|----------|--------|',
          '| security | SQL injection in src/auth.js | high | captured |',
        ].join('\n'),
      }],
    },
  };
  yield { type: 'assistant', message: { content: [{ type: 'text', text: '### Implementation Hindsight\nNo changes needed.' }] } };
  yield { type: 'assistant', message: { content: [{ type: 'text', text: '### Next Actions\nWrap up (Recommended).' }] } };
  yield { type: 'result', total_cost_usd: 0.02, usage: { input_tokens: 200, output_tokens: 100 } };
}

test('runScenarioWith: builds fixture, runs the fake query, evaluates assertions, writes a result file', async () => {
  const scenariosDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-scen-'));
  const scenarioPath = path.join(scenariosDir, 'sample.yaml');
  fs.writeFileSync(scenarioPath, [
    'name: sample',
    'fixture:',
    '  base: none',
    '  seed: []',
    'skill_invocation:',
    '  prompt: "hello"',
    'assertions:',
    '  - type: tool-called',
    '    name: Read',
    '    atLeast: 1',
  ].join('\n'));

  const resultsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-results-'));

  const result = await runScenarioWith(scenarioPath, { queryFn: fakeQuery, resultsDir, fixturesDir: scenariosDir });

  assert.strictEqual(result.allPassed, true);
  assert.strictEqual(result.costUsd, 0.01);
  assert.strictEqual(result.toolCallCount, 1);
  const written = fs.readdirSync(resultsDir);
  assert.strictEqual(written.length, 1);
});

test('runScenarioWith: resultText accumulates across assistant messages so an earlier findings table survives later narrative text', async () => {
  const scenariosDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-scen-'));
  const scenarioPath = path.join(scenariosDir, 'sample.yaml');
  fs.writeFileSync(scenarioPath, [
    'name: sample-multi-message',
    'fixture:',
    '  base: none',
    '  seed: []',
    'skill_invocation:',
    '  prompt: "hello"',
    'assertions:',
    '  - type: findings-include',
    '    severity: high',
    '    contains: "src/auth.js"',
  ].join('\n'));

  const resultsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-results-'));

  const result = await runScenarioWith(scenarioPath, { queryFn: fakeQueryMultiMessage, resultsDir, fixturesDir: scenariosDir });

  assert.strictEqual(result.allPassed, true, JSON.stringify(result.assertions));
  assert.strictEqual(result.assertions[0].pass, true);
});
