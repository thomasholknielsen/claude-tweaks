// tests/hooks-dispatcher.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readRunState } = require('../plugin/bin/lib/hooks/context');
const { linkedWorktreeOf, harnessWorktreeOf } = require('./helpers/git-fixtures');

const HOOKS = path.join(__dirname, '..', 'plugin', 'bin', 'hooks.js');

// #1130: never let an omitted cwd fall through to the spawned subprocess's
// own process.cwd() — that is the test runner's real working directory, and
// when npm test runs from a real checkout, hooks that walk
// .claude-tweaks/pipelines/ from there write fixture events into REAL run
// dirs (the #657 pollution incident). Calls that don't care about cwd get an
// isolated, non-git sandbox instead.
const HOOK_SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-disp-sandbox-'));

function runHook(args, { input = '', cwd = HOOK_SANDBOX, env = {} } = {}) {
  try {
    const stdout = execFileSync('node', [HOOKS, ...args], {
      // #1130: `PIPELINE_RUN_DIR: ''` neutralizes any ambient run-dir env var
      // so a call that doesn't explicitly pass one can't resolve against
      // whatever real run happens to be ambient in this test runner's own
      // process.env (e.g. when npm test itself runs inside a /flow-dispatched
      // shell). A caller that needs a run dir still passes it explicitly via
      // `env`, which wins because it spreads last.
      // #1337: CT_HOOKS_TEST_MODE tells pre-tool-use.js's gate-denial write
      // this denial came from the test suite's own exercise of the deny
      // logic, not a real operator action — see that file's appendEvent call
      // and friction-events.js's readEvents, which excludes tagged events
      // from aggregation. A caller that needs to assert real (untagged)
      // denial behavior overrides it via `env`.
      input, cwd, encoding: 'utf8', env: { ...process.env, PIPELINE_RUN_DIR: '', CT_HOOKS_TEST_MODE: '1', ...env },
    });
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.status, stdout: e.stdout || '' };
  }
}

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-disp-'));
  // #790: an explicit --run must resolve under a real git checkout (see
  // bin/hooks.js's resolveRunArg anchoring check) — a bare, non-git tmp dir
  // no longer counts as a valid anchor for any run dir nested under it.
  execFileSync('git', ['-C', dir, 'init', '-q']);
  const run = path.join(dir, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  fs.mkdirSync(run, { recursive: true });
  // #721: an unadopted mint (neither run-state.json nor decisions.md) is
  // invisible to resolveRun's fallback — touch decisions.md so this fixture's
  // pre-record-worktree run dir stays reachable, matching a real flow-initialized
  // run at this stage (config.yml/decisions.md exist, run-state.json doesn't yet).
  fs.writeFileSync(path.join(run, 'decisions.md'), '');
  return dir;
}

function gitRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-disp-repo-'));
  execFileSync('git', ['-C', dir, 'init', '-q']);
  return fs.realpathSync(dir);
}

function writeWorktreeAlwaysPolicy(project) {
  fs.mkdirSync(path.join(project, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(project, '.claude-tweaks', 'policy.yml'), 'worktree-always: true\n');
}

test('invariant: every event exits 0 on garbage stdin, no stdout noise', () => {
  for (const ev of ['session-start', 'session-end', 'pre-compact', 'pre-tool-use', 'post-tool-use', 'subagent-stop']) {
    const r = runHook([ev], { input: '%%%not json%%%' });
    assert.strictEqual(r.code, 0, `${ev} must exit 0 on garbage stdin`);
    if (r.stdout.trim()) assert.doesNotThrow(() => JSON.parse(r.stdout), `${ev} stdout must be empty or valid JSON`);
  }
});

test('invariant: unknown event and missing event exit 0', () => {
  assert.strictEqual(runHook(['no-such-event'], { input: '{}' }).code, 0);
  assert.strictEqual(runHook([], { input: '{}' }).code, 0);
});

// #1012 AC1: each of the five mutating verbs, given an undeclared `--*` flag,
// prints usage and performs ZERO reads/writes of any run-state.json —
// asserted by fixture-file content equality (mtime is filesystem-resolution
// dependent and not a reliable byte-for-byte signal on every platform; a
// content snapshot proves "untouched" at least as strongly and portably).
test('#1012 AC1: an unrecognized flag on any of the five mutating verbs prints usage and touches no run-state.json (close-run --help, and a plain typo on every other verb)', () => {
  const project = tmpProject();
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  fs.writeFileSync(path.join(run, 'run-state.json'), JSON.stringify({ status: 'active', worktree: '/tmp/wt', sessionId: 'owner' }));
  const before = fs.readFileSync(path.join(run, 'run-state.json'), 'utf8');

  const cases = [
    ['close-run', '--help'],
    ['record-worktree', '--bogus'],
    ['record-pr', '--bogus'],
    ['spec-status', '--bogus'],
    ['teardown-run', '--bogus'],
  ];
  for (const [verb, flag] of cases) {
    const result = runHook([verb, flag], { cwd: project, env: { CLAUDE_CODE_SESSION_ID: 'owner' } });
    assert.strictEqual(result.code, 0, `${verb} ${flag} must exit 0`);
    assert.match(result.stdout, new RegExp(`unrecognized flag ${flag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} — usage: ${verb}`), `${verb} ${flag} must print a usage line naming the flag`);
    assert.strictEqual(fs.readFileSync(path.join(run, 'run-state.json'), 'utf8'), before, `${verb} ${flag} must not touch run-state.json`);
  }
});

// #721 parity regression: resolveImplicitRunDir's step-3 scan must stay
// blind to an unadopted mint (bare mkdir, neither run-state.json nor
// decisions.md) exactly as resolveRun's own fallback already is — a mint
// classifies 'indeterminate' (not 'foreign') under classifyOwnership, so
// without an explicit exclusion it would count as a survivor/candidate and
// could even be selected outright, resurrecting the #721 hazard this test
// pins closed.
test('#1012/#721: an unadopted mint (bare mkdir, no decisions.md/run-state.json) is invisible to the implicit-resolution scan — the one real adopted run resolves unambiguously', () => {
  const project = gitRepo();
  const mint = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-15T090000-record-19-mint');
  fs.mkdirSync(mint, { recursive: true }); // bare mkdir — no decisions.md, no run-state.json
  const ownDir = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  fs.mkdirSync(ownDir, { recursive: true });
  fs.writeFileSync(path.join(ownDir, 'decisions.md'), '');

  const result = runHook(['record-worktree', '/tmp/wt-mint-test'], { cwd: project });
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /worktree recorded for 2026-07-01T090000-spec-1/,
    'the mint must not count as a second candidate — the one adopted run resolves unambiguously');
  assert.strictEqual(fs.existsSync(path.join(mint, 'run-state.json')), false, 'the mint must never be written to');
});

