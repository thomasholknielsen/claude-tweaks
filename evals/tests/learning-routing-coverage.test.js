// Guards the invariant #158 was filed about: every lesson in the frozen
// learning-routing corpus is actually exercised by some scenario.
//
// The corpus is the fixture that makes the classifier evals meaningful — a set
// of only obvious cases would pass against any classifier (IL-78). A corpus
// entry that no scenario runs has that same problem one layer up: it looks like
// coverage while measuring nothing. Before the runner had a matrix construct,
// four of seven entries were in exactly that state.
//
// This runs offline: it reads scenario YAML and expands the matrix, spending no
// API calls. It is the cheap check that keeps the expensive suite honest.
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
const CORPUS_REL = 'learning-routing-corpus/lessons.json';

function readScenarios() {
  return fs.readdirSync(SCENARIOS_DIR)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => loadYaml(fs.readFileSync(path.join(SCENARIOS_DIR, f), 'utf8')));
}

// Which corpus entries each scenario exercises: a dedicated file declares one
// via covers_corpus_entry; a matrix scenario over this corpus contributes every
// entry its exclude list did not drop.
function coverageByEntry() {
  const covered = new Map();
  const claim = (id, scenarioName) => {
    if (!covered.has(id)) covered.set(id, []);
    covered.get(id).push(scenarioName);
  };
  for (const scenario of readScenarios()) {
    if (scenario.covers_corpus_entry) claim(scenario.covers_corpus_entry, scenario.name);
    if (scenario.matrix && scenario.matrix.corpus === CORPUS_REL) {
      for (const c of expandMatrix(scenario, FIXTURES_DIR)) {
        // expandMatrix names each case `<scenario>[<entry id>]`.
        claim(c.name.slice(scenario.name.length + 1, -1), scenario.name);
      }
    }
  }
  return covered;
}

test('every learning-routing corpus lesson is exercised by exactly one scenario', () => {
  const corpus = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, CORPUS_REL), 'utf8'));
  const corpusIds = corpus.lessons.map((l) => l.id);
  const covered = coverageByEntry();

  const uncovered = corpusIds.filter((id) => !covered.has(id));
  assert.deepStrictEqual(uncovered, [], `corpus lessons exercised by no scenario: ${uncovered.join(', ')}`);

  const doubled = [...covered.entries()].filter(([, names]) => names.length > 1);
  assert.deepStrictEqual(
    doubled.map(([id, names]) => `${id} (${names.join(' + ')})`), [],
    'each duplicate costs a second real agent run for an answer already measured',
  );
});

test('no scenario names a corpus entry the corpus does not hold', () => {
  const corpus = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, CORPUS_REL), 'utf8'));
  const corpusIds = new Set(corpus.lessons.map((l) => l.id));

  // Catches the direction the coverage test cannot: a lesson renamed or removed
  // while one of the two hand-maintained id lists still names the old value.
  // Both lists are checked — covers_corpus_entry AND the matrix exclude — since
  // a stale exclude is invisible to coverage (an excluded id produces no case,
  // so it simply never appears) yet still means a dedicated scenario and the
  // matrix are both paying for the renamed lesson.
  const named = [];
  for (const scenario of readScenarios()) {
    if (scenario.covers_corpus_entry) named.push([scenario.covers_corpus_entry, `${scenario.name}.covers_corpus_entry`]);
    if (scenario.matrix && scenario.matrix.corpus === CORPUS_REL) {
      for (const id of scenario.matrix.exclude || []) named.push([id, `${scenario.name}.matrix.exclude`]);
    }
  }

  const orphans = named.filter(([id]) => !corpusIds.has(id)).map(([id, where]) => `${id} (${where})`);
  assert.deepStrictEqual(orphans, [], 'scenario declarations naming corpus ids that no longer exist');
});
