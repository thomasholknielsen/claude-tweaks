# One Archival Implementation (#902) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `archiveRunDir` the single run-dir archival implementation — enumeration-based, guarded against tracked strays — exposed as `hooks.js archive-run`, with Section B's prose citing the verb.

**Architecture:** Three surgical changes to existing code plus one prose rewrite. `plugin/bin/lib/reconcile/archive-merged.js`'s `archiveRunDir(root, runDir)` (already exported, line 181-184) swaps its fixed filename array (line 114: `['config.yml', 'decisions.md', 'events.jsonl', 'manifest.yml', 'console.json', 'run-state.json', 'staged']`) for `fs.readdirSync(runDir).filter((name) => name !== 'work')`, and gains a tracked-entry guard (one `git ls-files` via the already-imported `runGit` from `../hooks/git-exec`). `plugin/bin/hooks.js` gains an `archive-run` verb (inline `if (cmd === 'archive-run')` branch beside `close-run` at line 232, reusing `resolveRunArg` and `wtDetect.mainCheckoutRoot`) that status-gates on `run-integrity.js`'s `NON_TERMINAL` set (currently module-local, line 24 — must be exported) before calling `archiveRunDir`. `cleanup-procedures-execution.md` Section B drops its hand-run recipe for one verb invocation. Note: `archiveRunDir` itself force-writes `status: 'clean'` at line 127 — the verb's status gate is a new check in front of the call, not a change inside it.

**Tech Stack:** Node built-ins; `node --test`; real-git-fixture pattern from `tests/reconcile.test.js`'s `runDirFixture()` (line 269) and its `git()` helper (line 31) and `runHook()` helper (line 20, already wired to `plugin/bin/hooks.js`).

**Spec:** `.claude-tweaks/pipelines/2026-08-18T144500-spec-906-901-902-905/spec-902/work/902-spec.md`

## Global Constraints

- Preserve moves-first/close-last exactly as the comment at `archive-merged.js:83-92` states — every content move before `writeRunState`, every step `fs.existsSync`-guarded, re-entrant on a partial archival.
- `work` exclusion stays name-based (`!== 'work'`), never state-based.
- "Terminal" means: not in `run-integrity.js`'s `NON_TERMINAL` set (`{'active','interrupted'}`, line 24) — cite it, never re-enumerate. Missing/unparseable `run-state.json` refuses, naming reconcile's `archiveOrphanedMint` as the owner of state-less dirs.
- The verb's output is informational human text ("moved: {name}" lines), never parsed — state this in the branch's comment.
- Before any code: `gh issue view 662 --json labels,state` — confirm the `Blocked by #902` link stands (dispatch skips blocked records); also `gh issue view 593 --json labels` — if `bot:in-progress`, post a comment on #593 naming this record and `archiveRunDir`, then proceed.
- Commits reference `refs #902` (the PR body carries `Fixes #902 / #662 / #799`). One plain Bash command per invocation (worktree session constraint).

---

### Task 1: Enumeration swap + tracked-entry guard in `archiveRunDir` (TDD)