test('record-worktree writes run-state, prints a confirmation line, and close-run marks clean', () => {
  const project = tmpProject();
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  const recorded = runHook(['record-worktree', '/tmp/wt-1'], { cwd: project });
  assert.strictEqual(recorded.code, 0);
  assert.match(recorded.stdout, /claude-tweaks: worktree recorded for 2026-07-01T090000-spec-1/);
  let state = readRunState(run);
  assert.strictEqual(state.worktree, path.resolve('/tmp/wt-1'));
  assert.strictEqual(state.status, 'active');
  assert.strictEqual(runHook(['close-run'], { cwd: project }).code, 0);
  state = readRunState(run);
  assert.strictEqual(state.status, 'clean');
});

test('close-run on a run dir with no pre-existing run-state.json creates one and stamps it clean (#743 — refine standalone runs, which never call record-worktree)', () => {
  const project = tmpProject();
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  const statePath = path.join(run, 'run-state.json');
  // No record-worktree call, no prior writeRunState — mirrors a backlog refine
  // standalone run dir today: decisions.md gets written, run-state.json never does.
  assert.strictEqual(fs.existsSync(statePath), false,
    'precondition: run dir must start with no run-state.json at all');
  assert.strictEqual(runHook(['close-run', '--run', run], { cwd: project }).code, 0);
  assert.strictEqual(fs.existsSync(statePath), true,
    'close-run must create run-state.json when the run dir never had one — the premise refine-mode.md Step 5 now relies on');
  assert.strictEqual(readRunState(run).status, 'clean');
});

test('close-run warns when the run dir still holds un-archived work/ content (#1103)', () => {
  const project = tmpProject();
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  fs.mkdirSync(path.join(run, 'work'), { recursive: true });
  fs.writeFileSync(path.join(run, 'work', '1-spec.md'), '# 1\n');
  const result = runHook(['close-run', '--run', run], { cwd: project });
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /still holds un-archived work\/ content/,
    'expected close-run to note the pending archival as a routine informational reminder (#1103)');
  assert.match(result.stdout, /archive-run --run/);
});

test('close-run does NOT warn about un-archived work/ when no work/ content exists', () => {
  const project = tmpProject();
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  const result = runHook(['close-run', '--run', run], { cwd: project });
  assert.strictEqual(result.code, 0);
  assert.doesNotMatch(result.stdout, /still holds un-archived work\/ content/);
});

test('record-worktree --run pins the target run dir; without --run and two non-terminal candidates, it refuses rather than guessing (#1012 — supersedes the old "newest non-terminal run" fallback vulnerability)', () => {
  const project = gitRepo(); // #790: --run must resolve under a real git checkout
  const staleDir = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-15T090000-record-19');
  const ownDir = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  // staleDir sorts newer than ownDir and is non-terminal (interrupted, never
  // closed) — the OLD resolveRunDir fallback (listRunDirs[0], newest
  // non-terminal by name) picked staleDir over ownDir with no --run override:
  // exactly #19/#36's cross-contamination shape, a later unrelated call
  // resolving to an older run's directory because it was never marked clean.
  // #1012 replaces that guess with unambiguous-only resolution: with BOTH
  // dirs present as non-terminal candidates and neither provably this
  // caller's own (no worktree binding, no session id), resolveImplicitRunDir
  // finds two survivors and refuses outright rather than picking either.
  fs.mkdirSync(staleDir, { recursive: true });
  fs.writeFileSync(path.join(staleDir, 'run-state.json'), JSON.stringify({ status: 'interrupted' }));
  fs.mkdirSync(ownDir, { recursive: true });
  // #721/#1012: an unadopted mint (neither run-state.json nor decisions.md)
  // is invisible to resolveImplicitRunDir's candidate scan by design — touch
  // decisions.md so ownDir is a realistic adopted-but-unbound run (the shape
  // every flow-initialized run already has by the time record-worktree runs),
  // matching tmpProject()'s own fixture convention above.
  fs.writeFileSync(path.join(ownDir, 'decisions.md'), '');
  const staleStateBefore = readRunState(staleDir);

  const noFlag = runHook(['record-worktree', '/tmp/wt-fallback'], { cwd: project });
  assert.strictEqual(noFlag.code, 0);
  assert.match(noFlag.stdout, /multiple candidate runs — pass --run explicitly:/);
  assert.match(noFlag.stdout, /record-worktree --run "[^"]*2026-07-15T090000-record-19"/);
  assert.match(noFlag.stdout, /record-worktree --run "[^"]*2026-07-01T090000-spec-1"/);
  assert.strictEqual(fs.existsSync(path.join(ownDir, 'run-state.json')), false,
    'the refused implicit call must not write ownDir');
  assert.deepStrictEqual(readRunState(staleDir), staleStateBefore,
    'the refused implicit call must not touch staleDir either — no guessing');

  const withFlag = runHook(['record-worktree', '--run', ownDir, '/tmp/wt-correct'], { cwd: project });
  assert.strictEqual(withFlag.code, 0);
  assert.match(withFlag.stdout, /worktree recorded for 2026-07-01T090000-spec-1/);
  const ownState = readRunState(ownDir);
  assert.strictEqual(ownState.worktree, path.resolve('/tmp/wt-correct'));
  assert.strictEqual(ownState.status, 'active');
  assert.deepStrictEqual(readRunState(staleDir), staleStateBefore,
    'an explicitly-targeted --run call must not touch a different run dir at all');
});

test('record-worktree accepts --run before or after the worktree positional', () => {
  const project = tmpProject();
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  const result = runHook(['record-worktree', '/tmp/wt-2', '--run', run], { cwd: project });
  assert.strictEqual(result.code, 0);
  const state = readRunState(run);
  assert.strictEqual(state.worktree, path.resolve('/tmp/wt-2'));
});

test('record-worktree without a run dir exits 0 and prints a not-recorded notice', () => {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bare-'));
  const result = runHook(['record-worktree', '/tmp/wt'], { cwd: bare });
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /claude-tweaks: no pipeline run dir found — worktree not recorded/);
});

test('record-worktree with a non-existent --run path fails loudly instead of falling back or claiming success', () => {
  const project = tmpProject(); // has a real run dir the fallback WOULD find if we silently fell through
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  const bogus = path.join(project, 'does-not-exist');
  const result = runHook(['record-worktree', '--run', bogus, '/tmp/wt'], { cwd: project });
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /--run path rejected/);
  assert.doesNotMatch(result.stdout, /worktree recorded/);
  assert.strictEqual(fs.existsSync(path.join(run, 'run-state.json')), false,
    'an invalid --run must not silently fall back to a different run dir');
});

test('record-worktree --run with no following value fails loudly instead of falling back or claiming success', () => {
  const project = tmpProject(); // has a real run dir the fallback WOULD find if we silently fell through
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  // '--run' as the trailing token — flag present, no path follows it. Keep
  // the worktree positional present (before --run) so this isolates the
  // missing-value case from the separate "no worktree given" branch.
  const result = runHook(['record-worktree', '/tmp/wt-2', '--run'], { cwd: project });
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /claude-tweaks: --run path rejected: \(missing value\) — worktree not recorded/);
  assert.doesNotMatch(result.stdout, /worktree recorded/);
  assert.strictEqual(fs.existsSync(path.join(run, 'run-state.json')), false,
    '--run with a missing value must not silently fall back to a different run dir');
});

