// Guards the invariant #180 exists to prevent: every entry in the frozen
// consequence-filter-cases corpus is actually exercised by some scenario. A
// corpus entry recorded but never run is coverage that measures nothing
// (IL-78) — exactly the failure mode this record's whole deliverable exists
// to close.
//
// Parallel to merge-check-coverage.test.js (#115) rather than a shared
// helper: the two are near-identical, but merge-check-coverage.test.js's own
// header comment documents why no corpus-scoping convention exists yet for a
// dedicated per-entry scenario file — extracting a shared helper now would
// need to invent that convention speculatively. Kept as parallel files
// matching the learning-routing-coverage.test.js precedent instead.
//
// Like its models, no dedicated per-entry scenario file exists for
// consequence-filter-cases.json today — every entry is exercised only
// through research-consequence-filter-matrix.yaml's matrix. So this file
// does not scan for a `covers_corpus_entry` declaration either: doing so
// unscoped would pick up merge-check's and learning-routing's own dedicated
// scenario files (they share this one evals/scenarios/ directory), which
// declare covers_corpus_entry against a completely different corpus and
// would read as false "orphan" hits here.
//
// This runs offline: it reads scenario YAML and expands the matrix, spending
// no API calls. It is the cheap check that keeps the expensive suite honest.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { load as loadYaml } from 'js-yaml';
import { expandMatrix } from '../runner.js';

const EVALS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCENARIOS_DIR = path.join(EVALS_ROOT, 'scenarios');
const FIXTURES_DIR = path.join(EVALS_ROOT, 'fixtures');
const CORPUS_REL = 'consequence-filter-cases.json';

function readScenarios() {
  return fs.readdirSync(SCENARIOS_DIR)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => loadYaml(fs.readFileSync(path.join(SCENARIOS_DIR, f), 'utf8')));
}

// Which corpus entries each scenario exercises: only a matrix scenario whose
// matrix.corpus is THIS corpus contributes — every entry its exclude list
// (empty today) did not drop.
function coverageByEntry() {
  const covered = new Map();
  const claim = (id, scenarioName) => {
    if (!covered.has(id)) covered.set(id, []);
    covered.get(id).push(scenarioName);
  };
  for (const scenario of readScenarios()) {
    if (scenario.matrix && scenario.matrix.corpus === CORPUS_REL) {
      for (const c of expandMatrix(scenario, FIXTURES_DIR)) {
        // expandMatrix names each case `<scenario>[<entry id>]`.
        claim(c.name.slice(scenario.name.length + 1, -1), scenario.name);
      }
    }
  }
  return covered;
}

test('every consequence-filter-cases entry is exercised by exactly one scenario', () => {
  const corpus = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, CORPUS_REL), 'utf8'));
  const corpusIds = corpus.cases.map((c) => c.id);
  const covered = coverageByEntry();

  const uncovered = corpusIds.filter((id) => !covered.has(id));
  assert.deepStrictEqual(uncovered, [], `corpus cases exercised by no scenario: ${uncovered.join(', ')}`);

  const doubled = [...covered.entries()].filter(([, names]) => names.length > 1);
  assert.deepStrictEqual(
    doubled.map(([id, names]) => `${id} (${names.join(' + ')})`), [],
    'each duplicate costs a second real agent run for an answer already measured',
  );
});

test('no scenario names a consequence-filter-cases entry the corpus does not hold', () => {
  const corpus = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, CORPUS_REL), 'utf8'));
  const corpusIds = new Set(corpus.cases.map((c) => c.id));

  // Catches the direction the coverage test cannot: an entry renamed or
  // removed while a matrix scenario's own exclude list still names the old
  // value — invisible to coverage since an excluded id produces no case, so
  // it simply never appears there.
  const named = [];
  for (const scenario of readScenarios()) {
    if (scenario.matrix && scenario.matrix.corpus === CORPUS_REL) {
      for (const id of scenario.matrix.exclude || []) named.push([id, `${scenario.name}.matrix.exclude`]);
    }
  }

  const orphans = named.filter(([id]) => !corpusIds.has(id)).map(([id, where]) => `${id} (${where})`);
  assert.deepStrictEqual(orphans, [], 'scenario declarations naming corpus ids that no longer exist');
});
