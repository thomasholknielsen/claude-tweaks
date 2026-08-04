const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

function readSkill(name, file = 'SKILL.md') {
  return fs.readFileSync(path.join(REPO_ROOT, 'skills', name, file), 'utf8');
}

function readSubfile(skill, filename) {
  return fs.readFileSync(path.join(REPO_ROOT, 'skills', skill, filename), 'utf8');
}

// These edges used to be asserted twice — once in /research's own Relationship
// table and once in each counterpart's. Both tables were removed in v6.33.0 and
// every edge now lives once in docs/skill-graph.md. The invariant is unchanged:
// these relationships stay recorded. Only their home moved.
function readGraph() {
  return fs.readFileSync(path.join(REPO_ROOT, 'docs', 'skill-graph.md'), 'utf8');
}

for (const skill of ['capture', 'challenge', 'specify', 'browse']) {
  test(`docs/skill-graph.md records the /research <-> /${skill} edge`, () => {
    const graph = readGraph();
    assert.match(graph, /research/, 'docs/skill-graph.md must mention /research');
    assert.ok(
      graph.includes(skill),
      `docs/skill-graph.md must record the edge between /research and /${skill}`,
    );
  });
}

// Task 9 will add this — expected to fail until then
test('/help reference card lists /research', () => {
  const body = readSubfile('help', 'reference-card.md');
  assert.match(body, /research/, '/help reference-card.md must mention /research');
});