test('record-worktree reports a distinct failure when the run-state write itself fails', () => {
  const project = tmpProject();
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  fs.chmodSync(run, 0o500); // read+execute only — fs.writeFileSync inside it must throw
  try {
    const result = runHook(['record-worktree', '/tmp/wt-1'], { cwd: project });
    assert.strictEqual(result.code, 0);
    assert.match(result.stdout, /failed to record worktree/);
    assert.doesNotMatch(result.stdout, /worktree recorded for/);
  } finally {
    fs.chmodSync(run, 0o700);
  }
});

test('close-run with a non-existent --run path fails loudly instead of falling back', () => {
  const project = tmpProject();
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  runHook(['record-worktree', '/tmp/wt-1'], { cwd: project });
  const bogus = path.join(project, 'does-not-exist');
  const result = runHook(['close-run', '--run', bogus], { cwd: project });
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /--run path rejected/);
  const state = readRunState(run);
  assert.strictEqual(state.status, 'active', 'an invalid --run must not touch a different run dir at all');
});

test('close-run --run with no following value fails loudly instead of falling back to the newest non-terminal run', () => {
  const project = tmpProject();
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  // Prove the fallback WOULD find and close this run if --run's missing
  // value were silently ignored: record a worktree so it's active and
  // non-terminal — exactly what resolveRunDir's "newest non-terminal run"
  // scan picks up (see the #19/#36 cross-contamination shape above).
  assert.strictEqual(runHook(['record-worktree', '/tmp/wt-1'], { cwd: project }).code, 0);
  assert.strictEqual(readRunState(run).status, 'active');

  const result = runHook(['close-run', '--run'], { cwd: project });
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /claude-tweaks: --run path rejected: \(missing value\) — run not closed/);
  assert.strictEqual(readRunState(run).status, 'active',
    '--run with a missing value must not fall back to closing the newest non-terminal run');
});

// Regression: record-worktree's if/else-if chain had no branch for "a run
// dir was resolved but no worktree argument was given" — that case printed
// nothing and exited 0, indistinguishable from success.
test('record-worktree with a resolvable run dir but no worktree argument prints a not-recorded notice instead of silent success', () => {
  const project = tmpProject();
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  const result = runHook(['record-worktree'], { cwd: project });
  assert.strictEqual(result.code, 0);
  assert.ok(result.stdout.trim().length > 0, 'expected a diagnostic message, not silent success');
  assert.doesNotMatch(result.stdout, /worktree recorded/);
  assert.strictEqual(fs.existsSync(path.join(run, 'run-state.json')), false,
    'no worktree path was given — nothing should be recorded');
});

// Regression: close-run's analogous chain had no branch for "no run dir
// could be resolved and --run wasn't invalid" (i.e. --run omitted entirely
// and resolveRunDir's own fallback also found nothing) — that case also
// printed nothing and exited 0.
test('close-run with no resolvable run dir and no --run given prints a not-closed notice instead of silent success', () => {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bare-'));
  const result = runHook(['close-run'], { cwd: bare });
  assert.strictEqual(result.code, 0);
  assert.ok(result.stdout.trim().length > 0, 'expected a diagnostic message, not silent success');
});

test('record-worktree stamps the owning session from CLAUDE_CODE_SESSION_ID and preserves it on env-less re-record', () => {
  const project = tmpProject();
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  runHook(['record-worktree', '/tmp/wt-1'], { cwd: project, env: { CLAUDE_CODE_SESSION_ID: 'sess-owner' } });
  let state = readRunState(run);
  assert.strictEqual(state.sessionId, 'sess-owner');
  runHook(['record-worktree', '/tmp/wt-1'], { cwd: project, env: { CLAUDE_CODE_SESSION_ID: '' } });
  state = readRunState(run);
  assert.strictEqual(state.sessionId, 'sess-owner', 'env-less re-record must not clobber the stamp');
});

test('record-worktree without CLAUDE_CODE_SESSION_ID records no owner', () => {
  const project = tmpProject();
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  runHook(['record-worktree', '/tmp/wt-2'], { cwd: project, env: { CLAUDE_CODE_SESSION_ID: '' } });
  const state = readRunState(run);
  assert.ok(!('sessionId' in state), 'no env var -> no sessionId field');
});

test('close-run without --run REFUSES to close a run recorded by another (still-active) session, stays silent for the owner (finding regression)', () => {
  // Previously, a cross-session mismatch reached via the implicit fallback
  // (no --run) was only ever NOTED via a printed message but still
  // unconditionally closed — silently disarming the OTHER session's E1/E2/E3
  // enforcement with no way for it to know. #1012: with exactly one
  // non-terminal candidate that classifyOwnership can PROVE foreign (distinct
  // session ids, both present), resolveImplicitRunDir's step-3 scan itself
  // finds zero survivors and refuses — the candidates-refusal shape (AC #2's
  // "zero survivors" case), not closeRunState's own byte-pinned
  // 'refused-foreign' message (that one is reserved for an env/binding-
  // resolved single candidate that turns out foreign — see the explicit-run
  // test below, still exercising that same closeRunState path).
  const foreignProject = tmpProject();
  const foreignRun = path.join(foreignProject, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  runHook(['record-worktree', '/tmp/wt'], { cwd: foreignProject, env: { CLAUDE_CODE_SESSION_ID: 'owner' } });
  const foreign = runHook(['close-run'], { cwd: foreignProject, env: { CLAUDE_CODE_SESSION_ID: 'bystander' } });
  assert.strictEqual(foreign.code, 0);
  assert.match(foreign.stdout, /the only candidate run\(s\) are recorded by another session\/worktree — pass --run explicitly to act on one:/);
  assert.match(foreign.stdout, /close-run --run "[^"]*2026-07-01T090000-spec-1" \(recorded by another session\/worktree\)/);
  const foreignState = readRunState(foreignRun);
  assert.strictEqual(foreignState.status, 'active', 'the foreign session\'s run must remain active, not be silently closed');
  assert.strictEqual(foreignState.worktree, path.resolve('/tmp/wt'), 'the foreign session\'s worktree assignment must survive');

  const ownProject = tmpProject();
  runHook(['record-worktree', '/tmp/wt'], { cwd: ownProject, env: { CLAUDE_CODE_SESSION_ID: 'owner' } });
  const own = runHook(['close-run'], { cwd: ownProject, env: { CLAUDE_CODE_SESSION_ID: 'owner' } });
  assert.strictEqual(own.code, 0);
  assert.match(own.stdout, /no recorded wrap-up/,
    'the fixture has no wrap-up event, so close-run\'s new warn-tier check (#373) fires');
});

test('close-run WITH an explicit --run still closes a run recorded by another session — the refusal only applies to the implicit fallback', () => {
  const project = tmpProject();
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  runHook(['record-worktree', '/tmp/wt'], { cwd: project, env: { CLAUDE_CODE_SESSION_ID: 'owner' } });
  const result = runHook(['close-run', '--run', run], { cwd: project, env: { CLAUDE_CODE_SESSION_ID: 'bystander' } });
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /recorded by another session/);
  assert.doesNotMatch(result.stdout, /refusing to close/);
  assert.strictEqual(readRunState(run).status, 'clean', 'an explicitly-targeted --run intentionally overrides the cross-session refusal');
});

