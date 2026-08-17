// tests/hooks-session-start.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sessionStart = require('../bin/lib/hooks/session-start');
const deps = require('../bin/lib/deps');

function tmpProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ss-'));
  fs.mkdirSync(path.join(dir, '.claude-tweaks', 'pipelines'), { recursive: true });
  return dir;
}
function mkRun(project, name, state) {
  const run = path.join(project, '.claude-tweaks', 'pipelines', name);
  fs.mkdirSync(run, { recursive: true });
  if (state) fs.writeFileSync(path.join(run, 'run-state.json'), JSON.stringify(state));
  return run;
}

test('deps.collect returns an array of strings and prints nothing', () => {
  const msgs = deps.collect();
  assert.ok(Array.isArray(msgs));
  for (const m of msgs) assert.strictEqual(typeof m, 'string');
});

test('stale runs are reported in additionalContext, capped at 3, newest first', () => {
  const project = tmpProject();
  // Four non-clean runs (more than MAX_REPORTED=3) so the cap is actually exercised —
  // with only 2 non-clean candidates, listRunDirsWithState's own clean-status filter
  // (which drops spec-0 below) does all the work and .slice(0, 3) is a no-op, unable to
  // distinguish "the cap correctly keeps 3" from "there is no cap at all".
  mkRun(project, '2026-07-01T090000-spec-1', { status: 'interrupted' });
  mkRun(project, '2026-07-02T090000-spec-2', { status: 'active' });
  mkRun(project, '2026-07-03T090000-spec-3', { status: 'interrupted' });
  mkRun(project, '2026-07-04T090000-spec-4', { status: 'active' });
  mkRun(project, '2026-06-30T090000-spec-0', { status: 'clean' });
  const out = sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
  const ctx = out.json.hookSpecificOutput.additionalContext;
  assert.strictEqual(out.json.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(ctx, /unfinished pipeline run/i);
  assert.match(ctx, /spec-4/);
  assert.match(ctx, /spec-3/);
  assert.match(ctx, /spec-2/);
  assert.doesNotMatch(ctx, /spec-1/, 'the oldest of 4 non-clean runs must be excluded by the MAX_REPORTED=3 cap');
  assert.doesNotMatch(ctx, /spec-0/, 'the clean run must be excluded before the cap ever runs');
  assert.ok(ctx.indexOf('spec-4') < ctx.indexOf('spec-3'), 'newest-first: spec-4 before spec-3');
  assert.ok(ctx.indexOf('spec-3') < ctx.indexOf('spec-2'), 'newest-first: spec-3 before spec-2');
});

test('#410: a stale run carrying a recorded pr URL includes it in the reported line; one without does not', () => {
  const project = tmpProject();
  mkRun(project, '2026-07-01T090000-spec-1', { status: 'active', pr: { number: 42, url: 'https://github.com/o/r/pull/42' } });
  mkRun(project, '2026-07-02T090000-spec-2', { status: 'interrupted' });
  const out = sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
  const ctx = out.json.hookSpecificOutput.additionalContext;
  assert.match(ctx, /spec-1 \(status: active\) — PR https:\/\/github\.com\/o\/r\/pull\/42/);
  assert.match(ctx, /spec-2 \(status: interrupted\)\n/, 'a run with no recorded pr must not gain a PR suffix');
});

test('close-run hint substitutes CLAUDE_PLUGIN_ROOT when set, else keeps the literal placeholder', () => {
  const project = tmpProject();
  mkRun(project, '2026-07-01T090000-spec-1', { status: 'interrupted' });
  const orig = process.env.CLAUDE_PLUGIN_ROOT;

  try {
    delete process.env.CLAUDE_PLUGIN_ROOT;
    const withoutEnv = sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
    assert.match(withoutEnv.json.hookSpecificOutput.additionalContext, /\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/hooks\.js/);

    process.env.CLAUDE_PLUGIN_ROOT = '/opt/claude-tweaks';
    const withEnv = sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
    assert.match(withEnv.json.hookSpecificOutput.additionalContext, /\/opt\/claude-tweaks\/bin\/hooks\.js/);
  } finally {
    if (orig === undefined) delete process.env.CLAUDE_PLUGIN_ROOT;
    else process.env.CLAUDE_PLUGIN_ROOT = orig;
  }
});

test('no stale runs and no deps warnings -> no json output', () => {
  const project = tmpProject();
  mkRun(project, '2026-07-01T090000-spec-1', { status: 'clean' });
  const out = sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
  if (out.json) {
    // On machines missing agent-browser, deps warnings alone may produce output — accept both, but stale-run text must be absent.
    assert.doesNotMatch(out.json.hookSpecificOutput.additionalContext, /unfinished pipeline run/i);
  } else {
    assert.deepStrictEqual(out, {});
  }
});

function gitProject() {
  const dir = tmpProject();
  execFileSync('git', ['-C', dir, 'init', '-q']);
  return dir;
}
function withPolicy(repo, content) {
  fs.mkdirSync(path.join(repo, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.claude-tweaks', 'policy.yml'), content);
}

test('worktree-always nudge appears when policy is on and session is not yet isolated', () => {
  const project = gitProject();
  withPolicy(project, 'worktree-always: true\n');
  const out = sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
  assert.match(out.json.hookSpecificOutput.additionalContext, /worktree-always/);
  assert.match(out.json.hookSpecificOutput.additionalContext, /using-git-worktrees/);
});

test('worktree-always nudge is absent when policy is off', () => {
  const project = gitProject();
  const out = sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
  if (out.json) assert.doesNotMatch(out.json.hookSpecificOutput.additionalContext, /worktree-always/);
  else assert.deepStrictEqual(out, {});
});

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

// #408 AC1: a session starting in a checkout strictly behind origin gets its
// integration branch fast-forwarded before additionalContext renders, with a
// one-line reconcile summary when anything changed.
test('SessionStart fast-forwards a behind-and-clean integration branch via reconcile(), and reports it in additionalContext (#408 AC1)', () => {
  const originDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ss-origin-'));
  git(['init', '-q', '--bare', '--initial-branch=main'], originDir);

  // seedDir is the ONLY pusher of history-defining commits — mainDir only
  // ever reads. Two independent pushers of sibling commits (both children
  // of the same parent) would diverge on the shared bare origin; having a
  // single writer avoids that entirely rather than working around it.
  const seedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ss-seed-'));
  git(['clone', '-q', originDir, seedDir]);
  git(['config', 'user.email', 'test@example.com'], seedDir);
  git(['config', 'user.name', 'Test'], seedDir);
  fs.writeFileSync(path.join(seedDir, 'a.txt'), 'one\n');
  git(['add', 'a.txt'], seedDir);
  git(['commit', '-q', '-m', 'seed'], seedDir);
  // Committed as part of the seed commit, not added post-clone in mainDir —
  // an untracked or separately-pushed policy.yml would either make the
  // working tree read as dirty or force a second, diverging pusher (see
  // above), both of which would mask the real fast-forward behavior this
  // test is checking.
  fs.mkdirSync(path.join(seedDir, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(seedDir, '.claude-tweaks', 'policy.yml'), 'integration-model: pr-first\n');
  git(['add', '.claude-tweaks/policy.yml'], seedDir);
  git(['commit', '-q', '-m', 'policy'], seedDir);
  git(['push', '-q', 'origin', 'main'], seedDir);

  const mainDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ss-main-'));
  git(['clone', '-q', originDir, mainDir]);
  git(['config', 'user.email', 'test@example.com'], mainDir);
  git(['config', 'user.name', 'Test'], mainDir);

  // Origin moves ahead — mainDir is now strictly behind and clean.
  fs.writeFileSync(path.join(seedDir, 'b.txt'), 'two\n');
  git(['add', 'b.txt'], seedDir);
  git(['commit', '-q', '-m', 'second'], seedDir);
  git(['push', '-q', 'origin', 'main'], seedDir);

  const before = git(['rev-parse', 'HEAD'], mainDir).trim();
  const out = sessionStart.run({ input: {}, runDir: null, runState: null, cwd: mainDir });
  const after = git(['rev-parse', 'HEAD'], mainDir).trim();

  assert.notStrictEqual(before, after, 'the integration branch must be fast-forwarded during SessionStart');
  assert.strictEqual(after, git(['rev-parse', 'origin/main'], mainDir).trim());
  assert.ok(out.json, 'a change occurred, so additionalContext must render');
  assert.match(out.json.hookSpecificOutput.additionalContext, /reconciled.*fast-forwarded/i);
});

test('#413: a run carrying an unresolved console.json never crashes SessionStart, and produces no answered-console message when gh cannot resolve the PR', () => {
  // No live PR/gh mocking convention exists in this suite (console-execute.js
  // is gh-CLI-only) — this proves the wiring is safe under exactly the
  // network-failure/gh-absent skip path every other reconcile check already
  // takes, not the positive "answered console" path (covered by
  // tests/console-execute.test.js's pure decideConsoleExecute unit tests).
  const project = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ss-console-')));
  execFileSync('git', ['init', '-q', '--initial-branch=main'], { cwd: project });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: project });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: project });
  fs.writeFileSync(path.join(project, 'a.txt'), 'one\n');
  execFileSync('git', ['add', 'a.txt'], { cwd: project });
  execFileSync('git', ['commit', '-q', '-m', 'seed'], { cwd: project });

  const run = mkRun(project, '2026-01-01T000000-test', { status: 'active' });
  fs.writeFileSync(path.join(run, 'console.json'), JSON.stringify({
    resolved: false, commentIds: ['IC_fake'], prNumber: 999999, items: [],
  }));

  const out = sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
  if (out.json) {
    assert.doesNotMatch(out.json.hookSpecificOutput.additionalContext, /answered console\(s\) awaiting execution/);
  }
});

