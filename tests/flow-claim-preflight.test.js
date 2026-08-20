const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

function mdFilesUnder(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...mdFilesUnder(full));
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

test('claim-outcomes.md is deleted', () => {
  assert.strictEqual(fs.existsSync(path.join(REPO_ROOT, 'plugin/skills/dispatch/claim-outcomes.md')), false);
});

test('flow/claim-targets.md exists and is referenced by flow/SKILL.md Step 2.8', () => {
  assert.strictEqual(fs.existsSync(path.join(REPO_ROOT, 'plugin/skills/flow/claim-targets.md')), true);
  const skillMd = read('plugin/skills/flow/SKILL.md');
  assert.match(skillMd, /2\.8 — Claim the targets/);
  assert.match(skillMd, /claim-targets\.md/);
});

test('claim-targets.md skip-guard keys on run-identity match and the local-files backend', () => {
  const content = read('plugin/skills/flow/claim-targets.md');
  assert.match(content, /claim\.runId === basename\(\$PIPELINE_RUN_DIR\)/);
  assert.match(content, /work-backend.*local-files/);
});

test('dispatch/SKILL.md Step 4 is mint-only — no claim-only modifier remains', () => {
  const content = read('plugin/skills/dispatch/SKILL.md');
  assert.doesNotMatch(content, /claim-only/);
  assert.match(content, /Mint the selected group's run directory/);
  assert.doesNotMatch(content, /bootstrap-then-add `bot:in-progress`/);
});

test('dispatch/SKILL.md argument-hint drops --claim-only', () => {
  const hintLine = read('plugin/skills/dispatch/SKILL.md')
    .split('\n')
    .find((l) => l.startsWith('argument-hint:'));
  assert.ok(hintLine, 'argument-hint line should exist');
  assert.doesNotMatch(hintLine, /claim-only/);
  assert.match(hintLine, /--batch-size/);
});

test('task-prompt.md first template no longer claims "already-claimed"; second still does', () => {
  const content = read('plugin/skills/dispatch/task-prompt.md');
  assert.match(content, /Execute claude-tweaks build\+test for this file-overlap group of/);
  assert.doesNotMatch(content, /Execute claude-tweaks build\+test for this already-claimed/);
  assert.match(content, /Execute claude-tweaks review\+polish\+wrap-up for this already-claimed/);
});

test('task-prompt.md documents DISPATCH_HEADLESS for next-form firings', () => {
  assert.match(read('plugin/skills/dispatch/task-prompt.md'), /DISPATCH_HEADLESS/);
});

test('_shared/headless-self-report.md documents the Step 2.8 contest trigger', () => {
  const content = read('plugin/skills/_shared/headless-self-report.md');
  assert.match(content, /flow-step-2\.8-claim-contest|Step 2\.8 claim contest/);
});

test('settle-and-merge.md documents the claim-contest special case', () => {
  const content = read('plugin/skills/dispatch/settle-and-merge.md');
  assert.match(content, /Claim-contest special case/);
  assert.match(content, /DISPATCH_HEADLESS/);
});

test('mcp-transport.md no longer carries claim-write sections', () => {
  const content = read('plugin/skills/dispatch/mcp-transport.md');
  assert.doesNotMatch(content, /## Step 4 — claiming a group/);
  assert.doesNotMatch(content, /## Step 4 — `--claim-only` release/);
});

test('claim-targets.md claim read cites issue-claims.md steps 1-2 — no raw base64 -d pipe (#720)', () => {
  const content = read('plugin/skills/flow/claim-targets.md');
  assert.doesNotMatch(content, /base64 -d/);
  assert.match(content, /__ABSENT__/);
  assert.match(content, /@base64d/);
});

test('every base64 -d claim read under skills/ cites issue-claims.md or handles empty content (#720)', () => {
  const offenders = [];
  for (const file of mdFilesUnder(path.join(REPO_ROOT, 'plugin', 'skills'))) {
    const text = fs.readFileSync(file, 'utf8');
    if (!/ref=claims-registry/.test(text) || !/base64 -d/.test(text)) continue;
    const cites = /_shared\/issue-claims\.md/.test(text);
    const absentBranch = /\|\| null/.test(text);
    if (!cites && !absentBranch) offenders.push(path.relative(REPO_ROOT, file));
  }
  assert.deepStrictEqual(offenders, []);
});

test('contest card renders holder liveness — three verdict variants, each with a next step (#722)', () => {
  const content = read('plugin/skills/flow/claim-targets.md');
  assert.match(content, /Live sibling on this machine/);
  assert.match(content, /Remote holder/);
  assert.match(content, /Stale holder — no activity since/);
  assert.match(content, /sessionId/);
  assert.match(content, /git worktree list/);
  assert.match(content, /~\/\.claude\/projects\//);

  // Extract the card region (the fenced ```markdown block for "## Flow: Claim contested")
  // and confirm each of the three verdict variants carries its own "Next:" step.
  const cardStart = content.indexOf('## Flow: Claim contested');
  assert.ok(cardStart !== -1, 'card region should exist');
  const cardEnd = content.indexOf('```', cardStart);
  const card = content.slice(cardStart, cardEnd);
  const nextCount = (card.match(/Next:/g) || []).length;
  assert.strictEqual(nextCount, 3, 'card should carry exactly one "Next:" step per verdict variant');
  assert.match(card, /Live sibling on this machine[\s\S]*?Next: wait for it to finish or release/);
  assert.match(card, /Remote holder \(\{holder-host\}\)\. Next: inspect that session/);
  assert.match(card, /Stale holder — no activity since[\s\S]*?Next: \{if step 3 matched a worktree/);
});

test('contest card weighs worktree evidence before recommending reclaim on a Stale-holder verdict (#722)', () => {
  const content = read('plugin/skills/flow/claim-targets.md');
  // Step 5's verdict rule must not let a matched (possibly-live) worktree be reclaimed on the
  // strength of an absent transcript alone.
  assert.match(content, /Stale-holder next step must not recommend reclaim/);
  assert.match(content, /inspect the matched worktree/);
  // The card's Stale variant must render that softened next step conditionally rather than
  // unconditionally pointing at /tidy reclaim.
  assert.match(content, /inspect it\s*\n\s*before any reclaim; a locked worktree usually means a live session/);
});

test('contest liveness lookup is evidence-gathering, never a gate or a prompt (#722)', () => {
  const content = read('plugin/skills/flow/claim-targets.md');
  assert.match(content, /never block on the lookup|evidence, not an error/);
  assert.match(content, /session-evaluation\.md/);
  // the card remains a stop: the section still forbids AskUserQuestion
  assert.match(content, /No `AskUserQuestion`/);
});

test('claim step invokes bin/claim-targets.js — no per-target gh api snippet remains (#723)', () => {
  const content = read('plugin/skills/flow/claim-targets.md');
  assert.match(content, /bin\/claim-targets\.js/);
  const claimSection = content.split('## Claim every named target')[1];
  assert.ok(claimSection, 'claim section heading must exist');
  assert.doesNotMatch(claimSection, /gh api "repos/);
  assert.doesNotMatch(claimSection, /gh issue edit "\$ISSUE"/);
  // the canonical-read citation tokens survive (pinned by the #720 tests too)
  assert.match(content, /__ABSENT__/);
  assert.match(content, /@base64d/);
});

test('multi-spec pre-flight and dispatch cite bin/preflight-records.js (#723)', () => {
  assert.match(read('plugin/skills/flow/multi-spec.md'), /bin\/preflight-records\.js/);
  assert.match(read('plugin/skills/dispatch/SKILL.md'), /bin\/preflight-records\.js/);
});