// Fixture for the two #1012 named regression tests below: four non-terminal
// run dirs (A-D), each bound to its OWN live harness worktree, all four
// recording the SAME sessionId — the #860/#758/#965 incident shape, in which
// session id alone can never tell the siblings apart. `main` must already
// have a commit (git worktree add needs a HEAD).
function seedSharedSessionRuns(main) {
  const runs = {};
  const worktrees = {};
  ['a', 'b', 'c', 'd'].forEach((name, i) => {
    const key = name.toUpperCase();
    worktrees[key] = harnessWorktreeOf(main, name);
    runs[key] = path.join(main, '.claude-tweaks', 'pipelines', `2026-07-01T09000${i + 1}-record-${name}`);
    fs.mkdirSync(runs[key], { recursive: true });
    fs.writeFileSync(path.join(runs[key], 'run-state.json'), JSON.stringify({
      status: 'active', worktree: worktrees[key], sessionId: 'shared-session',
    }));
  });
  return { runs, worktrees };
}

// Every run's state, keyed the same way as `runs` — the "nothing else moved"
// baseline both tests below compare against.
function snapshotRuns(runs) {
  return Object.fromEntries(Object.entries(runs).map(([key, dir]) => [key, readRunState(dir)]));
}

// #1012 named regression test — the exact incident shape (#860/#758, #965):
// N siblings sharing CLAUDE_CODE_SESSION_ID, one omits/mistypes --run, the
// old "newest non-terminal run" fallback (or the old session-id-only
// foreignOwner check) silently overwrites the WRONG run's state. Four
// non-terminal run dirs (A, B, C bound to their own live worktree; D bound to
// a fourth live worktree with no test caller ever invoking from it — the
// "agent absent" bystander), all four recording the SAME sessionId — the
// exact condition that defeated the pre-#1012 raw session-id comparison.
test('#1012: close-run --help touches no state, and bare close-run from a caller\'s own worktree closes only that caller\'s run — bystander run D is never touched (named regression, #860/#758/#965 incident shape)', () => {
  const main = gitRepo();
  execFileSync('git', ['-C', main, 'commit', '--allow-empty', '-m', 'init', '-q']);
  const { runs, worktrees } = seedSharedSessionRuns(main);
  const dSnapshotBefore = readRunState(runs.D);

  for (const key of ['A', 'B', 'C']) {
    const cwd = worktrees[key];
    const snapshotBefore = snapshotRuns(runs);

    const help = runHook(['close-run', '--help'], { cwd, env: { CLAUDE_CODE_SESSION_ID: 'shared-session' } });
    assert.strictEqual(help.code, 0);
    assert.match(help.stdout, /unrecognized flag --help/, `${key}: --help must hit the usage path`);
    for (const other of ['A', 'B', 'C', 'D']) {
      assert.deepStrictEqual(readRunState(runs[other]), snapshotBefore[other], `${key}: --help must not touch run ${other}`);
    }

    // D must never be touched by ANY iteration's close-run, whether or not
    // an earlier caller in this loop already closed its own run — checked
    // fresh after every bare close-run, not just once at the end, so a
    // regression is pinned to the exact call that caused it.
    const bare = runHook(['close-run'], { cwd, env: { CLAUDE_CODE_SESSION_ID: 'shared-session' } });
    assert.strictEqual(bare.code, 0);
    assert.strictEqual(readRunState(runs[key]).status, 'clean', `${key}: bare close-run must close its OWN cwd-bound run (step 2 hit)`);
    assert.deepStrictEqual(readRunState(runs.D), dSnapshotBefore, `${key}'s close-run must not touch bystander run D`);
  }
  // Each caller closed only itself — A/B/C all end 'clean', D (never a
  // caller's own cwd-bound run) ends untouched and still 'active'.
  assert.strictEqual(readRunState(runs.A).status, 'clean');
  assert.strictEqual(readRunState(runs.B).status, 'clean');
  assert.strictEqual(readRunState(runs.C).status, 'clean');
  assert.deepStrictEqual(readRunState(runs.D), dSnapshotBefore,
    'run D (bystander, agent absent) must end byte-identical across every --help probe and every caller\'s own close-run');
});

// Unbound-caller variant (#1012): the #860/#758 incident shape exactly — the
// stray caller has no run bound to its own cwd at all. Step 2 misses (no
// binding hit), step 3 excludes A/B/C/D as foreign (same sessionId, but each
// one's recorded binding names a DIFFERENT live worktree than this caller's
// cwd) leaving zero survivors, so resolution refuses instead of guessing —
// exercising step 4. Separate fixture from the sequential test above so nothing
// here has already been closed when the exclusion check runs.
test('#1012: an unbound caller (no run bound to its own cwd) invoking bare close-run refuses — every existing run classifies foreign, zero survivors, no state changes', () => {
  const main = gitRepo();
  execFileSync('git', ['-C', main, 'commit', '--allow-empty', '-m', 'init', '-q']);
  const { runs } = seedSharedSessionRuns(main);
  // The stray caller's own worktree — deliberately NOT the binding of any run
  // seeded above, so step 2's reverse lookup has nothing to hit.
  const wtUnbound = harnessWorktreeOf(main, 'unbound');
  const snapshotBefore = snapshotRuns(runs);

  const result = runHook(['close-run'], { cwd: wtUnbound, env: { CLAUDE_CODE_SESSION_ID: 'shared-session' } });
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /the only candidate run\(s\) are recorded by another session\/worktree — pass --run explicitly to act on one:/);
  for (const key of ['A', 'B', 'C', 'D']) {
    assert.ok(
      result.stdout.includes(`close-run --run "${runs[key]}" (recorded by another session/worktree)`),
      `refusal must list run ${key} as a foreign candidate: ${result.stdout}`,
    );
    assert.deepStrictEqual(readRunState(runs[key]), snapshotBefore[key], `run ${key} must be untouched by the refused unbound-caller call`);
  }
});