test('#561: a redTip finding from reconcile() renders as its own additionalContext line', () => {
  const project = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ss-redtip-')));
  execFileSync('git', ['init', '-q', '--initial-branch=main'], { cwd: project });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: project });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: project });
  fs.writeFileSync(path.join(project, 'a.txt'), 'one\n');
  execFileSync('git', ['add', 'a.txt'], { cwd: project });
  execFileSync('git', ['commit', '-q', '-m', 'seed'], { cwd: project });

  // Stub reconcile() at the module boundary session-start.js imports it
  // from. session-start.js destructures `const { reconcile } =
  // require('../reconcile')` at its own load time, so mutating the export
  // AFTER session-start.js has already loaded (the top-of-file `sessionStart`
  // binding) would not be observed — that binding already captured the
  // original function reference. Instead: patch the already-cached reconcile
  // module's export in place (module identity/cache entry unchanged, so this
  // IS the object any require of the same resolved path returns), then bust
  // ONLY session-start.js's own cache entry and re-require it fresh so its
  // top-level destructure re-runs against the now-patched export. Same
  // require.cache-busting convention tests/bin-lib/code-health/
  // focus-generators.test.js already uses for a require-order concern.
  const reconcileMod = require('../bin/lib/reconcile');
  const original = reconcileMod.reconcile;
  reconcileMod.reconcile = () => ({
    mirror: null, redTip: { branch: 'main', sha: '0123456789abcdef', failing: ['ci/tests'], message: 'CI is red on main tip at 0123456 — ci/tests' },
    worktrees: null, claims: null, runs: null, branches: null, console: null, skipped: [],
  });
  delete require.cache[require.resolve('../bin/lib/hooks/session-start')];
  try {
    const freshSessionStart = require('../bin/lib/hooks/session-start');
    const out = freshSessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
    assert.ok(out.json, 'a redTip finding must render additionalContext');
    assert.match(out.json.hookSpecificOutput.additionalContext, /CI is red on main tip at 0123456 — ci\/tests/);
  } finally {
    reconcileMod.reconcile = original;
    // Restore a clean (unpatched) session-start module in the cache so
    // every later test in this file — including ones already holding the
    // original top-of-file `sessionStart` binding, which is unaffected
    // either way — sees the real reconcile() again if it re-requires fresh.
    delete require.cache[require.resolve('../bin/lib/hooks/session-start')];
    require('../bin/lib/hooks/session-start');
  }
});

