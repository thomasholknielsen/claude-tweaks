const { test } = require('node:test');
const assert = require('node:assert');
const { probeWorktrees } = require('../../../plugin/bin/lib/residue/probes/worktrees');
const { probeBranches } = require('../../../plugin/bin/lib/residue/probes/branches');

function stubRunner(responses) {
  return (args) => (Object.prototype.hasOwnProperty.call(responses, args.join(' ')) ? responses[args.join(' ')] : null);
}

const SCOPE = {
  ran: true, reason: null, base: 'a1b2c3d', headBranch: 'worktree-feat',
  branches: ['main', 'worktree-feat', 'worktree-old'],
  worktrees: [
    { path: '/repo', branch: 'main', locked: false },
    { path: '/repo/.claude/worktrees/self', branch: 'worktree-feat', locked: true },
    { path: '/repo/.claude/worktrees/live', branch: 'worktree-live', locked: true },
    { path: '/repo/.claude/worktrees/done', branch: 'worktree-done', locked: false },
    { path: '/repo/.worktrees/fallback', branch: 'worktree-fallback', locked: false },
  ],
};

test('the main working tree is never a finding', () => {
  const { findings } = probeWorktrees({ scope: SCOPE });
  assert.ok(!findings.some((f) => f.subject === '/repo'), 'main checkout must not be reported');
});

test('a locked worktree is reported for a human, not for auto-removal', () => {
  const { findings } = probeWorktrees({ scope: SCOPE });
  const locked = findings.find((f) => f.subject === '/repo/.claude/worktrees/live');
  assert.strictEqual(locked.remedy, 'record', 'a live lock means a session is using it');
});

test('an unlocked worktree in the harness domain is auto-remediable', () => {
  const { findings } = probeWorktrees({ scope: SCOPE });
  assert.strictEqual(findings.find((f) => f.subject === '/repo/.claude/worktrees/done').remedy, 'auto');
});

test('an unlocked worktree outside the reaper domain is still auto-remediable', () => {
  // No reaper collects .worktrees/ — that makes explicit teardown MORE
  // necessary, not less.
  const { findings } = probeWorktrees({ scope: SCOPE });
  assert.strictEqual(findings.find((f) => f.subject === '/repo/.worktrees/fallback').remedy, 'auto');
});

test('an unresolved scope produces no findings and says why', () => {
  const r = probeWorktrees({ scope: { ran: false, reason: 'not a git repository', worktrees: [] } });
  assert.strictEqual(r.ran, false);
  assert.deepStrictEqual(r.findings, []);
  assert.match(r.reason, /not a git repository/);
});

// The head worktree is present, locked, and reachable at every Step 8.5 run
// (the session is standing in it) — reporting it demands a per-item answer
// for a worktree that cannot ever be disposed of mid-run. Confirmed broken
// by execution before this fix: on this repo, every /wrap-up run surfaced
// its own live worktree, plus every OTHER concurrent session's, as findings.
test('the worktree this session is standing in is never a finding', () => {
  const { findings } = probeWorktrees({ scope: SCOPE });
  assert.ok(!findings.some((f) => f.subject === '/repo/.claude/worktrees/self'), 'this run\'s own worktree must not be reported');
});

test('a sibling worktree is observed, not blast-radius', () => {
  const { findings } = probeWorktrees({ scope: SCOPE });
  const sibling = findings.find((f) => f.subject === '/repo/.claude/worktrees/live');
  assert.strictEqual(sibling.scope, 'observed', 'a worktree on a branch this work did not produce is observed, never blast-radius');
});

test('a merged remote branch is reported as auto-remediable', () => {
  const run = stubRunner({ 'branch -r --format=%(refname:short) --merged origin/main': 'origin/main\norigin/worktree-old' });
  const { findings } = probeBranches({ scope: SCOPE, integrationBranch: 'origin/main', run });
  const stale = findings.find((f) => f.subject === 'origin/worktree-old');
  assert.strictEqual(stale.kind, 'branch');
  assert.strictEqual(stale.remedy, 'auto');
});