test('e2e: foreign-session commit in the main checkout is allowed with a systemMessage, not denied', () => {
  const project = tmpProject(); // already a git repo (tmpProject inits one) — the "main checkout" this test's title refers to
  // #861: `worktree` must be a REAL linked worktree of `project` (not an
  // independent gitRepo()) — pre-tool-use.js now tells "wrong location WITHIN
  // this project" apart from "an entirely unrelated repo" via each target's
  // own main-checkout root, so an unrelated worktree fixture would read as a
  // foreign repo and short-circuit to a bare allow with no systemMessage.
  execFileSync('git', ['-C', project, 'commit', '--allow-empty', '-q', '-m', 'init']);
  const worktree = linkedWorktreeOf(project);
  runHook(['record-worktree', worktree], { cwd: project, env: { CLAUDE_CODE_SESSION_ID: 'owner' } });

  const result = runHook(['pre-tool-use'], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git commit -m x' }, cwd: project, session_id: 'bystander' }),
    cwd: project,
  });
  assert.strictEqual(result.code, 0);
  assert.ok(!result.stdout.includes('permissionDecision'), `expected allow, got: ${result.stdout}`);
  assert.match(result.stdout, /"systemMessage"/);
  assert.match(result.stdout, /allowing this commit/);
});

test('close-run lifts E1 enforcement: pre-tool-use allows a commit outside the old worktree', () => {
  const project = tmpProject();
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  const worktree = gitRepo();
  const otherRepo = gitRepo();

  assert.strictEqual(runHook(['record-worktree', worktree], { cwd: project }).code, 0);
  assert.strictEqual(runHook(['close-run'], { cwd: project }).code, 0);

  const result = runHook(['pre-tool-use'], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git commit -m x' }, cwd: otherRepo }),
    env: { PIPELINE_RUN_DIR: run },
  });
  assert.strictEqual(result.code, 0);
  assert.ok(
    !result.stdout.includes('permissionDecision'),
    `expected close-run to lift E1 enforcement (no permissionDecision), got: ${result.stdout}`
  );
});

test('hooks.json registers PreToolUse matchers for Edit, Write, and NotebookEdit', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugin', 'hooks', 'hooks.json'), 'utf8'));
  const matchers = config.hooks.PreToolUse.map((entry) => entry.matcher);
  assert.ok(matchers.includes('Edit'), 'expected an Edit matcher');
  assert.ok(matchers.includes('Write'), 'expected a Write matcher');
  assert.ok(matchers.includes('NotebookEdit'), 'expected a NotebookEdit matcher');
});

test('hooks.json registers a PreToolUse matcher for ExitWorktree (unfiltered, literal tool-name match)', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugin', 'hooks', 'hooks.json'), 'utf8'));
  const entry = config.hooks.PreToolUse.find((e) => e.matcher === 'ExitWorktree');
  assert.ok(entry, 'expected a PreToolUse ExitWorktree matcher entry');
  assert.strictEqual(entry.hooks.length, 1);
  assert.strictEqual(entry.hooks[0].type, 'command');
  assert.ok(!('if' in entry.hooks[0]), 'ExitWorktree matcher must be a literal tool-name match, not pattern-filtered');
  assert.match(entry.hooks[0].command, /bin\/hooks\.js" pre-tool-use$/);
});

test("hooks.json's PreToolUse Bash `if` patterns include Bash(git worktree *)", () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugin', 'hooks', 'hooks.json'), 'utf8'));
  const bashEntry = config.hooks.PreToolUse.find((e) => e.matcher === 'Bash');
  const ifs = bashEntry.hooks.map((h) => h.if);
  assert.ok(ifs.includes('Bash(git worktree *)'), 'expected PreToolUse\'s Bash matcher to include an "if": "Bash(git worktree *)" entry');
});

test('hooks.json registers a PostToolUse matcher for Skill (unfiltered, literal tool-name match)', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugin', 'hooks', 'hooks.json'), 'utf8'));
  const skillEntry = config.hooks.PostToolUse.find((e) => e.matcher === 'Skill');
  assert.ok(skillEntry, 'expected a PostToolUse Skill matcher entry');
  assert.strictEqual(skillEntry.hooks.length, 1);
  assert.strictEqual(skillEntry.hooks[0].type, 'command');
  assert.ok(!('if' in skillEntry.hooks[0]), 'Skill matcher must be a literal tool-name match, not pattern-filtered');
  assert.match(skillEntry.hooks[0].command, /bin\/hooks\.js" post-tool-use$/);
});

test('hooks.json registers a PostToolUse matcher for AskUserQuestion (unfiltered, literal tool-name match)', () => {
  // Pinning test for a real gap: post-tool-use.js's run() has had an
  // `if (ctx.input.tool_name === 'AskUserQuestion') return logAskUserQuestion(ctx);`
  // branch since #452, but with no matcher entry here the hook was never
  // spawned for that tool at all — the branch was dead code in production.
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugin', 'hooks', 'hooks.json'), 'utf8'));
  const askEntry = config.hooks.PostToolUse.find((e) => e.matcher === 'AskUserQuestion');
  assert.ok(askEntry, 'expected a PostToolUse AskUserQuestion matcher entry');
  assert.strictEqual(askEntry.hooks.length, 1);
  assert.strictEqual(askEntry.hooks[0].type, 'command');
  assert.ok(!('if' in askEntry.hooks[0]), 'AskUserQuestion matcher must be a literal tool-name match, not pattern-filtered');
  assert.match(askEntry.hooks[0].command, /bin\/hooks\.js" post-tool-use$/);
});

test("hooks.json's PreToolUse/PostToolUse Bash `if` patterns cover every VALUE_FLAGS entry git-command.js's gitTargets() resolves (finding regression)", () => {
  // git-command.js's gitTargets() is written and unit-tested to correctly
  // resolve a commit/push target through `-c`, `--exec-path`, and
  // `--namespace` (VALUE_FLAGS), not just `-C` — but the parser is only ever
  // invoked at all if one of hooks.json's own `if` matchers first recognizes
  // the command shape enough to spawn bin/hooks.js. A commit issued as
  // `git -c user.name=x commit -m y` previously never even reached the
  // parser: no registered `if` pattern matched its literal text, so both
  // the worktree-always deny and the E1 wrong-checkout deny silently never
  // fired for this shape.
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'plugin', 'hooks', 'hooks.json'), 'utf8'));
  const requiredPatterns = ['Bash(git -c *)', 'Bash(git --exec-path=*)', 'Bash(git --namespace=*)'];
  for (const event of ['PreToolUse', 'PostToolUse']) {
    const bashEntry = config.hooks[event].find((e) => e.matcher === 'Bash');
    const ifs = bashEntry.hooks.map((h) => h.if);
    for (const pattern of requiredPatterns) {
      assert.ok(ifs.includes(pattern), `expected ${event}'s Bash matcher to include an "if": "${pattern}" entry`);
    }
  }
});

test('e2e: pre-tool-use CLI denies an Edit when worktree-always policy is set in the main checkout', () => {
  const project = gitRepo();
  writeWorktreeAlwaysPolicy(project);
  const result = runHook(['pre-tool-use'], {
    input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: path.join(project, 'a.txt') } }),
    cwd: project,
  });
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /"permissionDecision":"deny"/);
});