test('#561: no redTip finding produces no red-tip line (AC5 — green tip)', () => {
  const project = gitProject();
  const out = sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
  if (out.json) assert.doesNotMatch(out.json.hookSpecificOutput.additionalContext, /CI is red on/);
  else assert.deepStrictEqual(out, {});
});

test('worktree-always nudge is absent when the session is already inside a linked worktree', () => {
  const project = gitProject();
  execFileSync('git', ['-C', project, 'commit', '--allow-empty', '-m', 'init', '-q']);
  withPolicy(project, 'worktree-always: true\n');
  execFileSync('git', ['-C', project, 'add', '.claude-tweaks/policy.yml']);
  execFileSync('git', ['-C', project, 'commit', '-m', 'policy', '-q']);
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ss-wt-'));
  const wt = path.join(parent, 'wt');
  execFileSync('git', ['-C', project, 'worktree', 'add', '-q', wt, '-b', 'wt-branch']);
  const out = sessionStart.run({ input: {}, runDir: null, runState: null, cwd: fs.realpathSync(wt) });
  // The verdict banner fires unconditionally whenever a policy file exists — including
  // inside a linked worktree — so `additionalContext` legitimately contains the substring
  // `worktree-always` (from the verdict line itself). Only the *nudge* is suppressed by
  // isLinkedWorktree; prove that specifically, plus that the policy correctly reads ON.
  assert.ok(out.json, 'a policy file exists, so the verdict banner must render');
  assert.doesNotMatch(out.json.hookSpecificOutput.additionalContext, /using-git-worktrees/);
  assert.match(out.json.hookSpecificOutput.additionalContext, /worktree-always: ON \(matched key: worktree-always\)/);
});

