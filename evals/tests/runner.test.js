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