function policyRepoWithRun() {
  const project = gitRepo();
  writeWorktreeAlwaysPolicy(project);
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  fs.mkdirSync(run, { recursive: true });
  // #721: touch decisions.md so this run dir is adopted and reachable by
  // resolveRun's fallback (see tmpProject() above for the full rationale).
  fs.writeFileSync(path.join(run, 'decisions.md'), '');
  return { project, run };
}

test('a resolved deny appends a gate-denial event', () => {
  const { project, run } = policyRepoWithRun();
  const target = path.join(project, 'a.txt');
  const result = runHook(['pre-tool-use'], {
    input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: target } }),
    cwd: project,
  });
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /"permissionDecision":"deny"/);
  const events = fs.readFileSync(path.join(run, 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.strictEqual(events.length, 1, 'expected exactly one event appended');
  assert.strictEqual(events[0].type, 'gate-denial');
  assert.strictEqual(events[0].tool, 'Write');
  assert.strictEqual(events[0].path, target);
  // #1337: runHook's default env carries CT_HOOKS_TEST_MODE=1, so this
  // suite-produced denial is tagged — friction-events.js's readEvents
  // excludes it from aggregation on that basis.
  assert.strictEqual(events[0].test, true);
});

// #1337: a call site that overrides CT_HOOKS_TEST_MODE off (simulating a
// real, non-test invocation of the hook) must NOT tag its gate-denial event —
// the regression guard for "a real operator denial still logs and is still
// returned" (issue's Acceptance Criteria).
test('#1337: a gate-denial event is untagged when CT_HOOKS_TEST_MODE is not set', () => {
  const { project, run } = policyRepoWithRun();
  const target = path.join(project, 'a.txt');
  const result = runHook(['pre-tool-use'], {
    input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: target } }),
    cwd: project,
    env: { CT_HOOKS_TEST_MODE: '' },
  });
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /"permissionDecision":"deny"/);
  const events = fs.readFileSync(path.join(run, 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].type, 'gate-denial');
  assert.strictEqual('test' in events[0], false, 'a real denial must not carry the test-mode tag');
});

// #1270 regression: the #1130 fix (`PIPELINE_RUN_DIR: ''` in runHook's spread,
// proven above at 'record-pr does not resolve against an ambient
// PIPELINE_RUN_DIR...') guards run-state.json field writes. This is the sibling
// proof for events.jsonl specifically — the artifact #1270's own Current State
// named (`gate-denial`/`wd-foreign-session`/`close-without-wrapup` entries
// landing in a REAL run's events.jsonl). Ambient PIPELINE_RUN_DIR is set on
// THIS test runner's own process.env — exactly the shape a /flow-dispatched
// shell running `npm test` carries — pointed at a decoy "real" run dir
// entirely separate from the fixture project below, so if runHook's guard
// ever regressed, the gate-denial event triggered here would land in the
// decoy instead of (or in addition to) the correctly cwd-resolved run.
test('#1270: a gate-denial event never lands in an ambient PIPELINE_RUN_DIR the call site never passed', () => {
  const decoyRepo = gitRepo();
  const decoyRun = path.join(decoyRepo, '.claude-tweaks', 'pipelines', '2026-08-02T090000-record-9');
  fs.mkdirSync(decoyRun, { recursive: true });
  fs.writeFileSync(path.join(decoyRun, 'decisions.md'), '');
  const decoyEventsPath = path.join(decoyRun, 'events.jsonl');

  const { project, run } = policyRepoWithRun();
  const target = path.join(project, 'a.txt');

  const savedAmbient = process.env.PIPELINE_RUN_DIR;
  process.env.PIPELINE_RUN_DIR = decoyRun;
  let result;
  try {
    result = runHook(['pre-tool-use'], {
      input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: target } }),
      cwd: project,
    });
  } finally {
    if (savedAmbient === undefined) delete process.env.PIPELINE_RUN_DIR;
    else process.env.PIPELINE_RUN_DIR = savedAmbient;
  }

  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /"permissionDecision":"deny"/);
  assert.strictEqual(fs.existsSync(decoyEventsPath), false,
    'ambient PIPELINE_RUN_DIR must receive no events.jsonl entries from a call site that never passed it');
  const events = fs.readFileSync(path.join(run, 'events.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.strictEqual(events.length, 1, 'the real (cwd-resolved) run dir must still receive its own event');
  assert.strictEqual(events[0].type, 'gate-denial');
});

test('a deny with no resolved run dir writes nothing and still denies', () => {
  const project = gitRepo();
  writeWorktreeAlwaysPolicy(project);
  // Deliberately no .claude-tweaks/pipelines/ run dir at all, so
  // ctxLib.resolveRun finds nothing and ownedRun.dir is null — the
  // documented, accepted gap: ad-hoc work with no run dir records nothing.
  const target = path.join(project, 'a.txt');
  const result = runHook(['pre-tool-use'], {
    input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: target } }),
    cwd: project,
  });
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /"permissionDecision":"deny"/);
  assert.strictEqual(fs.existsSync(path.join(project, '.claude-tweaks', 'pipelines')), false,
    'no run dir existed before the call, so appending a breadcrumb must not create one');
});

test('a gate denial with an unwritable run dir still denies and exits 0', () => {
  const { project, run } = policyRepoWithRun();
  fs.chmodSync(run, 0o500); // read+execute only — fs.appendFileSync inside it must throw
  try {
    const target = path.join(project, 'a.txt');
    const result = runHook(['pre-tool-use'], {
      input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: target } }),
      cwd: project,
    });
    assert.strictEqual(result.code, 0);
    assert.match(result.stdout, /"permissionDecision":"deny"/);
    assert.strictEqual(fs.existsSync(path.join(run, 'events.jsonl')), false);
  } finally {
    fs.chmodSync(run, 0o700);
  }
});

test('e2e: pre-tool-use CLI allows an Edit when worktree-always policy is not set', () => {
  const project = gitRepo();
  const result = runHook(['pre-tool-use'], {
    input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: path.join(project, 'a.txt') } }),
    cwd: project,
  });
  assert.strictEqual(result.code, 0);
  assert.strictEqual(result.stdout, '');
});

// #409: record-pr writes run-state.json's pr:{number,url} field — same shape
// and precedent as record-worktree/close-run (CLAUDE.md's write-ownership rule).
test('record-pr writes run-state.pr and prints a confirmation line', () => {
  const project = tmpProject();
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  const result = runHook(['record-pr', '42', 'https://github.com/o/r/pull/42'], { cwd: project });
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /claude-tweaks: PR #42 recorded for 2026-07-01T090000-spec-1/);
  const state = readRunState(run);
  assert.deepStrictEqual(state.pr, { number: 42, url: 'https://github.com/o/r/pull/42' });
});

