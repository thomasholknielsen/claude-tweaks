const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

test('claim-outcomes.md is deleted', () => {
  assert.strictEqual(fs.existsSync(path.join(REPO_ROOT, 'skills/dispatch/claim-outcomes.md')), false);
});

test('flow/claim-targets.md exists and is referenced by flow/SKILL.md Step 2.8', () => {
  assert.strictEqual(fs.existsSync(path.join(REPO_ROOT, 'skills/flow/claim-targets.md')), true);
  const skillMd = read('skills/flow/SKILL.md');
  assert.match(skillMd, /2\.8 — Claim the targets/);
  assert.match(skillMd, /claim-targets\.md/);
});

test('claim-targets.md skip-guard keys on run-identity match and the local-files backend', () => {
  const content = read('skills/flow/claim-targets.md');
  assert.match(content, /claim\.runId === basename\(\$PIPELINE_RUN_DIR\)/);
  assert.match(content, /work-backend.*local-files/);
});

test('dispatch/SKILL.md Step 4 is mint-only — no claim-only modifier remains', () => {
  const content = read('skills/dispatch/SKILL.md');
  assert.doesNotMatch(content, /claim-only/);
  assert.match(content, /Mint the selected group's run directory/);
  assert.doesNotMatch(content, /bootstrap-then-add `bot:in-progress`/);
});

test('dispatch/SKILL.md argument-hint drops --claim-only', () => {
  const hintLine = read('skills/dispatch/SKILL.md')
    .split('\n')
    .find((l) => l.startsWith('argument-hint:'));
  assert.ok(hintLine, 'argument-hint line should exist');
  assert.doesNotMatch(hintLine, /claim-only/);
  assert.match(hintLine, /--batch-size/);
});

test('task-prompt.md first template no longer claims "already-claimed"; second still does', () => {
  const content = read('skills/dispatch/task-prompt.md');
  assert.match(content, /Execute claude-tweaks build\+test for this file-overlap group of/);
  assert.doesNotMatch(content, /Execute claude-tweaks build\+test for this already-claimed/);
  assert.match(content, /Execute claude-tweaks review\+polish\+wrap-up for this already-claimed/);
});

test('task-prompt.md documents DISPATCH_HEADLESS for next-form firings', () => {
  assert.match(read('skills/dispatch/task-prompt.md'), /DISPATCH_HEADLESS/);
});

test('headless-self-report.md documents the Step 2.8 contest trigger', () => {
  const content = read('skills/dispatch/headless-self-report.md');
  assert.match(content, /flow-step-2\.8-claim-contest|Step 2\.8 claim contest/);
});

test('settle-and-merge.md documents the claim-contest special case', () => {
  const content = read('skills/dispatch/settle-and-merge.md');
  assert.match(content, /Claim-contest special case/);
  assert.match(content, /DISPATCH_HEADLESS/);
});

test('mcp-transport.md no longer carries claim-write sections', () => {
  const content = read('skills/dispatch/mcp-transport.md');
  assert.doesNotMatch(content, /## Step 4 — claiming a group/);
  assert.doesNotMatch(content, /## Step 4 — `--claim-only` release/);
});

test('claim-targets.md claim read cites issue-claims.md steps 1-2 — no raw base64 -d pipe (#720)', () => {
  const content = read('skills/flow/claim-targets.md');
  assert.doesNotMatch(content, /base64 -d/);
  assert.match(content, /__ABSENT__/);
  assert.match(content, /@base64d/);
});

test('every base64 -d claim read under skills/ cites issue-claims.md or handles empty content (#720)', () => {
  const skillsRoot = path.join(REPO_ROOT, 'skills');
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.md')) {
        const text = fs.readFileSync(full, 'utf8');
        if (/ref=claims-registry/.test(text) && /base64 -d/.test(text)) {
          const cites = /_shared\/issue-claims\.md/.test(text);
          const absentBranch = /\|\| null/.test(text);
          if (!cites && !absentBranch) offenders.push(path.relative(REPO_ROOT, full));
        }
      }
    }
  };
  walk(skillsRoot);
  assert.deepStrictEqual(offenders, []);
});