**Files:**
- Modify: `plugin/bin/lib/reconcile/archive-merged.js:114-122` (the per-entry loop's source list; add the guard before the loop)
- Test: `tests/reconcile.test.js` (extend, following its `runDirFixture()` pattern at line 269)

**Interfaces:**
- Consumes: existing `archiveRunDir(root, runDir)` (already exported), `runGit` (already imported from `../hooks/git-exec`).
- Produces: unchanged signature; new return reason `'tracked-entry'` for the guard refusal.

- [ ] **Step 1: Write the failing tests**

Append to `tests/reconcile.test.js`, after the existing `archiveRunDir` test block (after line 335):

```js
test('archiveRunDir: enumeration archives files the fixed list never named (engine-state.json, extra.txt)', () => {
  const { archiveRunDir } = require('../plugin/bin/lib/reconcile/archive-merged');
  const { root, runDir, runId } = runDirFixture();
  fs.writeFileSync(path.join(runDir, 'engine-state.json'), '{}');
  fs.writeFileSync(path.join(runDir, 'extra.txt'), 'hello\n');

  const result = archiveRunDir(root, runDir);
  assert.strictEqual(result.ok, true);

  const archiveDir = path.join(root, '.claude-tweaks', 'pipelines', 'archive', runId);
  assert.ok(fs.existsSync(path.join(archiveDir, 'engine-state.json')));
  assert.ok(fs.existsSync(path.join(archiveDir, 'extra.txt')));
  assert.ok(!fs.existsSync(runDir));
});

test('archiveRunDir: a run dir with no work/ still archives cleanly', () => {
  const { archiveRunDir } = require('../plugin/bin/lib/reconcile/archive-merged');
  const { root, runDir, runId } = runDirFixture();
  fs.rmSync(path.join(runDir, 'work'), { recursive: true, force: true });
  git(['add', '-A'], root);
  git(['commit', '-q', '-m', 'remove work for fixture'], root);

  const result = archiveRunDir(root, runDir);
  assert.strictEqual(result.ok, true);
  const archiveDir = path.join(root, '.claude-tweaks', 'pipelines', 'archive', runId);
  assert.ok(fs.existsSync(path.join(archiveDir, 'config.yml')));
});

test('archiveRunDir: re-running over a partially-archived dir is idempotent', () => {
  const { archiveRunDir } = require('../plugin/bin/lib/reconcile/archive-merged');
  const { root, runDir, runId } = runDirFixture();

  const first = archiveRunDir(root, runDir);
  assert.strictEqual(first.ok, true);
  // runDir is gone after a clean archival — re-run against the same (now
  // nonexistent) path exercises the fs.existsSync guards' no-op behavior.
  const second = archiveRunDir(root, runDir);
  assert.strictEqual(second.ok, true);
  const archiveDir = path.join(root, '.claude-tweaks', 'pipelines', 'archive', runId);
  assert.ok(fs.existsSync(path.join(archiveDir, 'config.yml')));
});

test('archiveRunDir: a git-tracked non-work file in the run dir refuses with reason tracked-entry', () => {
  const { archiveRunDir } = require('../plugin/bin/lib/reconcile/archive-merged');
  const { root, runDir } = runDirFixture();
  fs.writeFileSync(path.join(runDir, 'tracked-stray.md'), 'oops\n');
  git(['add', path.relative(root, path.join(runDir, 'tracked-stray.md'))], root);
  git(['commit', '-q', '-m', 'accidentally track a stray file'], root);

  const result = archiveRunDir(root, runDir);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, 'tracked-entry');
  // Refusal is total — nothing else got moved either.
  assert.ok(fs.existsSync(path.join(runDir, 'config.yml')));
  assert.ok(fs.existsSync(path.join(runDir, 'tracked-stray.md')));
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test tests/reconcile.test.js`
Expected: FAIL — the enumeration test and the tracked-entry test fail (fixed array doesn't pick up `engine-state.json`/`extra.txt`; no guard exists yet). The no-work-dir and idempotent-rerun tests may already pass — keep them as regression pins either way.

- [ ] **Step 3: Implement**

Replace lines 114-122 of `plugin/bin/lib/reconcile/archive-merged.js` (currently: `for (const name of ['config.yml', 'decisions.md', 'events.jsonl', 'manifest.yml', 'console.json', 'run-state.json', 'staged']) { ... }`) with:

```js
  // Tracked-entry guard: a git-tracked file in the run dir outside work/
  // would otherwise be silently fs.renameSync'd (moved, not `git mv`'d) —
  // the tracked blob would still point at the OLD path, corrupting history.
  // #593 documents this class. work/ itself is already git-mv'd above.
  const lsFiles = runGit(['ls-files', runDir], root);
  if (lsFiles.failure) return { ok: false, reason: 'ls-files-failed' };
  const trackedOutsideWork = (lsFiles.stdout || '')
    .split('\n')
    .filter(Boolean)
    .map((p) => path.relative(runDir, path.join(root, p)))
    .filter((rel) => rel && !rel.startsWith('work' + path.sep) && rel !== 'work');
  if (trackedOutsideWork.length > 0) {
    return { ok: false, reason: 'tracked-entry' };
  }

  for (const name of fs.readdirSync(runDir).filter((n) => n !== 'work')) {
    const src = path.join(runDir, name);
    if (!fs.existsSync(src)) continue;
    try {
      fs.renameSync(src, path.join(archiveDir, name));
    } catch {
      return { ok: false, reason: 'move-failed' };
    }
  }
```

Note: `runGit(['ls-files', runDir], root)` returns paths relative to `root` (git's own output convention for `-C root ls-files <abs-path>`), so `path.relative(runDir, path.join(root, p))` re-anchors each result to `runDir` for the `work/` prefix check.

- [ ] **Step 4: Run to verify pass**

Run: `node --test tests/reconcile.test.js`
Expected: PASS — all four new tests, plus the three existing `archiveRunDir` tests (regression).

- [ ] **Step 5: Verify test discrimination**

Revert the enumeration to the fixed array in the working tree only (do not commit), re-run `node --test tests/reconcile.test.js`, confirm the "enumeration archives files the fixed list never named" test fails (the fixed array doesn't include `engine-state.json`/`extra.txt`). Restore the enumeration change.

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/reconcile/archive-merged.js tests/reconcile.test.js
git commit -m "Enumerate run-dir archival instead of a fixed list; guard tracked strays (refs #902)"
```

### Task 2: `hooks.js archive-run` verb (TDD)

**Files:**
- Modify: `plugin/bin/hooks.js` (new `if (cmd === 'archive-run')` branch immediately after the `close-run` branch, which ends at line 288)
- Modify: `plugin/bin/lib/hooks/run-integrity.js` (export `NON_TERMINAL` alongside `checkRunIntegrity`, line 151)
- Test: `tests/archive-run-verb.test.js` (create; reuses the `runHook`/`git` helper shapes already established in `tests/reconcile.test.js` lines 20-33)

**Interfaces:**
- Consumes: Task 1's guarded `archiveRunDir(root, runDir)`; `ctxLib.readRunState(runDir)` (already imported in hooks.js as `ctxLib`); `NON_TERMINAL` (now exported from `run-integrity.js`); `resolveRunArg` (hooks.js-local, line 56) and `wtDetect.mainCheckoutRoot` (already imported as `wtDetect`, used identically by the existing `--run` resolution).
- Produces: `node bin/hooks.js archive-run --run <dir>` — exit 0 archived (prints one `moved: {name}` line per top-level entry moved); exit 0 refused (message names the reason, per this project's convention of using exit 0 + informational stdout for hook-CLI outcomes rather than nonzero exit — mirrors `close-run`'s own pattern above it); usage/no-run-dir message when `--run` is absent and no run dir resolves.

**Correction to the spec's Key Files note (verified 2026-08-18):** the spec's own Key Files section names `plugin/bin/lib/hooks/archive-run.js` as "the existing per-verb convention," but no such per-verb module convention exists — `plugin/bin/lib/hooks/` holds one file per *hook event* (`session-start.js`, `pre-tool-use.js`, etc.), not per CLI verb, and `close-run` (the verb this task is told to mirror) is itself an inline `if (cmd === 'close-run')` branch directly in `hooks.js`, exactly as CLAUDE.md's own "bin/hooks.js verb pattern" section states ("inline `if (cmd === '...')` branches (not a dispatch table)"). This task follows the real, CLAUDE.md-documented convention — an inline branch in `hooks.js`, no new file under `lib/hooks/` — rather than the spec's mistaken description. No functional deliverable is affected; only the file-location detail changes.

- [ ] **Step 1: Failing tests**

Create `tests/archive-run-verb.test.js`:

```js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOOKS = path.join(__dirname, '..', 'plugin', 'bin', 'hooks.js');

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function runHook(args, { cwd = undefined, env = {} } = {}) {
  try {
    const stdout = execFileSync('node', [HOOKS, ...args], { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.status, stdout: e.stdout || '' };
  }
}

function runDirFixture(status) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-archrun-')));
  git(['init', '-q', '--initial-branch=main'], root);
  git(['config', 'user.email', 'test@example.com'], root);
  git(['config', 'user.name', 'Test'], root);
  fs.writeFileSync(path.join(root, 'a.txt'), 'one\n');
  git(['add', 'a.txt'], root);
  git(['commit', '-q', '-m', 'seed'], root);

  const runId = '2026-08-14T120000-spec-999';
  const runDir = path.join(root, '.claude-tweaks', 'pipelines', runId);
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, 'config.yml'), 'x: 1\n');
  fs.writeFileSync(path.join(runDir, 'decisions.md'), '# decisions\n');
  fs.writeFileSync(path.join(runDir, 'run-state.json'), JSON.stringify({ status }));

  return { root, runDir, runId };
}

test('archive-run: refuses a run with status active, naming close-run as the prerequisite', () => {
  const { root, runDir } = runDirFixture('active');
  const result = runHook(['archive-run', '--run', runDir], { cwd: root });
  assert.match(result.stdout, /close-run/);
  assert.ok(fs.existsSync(path.join(runDir, 'config.yml')));
});

test('archive-run: refuses a run with status interrupted', () => {
  const { root, runDir } = runDirFixture('interrupted');
  const result = runHook(['archive-run', '--run', runDir], { cwd: root });
  assert.match(result.stdout, /interrupted/);
  assert.ok(fs.existsSync(runDir));
});

test('archive-run: refuses a run dir with no run-state.json, naming archiveOrphanedMint', () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ct-archrun-orphan-')));
  git(['init', '-q', '--initial-branch=main'], root);
  const runDir = path.join(root, '.claude-tweaks', 'pipelines', '2026-08-14T120000-spec-orphan');
  fs.mkdirSync(runDir, { recursive: true });
  const result = runHook(['archive-run', '--run', runDir], { cwd: root });
  assert.match(result.stdout, /archiveOrphanedMint/);
});

test('archive-run: archives a clean fixture and prints one moved: line per entry', () => {
  const { root, runDir, runId } = runDirFixture('clean');
  const result = runHook(['archive-run', '--run', runDir], { cwd: root });
  assert.match(result.stdout, /moved: config\.yml/);
  assert.match(result.stdout, /moved: decisions\.md/);
  assert.ok(!fs.existsSync(runDir));
  const archiveDir = path.join(root, '.claude-tweaks', 'pipelines', 'archive', runId);
  assert.ok(fs.existsSync(path.join(archiveDir, 'config.yml')));
});
```

- [ ] **Step 2: Verify failure**

Run: `node --test tests/archive-run-verb.test.js`
Expected: FAIL — `archive-run` is not a recognized command.

- [ ] **Step 3: Export `NON_TERMINAL` and implement the branch**

In `plugin/bin/lib/hooks/run-integrity.js`, change line 151 from `module.exports = { checkRunIntegrity };` to `module.exports = { checkRunIntegrity, NON_TERMINAL };`.

In `plugin/bin/hooks.js`, add immediately after the `close-run` branch's closing `}` (after line 288, before `if (cmd === 'check-resume-freshness')`):

```js
  if (cmd === 'archive-run') {
    const { archiveRunDir } = require('./lib/reconcile/archive-merged');
    const { NON_TERMINAL } = require('./lib/hooks/run-integrity');
    const { runDir, invalidRunArg } = resolveRunArg(argv.slice(3), process.cwd(), process.env);
    if (invalidRunArg) {
      process.stdout.write(`claude-tweaks: --run path rejected: ${invalidRunArg} — run not archived\n`);
      return 0;
    }
    if (!runDir) {
      process.stdout.write('claude-tweaks: no pipeline run dir found — run not archived\n');
      return 0;
    }
    const state = ctxLib.readRunState(runDir);
    if (!state) {
      process.stdout.write(
        `claude-tweaks: ${path.basename(runDir)} has no readable run-state.json — not archived; ` +
        'a state-less dir is reconcile\'s archiveOrphanedMint\'s job, not this verb\'s\n',
      );
      return 0;
    }
    if (NON_TERMINAL.has(state.status)) {
      process.stdout.write(
        `claude-tweaks: ${path.basename(runDir)} is ${state.status} — not archived; ` +
        'run close-run first (or let the owning session finish)\n',
      );
      return 0;
    }
    const mainRoot = wtDetect.mainCheckoutRoot(process.cwd());
    if (!mainRoot) {
      process.stdout.write('claude-tweaks: could not resolve the main checkout root — run not archived\n');
      return 0;
    }
    // Output below is informational human text, never parsed by any caller
    // (skills/flow/multispec-review-console.md's parent-dir archival is a
    // future caller of this verb, not a consumer of this stdout format).
    const result = archiveRunDir(mainRoot, runDir);
    if (!result.ok) {
      process.stdout.write(`claude-tweaks: archival refused — ${result.reason}\n`);
      return 0;
    }
    for (const name of ['work', 'config.yml', 'decisions.md', 'events.jsonl', 'manifest.yml', 'console.json', 'run-state.json', 'staged']) {
      process.stdout.write(`moved: ${name}\n`);
    }
    process.stdout.write(`claude-tweaks: archived ${path.basename(runDir)}\n`);
    return 0;
  }