test('record-pr --run pins the target run dir, same as record-worktree', () => {
  const project = gitRepo(); // #790: --run must resolve under a real git checkout
  const staleDir = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-15T090000-record-19');
  fs.mkdirSync(staleDir, { recursive: true });
  fs.writeFileSync(path.join(staleDir, 'run-state.json'), JSON.stringify({ status: 'active' }));
  const ownDir = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  fs.mkdirSync(ownDir, { recursive: true });

  const result = runHook(['record-pr', '--run', ownDir, '7', 'https://github.com/o/r/pull/7'], { cwd: project });
  assert.strictEqual(result.code, 0);
  assert.deepStrictEqual(readRunState(ownDir).pr, { number: 7, url: 'https://github.com/o/r/pull/7' });
  assert.strictEqual(readRunState(staleDir).pr, undefined, 'the stale run must not have been written to');
});

test('record-pr with a non-existent --run path fails loudly instead of falling back or claiming success', () => {
  const project = tmpProject();
  const bogus = path.join(project, 'nope');
  const result = runHook(['record-pr', '--run', bogus, '7', 'https://github.com/o/r/pull/7'], { cwd: project });
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /--run path rejected/);
});

test('record-pr with no resolvable run dir prints a not-recorded notice instead of silent success', () => {
  const bare = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bare-'));
  const result = runHook(['record-pr', '7', 'https://github.com/o/r/pull/7'], { cwd: bare });
  assert.strictEqual(result.code, 0);
  assert.ok(result.stdout.trim().length > 0, 'expected a diagnostic message, not silent success');
  assert.doesNotMatch(result.stdout, /PR #7 recorded/);
});

test('record-pr with a non-numeric or missing number/url prints a usage notice instead of writing garbage state', () => {
  const project = tmpProject();
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  for (const args of [['record-pr'], ['record-pr', 'not-a-number', 'https://x'], ['record-pr', '7']]) {
    const result = runHook(args, { cwd: project });
    assert.strictEqual(result.code, 0);
    assert.match(result.stdout, /usage: record-pr/);
    assert.strictEqual(fs.existsSync(path.join(run, 'run-state.json')), false);
  }
});

// #1012 deliverable 3: record-worktree, record-pr, and spec-status had NO
// ownership check at all on the implicit path before this record — closeRunState
// already had one (upgraded above). This exercises the write-time guard added
// to all three: an env-resolved (PIPELINE_RUN_DIR) run that classifyOwnership
// can prove foreign (distinct session ids, both present — no worktree fixture
// needed for that classification arm) must refuse the write, not silently stomp it.
test('#1012 deliverable 3: record-worktree/record-pr/spec-status refuse an implicit write when PIPELINE_RUN_DIR resolves to a foreign-session run', () => {
  const project = tmpProject();
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  fs.writeFileSync(path.join(run, 'run-state.json'), JSON.stringify({ status: 'active', worktree: '/tmp/wt-owner', sessionId: 'owner' }));
  fs.writeFileSync(path.join(run, 'manifest.yml'), 'specs: []\n');
  const before = fs.readFileSync(path.join(run, 'run-state.json'), 'utf8');
  const env = { CLAUDE_CODE_SESSION_ID: 'bystander', PIPELINE_RUN_DIR: run };

  const wt = runHook(['record-worktree', '/tmp/wt-bystander'], { cwd: project, env });
  assert.strictEqual(wt.code, 0);
  assert.match(wt.stdout, /the only candidate run\(s\) are recorded by another session\/worktree — pass --run explicitly to act on one:/);
  assert.strictEqual(fs.readFileSync(path.join(run, 'run-state.json'), 'utf8'), before, 'record-worktree must not overwrite a foreign env-resolved run');

  const pr = runHook(['record-pr', '42', 'https://github.com/o/r/pull/42'], { cwd: project, env });
  assert.strictEqual(pr.code, 0);
  assert.match(pr.stdout, /the only candidate run\(s\) are recorded by another session\/worktree — pass --run explicitly to act on one:/);
  assert.strictEqual(fs.readFileSync(path.join(run, 'run-state.json'), 'utf8'), before, 'record-pr must not overwrite a foreign env-resolved run');

  const status = runHook(['spec-status', '--spec', '1', '--status', 'running', '--phase', 'build'], { cwd: project, env });
  assert.strictEqual(status.code, 0);
  assert.match(status.stdout, /the only candidate run\(s\) are recorded by another session\/worktree — pass --run explicitly to act on one:/);
  assert.strictEqual(fs.readFileSync(path.join(run, 'run-state.json'), 'utf8'), before, 'spec-status must not act on a foreign env-resolved run');
});

test('check-resume-freshness: reports OK when the run is not interrupted', () => {
  const project = tmpProject();
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-08-01T000000-record-1');
  fs.mkdirSync(run, { recursive: true });
  fs.writeFileSync(path.join(run, 'run-state.json'), JSON.stringify({ status: 'active', sessionId: 'other' }));
  const result = runHook(['check-resume-freshness', '--run', run], { cwd: project, env: { CLAUDE_CODE_SESSION_ID: 'me' } });
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /freshness OK for 2026-08-01T000000-record-1 \(not-interrupted\)/);
});

test('check-resume-freshness: reports BLOCKED with a reason when the run is interrupted and the recorded worktree has a fresh commit', () => {
  const project = tmpProject();
  const wt = gitRepo();
  execFileSync('git', ['-C', wt, 'commit', '--allow-empty', '-m', 'recent', '-q']);
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-08-01T000000-record-2');
  fs.mkdirSync(run, { recursive: true });
  fs.writeFileSync(path.join(run, 'run-state.json'), JSON.stringify({ status: 'interrupted', sessionId: 'other', worktree: wt }));
  const result = runHook(['check-resume-freshness', '--run', run], { cwd: project, env: { CLAUDE_CODE_SESSION_ID: 'me' } });
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /freshness BLOCKED for 2026-08-01T000000-record-2 — run appears actively owned \(worktree committed to within the last \d+ minutes\)/);
});

test('check-resume-freshness: no resolvable --run path reports the not-found line', () => {
  const project = tmpProject();
  const result = runHook(['check-resume-freshness', '--run', path.join(project, 'nope')], { cwd: project });
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /--run path rejected/);
});

test('check-staged-inventory: reports OK when decisions.md has no STAGED entries', () => {
  const project = tmpProject();
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-08-01T000000-record-3');
  fs.mkdirSync(run, { recursive: true });
  fs.writeFileSync(path.join(run, 'decisions.md'), 'AUTO 14:32:14 — Step 1.5: scope-creep applied. Reversibility: high.');
  const result = runHook(['check-staged-inventory', '--run', run], { cwd: project });
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /staged inventory OK for 2026-08-01T000000-record-3 \(0 STAGED entries\)/);
});

test('check-staged-inventory: reports OK when every STAGED entry has a backing file', () => {
  const project = tmpProject();
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-08-01T000000-record-4');
  fs.mkdirSync(path.join(run, 'staged'), { recursive: true });
  fs.writeFileSync(path.join(run, 'staged', 'review-1.patch'), 'diff');
  fs.writeFileSync(path.join(run, 'decisions.md'), 'STAGED 14:41:15 — Step 3 Routing: finding. Stage path: staged/review-1.patch.');
  const result = runHook(['check-staged-inventory', '--run', run], { cwd: project });
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /staged inventory OK for 2026-08-01T000000-record-4 \(1 STAGED entries\)/);
});