// IL-133 verdict-banner coverage: policy.resolveWorktreeAlways drives the banner text
// directly, so these pin the exact literal line for each alias-resolution outcome.

test('verdict banner: old key only (worktree.always) resolves ON with matched key worktree.always', () => {
  const project = gitProject();
  withPolicy(project, 'worktree.always: true\n');
  const out = sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
  assert.match(out.json.hookSpecificOutput.additionalContext, /worktree-always: ON \(matched key: worktree\.always\)/);
});

test('verdict banner: new key only (worktree-always) resolves ON with matched key worktree-always', () => {
  const project = gitProject();
  withPolicy(project, 'worktree-always: true\n');
  const out = sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
  assert.match(out.json.hookSpecificOutput.additionalContext, /worktree-always: ON \(matched key: worktree-always\)/);
});

test('verdict banner: both keys present — new key wins over old', () => {
  const project = gitProject();
  withPolicy(project, 'worktree.always: true\nworktree-always: true\n');
  const out = sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
  assert.match(out.json.hookSpecificOutput.additionalContext, /worktree-always: ON \(matched key: worktree-always\)/);
  assert.doesNotMatch(out.json.hookSpecificOutput.additionalContext, /matched key: worktree\.always/);
});

test('verdict banner: policy.yml exists but neither key is present — OFF (no key)', () => {
  const project = gitProject();
  withPolicy(project, 'integration-branch: main\n');
  const out = sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
  assert.match(out.json.hookSpecificOutput.additionalContext, /worktree-always: OFF \(no key\)/);
});

test('verdict banner: no policy.yml anywhere in the ancestor chain — no verdict line at all', () => {
  const project = gitProject();
  const out = sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
  if (out.json) assert.doesNotMatch(out.json.hookSpecificOutput.additionalContext, /worktree-always:/);
  else assert.deepStrictEqual(out, {});
});

test('verdict banner: a throw from policy.resolveWorktreeAlways is swallowed — no verdict line, hook does not throw', () => {
  // readPolicyFile/parseFlatLines already fail safe for garbled *content* (a
  // directory at .claude-tweaks/policy.yml resolves to `{}` via the internal
  // try/catch in readPolicyFile, which reads as OFF/no-key, not a throw) — so a
  // throw has to be simulated at the resolver call site itself. `policy` is a
  // module-object property access in session-start.js (`policy.resolveWorktreeAlways(...)`),
  // not a destructured local binding, so mutating the shared module's export in
  // place is observed immediately by the already-required session-start module —
  // no require.cache-busting needed (contrast the reconcile() stub above, which
  // IS destructured and does need it).
  const project = gitProject();
  withPolicy(project, 'worktree-always: true\n');
  const policyMod = require('../bin/lib/policy');
  const original = policyMod.resolveWorktreeAlways;
  policyMod.resolveWorktreeAlways = () => { throw new Error('simulated malformed policy state'); };
  try {
    let out;
    assert.doesNotThrow(() => {
      out = sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
    });
    if (out.json) assert.doesNotMatch(out.json.hookSpecificOutput.additionalContext, /worktree-always:/);
    else assert.deepStrictEqual(out, {});
  } finally {
    policyMod.resolveWorktreeAlways = original;
  }
});