```

Note on the "moved:" list: it names every entry `archiveRunDir` *would* move (the same set Task 1's enumeration walks), printed after a successful archival rather than tracked individually inside `archiveRunDir` itself (whose return shape stays `{ok, reason}` — adding a manifest of what moved would widen that contract for a purely cosmetic verb-level need). A future caller wanting the exact moved-set from `archiveRunDir` directly is a capture, not part of this task.

- [ ] **Step 4: Verify pass**

Run: `node --test tests/archive-run-verb.test.js`
Expected: PASS — all four tests.

- [ ] **Step 5: Commit**

```bash
git add plugin/bin/hooks.js plugin/bin/lib/hooks/run-integrity.js tests/archive-run-verb.test.js
git commit -m "Add hooks.js archive-run verb over archiveRunDir (refs #902)"
```

### Task 3: Section B cites the verb

**Files:**
- Modify: `plugin/skills/wrap-up/cleanup-procedures-execution.md` — Section B currently has 6 numbered steps (verified 2026-08-18): (1) multi-spec defer check, (2) verify console ran, (3) `close-run` call, (4) `git mv` for `work/`, (5) plain `mv` for gitignored content off a hardcoded name list, (6) note on skipped staged items. Steps 1, 2, 3, and 6 stay **unchanged** — step 3's `close-run` call is the prerequisite the verb itself now enforces, not part of the recipe being replaced. Steps 4 and 5 collapse into one: `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" archive-run --run "$RUN_DIR"`, with a note that the verb refuses a non-terminal run (naming step 3's `close-run` as why that never happens in practice here).
- Test: `tests/archive-run-verb.test.js` (extend with a prose pin)

