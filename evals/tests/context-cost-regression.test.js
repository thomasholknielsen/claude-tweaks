import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { contextCostRegression } from '../assertions/context-cost-regression.js';
import { runAssertion } from '../assertions/index.js';
import { readHistory, appendHistoryEntry } from '../history.js';
import { runScenarioWith } from '../runner.js';

const EVALS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Prior runs, newest last. All passing, so all count toward the baseline.
const priors = (values, scenario = 'demo') => values.map((v, i) => ({
  scenario,
  startedAt: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
  allPassed: true,
  tokens: { cache_creation_input_tokens: v },
}));

const ctx = (current, history, scenario = 'demo') => ({
  scenarioName: scenario,
  tokens: current === null ? null : { cache_creation_input_tokens: current },
  history,
});

// ── Discrimination ──────────────────────────────────────────────────────────
// A synthetic inflated reading, not a real eval run: the whole point of the
// check is that it can be exercised without spending on the API.

test('fails on a synthetically inflated reading', () => {
  const history = priors([100000, 102000, 98000]); // median 100000
  const result = contextCostRegression(ctx(180000, history)); // +80%
  assert.strictEqual(result.pass, false);
  assert.match(result.message, /context-cost regression/);
  assert.match(result.message, /180000 vs baseline 100000/);
  assert.match(result.message, /\+80\.0%/);
});

test('passes on an honest reading at the same baseline', () => {
  const history = priors([100000, 102000, 98000]);
  const result = contextCostRegression(ctx(104000, history)); // +4%
  assert.strictEqual(result.pass, true);
  assert.match(result.message, /within the 50% ceiling/);
});

test('the boundary is exclusive — exactly at the ceiling still passes', () => {
  const history = priors([100000, 100000, 100000]);
  assert.strictEqual(contextCostRegression(ctx(150000, history)).pass, true);
  assert.strictEqual(contextCostRegression(ctx(150001, history)).pass, false);
});

test('a large DECREASE is not a failure', () => {
  const history = priors([100000, 100000, 100000]);
  const result = contextCostRegression(ctx(20000, history));
  assert.strictEqual(result.pass, true);
  assert.match(result.message, /-80\.0%/);
});

test('the ceiling is tunable per scenario', () => {
  const history = priors([100000, 100000, 100000]);
  assert.strictEqual(contextCostRegression(ctx(120000, history), { maxIncreasePct: 10 }).pass, false);
});

// ── The skip path — loud, never silent ──────────────────────────────────────

test('says SKIPPED and names the shortfall when history is too thin', () => {
  const result = contextCostRegression(ctx(100000, priors([100000, 100000])));
  assert.strictEqual(result.pass, true);
  assert.match(result.message, /^SKIPPED/);
  assert.match(result.message, /2 comparable prior run\(s\)/);
  assert.match(result.message, /NO regression check was performed/);
  assert.match(result.message, /1 more time\(s\)/);
});

test('an empty history skips rather than dividing by nothing', () => {
  const result = contextCostRegression(ctx(100000, []));
  assert.strictEqual(result.pass, true);
  assert.match(result.message, /^SKIPPED/);
  assert.match(result.message, /0 comparable prior run/);
});

test('a zero baseline skips instead of reporting an infinite increase', () => {
  const result = contextCostRegression(ctx(100000, priors([0, 0, 0])));
  assert.strictEqual(result.pass, true);
  assert.match(result.message, /^SKIPPED/);
  assert.match(result.message, /undefined/);
});

// ── What must never be counted as a baseline ────────────────────────────────

test('failing runs do not count toward the sample floor', () => {
  const history = priors([100000, 100000, 100000]);
  history[0].allPassed = false;
  const result = contextCostRegression(ctx(500000, history));
  assert.strictEqual(result.pass, true, 'two passing samples is under the floor');
  assert.match(result.message, /2 comparable prior run/);
});

test('another scenario\'s runs do not count', () => {
  const history = [...priors([100000, 100000, 100000], 'other'), ...priors([100000], 'demo')];
  const result = contextCostRegression(ctx(900000, history, 'demo'));
  assert.match(result.message, /^SKIPPED/);
  assert.match(result.message, /1 comparable prior run/);
});

test('entries with no token record do not count', () => {
  const history = priors([100000, 100000, 100000]);
  delete history[0].tokens;
  history[1].tokens = {};
  const result = contextCostRegression(ctx(900000, history));
  assert.match(result.message, /^SKIPPED/);
  assert.match(result.message, /1 comparable prior run/);
});

test('only the most recent `window` runs form the baseline', () => {
  // Five recent runs at 100k, plus older runs at 10k that must be ignored.
  const history = [...priors([10000, 10000, 10000]), ...priors([100000, 100000, 100000, 100000, 100000])
    .map((e, i) => ({ ...e, startedAt: new Date(Date.UTC(2026, 1, i + 1)).toISOString() }))];
  const result = contextCostRegression(ctx(130000, history));
  assert.strictEqual(result.pass, true, 'baseline must be 100000, not a mix pulled down by old runs');
  assert.match(result.message, /baseline 100000 \(median of 5 passing runs\)/);
});

