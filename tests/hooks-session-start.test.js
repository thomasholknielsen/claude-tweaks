// tests/hooks-session-start.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sessionStart = require('../plugin/bin/lib/hooks/session-start');
const deps = require('../plugin/bin/lib/deps');

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

test('stale runs are reported in additionalContext, capped at 3, newest first', async () => {
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
  const out = await sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
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

test('#803: the banner names a designated consumer — relay the list once in the first reply', async () => {
  const project = tmpProject();
  mkRun(project, '2026-07-01T090000-spec-1', { status: 'interrupted' });
  const out = await sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
  const ctx = out.json.hookSpecificOutput.additionalContext;
  assert.match(ctx, /Relay this list once, in your first reply to the user/);
});

test('#410: a stale run carrying a recorded pr URL includes it in the reported line; one without does not', async () => {
  const project = tmpProject();
  mkRun(project, '2026-07-01T090000-spec-1', { status: 'active', pr: { number: 42, url: 'https://github.com/o/r/pull/42' } });
  mkRun(project, '2026-07-02T090000-spec-2', { status: 'interrupted' });
  const out = await sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
  const ctx = out.json.hookSpecificOutput.additionalContext;
  assert.match(ctx, /spec-1 \(status: active\) — PR https:\/\/github\.com\/o\/r\/pull\/42/);
  assert.match(ctx, /spec-2 \(status: interrupted\)\n/, 'a run with no recorded pr must not gain a PR suffix');
});

test('close-run hint substitutes CLAUDE_PLUGIN_ROOT when set, else keeps the literal placeholder', async () => {
  const project = tmpProject();
  mkRun(project, '2026-07-01T090000-spec-1', { status: 'interrupted' });
  const orig = process.env.CLAUDE_PLUGIN_ROOT;

  try {
    delete process.env.CLAUDE_PLUGIN_ROOT;
    const withoutEnv = await sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
    assert.match(withoutEnv.json.hookSpecificOutput.additionalContext, /\$\{CLAUDE_PLUGIN_ROOT\}\/bin\/hooks\.js/);

    process.env.CLAUDE_PLUGIN_ROOT = '/opt/claude-tweaks';
    const withEnv = await sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
    assert.match(withEnv.json.hookSpecificOutput.additionalContext, /\/opt\/claude-tweaks\/bin\/hooks\.js/);
  } finally {
    if (orig === undefined) delete process.env.CLAUDE_PLUGIN_ROOT;
    else process.env.CLAUDE_PLUGIN_ROOT = orig;
  }
});

test('no stale runs and no deps warnings -> no json output', async () => {
  const project = tmpProject();
  mkRun(project, '2026-07-01T090000-spec-1', { status: 'clean' });
  const out = await sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
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

test('worktree-always nudge appears when policy is on and session is not yet isolated', async () => {
  const project = gitProject();
  withPolicy(project, 'worktree-always: true\n');
  const out = await sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
  assert.match(out.json.hookSpecificOutput.additionalContext, /worktree-always/);
  assert.match(out.json.hookSpecificOutput.additionalContext, /using-git-worktrees/);
});

test('worktree-always nudge is absent when policy is off', async () => {
  const project = gitProject();
  const out = await sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
  if (out.json) assert.doesNotMatch(out.json.hookSpecificOutput.additionalContext, /worktree-always/);
  else assert.deepStrictEqual(out, {});
});

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

// #408 AC1: a session starting in a checkout strictly behind origin gets its
// integration branch fast-forwarded before additionalContext renders, with a
// one-line reconcile summary when anything changed.
test('SessionStart fast-forwards a behind-and-clean integration branch via reconcile(), and reports it in additionalContext (#408 AC1)', async () => {
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
  const out = await sessionStart.run({ input: {}, runDir: null, runState: null, cwd: mainDir });
  const after = git(['rev-parse', 'HEAD'], mainDir).trim();

  assert.notStrictEqual(before, after, 'the integration branch must be fast-forwarded during SessionStart');
  assert.strictEqual(after, git(['rev-parse', 'origin/main'], mainDir).trim());
  assert.ok(out.json, 'a change occurred, so additionalContext must render');
  assert.match(out.json.hookSpecificOutput.additionalContext, /reconciled.*fast-forwarded/i);
});

test('#413: a run carrying an unresolved console.json never crashes SessionStart, and produces no answered-console message when gh cannot resolve the PR', async () => {
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

  const out = await sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
  if (out.json) {
    assert.doesNotMatch(out.json.hookSpecificOutput.additionalContext, /answered console\(s\) awaiting execution/);
  }
});

test('#561: a redTip finding from reconcile() renders as its own additionalContext line', async () => {
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
  const reconcileMod = require('../plugin/bin/lib/reconcile');
  const original = reconcileMod.reconcile;
  reconcileMod.reconcile = () => ({
    mirror: null, redTip: { branch: 'main', sha: '0123456789abcdef', failing: ['ci/tests'], message: 'CI is red on main tip at 0123456 — ci/tests' },
    worktrees: null, claims: null, runs: null, branches: null, console: null, skipped: [],
  });
  delete require.cache[require.resolve('../plugin/bin/lib/hooks/session-start')];
  try {
    const freshSessionStart = require('../plugin/bin/lib/hooks/session-start');
    const out = await freshSessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
    assert.ok(out.json, 'a redTip finding must render additionalContext');
    assert.match(out.json.hookSpecificOutput.additionalContext, /CI is red on main tip at 0123456 — ci\/tests/);
  } finally {
    reconcileMod.reconcile = original;
    // Restore a clean (unpatched) session-start module in the cache so
    // every later test in this file — including ones already holding the
    // original top-of-file `sessionStart` binding, which is unaffected
    // either way — sees the real reconcile() again if it re-requires fresh.
    delete require.cache[require.resolve('../plugin/bin/lib/hooks/session-start')];
    require('../plugin/bin/lib/hooks/session-start');
  }
});

test('#561: no redTip finding produces no red-tip line (AC5 — green tip)', async () => {
  const project = gitProject();
  const out = await sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
  if (out.json) assert.doesNotMatch(out.json.hookSpecificOutput.additionalContext, /CI is red on/);
  else assert.deepStrictEqual(out, {});
});

test('worktree-always nudge is absent when the session is already inside a linked worktree', async () => {
  const project = gitProject();
  execFileSync('git', ['-C', project, 'commit', '--allow-empty', '-m', 'init', '-q']);
  withPolicy(project, 'worktree-always: true\n');
  execFileSync('git', ['-C', project, 'add', '.claude-tweaks/policy.yml']);
  execFileSync('git', ['-C', project, 'commit', '-m', 'policy', '-q']);
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ss-wt-'));
  const wt = path.join(parent, 'wt');
  execFileSync('git', ['-C', project, 'worktree', 'add', '-q', wt, '-b', 'wt-branch']);
  const out = await sessionStart.run({ input: {}, runDir: null, runState: null, cwd: fs.realpathSync(wt) });
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

test('verdict banner: old key only (worktree.always) resolves ON with matched key worktree.always', async () => {
  const project = gitProject();
  withPolicy(project, 'worktree.always: true\n');
  const out = await sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
  assert.match(out.json.hookSpecificOutput.additionalContext, /worktree-always: ON \(matched key: worktree\.always\)/);
});

test('verdict banner: new key only (worktree-always) resolves ON with matched key worktree-always', async () => {
  const project = gitProject();
  withPolicy(project, 'worktree-always: true\n');
  const out = await sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
  assert.match(out.json.hookSpecificOutput.additionalContext, /worktree-always: ON \(matched key: worktree-always\)/);
});

test('verdict banner: both keys present — new key wins over old', async () => {
  const project = gitProject();
  withPolicy(project, 'worktree.always: true\nworktree-always: true\n');
  const out = await sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
  assert.match(out.json.hookSpecificOutput.additionalContext, /worktree-always: ON \(matched key: worktree-always\)/);
  assert.doesNotMatch(out.json.hookSpecificOutput.additionalContext, /matched key: worktree\.always/);
});

test('verdict banner: policy.yml exists but neither key is present — OFF (no key)', async () => {
  const project = gitProject();
  withPolicy(project, 'integration-branch: main\n');
  const out = await sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
  assert.match(out.json.hookSpecificOutput.additionalContext, /worktree-always: OFF \(no key\)/);
});

test('verdict banner: no policy.yml anywhere in the ancestor chain — no verdict line at all', async () => {
  const project = gitProject();
  const out = await sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
  if (out.json) assert.doesNotMatch(out.json.hookSpecificOutput.additionalContext, /worktree-always:/);
  else assert.deepStrictEqual(out, {});
});

// #820 D8 (corrected): the write-only janitorial checks (release, archive,
// archive-branches, remote-prune, reap) no longer run inline as part of
// SessionStart's own reconcile() call — they run in a detached
// `reconcile-background` child process, and SessionStart's job is only to
// surface a PRIOR pass's already-written status file, once. A real detached
// spawn's timing is too racy to depend on in a test (see the spawn-triggering
// tests below, which cover that separately) — this test instead writes the
// status-file fixture directly, runs the hook twice, and asserts the summary
// line appears on the first firing (and flips `surfaced` to true) but not on
// the second. Includes a `notableWorktrees` entry (Task 10 review Important
// #2 — the individually-named "worktree(s) left in place" line the original
// inline block rendered, restored here on the background-summary path).
test('SessionStart surfaces a prior background reconcile pass exactly once (#820, D8)', async () => {
  const project = gitProject();
  const statusDir = path.join(project, '.claude-tweaks');
  fs.mkdirSync(statusDir, { recursive: true });
  const statusPath = path.join(statusDir, 'reconcile-background-status.json');
  fs.writeFileSync(statusPath, JSON.stringify({
    completedAt: Date.now(),
    surfaced: false,
    summary: {
      released: 2,
      archived: 1,
      notableWorktrees: [{ path: '/tmp/wt/foo', reason: 'pr-open' }],
    },
  }));

  const first = await sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
  assert.match(
    first.json.hookSpecificOutput.additionalContext,
    /background reconcile \(from a prior session\).*2 issue claim\(s\) released.*1 pipeline run\(s\) archived.*worktree\(s\) left in place: foo \(pr-open\)/,
  );
  const statusAfterFirst = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  assert.strictEqual(statusAfterFirst.surfaced, true, 'the status file must be marked surfaced after the first firing');

  const second = await sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
  if (second.json) {
    assert.doesNotMatch(second.json.hookSpecificOutput.additionalContext, /background reconcile/);
  }
});

// Task 10 review Critical finding: the spawn gate must key off the
// `reconcile-background-status.json` file's OWN `completedAt`, never
// reconcile()'s shared `reconcile-cache.json` `lastRunAt` stamp — that stamp
// fires on ANY fully-completed pr-first pass, including SessionStart's own
// FAST_CHECKS call, which (before this fix) made the gate see a false
// "fresh" from a pass that never ran the background checks and never spawn
// at all. Case (a) below (a fresh status file) is signal-agnostic and would
// pass under either the buggy or the fixed implementation — it's here for
// completeness. Case (b) is the one that actually discriminates the bug: it
// uses a REAL pr-first remote (not a bare no-remote repo, which never
// reaches reconcile()'s cache-stamping line at all and so could never
// reproduce the contamination), so SessionStart's own FAST_CHECKS call
// genuinely stamps reconcile-cache.json's lastRunAt moments before the gate
// decision runs — under the old (buggy) `readCache`/`lastRunAt` gate this
// case would incorrectly see "fresh" and skip the spawn; under the fix it
// must still spawn, because the STATUS file (not the reconcile cache) is
// absent/stale.
function prFirstRemoteFixture() {
  const originDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ss-spawn-origin-'));
  git(['init', '-q', '--bare', '--initial-branch=main'], originDir);

  const seedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ss-spawn-seed-'));
  git(['clone', '-q', originDir, seedDir]);
  git(['config', 'user.email', 'test@example.com'], seedDir);
  git(['config', 'user.name', 'Test'], seedDir);
  fs.mkdirSync(path.join(seedDir, '.claude-tweaks'), { recursive: true });
  fs.writeFileSync(path.join(seedDir, '.claude-tweaks', 'policy.yml'), 'integration-model: pr-first\n');
  git(['add', '.claude-tweaks/policy.yml'], seedDir);
  git(['commit', '-q', '-m', 'seed'], seedDir);
  git(['push', '-q', 'origin', 'main'], seedDir);

  const mainDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ss-spawn-main-'));
  git(['clone', '-q', originDir, mainDir]);
  git(['config', 'user.email', 'test@example.com'], mainDir);
  git(['config', 'user.name', 'Test'], mainDir);
  return mainDir;
}

test('SessionStart spawn gate: a fresh background-status file suppresses the spawn (#820, D8)', async () => {
  // Stubs `require('child_process').spawn` at the module-object level, the
  // same require.cache convention this file's #561 test uses to stub
  // reconcile() — session-start.js's `run(ctx)` is called directly
  // (in-process), never through a subprocess, so the stub is guaranteed to
  // be observed by the code under test.
  const cp = require('child_process');
  const originalSpawn = cp.spawn;
  let spawnedWith = null;
  cp.spawn = (...args) => { spawnedWith = args; return { unref() {} }; };
  try {
    const project = gitProject();
    const statusDir = path.join(project, '.claude-tweaks');
    fs.mkdirSync(statusDir, { recursive: true });
    fs.writeFileSync(
      path.join(statusDir, 'reconcile-background-status.json'),
      JSON.stringify({ completedAt: Date.now(), surfaced: true, summary: {} }),
    );
    await sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
    assert.strictEqual(spawnedWith, null, 'a fresh background-status file must not trigger a background spawn');
  } finally {
    cp.spawn = originalSpawn;
  }
});

test('SessionStart spawn gate: fires against a real pr-first remote even though the fast pass itself stamps reconcile-cache.json (#820 Task 10 fix-up — the Critical finding\'s repro)', async () => {
  const cp = require('child_process');
  const originalSpawn = cp.spawn;
  let spawnedWith = null;
  // The fake mirrors ChildProcess's EventEmitter surface (`on`) as well as
  // `unref`, and records both, so this test also pins #820 final review's
  // spawn hardening: an asynchronous spawn failure (EAGAIN under fork
  // pressure) emits 'error', and with no listener Node turns that into an
  // uncaught exception the surrounding try/catch cannot absorb — breaking
  // the never-break-a-session invariant. A fake without `on` would make
  // `child.on(...)` throw into that same catch, so `unrefCalls` is asserted
  // too: it proves the spawn block ran to completion rather than bailing.
  const listeners = [];
  let unrefCalls = 0;
  cp.spawn = (...args) => {
    spawnedWith = args;
    return { unref() { unrefCalls += 1; }, on(event, handler) { listeners.push([event, handler]); } };
  };
  try {
    const mainDir = prFirstRemoteFixture();
    // No reconcile-background-status.json exists yet — this is the very
    // first SessionStart firing in this repo. Also prove the fast pass
    // really does reach reconcile()'s own cache stamp (the contamination
    // source), so this case is not silently degrading to "no-remote skip".
    const out = await sessionStart.run({ input: {}, runDir: null, runState: null, cwd: mainDir });
    const reconcileCache = require('../plugin/bin/lib/reconcile/cache');
    const stampedCache = reconcileCache.readCache(fs.realpathSync(mainDir));
    assert.strictEqual(typeof stampedCache.lastRunAt, 'number', 'the FAST_CHECKS pass must have completed and stamped reconcile-cache.json — otherwise this fixture is not reproducing the bug scenario');
    assert.ok(out.json, 'a pr-first repo with no stale-run/policy signal still renders the worktree-always verdict banner');
    assert.ok(spawnedWith, 'the background pass must still spawn — the status file (not reconcile-cache.json) is what must gate this decision');
    assert.strictEqual(spawnedWith[0], process.execPath);
    assert.ok(spawnedWith[1][0].endsWith(path.join('bin', 'hooks.js')));
    assert.strictEqual(spawnedWith[1][1], 'reconcile-background');
    assert.strictEqual(spawnedWith[2].detached, true);
    // `detached: true` is precisely what leaves the child with no console to
    // inherit, so it MUST be paired with `windowsHide: true` — otherwise the
    // child, and every git process the background pass spawns beneath it,
    // each get their own VISIBLE console window on Windows. Observed as a
    // storm of black boxes flashing for the whole reconcile pass; see
    // tests/hooks-git-exec.test.js for the funnel-level counterpart.
    assert.strictEqual(spawnedWith[2].windowsHide, true,
      'a detached child must also be windowsHide:true — otherwise it and its git descendants each open a visible console window on Windows');
    const errorListeners = listeners.filter(([event]) => event === 'error');
    assert.strictEqual(errorListeners.length, 1, "the spawned child must carry an 'error' listener — without one, an async spawn failure becomes an uncaught exception");
    assert.strictEqual(typeof errorListeners[0][1], 'function');
    assert.doesNotThrow(() => errorListeners[0][1](Object.assign(new Error('spawn EAGAIN'), { code: 'EAGAIN' })), 'the error listener must swallow, never rethrow');
    assert.strictEqual(unrefCalls, 1, 'the spawn block must run to completion — a throw inside it would leave the child un-unref-ed');
  } finally {
    cp.spawn = originalSpawn;
  }
});

// #820 final review: a throw while RENDERING a prior background pass's
// summary must not take the spawn gate down with it. The two used to share
// one try block, so a malformed `notableWorktrees[].path` (path.basename
// throws on a non-string) skipped the spawn permanently for that repo — the
// status file never advanced, so every later SessionStart threw at the same
// line and the background pass stayed wedged off forever.
test('SessionStart: a throw while rendering the background summary still leaves the spawn gate reachable (#820 final review)', async () => {
  const cp = require('child_process');
  const originalSpawn = cp.spawn;
  let spawnedWith = null;
  cp.spawn = (...args) => { spawnedWith = args; return { unref() {}, on() {} }; };
  try {
    const project = gitProject();
    const statusDir = path.join(project, '.claude-tweaks');
    fs.mkdirSync(statusDir, { recursive: true });
    // `path: 42` — path.basename throws TypeError on a non-string, inside the
    // surfacing block's render. `completedAt` is deliberately absent, so the
    // gate must resolve to not-fresh and spawn.
    fs.writeFileSync(
      path.join(statusDir, 'reconcile-background-status.json'),
      JSON.stringify({ surfaced: false, summary: { notableWorktrees: [{ path: 42, reason: 'pr-open' }] } }),
    );
    let out;
    await assert.doesNotReject(async () => {
      out = await sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
    });
    if (out && out.json) {
      assert.doesNotMatch(out.json.hookSpecificOutput.additionalContext, /background reconcile/, 'the render threw, so no summary line is produced');
    }
    assert.ok(spawnedWith, 'the spawn gate must still be reached after the surfacing block threw');
    assert.strictEqual(spawnedWith[1][1], 'reconcile-background');
  } finally {
    cp.spawn = originalSpawn;
  }
});

// #820 final review finding 1: D7's freshness cache is wired into the INLINE
// fast pass, not just the background one — near-simultaneous session starts
// in the same repo skip the mirror/red-tip/console work inside the TTL.
// Discriminating by observable effect rather than by a stub's arguments: the
// repo is left strictly behind origin before EACH call, so an un-short-
// circuited pass would fast-forward it (as the first call does) and say so.
test('SessionStart: a second session start inside the TTL short-circuits the inline reconcile via D7\'s freshness cache (#820 final review)', async () => {
  const cp = require('child_process');
  const originalSpawn = cp.spawn;
  cp.spawn = () => ({ unref() {}, on() {} });
  const preflight = require('../plugin/bin/lib/reconcile/preflight');
  const originalHealth = preflight.ghHealthCheck;
  preflight.ghHealthCheck = () => ({ ok: true, reason: null });
  try {
    const originDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ss-ttl-origin-'));
    git(['init', '-q', '--bare', '--initial-branch=main'], originDir);
    const seedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ss-ttl-seed-'));
    git(['clone', '-q', originDir, seedDir]);
    git(['config', 'user.email', 'test@example.com'], seedDir);
    git(['config', 'user.name', 'Test'], seedDir);
    fs.mkdirSync(path.join(seedDir, '.claude-tweaks'), { recursive: true });
    fs.writeFileSync(path.join(seedDir, '.claude-tweaks', 'policy.yml'), 'integration-model: pr-first\n');
    // Mirrors this repo's own .gitignore. Without it the cache file the
    // first pass writes makes `git status --porcelain` non-empty, and
    // classifyMirror bails out on 'dirty' before ever reaching the
    // fast-forward — masking the behavior under test with an artifact of
    // the fixture.
    fs.writeFileSync(path.join(seedDir, '.gitignore'), '.claude-tweaks/reconcile-cache.json\n.claude-tweaks/reconcile-background-status.json\n');
    git(['add', '.claude-tweaks/policy.yml', '.gitignore'], seedDir);
    git(['commit', '-q', '-m', 'seed'], seedDir);
    git(['push', '-q', 'origin', 'main'], seedDir);

    const mainDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ss-ttl-main-'));
    git(['clone', '-q', originDir, mainDir]);
    git(['config', 'user.email', 'test@example.com'], mainDir);
    git(['config', 'user.name', 'Test'], mainDir);

    function advanceOrigin(name) {
      fs.writeFileSync(path.join(seedDir, `${name}.txt`), `${name}\n`);
      git(['add', `${name}.txt`], seedDir);
      git(['commit', '-q', '-m', name], seedDir);
      git(['push', '-q', 'origin', 'main'], seedDir);
    }

    advanceOrigin('second');
    const first = await sessionStart.run({ input: {}, runDir: null, runState: null, cwd: mainDir });
    const afterFirst = git(['rev-parse', 'HEAD'], mainDir).trim();
    assert.match(first.json.hookSpecificOutput.additionalContext, /reconciled.*fast-forwarded/i, 'the first (cold-cache) pass must do the real work');

    // Origin moves again; the local mirror is strictly behind once more.
    advanceOrigin('third');
    const second = await sessionStart.run({ input: {}, runDir: null, runState: null, cwd: mainDir });
    assert.strictEqual(git(['rev-parse', 'HEAD'], mainDir).trim(), afterFirst, 'the second pass, inside the TTL, must short-circuit before any mirror work');
    if (second.json) {
      assert.doesNotMatch(second.json.hookSpecificOutput.additionalContext, /reconciled.*fast-forwarded/i);
    }

    // Age the freshness stamp past the TTL: the same call must now do the work.
    const cacheLib = require('../plugin/bin/lib/reconcile/cache');
    const root = fs.realpathSync(mainDir);
    const aged = cacheLib.readCache(root);
    cacheLib.writeCache(root, { ...aged, lastRunAt: Date.now() - (cacheLib.DEFAULT_TTL_MS * 2) });
    const third = await sessionStart.run({ input: {}, runDir: null, runState: null, cwd: mainDir });
    assert.notStrictEqual(git(['rev-parse', 'HEAD'], mainDir).trim(), afterFirst, 'past the TTL the inline pass must run again');
    assert.match(third.json.hookSpecificOutput.additionalContext, /reconciled.*fast-forwarded/i);
  } finally {
    cp.spawn = originalSpawn;
    preflight.ghHealthCheck = originalHealth;
  }
});

test('verdict banner: a throw from policy.resolveWorktreeAlways is swallowed — no verdict line, hook does not throw', async () => {
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
  const policyMod = require('../plugin/bin/lib/policy');
  const original = policyMod.resolveWorktreeAlways;
  policyMod.resolveWorktreeAlways = () => { throw new Error('simulated malformed policy state'); };
  try {
    let out;
    await assert.doesNotReject(async () => {
      out = await sessionStart.run({ input: {}, runDir: null, runState: null, cwd: project });
    });
    if (out.json) assert.doesNotMatch(out.json.hookSpecificOutput.additionalContext, /worktree-always:/);
    else assert.deepStrictEqual(out, {});
  } finally {
    policyMod.resolveWorktreeAlways = original;
  }
});

// #381: coalesce redundant git spawns across the stale-runs .map() and the
// trailing reconcile() call within one SessionStart invocation. Deliberately
// no policy.yml integration-branch override here (unlike run-integrity.test.js's
// fixtureRepo()) — this test needs resolveIntegrationBranch to actually reach its
// `git rev-parse --abbrev-ref origin/HEAD` spawn rather than short-circuiting on
// the policy value, so the cache has something real to coalesce.
function fixtureRepoNoPolicy() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-ss-spawn-')));
  execFileSync('git', ['-C', root, 'init', '-q', '-b', 'trunk']);
  execFileSync('git', ['-C', root, 'config', 'user.email', 't@example.com']);
  execFileSync('git', ['-C', root, 'config', 'user.name', 'T']);
  fs.writeFileSync(path.join(root, 'a.txt'), 'base\n');
  execFileSync('git', ['-C', root, 'add', 'a.txt']);
  execFileSync('git', ['-C', root, 'commit', '-q', '-m', 'base']);
  const wt = path.join(root, '.claude', 'worktrees', 'feat');
  execFileSync('git', ['-C', root, 'worktree', 'add', '-q', '-b', 'feat-branch', wt]);
  return { root, wt };
}

test('AC1 (#381): one worktree-list spawn and one origin/HEAD spawn per SessionStart, not one per stale run', async (t) => {
  const { root, wt } = fixtureRepoNoPolicy();
  for (const name of ['2026-08-01T090000-spec-1', '2026-08-01T090100-spec-2', '2026-08-01T090200-spec-3']) {
    const run = mkRun(root, name, { status: 'active', worktree: wt });
    fs.writeFileSync(path.join(run, 'events.jsonl'), '');
  }

  const cp = require('child_process');
  const realExecFileSync = cp.execFileSync;
  const worktreeListCalls = [];
  const originHeadCalls = [];
  t.mock.method(cp, 'execFileSync', (cmd, args, opts) => {
    if (cmd === 'git' && Array.isArray(args)) {
      if (args.includes('worktree') && args.includes('list')) worktreeListCalls.push(args);
      if (args.includes('rev-parse') && args.includes('origin/HEAD')) originHeadCalls.push(args);
    }
    return realExecFileSync(cmd, args, opts);
  });

  await sessionStart.run({ input: {}, runDir: null, runState: null, cwd: root });

  assert.ok(worktreeListCalls.length <= 1, `expected <=1 'git worktree list --porcelain' spawn, got ${worktreeListCalls.length}`);
  assert.ok(originHeadCalls.length <= 1, `expected <=1 'git rev-parse --abbrev-ref origin/HEAD' spawn, got ${originHeadCalls.length}`);
  assert.ok(worktreeListCalls.length >= 1, 'expected the worktree-list spawn to happen at least once');
});
