const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');

test('claim-outcomes.md is deleted', () => {
  assert.strictEqual(
    fs.existsSync(path.join(REPO_ROOT, 'skills/dispatch/claim-outcomes.md')),
    false
  );
});

test('flow/claim-targets.md exists and is referenced by flow/SKILL.md Step 2.8', () => {
  const claimTargetsPath = path.join(REPO_ROOT, 'skills/flow/claim-targets.md');
  assert.strictEqual(fs.existsSync(claimTargetsPath), true);
  const skillMd = fs.readFileSync(path.join(REPO_ROOT, 'skills/flow/SKILL.md'), 'utf8');
  assert.match(skillMd, /2\.8 — Claim the targets/);
  assert.match(skillMd, /claim-targets\.md/);
});

test('claim-targets.md skip-guard is one condition, not three special cases', () => {
  const content = fs.readFileSync(path.join(REPO_ROOT, 'skills/flow/claim-targets.md'), 'utf8');
  assert.match(content, /claim\.runId === basename\(\$PIPELINE_RUN_DIR\)/);
  assert.match(content, /work-backend.*local-files/);
});

test('dispatch/SKILL.md Step 4 is mint-only — no claim-only modifier remains', () => {
  const content = fs.readFileSync(path.join(REPO_ROOT, 'skills/dispatch/SKILL.md'), 'utf8');
  assert.doesNotMatch(content, /claim-only/);
  assert.match(content, /Mint the selected group's run directory/);
  assert.doesNotMatch(content, /bootstrap-then-add `bot:in-progress`/);
});

test('dispatch/SKILL.md argument-hint drops --claim-only', () => {
  const content = fs.readFileSync(path.join(REPO_ROOT, 'skills/dispatch/SKILL.md'), 'utf8');
  const hintLine = content.split('\n').find((l) => l.startsWith('argument-hint:'));
  assert.ok(hintLine, 'argument-hint line should exist');
  assert.doesNotMatch(hintLine, /claim-only/);
  assert.match(hintLine, /--batch-size/);
});

test('task-prompt.md first template no longer claims "already-claimed"; second still does', () => {
  const content = fs.readFileSync(path.join(REPO_ROOT, 'skills/dispatch/task-prompt.md'), 'utf8');
  assert.match(content, /Execute claude-tweaks build\+test for this file-overlap group of/);
  assert.doesNotMatch(content, /Execute claude-tweaks build\+test for this already-claimed/);
  assert.match(content, /Execute claude-tweaks review\+polish\+wrap-up for this already-claimed/);
});

test('task-prompt.md documents DISPATCH_HEADLESS for next-form firings', () => {
  const content = fs.readFileSync(path.join(REPO_ROOT, 'skills/dispatch/task-prompt.md'), 'utf8');
  assert.match(content, /DISPATCH_HEADLESS/);
});

test('headless-self-report.md documents the Step 2.8 contest trigger', () => {
  const content = fs.readFileSync(
    path.join(REPO_ROOT, 'skills/dispatch/headless-self-report.md'),
    'utf8'
  );
  assert.match(content, /flow-step-2\.8-claim-contest|Step 2\.8 claim contest/);
});

test('settle-and-merge.md documents the claim-contest special case', () => {
  const content = fs.readFileSync(
    path.join(REPO_ROOT, 'skills/dispatch/settle-and-merge.md'),
    'utf8'
  );
  assert.match(content, /Claim-contest special case/);
  assert.match(content, /DISPATCH_HEADLESS/);
});

test('mcp-transport.md no longer carries claim-write sections', () => {
  const content = fs.readFileSync(path.join(REPO_ROOT, 'skills/dispatch/mcp-transport.md'), 'utf8');
  assert.doesNotMatch(content, /## Step 4 — claiming a group/);
  assert.doesNotMatch(content, /## Step 4 — `--claim-only` release/);
});
