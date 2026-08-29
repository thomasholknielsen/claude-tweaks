'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const DEMO_SKILL_PATH = 'plugin/skills/demo/SKILL.md';
const BROWSER_REVIEW_PATH = 'plugin/skills/visual-review/browser-review.md';
const CONTRACT_PATH = 'plugin/skills/_shared/visual-decision.md';
const PLUGIN_STRUCTURE_PATH = 'docs/plugin-structure.md';
const SKILL_GRAPH_PATH = 'docs/skill-graph.md';

const demoSkill = fs.readFileSync(path.join(ROOT, DEMO_SKILL_PATH), 'utf8');
const browserReview = fs.readFileSync(path.join(ROOT, BROWSER_REVIEW_PATH), 'utf8');
const contract = fs.readFileSync(path.join(ROOT, CONTRACT_PATH), 'utf8');
const pluginStructure = fs.readFileSync(path.join(ROOT, PLUGIN_STRUCTURE_PATH), 'utf8');
const skillGraph = fs.readFileSync(path.join(ROOT, SKILL_GRAPH_PATH), 'utf8');

// The commit this branch was built on top of (worktree branch point off origin/main) —
// already part of main's own history, so it stays reachable after this branch merges.
// None of the literals pinned below existed in these files at this commit, proving each
// assertion below is capable of going red (skill-prose-conformance-tests' "Proving
// discrimination without editing the tree").
const PRE_CHANGE_SHA = '91cd684cf66dc93dd91ca541b8b1fbe37f89179c';