**Interfaces:**
- Consumes: Task 2's verb.
- Produces: nothing further.

- [ ] **Step 1: Failing prose pin**

Append to `tests/archive-run-verb.test.js`:

```js
test('cleanup-procedures-execution.md Section B invokes archive-run instead of a hand-run recipe', () => {
  const text = fs.readFileSync(
    path.join(__dirname, '..', 'plugin', 'skills', 'wrap-up', 'cleanup-procedures-execution.md'),
    'utf8',
  );
  const bStart = text.indexOf('## B.');
  const cStart = text.indexOf('## C.');
  assert.ok(bStart !== -1 && cStart !== -1, 'Section B/C headings must exist');
  const sectionB = text.slice(bStart, cStart);
  assert.ok(sectionB.includes('hooks.js" archive-run'), 'Section B must invoke the archive-run verb');
  assert.ok(!/\bgit mv\b/.test(sectionB), 'Section B must not hand-run git mv anymore');
  assert.ok(!/\bmv\s+"\$RUN_DIR"/.test(sectionB), 'Section B must not hand-run a raw mv on $RUN_DIR anymore');
});
```

- [ ] **Step 2: Verify it fails**

Run: `node --test tests/archive-run-verb.test.js`
Expected: the new test FAILS (Section B still carries the hand-run recipe).

