const { test } = require('node:test');
const assert = require('node:assert');
const { probeWorktrees, extractPid } = require('../../../plugin/bin/lib/residue/probes/worktrees');
const { probeBranches } = require('../../../plugin/bin/lib/residue/probes/branches');
const { filterResultsByScope } = require('../../../plugin/bin/lib/residue/scope-filter');

function stubRunner(responses) {
  return (args) => (Object.prototype.hasOwnProperty.call(responses, args.join(' ')) ? responses[args.join(' ')] : null);
}

// Same as stubRunner, but also records every call's args (and any execFileSync
// options passed alongside them) so a test can assert ordering (the prune
// must run before the `--merged` read) and per-call options (e.g. `timeout`).
function recordingRunner(responses) {
  const calls = [];
  const runner = (args, opts) => {
    calls.push(args.join(' '));
    runner.optsByCall.push(opts);
    return Object.prototype.hasOwnProperty.call(responses, args.join(' ')) ? responses[args.join(' ')] : null;
  };
  runner.calls = calls;
  runner.optsByCall = [];
  return runner;
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

// #499: probeBranches tagged every merged-but-undeleted remote branch except
// scope.headBranch as scope:'blast-radius' unconditionally, with no way to
// tell "this run's own worktree branch" apart from an unrelated, separately-
// completed session's merged branch. `probeWorktrees` already draws this
// contrast correctly (a fallthrough worktree is 'observed', never
// 'blast-radius') — this probe had no equivalent contrast. Mirrors that
// fix: a merged branch not matching scope.headBranch is 'observed'.
test('a merged branch belonging to an unrelated run is observed, not blast-radius', () => {
  const run = stubRunner({ 'branch -r --format=%(refname:short) --merged origin/main': 'origin/main\norigin/worktree-old' });
  const { findings } = probeBranches({ scope: SCOPE, integrationBranch: 'origin/main', run });
  const stale = findings.find((f) => f.subject === 'origin/worktree-old');
  assert.strictEqual(stale.scope, 'observed', 'a branch this run did not produce is observed, never blast-radius, mirroring probeWorktrees');
});

// AC: a repo state with 2+ merged-but-undeleted branches belonging to
// unrelated runs, and 0 belonging to the invoking run, produces zero
// blast-radius-scoped branch findings under --scope blast-radius.
test('multiple merged branches from unrelated runs produce zero blast-radius findings', () => {
  const run = stubRunner({
    'branch -r --format=%(refname:short) --merged origin/main':
      'origin/main\norigin/worktree-flow-464\norigin/worktree-record-174',
  });
  const { findings } = probeBranches({ scope: SCOPE, integrationBranch: 'origin/main', run });
  assert.strictEqual(findings.length, 2, 'both unrelated merged branches are still reported');
  assert.ok(findings.every((f) => f.scope !== 'blast-radius'), 'none of them qualify as this run\'s own blast radius');
  assert.deepStrictEqual(
    filterResultsByScope([{ ran: true, reason: null, findings }], 'blast-radius')[0].findings,
    [],
    '--scope blast-radius drops every finding once none carry scope:blast-radius',
  );
});

// #663: `probeBranches` used to read `--merged` against whatever stale
// `refs/remotes/origin/*` entries the local checkout already had, with no
// fetch/prune first. A branch merged and already deleted upstream (auto-
// deleted on merge, or cleaned up by a sibling tidy pass) still showed up as
// "merged, not deleted" — a fix-now attempt against it then 422s.
test('a prune runs before the merged-branch read, and a since-pruned branch produces no finding', () => {
  const run = recordingRunner({
    'remote prune origin': 'Pruning origin\n * [pruned] origin/worktree-old',
    // Reflects what git itself returns AFTER a real prune removed the stale
    // tracking ref — the branch this run is regression-testing is simply
    // absent from the merged list once pruned.
    'branch -r --format=%(refname:short) --merged origin/main': 'origin/main',
  });
  const { findings } = probeBranches({ scope: SCOPE, integrationBranch: 'origin/main', run });
  assert.deepStrictEqual(findings, [], 'the stale ref was pruned before the merged read, so it never appears');
  assert.deepStrictEqual(run.calls, [
    'remote prune origin',
    'branch -r --format=%(refname:short) --merged origin/main',
  ], 'prune must run before the merged-branch read, on the same injected run seam');
});

// #663 follow-up (review finding): the prune call is the first command on
// this probe's run seam to contact a remote at all, so it needs an explicit
// timeout — an unbounded `execFileSync` could hang the whole probe on a
// slow/black-holed remote. The local-only merged-branch read has no such
// risk and must stay unbounded.
test('the prune call carries an explicit timeout; the local merged-branch read does not', () => {
  const run = recordingRunner({
    'remote prune origin': '',
    'branch -r --format=%(refname:short) --merged origin/main': 'origin/main',
  });
  probeBranches({ scope: SCOPE, integrationBranch: 'origin/main', run });
  assert.deepStrictEqual(run.calls, [
    'remote prune origin',
    'branch -r --format=%(refname:short) --merged origin/main',
  ]);
  assert.strictEqual(run.optsByCall[0] && run.optsByCall[0].timeout, 15000, 'prune call must pass an explicit timeout');
  assert.strictEqual(run.optsByCall[1], undefined, 'the local-only merged-branch read must not carry a timeout option');
});

test('a prune failure degrades to the unpruned read rather than aborting the probe', () => {
  // No 'remote prune origin' entry in the map -> stubRunner returns null,
  // simulating a network failure / offline prune.
  const run = stubRunner({
    'branch -r --format=%(refname:short) --merged origin/main': 'origin/main\norigin/worktree-old',
  });
  const { ran, findings } = probeBranches({ scope: SCOPE, integrationBranch: 'origin/main', run });
  assert.strictEqual(ran, true, 'a prune failure degrades, it does not abort the probe');
  const stale = findings.find((f) => f.subject === 'origin/worktree-old');
  assert.ok(stale, 'still returns the finding it would have returned unpruned');
  assert.match(stale.evidence, /unpruned-read/, 'tagged so a consumer (fix-now) knows deletion may 422');
});

test('the degrade tag lives in evidence only — it never mints a duplicate finding id', () => {
  const prunedRun = stubRunner({
    'remote prune origin': '',
    'branch -r --format=%(refname:short) --merged origin/main': 'origin/main\norigin/worktree-old',
  });
  const degradedRun = stubRunner({
    'branch -r --format=%(refname:short) --merged origin/main': 'origin/main\norigin/worktree-old',
  });
  const pruned = probeBranches({ scope: SCOPE, integrationBranch: 'origin/main', run: prunedRun });
  const degraded = probeBranches({ scope: SCOPE, integrationBranch: 'origin/main', run: degradedRun });
  const prunedFinding = pruned.findings.find((f) => f.subject === 'origin/worktree-old');
  const degradedFinding = degraded.findings.find((f) => f.subject === 'origin/worktree-old');
  assert.strictEqual(prunedFinding.id, degradedFinding.id, 'same finding whether pruned or degraded — id excludes evidence');
  assert.notStrictEqual(prunedFinding.evidence, degradedFinding.evidence, 'evidence text differs to carry the degrade tag');
});

// #225: a locked worktree's evidence must distinguish a live session from an
// abandoned lock, not report every lock identically.
const PID_SCOPE = {
  ran: true, reason: null, base: 'a1b2c3d', headBranch: 'worktree-feat',
  branches: [],
  worktrees: [
    { path: '/repo', branch: 'main', locked: false },
    { path: '/repo/.claude/worktrees/live', branch: 'worktree-live', locked: true, lockReason: 'claude session foo (pid 16478, host vm)' },
    { path: '/repo/.claude/worktrees/dead', branch: 'worktree-dead', locked: true, lockReason: 'claude session bar (pid 99999, host vm)' },
    { path: '/repo/.claude/worktrees/nopid', branch: 'worktree-nopid', locked: true, lockReason: 'manual lock, no pid recorded' },
  ],
};

test('extractPid reads the pid out of a lockReason string', () => {
  assert.strictEqual(extractPid('claude session foo (pid 16478, host vm)'), 16478);
  assert.strictEqual(extractPid('manual lock, no pid recorded'), null);
  assert.strictEqual(extractPid(null), null);
  assert.strictEqual(extractPid(undefined), null);
});

test('a locked worktree whose pid is running shows a live-session verdict with the pid', () => {
  const isPidAlive = (pid) => pid === 16478;
  const { findings } = probeWorktrees({ scope: PID_SCOPE, isPidAlive });
  const live = findings.find((f) => f.subject === '/repo/.claude/worktrees/live');
  assert.match(live.evidence, /live session/);
  assert.match(live.evidence, /pid 16478/);
  assert.strictEqual(live.remedy, 'record', 'still a human call — liveness does not change the remedy');
});

test('a locked worktree whose pid is not running shows an abandoned-lock verdict, distinct from a live one', () => {
  const isPidAlive = (pid) => pid === 16478; // only the "live" fixture's pid is alive
  const { findings } = probeWorktrees({ scope: PID_SCOPE, isPidAlive });
  const dead = findings.find((f) => f.subject === '/repo/.claude/worktrees/dead');
  assert.match(dead.evidence, /abandoned lock/);
  assert.match(dead.evidence, /pid 99999/);
  assert.strictEqual(dead.remedy, 'record');

  const live = findings.find((f) => f.subject === '/repo/.claude/worktrees/live');
  assert.notStrictEqual(dead.evidence, live.evidence, 'a live pid and a dead pid must render differently');
});

test('an unparseable lock reason reports pid unknown rather than crashing', () => {
  const { findings } = probeWorktrees({ scope: PID_SCOPE, isPidAlive: () => true });
  const nopid = findings.find((f) => f.subject === '/repo/.claude/worktrees/nopid');
  assert.match(nopid.evidence, /pid unknown/);
});

test('a liveness check that throws fails toward "could not be confirmed" rather than crashing the sweep', () => {
  const isPidAlive = () => { throw new Error('ps unavailable'); };
  const { findings } = probeWorktrees({ scope: PID_SCOPE, isPidAlive });
  const live = findings.find((f) => f.subject === '/repo/.claude/worktrees/live');
  assert.match(live.evidence, /could not be confirmed/);
  assert.strictEqual(live.remedy, 'record');
});
