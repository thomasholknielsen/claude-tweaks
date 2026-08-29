'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

test('dispatch argument-hint advertises --budget, not next/--batch-size', () => {
  const hint = read('plugin/skills/dispatch/SKILL.md').split('\n').find((l) => l.startsWith('argument-hint:'));
  assert.match(hint, /--budget <n\|all>/);
  assert.doesNotMatch(hint, /next\|/);
  assert.doesNotMatch(hint, /--batch-size/);
});

test('dispatch Step 3 no longer renders the interactive bare pick', () => {
  const content = read('plugin/skills/dispatch/SKILL.md');
  assert.doesNotMatch(content, /"Dispatch pick"/);
  assert.doesNotMatch(content, /Which groups should this firing dispatch\?/);
  assert.match(content, /--budget/);
});

test('deprecated-aliases.md carries the --batch-size and next rows without touching --concurrent', () => {
  const content = read('plugin/skills/dispatch/deprecated-aliases.md');
  assert.match(content, /## `--batch-size <n>` \(deprecated alias for `--budget <n>`\)/);
  assert.match(content, /## `next` \(deprecated alias for `--budget 1`\)/);
  assert.match(content, /## `--concurrent <n>` \(deprecated alias for `--batch-size <n>`\)/);
});

test('routine template fires an explicit --budget 1 drain', () => {
  const content = read('plugin/skills/dispatch/routine-template.yml');
  assert.match(content, /^kickoff: dispatch --budget 1$/m);
  assert.doesNotMatch(content, /^kickoff: dispatch next$/m);
});

test('backlog hand-off and reference card cite --budget, not dispatch next', () => {
  assert.doesNotMatch(read('plugin/skills/backlog/SKILL.md'), /`\/claude-tweaks:dispatch next`/);
  const card = read('plugin/skills/help/reference-card.md');
  // reference-card.md's argument-grammar cells escape the pipe as `\|` — pin the
  // literal Task 2 actually produced, not the unescaped hint-line spelling.
  assert.match(card, /--budget <n\\\|all>/);
});

test('dispatch SKILL.md stays under the 40KB ceiling', () => {
  const bytes = Buffer.byteLength(read('plugin/skills/dispatch/SKILL.md'), 'utf8');
  assert.ok(bytes <= 40960, `dispatch/SKILL.md is ${bytes} bytes — over the 40960 ceiling`);
});