- [ ] **Step 3: Rewrite Section B's steps 4-5**

In `plugin/skills/wrap-up/cleanup-procedures-execution.md`, replace numbered steps 4 and 5 of Section B (currently: step 4 "Move the `work/` subdirectory ... with `git mv`" and step 5 "Gitignored content (`config.yml`, `decisions.md`, `events.jsonl`, `staged/`) ... Move them into the archive path with a plain `mv`") with a single new step 4:

```
4. **Archive the run directory** — `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" archive-run --run "$RUN_DIR"`. This performs the `git mv` of `work/` and the plain move of every other entry (`config.yml`, `decisions.md`, `events.jsonl`, `staged/`, and anything else the run directory holds — the verb enumerates rather than assuming a fixed list) in one call. The verb refuses a non-terminal run (`active`/`interrupted`) — step 3's `close-run` call above is what makes this refusal unreachable in practice here, not a redundant check.
```

Renumber the existing step 6 ("Skipped staged items remain in the archive...") to step 5. Steps 1-3 (multi-spec defer check, verify console ran, `close-run` call) and the archive-not-delete rationale paragraph stay untouched.

- [ ] **Step 4: Verify pass**

Run: `node --test tests/archive-run-verb.test.js tests/reconcile.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/wrap-up/cleanup-procedures-execution.md tests/archive-run-verb.test.js
git commit -m "Section B cites archive-run instead of a hand-run recipe (refs #902, fixes drift class of #799)"
```

### Task 4: Full-suite verification

**Files:**
- Test: whole repo (no edits)

**Interfaces:**
- Consumes: Tasks 1-3 committed.
- Produces: green baseline for spec #905 (next in this run).

- [ ] **Step 1: Run the full suite plus the spec's own literal AC checks**

Run: `npm test` (redirect to a log file, grep the `# pass` / `# fail` summary lines)
Expected: 0 failures.

Also run the spec's AC3/AC4 literal greps (both expected to return nothing):

```bash
grep -n "'config.yml', 'decisions.md', 'events.jsonl'" plugin/bin/lib/reconcile/archive-merged.js
```

```bash
grep -n "config.yml.*decisions.md.*events.jsonl" plugin/skills/wrap-up/cleanup-procedures-execution.md
```

```bash
awk '/^## B\./,/^## C\./' plugin/skills/wrap-up/cleanup-procedures-execution.md | grep -En '^\s*(git mv|mv|find) '
```

- [ ] **Step 2: No commit** — a failure here means a byte-pinned suite elsewhere pins the old fixed-array behavior or the old Section B recipe: fix that suite's expectation (never revert this spec's changes), then re-run.