test('the integration branch itself is never a finding', () => {
  const run = stubRunner({ 'branch -r --format=%(refname:short) --merged origin/main': 'origin/main\norigin/worktree-old' });
  const { findings } = probeBranches({ scope: SCOPE, integrationBranch: 'origin/main', run });
  assert.ok(!findings.some((f) => f.subject === 'origin/main'), 'deleting the integration branch would be catastrophic');
});

test('the branch currently checked out is never a finding', () => {
  const run = stubRunner({ 'branch -r --format=%(refname:short) --merged origin/main': 'origin/main\norigin/worktree-feat' });
  const { findings } = probeBranches({ scope: SCOPE, integrationBranch: 'origin/main', run });
  assert.ok(!findings.some((f) => f.subject.endsWith('worktree-feat')), 'HEAD is on this branch');
});

test('branches on other remotes are never findings', () => {
  // Verified live: `git branch -r --merged origin/main` in this repo returns
  // local-check/main, local/main-check, and a bare `origin` alongside
  // origin/*. Proposing a delete on another remote's main is the worst
  // output this probe could produce.
  const run = stubRunner({
    'branch -r --format=%(refname:short) --merged origin/main':
      'origin\norigin/main\nlocal-check/main\nlocal/main-check\norigin/worktree-old',
  });
  const { findings } = probeBranches({ scope: SCOPE, integrationBranch: 'origin/main', run });
  assert.deepStrictEqual(findings.map((f) => f.subject), ['origin/worktree-old']);
});

test('an unreadable branch list does not run, rather than reporting none', () => {
  const r = probeBranches({ scope: SCOPE, integrationBranch: 'origin/main', run: stubRunner({}) });
  assert.strictEqual(r.ran, false);
  assert.deepStrictEqual(r.findings, []);
});

// `_shared/integration-branch.md`'s canonical ladder yields a BARE branch
// name (`main`, `dev`), never a `<remote>/<branch>` form. `git branch -r
// --merged` only ever returns remote-tracking refs, so a bare name must
// resolve to one before it can match anything — confirmed broken by
// execution before this fix: `origin/main` found 1 stale branch, bare
// `main` and bare `dev` found 0, on the identical live repo.
test('bare main, bare dev, and origin/main all find the same stale branch', () => {
  const stale = 'origin/worktree-old';
  const branchListForMain = 'origin/main\norigin/worktree-old';
  const branchListForDev = 'origin/dev\norigin/worktree-old';

  const viaQualified = probeBranches({
    scope: SCOPE,
    integrationBranch: 'origin/main',
    run: stubRunner({ 'branch -r --format=%(refname:short) --merged origin/main': branchListForMain }),
  });
  const viaBareMain = probeBranches({
    scope: SCOPE,
    integrationBranch: 'main',
    run: stubRunner({
      'config branch.main.remote': null,
      'branch -r --format=%(refname:short) --merged origin/main': branchListForMain,
    }),
  });
  const viaBareDev = probeBranches({
    scope: SCOPE,
    integrationBranch: 'dev',
    run: stubRunner({
      'config branch.dev.remote': 'origin',
      'branch -r --format=%(refname:short) --merged origin/dev': branchListForDev,
    }),
  });

  assert.deepStrictEqual(viaQualified.findings.map((f) => f.subject), [stale]);
  assert.deepStrictEqual(viaBareMain.findings.map((f) => f.subject), [stale]);
  assert.deepStrictEqual(viaBareDev.findings.map((f) => f.subject), [stale]);
});

test('a bare integration branch resolves its remote via git config, not always origin', () => {
  const run = stubRunner({
    'config branch.dev.remote': 'upstream',
    'branch -r --format=%(refname:short) --merged upstream/dev': 'upstream/dev\nupstream/worktree-old',
  });
  const { findings } = probeBranches({ scope: SCOPE, integrationBranch: 'dev', run });
  assert.deepStrictEqual(findings.map((f) => f.subject), ['upstream/worktree-old']);
});

test('the integration branch itself is never a finding, even when passed bare', () => {
  const run = stubRunner({
    'config branch.main.remote': null,
    'branch -r --format=%(refname:short) --merged origin/main': 'origin/main\norigin/worktree-old',
  });
  const { findings } = probeBranches({ scope: SCOPE, integrationBranch: 'main', run });
  assert.ok(!findings.some((f) => f.subject === 'origin/main'), 'deleting the integration branch would be catastrophic');
});