function countAtPreChange(relPath, literal) {
  const out = execFileSync('git', ['show', `${PRE_CHANGE_SHA}:${relPath}`], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return out.split(literal).length - 1;
}

const EVENT_SHAPES = ['pick', 'reroll', 'steer', 'tweak', 'exit'];

test('#1208 AC1/AC3: demo/SKILL.md cites the contract and never restates the event JSON shapes', () => {
  assert.match(demoSkill, /_shared\/visual-decision\.md/);
  for (const shape of EVENT_SHAPES) {
    assert.equal(
      demoSkill.includes(`"type":"${shape}"`),
      false,
      `demo/SKILL.md restates the "${shape}" event shape literal — it must only cite the contract`,
    );
  }
  assert.strictEqual(
    countAtPreChange(DEMO_SKILL_PATH, '_shared/visual-decision.md'),
    0,
    'demo/SKILL.md must not have cited the contract pre-change (proves this assertion can go red)',
  );
  assert.ok(
    demoSkill.split('_shared/visual-decision.md').length - 1 >= 1,
    'demo/SKILL.md must cite the contract at least once now',
  );
});

test('#1208 AC1: demo/SKILL.md documents pick-replaces / exit-narrows / reroll-steer-tweak-fall-back-full mapping', () => {
  const verdictIdx = demoSkill.indexOf('### Verdict');
  assert.ok(verdictIdx > -1, '### Verdict section not found');
  const verdictSection = demoSkill.slice(verdictIdx);

  assert.match(verdictSection, /\*\*Pick\*\*.*replaces\*\* the terminal question/s);
  assert.match(verdictSection, /\*\*Exit\*\*.*falls back\*\* to the terminal question/s);
  assert.match(verdictSection, /Reroll \/ Steer.*not meaningful here/s);
  assert.match(verdictSection, /Tweak.*never a verdict/s);
  assert.match(verdictSection, /Empty or absent events file.*documented fallback/s);

  assert.strictEqual(
    countAtPreChange(DEMO_SKILL_PATH, 'Browser verdict (optional'),
    0,
    'the browser-verdict subsection must not have existed pre-change',
  );
});

test('#1208 AC1: demo/SKILL.md gates the browser round on rendered-page/app-route only, and on browser-tool availability', () => {
  assert.match(demoSkill, /`rendered-page`\/`app-route` only.*applies only to the URL surfaces/s);
  assert.match(demoSkill, /Available whenever browser tools resolve/);
});

test('#1208 AC1: demo/SKILL.md documents lifecycle stop on every exit path, matching explore.md\'s rule shape', () => {
  assert.match(demoSkill, /Stop the server \(`visual-decide\.js stop --state <demo-dir>\/\.vd-state`\)/);
  assert.match(demoSkill, /on every exit path — pick, exit, or any error that aborts the round/);
  assert.match(demoSkill, /never rely on the idle timeout/);
});

test('CRITICAL gotcha: demo/SKILL.md explicitly states no auto-mode path can reach the browser-verdict step', () => {
  assert.match(demoSkill, /No auto-mode path reaches this/);
  assert.match(demoSkill, /never invoked from within an `auto`-mode pipeline/);
  assert.strictEqual(
    countAtPreChange(DEMO_SKILL_PATH, 'No auto-mode path reaches this'),
    0,
    'the auto-mode-exclusion statement must not have existed pre-change',
  );
});

test('#1208 AC4: _shared/visual-decision.md Consumers table gains a demo row, explore.md row is untouched', () => {
  const consumersIdx = contract.indexOf('## Consumers');
  assert.ok(consumersIdx > -1);
  const consumersSection = contract.slice(consumersIdx);
  assert.match(consumersSection, /`plugin\/skills\/design-wrapper\/modes\/explore\.md`/);
  assert.match(consumersSection, /`plugin\/skills\/demo\/SKILL\.md`/);
  assert.strictEqual(
    countAtPreChange(CONTRACT_PATH, '`plugin/skills/demo/SKILL.md`'),
    0,
    'the demo Consumers row must not have existed pre-change',
  );
});

test('#1208 AC3: _shared/visual-decision.md still states each event shape exactly once (demo adoption added no sixth shape)', () => {
  for (const shape of EVENT_SHAPES) {
    const literal = `"type":"${shape}"`;
    const count = contract.split(literal).length - 1;
    assert.equal(count, 1, `expected exactly one "${literal}" in ${CONTRACT_PATH}, found ${count}`);
  }
});

test('#1208 deliverable 2: visual-review/browser-review.md cites the contract with an explicit not-applicable decision', () => {
  assert.match(browserReview, /_shared\/visual-decision\.md/);
  assert.match(browserReview, /not adopted/i);
  for (const shape of EVENT_SHAPES) {
    assert.equal(
      browserReview.includes(`"type":"${shape}"`),
      false,
      `browser-review.md restates the "${shape}" event shape literal — it must only cite the contract`,
    );
  }
  assert.strictEqual(
    countAtPreChange(BROWSER_REVIEW_PATH, 'Evaluated against `_shared/visual-decision.md`'),
    0,
    'the not-adopted rationale must not have existed pre-change',
  );
});

test('#1208 deliverable 2: visual-review is NOT added to the Consumers table (documented non-adoption, not adoption)', () => {
  const consumersIdx = contract.indexOf('## Consumers');
  const consumersSection = contract.slice(consumersIdx);
  assert.equal(
    consumersSection.includes('visual-review'),
    false,
    'visual-review declined adoption — it must not appear as a Consumers-table row',
  );
});

test('docs cross-references: plugin-structure.md no longer claims explore.md is the sole consumer', () => {
  assert.equal(pluginStructure.includes('sole consumer is `design-wrapper/modes/explore.md`'), false);
  assert.match(pluginStructure, /consumers are `design-wrapper\/modes\/explore\.md`/);
  assert.match(pluginStructure, /`\/claude-tweaks:demo`'s Verdict step/);
});

test('docs cross-references: skill-graph.md ## demo table gains a _shared/visual-decision.md row', () => {
  const demoIdx = skillGraph.indexOf('## demo\n');
  const nextSectionIdx = skillGraph.indexOf('\n## ', demoIdx + 1);
  const demoSection = skillGraph.slice(demoIdx, nextSectionIdx > -1 ? nextSectionIdx : undefined);
  assert.match(demoSection, /`_shared\/visual-decision\.md`/);
  assert.strictEqual(
    countAtPreChange(SKILL_GRAPH_PATH, '| `_shared/visual-decision.md` | Verdict step'),
    0,
    'the skill-graph.md demo row must not have existed pre-change',
  );
});