// ── A missing measurement fails; it never quietly passes ────────────────────

test('a run with no usage data fails rather than skipping', () => {
  const result = contextCostRegression(ctx(null, priors([100000, 100000, 100000])));
  assert.strictEqual(result.pass, false);
  assert.match(result.message, /no cache_creation_input_tokens/);
});

// ── Wiring ──────────────────────────────────────────────────────────────────

test('registered in the assertion registry under its scenario type name', () => {
  const out = runAssertion(ctx(180000, priors([100000, 100000, 100000])), { type: 'context-cost-regression' });
  assert.strictEqual(out.type, 'context-cost-regression');
  assert.strictEqual(out.pass, false);
});

// ── End-to-end through runScenarioWith ──────────────────────────────────────
//
// The synthetic inflated reading, delivered the way a real run delivers it: as
// the SDK result message's usage block. This proves the runner actually wires
// scenarioName/tokens/history into the assertion context, which no unit test of
// the assertion alone can show.

const fakeRunAt = (cacheCreationTokens) => async function* fake({ options }) {
  await options.canUseTool('Read', { file_path: '/tmp/x' }, {});
  yield { type: 'assistant', message: { content: [{ type: 'text', text: 'done' }] } };
  yield {
    type: 'result',
    total_cost_usd: 0.01,
    usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: cacheCreationTokens },
  };
};

async function runWithHistory(cacheCreationTokens, priorTokens) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-cost-'));
  const scenarioPath = path.join(dir, 'cost-demo.yaml');
  fs.writeFileSync(scenarioPath, [
    'name: cost-demo',
    'fixture:',
    '  base: none',
    '  seed: []',
    'skill_invocation:',
    '  prompt: "hello"',
    'assertions:',
    '  - type: context-cost-regression',
  ].join('\n'));

  const historyPath = path.join(dir, 'history.jsonl');
  priorTokens.forEach((t, i) => appendHistoryEntry(historyPath, {
    scenario: 'cost-demo',
    startedAt: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
    allPassed: true,
    tokens: { cache_creation_input_tokens: t },
  }));

  const [result] = await runScenarioWith(scenarioPath, {
    queryFn: fakeRunAt(cacheCreationTokens),
    resultsDir: path.join(dir, 'results'),
    fixturesDir: dir,
    historyPath,
  });
  return result.assertions.find((a) => a.type === 'context-cost-regression');
}

test('end-to-end: an inflated run fails, an honest run at the same baseline passes', async () => {
  const priors = [100000, 102000, 98000]; // median 100000

  const inflated = await runWithHistory(180000, priors);
  assert.strictEqual(inflated.pass, false, inflated.message);
  assert.match(inflated.message, /context-cost regression/);

  const honest = await runWithHistory(101000, priors);
  assert.strictEqual(honest.pass, true, honest.message);
  assert.ok(!honest.message.startsWith('SKIPPED'), 'a live baseline existed, so it must have been used');
});

test('end-to-end: a thin history reports SKIPPED instead of passing quietly', async () => {
  const skipped = await runWithHistory(999999, [100000]);
  assert.strictEqual(skipped.pass, true);
  assert.match(skipped.message, /^SKIPPED/);
});

test('the real history.jsonl gives the wired scenario a live baseline', () => {
  const scenario = 'dispatch-local-files-preflight-stop';
  const yaml = fs.readFileSync(path.join(EVALS_ROOT, 'scenarios', `${scenario}.yaml`), 'utf8');
  assert.ok(yaml.includes('context-cost-regression'), 'the scenario must declare the check');

  const history = readHistory(path.join(EVALS_ROOT, 'history.jsonl'));
  const passing = history.filter(
    (e) => e.scenario === scenario && e.allPassed
      && Number.isFinite(e.tokens && e.tokens.cache_creation_input_tokens),
  );

  // If this scenario ever drops below the floor the check must SAY so, not
  // start passing quietly — that is the property under test, not the count.
  const probe = contextCostRegression(ctx(1, history, scenario));
  if (passing.length < 3) {
    assert.match(probe.message, /^SKIPPED/);
  } else {
    assert.strictEqual(probe.pass, true, 'a 1-token run is not a regression');
    assert.ok(!probe.message.startsWith('SKIPPED'), 'a live baseline exists, so it must be used');
    // And the same live history rejects a doubled reading.
    const baseline = probe.message.match(/baseline (\d+)/)[1];
    const inflated = contextCostRegression(ctx(Number(baseline) * 2, history, scenario));
    assert.strictEqual(inflated.pass, false, 'doubling the live baseline must fail');
  }
});
