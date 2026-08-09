'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { collectClaims, checkCollisions, precheck } = require('../precheck.js');

// Lazily-evaluated canned git — a function per invocation, never an IIFE [IL-30].
function fakeGit(responses) {
  const calls = [];
  const git = (args) => {
    calls.push(args.join(' '));
    const key = args.join(' ');
    for (const [prefix, respond] of responses) {
      if (key.startsWith(prefix)) return respond();
    }
    throw new Error(`unexpected git call: ${key}`);
  };
  git.calls = calls;
  return git;
}

const manifest = (v) => JSON.stringify({ name: 'claude-tweaks', version: v });

function baseDeps(overrides = {}) {
  return {
    git: fakeGit([
      ['fetch origin main', () => ''],
      ['show origin/main:.claude-plugin/plugin.json', () => manifest(overrides.origin || '6.70.1')],
      ['show main:.claude-plugin/plugin.json', () => manifest(overrides.local || '6.70.1')],
      ['worktree list --porcelain', () => overrides.worktrees || 'worktree /repo\nbranch refs/heads/main\n'],
      ['show wt-feature:.claude-plugin/plugin.json', () => manifest(overrides.wtVersion || '6.70.1')],
    ]),
    listPlanFiles: () => overrides.plans || [],
    readFile: (p) => (overrides.planText || {})[p] || '',
  };
}

test('clean state: candidate is next minor over origin, no conflicts', () => {
  const { candidate, result } = precheck(baseDeps(), 'minor');
  assert.strictEqual(candidate, '6.71.0');
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.conflicts, []);
});

test('a bump already on origin/main raises the base instead of colliding', () => {
  const { candidate, result } = precheck(baseDeps({ origin: '6.71.0' }), 'minor');
  assert.strictEqual(candidate, '6.72.0');
  assert.strictEqual(result.ok, true);
});

test('an executed bump on unpushed local main raises the base [IL-98]', () => {
  const { candidate, result } = precheck(baseDeps({ local: '6.71.0' }), 'minor');
  assert.strictEqual(candidate, '6.72.0');
  assert.strictEqual(result.ok, true);
});

test('a committed-but-unmerged bump on a sibling worktree branch conflicts', () => {
  const deps = baseDeps({
    worktrees: 'worktree /repo\nbranch refs/heads/main\n\nworktree /repo/.claude/worktrees/f\nbranch refs/heads/wt-feature\n',
    wtVersion: '6.71.0',
  });
  const { result } = precheck(deps, 'minor');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.conflicts.length, 1);
  assert.strictEqual(result.conflicts[0].source, 'worktree-branch');
  assert.strictEqual(result.suggested, '6.72.0');
});

test('a plan document claiming the candidate number conflicts', () => {
  const deps = baseDeps({
    plans: ['docs/superpowers/plans/2026-08-08-x.md'],
    planText: { 'docs/superpowers/plans/2026-08-08-x.md': 'bump to v6.71.0 in this plan' },
  });
  const { result } = precheck(deps, 'minor');
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.conflicts[0].source, 'plan-claim');
  assert.strictEqual(result.suggested, '6.72.0');
});

test('plan versions at or below origin/main are not claims', () => {
  const deps = baseDeps({
    plans: ['docs/superpowers/plans/old.md'],
    planText: { 'docs/superpowers/plans/old.md': 'shipped back in v6.60.0' },
  });
  const { result } = precheck(deps, 'minor');
  assert.strictEqual(result.ok, true);
});

const SIBLING_WORKTREES = 'worktree /repo\nbranch refs/heads/main\n\nworktree /repo/.claude/worktrees/f\nbranch refs/heads/wt-feature\n';

test('a branch with no manifest is skipped silently — not a claim', () => {
  const deps = baseDeps();
  deps.git = fakeGit([
    ['fetch origin main', () => ''],
    ['show origin/main:.claude-plugin/plugin.json', () => manifest('6.70.1')],
    ['show main:.claude-plugin/plugin.json', () => manifest('6.70.1')],
    ['worktree list --porcelain', () => SIBLING_WORKTREES],
    ['show wt-feature:.claude-plugin/plugin.json', () => {
      throw new Error("fatal: path '.claude-plugin/plugin.json' does not exist in 'wt-feature'");
    }],
  ]);
  const { result } = precheck(deps, 'minor');
  assert.strictEqual(result.ok, true);
});

test('any other branch-manifest read failure aborts naming the branch — never silently weakens the check', () => {
  const deps = baseDeps();
  deps.git = fakeGit([
    ['fetch origin main', () => ''],
    ['show origin/main:.claude-plugin/plugin.json', () => manifest('6.70.1')],
    ['show main:.claude-plugin/plugin.json', () => manifest('6.70.1')],
    ['worktree list --porcelain', () => SIBLING_WORKTREES],
    ['show wt-feature:.claude-plugin/plugin.json', () => 'not valid json'],
  ]);
  assert.throws(() => precheck(deps, 'minor'), /wt-feature/);
});
