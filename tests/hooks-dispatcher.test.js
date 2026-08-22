// tests/hooks-dispatcher.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readRunState } = require('../plugin/bin/lib/hooks/context');
const { linkedWorktreeOf } = require('./helpers/git-fixtures');

const HOOKS = path.join(__dirname, '..', 'plugin', 'bin', 'hooks.js');

function runHook(args, { input = '', cwd = undefined, env = {} } = {}) {
  try {
    const stdout = execFileSync('node', [HOOKS, ...args], {
      input, cwd, encoding: 'utf8', env: { ...process.env, ...env },
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
  assert.match(result.stdout, /still holds un-archived git-tracked work\/ content/,
    'expected close-run to warn about the un-archived work/ ordering hazard (#1103)');
  assert.match(result.stdout, /archive-run --run/);
});

test('close-run does NOT warn about un-archived work/ when no work/ content exists', () => {
  const project = tmpProject();
  const run = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  const result = runHook(['close-run', '--run', run], { cwd: project });
  assert.strictEqual(result.code, 0);
  assert.doesNotMatch(result.stdout, /still holds un-archived git-tracked work\/ content/);
});

test('record-worktree --run pins the target run dir, ignoring a newer stale non-terminal run that would otherwise win the fallback', () => {
  const project = gitRepo(); // #790: --run must resolve under a real git checkout
  const staleDir = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-15T090000-record-19');
  const ownDir = path.join(project, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  // staleDir sorts newer than ownDir and is non-terminal (interrupted, never
  // closed) — resolveRunDir's fallback (listRunDirs[0], newest non-terminal
  // by name) would pick staleDir over ownDir with no --run override. This is
  // exactly #19/#36's cross-contamination shape: a later, unrelated call
  // resolving to an older run's directory because it was never marked clean.
  fs.mkdirSync(staleDir, { recursive: true });
  fs.writeFileSync(path.join(staleDir, 'run-state.json'), JSON.stringify({ status: 'interrupted' }));
  fs.mkdirSync(ownDir, { recursive: true });

  const noFlag = runHook(['record-worktree', '/tmp/wt-fallback'], { cwd: project });
  assert.strictEqual(noFlag.code, 0);
  assert.match(noFlag.stdout, /worktree recorded for 2026-07-15T090000-record-19/,
    'sanity check: without --run, the fallback really does pick the newer stale run, not ownDir');
  assert.strictEqual(fs.existsSync(path.join(ownDir, 'run-state.json')), false);
  // The no-flag call above IS the vulnerability being demonstrated — it just
  // corrupted staleDir's state exactly like #19/#36. Snapshot that corrupted
  // state so the next assertion can prove the FIX (an explicitly-targeted
  // --run call) doesn't compound it by touching staleDir a second time.
  const staleStateAfterFallback = readRunState(staleDir);

  const withFlag = runHook(['record-worktree', '--run', ownDir, '/tmp/wt-correct'], { cwd: project });
  assert.strictEqual(withFlag.code, 0);
  assert.match(withFlag.stdout, /worktree recorded for 2026-07-01T090000-spec-1/);
  const ownState = readRunState(ownDir);
  assert.strictEqual(ownState.worktree, path.resolve('/tmp/wt-correct'));
  assert.strictEqual(ownState.status, 'active');
  const staleStateAfterExplicitCall = readRunState(staleDir);
  assert.deepStrictEqual(staleStateAfterExplicitCall, staleStateAfterFallback,
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
  // enforcement with no way for it to know.
  const foreignProject = tmpProject();
  const foreignRun = path.join(foreignProject, '.claude-tweaks', 'pipelines', '2026-07-01T090000-spec-1');
  runHook(['record-worktree', '/tmp/wt'], { cwd: foreignProject, env: { CLAUDE_CODE_SESSION_ID: 'owner' } });
  const foreign = runHook(['close-run'], { cwd: foreignProject, env: { CLAUDE_CODE_SESSION_ID: 'bystander' } });
  assert.strictEqual(foreign.code, 0);
  assert.match(foreign.stdout, /recorded by another session/);
  assert.match(foreign.stdout, /refusing to close/);
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
  fs.mkdirSync(path.join(project, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(project, '.claude-tweaks', 'policy.yml'), 'worktree-always: true\n');
  const result = runHook(['pre-tool-use'], {
    input: JSON.stringify({ tool_name: 'Edit', tool_input: { file_path: path.join(project, 'a.txt') } }),
    cwd: project,
  });
  assert.strictEqual(result.code, 0);
  assert.match(result.stdout, /"permissionDecision":"deny"/);
});

function policyRepoWithRun() {
  const project = gitRepo();
  fs.mkdirSync(path.join(project, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(project, '.claude-tweaks', 'policy.yml'), 'worktree-always: true\n');
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
});

test('a deny with no resolved run dir writes nothing and still denies', () => {
  const project = gitRepo();
  fs.mkdirSync(path.join(project, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(project, '.claude-tweaks', 'policy.yml'), 'worktree-always: true\n');
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