test('check-staged-inventory: reports MISMATCH naming the missing path when a STAGED entry has no backing file', () => {
  const project = tmpProject();
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-08-01T000000-record-5');
  fs.mkdirSync(run, { recursive: true });
  fs.writeFileSync(path.join(run, 'decisions.md'), 'STAGED 08:22:19 — Step 3 lens dispatch: deferred finding. Stage path: staged/review-defer-1.md.');
  const result = runHook(['check-staged-inventory', '--run', run], { cwd: project });
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /staged inventory MISMATCH for 2026-08-01T000000-record-5 — 1 of 1 STAGED entries missing from staged\/: staged\/review-defer-1\.md/);
});

test('check-staged-inventory: no resolvable --run path reports the not-found line', () => {
  const project = tmpProject();
  const result = runHook(['check-staged-inventory', '--run', path.join(project, 'nope')], { cwd: project });
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /--run path rejected/);
});

// #1130: a runHook call that omits cwd BOTH in execFileSync's options and in
// the JSON payload used to fall through to the spawned subprocess's own
// process.cwd() — the test runner's real working directory. When that
// directory sits inside a real checkout, iterRunDirsWithState walked the
// REAL .claude-tweaks/pipelines/ and appendEvent wrote fixture literals into
// a real run's events.jsonl (the #657 incident's pollution mechanism). The
// hardened helper defaults to an isolated sandbox dir instead, so the decoy
// "real" run dir below must stay byte-untouched.
//
// Note (verified during Step 3): the brief's original Bash/`git commit`
// payload never reaches appendEvent, pre- or post-fix — E1's wd-deny path
// requires `safeReal(ctx.runState.worktree)` to resolve, and the decoy
// `/tmp/wt-decoy` doesn't exist on disk, so runInner returns early before
// ever writing. Per Step 3's fallback instruction, this uses a Write-tool
// payload targeting a path inside the decoy repo instead (mirroring 'a
// resolved deny appends a gate-denial event' above) — checkWorktreeRequired's
// gate-denial write depends on `ownedRun`, which IS resolved from `ctx.cwd`
// (via resolveRun's iterRunDirsWithState(cwd) scan), so this payload
// discriminates pre/post-fix correctly: pre-fix, cwd falls through to the
// decoy repo and ownedRun resolves to the decoy run; post-fix, cwd is the
// isolated sandbox, which has no `.claude-tweaks/pipelines/` at all, so
// ownedRun.dir is null and appendEvent no-ops.
test('a hook spawned with no cwd anywhere cannot write into a real run dir reachable from the test runner process.cwd()', () => {
  const decoyRepo = gitRepo();
  writeWorktreeAlwaysPolicy(decoyRepo);
  const decoyRun = path.join(decoyRepo, '.claude-tweaks', 'pipelines', '2026-08-01T090000-record-9');
  fs.mkdirSync(decoyRun, { recursive: true });
  fs.writeFileSync(path.join(decoyRun, 'run-state.json'), JSON.stringify({ status: 'active', worktree: '/tmp/wt-decoy', sessionId: 'decoy-owner' }));
  const eventsPath = path.join(decoyRun, 'events.jsonl');

  const realCwd = process.cwd();
  process.chdir(decoyRepo);
  try {
    // Write-shaped payload with NO cwd field, NO options.cwd, NO
    // PIPELINE_RUN_DIR, NO session_id: pre-fix, this resolves cwd to
    // process.cwd() (= decoyRepo) and can append a gate-denial event to the
    // decoy run via ownedRun's unfiltered fallback resolution.
    runHook(['pre-tool-use'], {
      input: JSON.stringify({
        tool_name: 'Write',
        tool_input: { file_path: path.join(decoyRepo, 'a.txt') },
      }),
    });
  } finally {
    process.chdir(realCwd);
  }

  assert.strictEqual(fs.existsSync(eventsPath), false,
    'decoy run dir must receive no events from a cwd-omitting hook spawn');
  const state = JSON.parse(fs.readFileSync(path.join(decoyRun, 'run-state.json'), 'utf8'));
  assert.strictEqual(state.status, 'active', 'decoy run-state.json must be untouched');
});

// #1130 (env leak): resolveRun checks env.PIPELINE_RUN_DIR BEFORE any cwd
// scan (plugin/bin/lib/hooks/context.js's resolveRun). Every /flow-dispatched
// shell carries an ambient PIPELINE_RUN_DIR pointed at that run's own
// directory. runHook's `{ ...process.env, ...env }` spread forwards that
// ambient value to every spawned hooks.js call whose own `env` option doesn't
// override it — so a call site that never mentions PIPELINE_RUN_DIR at all
// still resolves against whatever real run dir happens to be ambient in the
// TEST RUNNER's own process.env when `npm test` itself runs inside a
// /flow-dispatched shell. Reproduced live by the reviewer: record-pr fixture
// calls wrote `pr:{number:7,url:"..."}` into a stand-in foreign run dir this
// way. The guard (`PIPELINE_RUN_DIR: ''` between the process.env spread and
// the caller's env) neutralizes the ambient value so only an explicit
// call-site `env.PIPELINE_RUN_DIR` can select a run dir.
test('record-pr does not resolve against an ambient PIPELINE_RUN_DIR the call site never passed', () => {
  const decoyRepo = gitRepo();
  const decoyRun = path.join(decoyRepo, '.claude-tweaks', 'pipelines', '2026-08-02T090000-record-9');
  fs.mkdirSync(decoyRun, { recursive: true });
  fs.writeFileSync(path.join(decoyRun, 'run-state.json'), JSON.stringify({ status: 'active' }));

  // Simulate a /flow-dispatched shell: PIPELINE_RUN_DIR ambient in the test
  // runner's OWN process.env, pointed at the decoy run — NOT passed via this
  // call's `env` option.
  const savedAmbient = process.env.PIPELINE_RUN_DIR;
  process.env.PIPELINE_RUN_DIR = decoyRun;
  let result;
  try {
    result = runHook(['record-pr', '7', 'https://github.com/o/r/pull/7']);
  } finally {
    if (savedAmbient === undefined) delete process.env.PIPELINE_RUN_DIR;
    else process.env.PIPELINE_RUN_DIR = savedAmbient;
  }

  assert.match(result.stdout, /no pipeline run dir found/,
    'a call site that never passed PIPELINE_RUN_DIR must not resolve one from the test runner\'s ambient env');
  const state = JSON.parse(fs.readFileSync(path.join(decoyRun, 'run-state.json'), 'utf8'));
  assert.strictEqual(state.pr, undefined, 'decoy run-state.json must gain no pr field from the ambient env leak');
});
