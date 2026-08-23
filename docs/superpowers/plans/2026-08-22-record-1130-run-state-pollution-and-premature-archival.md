# Record #1130: Run-State Pollution + Premature Archival Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close two confirmed defects: (1) a test-spawned `hooks.js` subprocess can resolve its working directory to the real repo checkout by omission and write fixture events into a real pipeline run's state files; (2) reconcile's archival sweep archives a merged-PR run whose Review Console was never rendered, and can archive before the local main checkout has incorporated the merge (moving only the gitignored half).

**Architecture:** Three narrow fixes at the exact seams two completed investigations identified — the `runHook` test helper's spawn defaults (tests only), `decideArchive`'s `'none'` console-state clause plus a local-merge-ancestry check in `archiveMerged` (reconcile), and a console-unresolved refusal in the `archive-run` CLI verb (parity for the second call site). No changes to `worktree-detect.js`'s directory walking or `archiveRunDir`'s git-mv/revert mechanics — both were investigated and cleared.

**Tech Stack:** Node 18+ built-ins, `node --test`, `gh` CLI (one added JSON field on an existing call).

**Spec:** `.claude-tweaks/pipelines/2026-08-22T081916-spec-1068-1103-1122-1130-1140-1170-1183-1059-1060-1123-1129-1131-1137-1145-1146-1147-1148-1171-1172-1174-1181-1184-1034-1051-1138-1139-1167-1175-1176-1177/spec-1130/work/1130-spec.md`

## Global Constraints

- All work happens in the shared multi-spec worktree `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177` on branch `worktree-flow+spec-1068-1177`. Every shell step must `cd` there first (or use `git -C`).
- Commit messages: `{Verb} {what} — {detail}` imperative style, body ending with `refs #1130` (never `closes`/`fixes` — the multi-spec run's shared PR owns closure).
- Do NOT touch `plugin/bin/lib/hooks/worktree-detect.js` (investigated, confirmed clean) or `archiveRunDir`'s `workMoves` git-mv/revert loop (record #1103's fix, confirmed not the cause).
- `plugin/` subtree is the shipped payload; `tests/` is maintainer-side. Test-only changes (Task 1) must not add anything under `plugin/`.
- Run targeted suites per task; the full `npm test` runs once at the end (Task 3). A failure count that varies run-to-run on unchanged code is machine load — re-run the affected file in isolation before treating it as a regression.

## Investigation Findings (authoritative context — do not re-derive)

**Pollution path (Investigation 1):** `plugin/bin/hooks.js` line ~635 resolves each hook event's `cwd` from the stdin payload's `cwd` field, falling back to the spawned subprocess's own `process.cwd()`. `tests/hooks-dispatcher.test.js`'s `runHook` helper (line ~14) spawns with `cwd: undefined` when a call site omits `cwd` — the subprocess then inherits the test runner's real working directory (the real checkout, when `npm test` runs from it), and `iterRunDirsWithState` walks the REAL `.claude-tweaks/pipelines/`. One call site with that omission exists today (~line 337-340, saved only by its `PIPELINE_RUN_DIR` env short-circuit). The fixture literals that polluted the real run in the original incident (`owner`/`bystander` session ids, `ct-wtd-parent-*/wt`, `ct-disp-repo-*/a.txt`) match this file's tests at ~307-326 and ~442-456. `worktree-detect.js` is clean — the leak is entirely what feeds `cwd`.

**Archival path (Investigation 2):** `decideArchive(prState, consoleState)` (`plugin/bin/lib/reconcile/archive-merged.js` ~line 62) blocks archival only for `consoleState === 'unresolved'`; `'none'` (no `console.json` at all) archives purely on `prState.state === 'MERGED'`. `archiveMerged` only ever iterates non-terminal runs (`iterRunDirsWithState` skips `status: 'clean'`), so for its population `'none'` always means "wrap-up never rendered a console for this run" — the empty-console fast path is NOT affected, because that path ends with `close-run` (status `clean`) + the `archive-run` verb, never this sweep. Separately, `resolvePrState`'s `MERGED` comes from a live `gh` call and can be true before the local main checkout has fast-forwarded; the run's `work/` subtree only reaches the main checkout via that merge, so archiving early moves only the gitignored half — the exact #657 symptom. The `archive-run` CLI verb (`plugin/bin/hooks.js` ~line 371) checks only `NON_TERMINAL.has(state.status)` — no console check.

---

### Task 1: Harden `runHook` so an omitted cwd can never reach the real checkout

**Files:**
- Modify: `tests/hooks-dispatcher.test.js` (the `runHook` helper at ~line 14, plus a new regression test)

**Interfaces:**
- Consumes: existing `runHook(args, { input, cwd, env })` helper; `tmpProject()` fixture in the same file.
- Produces: `runHook` with a sandbox-default `cwd` (same signature — no call-site changes needed); a regression test named `a hook spawned with no cwd anywhere cannot write into a real run dir reachable from the test runner's own process.cwd()`.

- [ ] **Step 1: Sweep sibling spawn sites (read-only, informs scope)**

Run:
```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177" && grep -rn "execFileSync('node', \[HOOKS" tests/ | grep -v "cwd"
```
Expected: only lines that also pass `cwd` via a wrapper (most files route through a local `runHook`-style helper that takes `cwd`). Record any file whose helper allows `cwd: undefined` to reach `execFileSync` — `tests/hooks-dispatcher.test.js` is the known case; if others surface (e.g. `tests/hooks-pre-tool-use.test.js`, `tests/hooks-session-start.test.js`), apply the identical Step 3 hardening to each helper (same default, same comment), and note them in the commit body. Do not chase call sites individually — harden the helpers.

- [ ] **Step 2: Write the failing regression test**

Append to `tests/hooks-dispatcher.test.js`:

```js
// #1130: a runHook call that omits cwd BOTH in execFileSync's options and in
// the JSON payload used to fall through to the spawned subprocess's own
// process.cwd() — the test runner's real working directory. When that
// directory sits inside a real checkout, iterRunDirsWithState walked the
// REAL .claude-tweaks/pipelines/ and appendEvent wrote fixture literals into
// a real run's events.jsonl (the #657 incident's pollution mechanism). The
// hardened helper defaults to an isolated sandbox dir instead, so the decoy
// "real" run dir below must stay byte-untouched.
test('a hook spawned with no cwd anywhere cannot write into a real run dir reachable from the test runner process.cwd()', () => {
  const decoyRepo = tmpProject(); // git-init'd, has .claude-tweaks/pipelines/
  const decoyRun = path.join(decoyRepo, '.claude-tweaks', 'pipelines', '2026-08-01T090000-record-9');
  fs.mkdirSync(decoyRun, { recursive: true });
  fs.writeFileSync(path.join(decoyRun, 'run-state.json'), JSON.stringify({ status: 'active', worktree: '/tmp/wt-decoy', sessionId: 'decoy-owner' }));
  const eventsPath = path.join(decoyRun, 'events.jsonl');

  const realCwd = process.cwd();
  process.chdir(decoyRepo);
  try {
    // Write-shaped payload with NO cwd field, NO options.cwd, NO PIPELINE_RUN_DIR:
    // pre-fix, this resolves cwd to process.cwd() (= decoyRepo) and can append
    // a gate-denial/wd-foreign-session event to the decoy run.
    runHook(['pre-tool-use'], {
      input: JSON.stringify({
        tool_name: 'Bash',
        tool_input: { command: 'git commit -m x' },
        session_id: 'bystander',
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
```

Note (verified): `tmpProject()` git-inits its dir and already creates `.claude-tweaks/pipelines/2026-07-01T090000-spec-1/` with a `decisions.md` — the test's own `fs.mkdirSync(decoyRun, { recursive: true })` for a second run id needs no extra parent-dir setup. The decoy run's `run-state.json` (status `active`, newest-sorting run id) is what makes it resolvable as a write target pre-fix.

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177" && node --test tests/hooks-dispatcher.test.js 2>&1 | grep -A5 "no cwd anywhere"`
Expected: FAIL — pre-fix, the spawned hook resolves the decoy repo as its checkout and appends an event (`events.jsonl` exists), or mutates state. If it passes pre-fix, STOP and investigate before proceeding: the E1/enforcement path may need a different `tool_input` shape to reach `appendEvent` (try a `Write`-tool payload targeting a path inside the decoy's recorded worktree, mirroring the existing gate-denial test at ~line 442); the test MUST be demonstrated red before the fix lands.

- [ ] **Step 4: Harden the helper**

In `tests/hooks-dispatcher.test.js`, replace the `runHook` helper:

```js
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
      input, cwd, encoding: 'utf8', env: { ...process.env, ...env },
    });
    return { code: 0, stdout };
  } catch (e) {
    return { code: e.status, stdout: e.stdout || '' };
  }
}
```

Apply the same default to any additional vulnerable helper found in Step 1 (one sandbox constant per file).

- [ ] **Step 5: Run the file to verify the new test passes and nothing regressed**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177" && node --test tests/hooks-dispatcher.test.js 2>&1 | tail -10`
Expected: PASS, 0 failures. (A call site that previously relied on the implicit real-checkout cwd would now fail — fix such a call site by passing its intended fixture dir explicitly, never by reverting the default.)

- [ ] **Step 6: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177" && git add tests/hooks-dispatcher.test.js && git commit -m "Harden runHook against cwd-omission writes into real run dirs

A runHook call omitting cwd in both execFileSync options and the JSON
payload fell through to the spawned subprocess's process.cwd() — the test
runner's real working directory — letting hook events land in a REAL
.claude-tweaks/pipelines/ run dir (the #657 pollution incident's
mechanism). The helper now defaults to an isolated sandbox dir; a decoy-repo
regression test pins the class closed.

refs #1130"
```

(Include any additionally-hardened test files in the same `git add`.)

---

### Task 2: Gate reconcile archival on a rendered console and local merge ancestry

**Files:**
- Modify: `plugin/bin/lib/reconcile/archive-merged.js` (`decideArchive` ~line 62, `archiveMerged` ~line 395)
- Modify: `plugin/bin/lib/reconcile/pr-state.js` (`PR_LIST_ARGS` ~line 37)
- Modify: `tests/reconcile.test.js` (~line 240 — flip the `'none'` pin; add ancestry-gate tests)

**Interfaces:**
- Consumes: `decideArchive(prState, consoleState)` (pure), `resolvePrState` returning `{ number, state, mergedAt, updatedAt }`, `runGit(args, cwd)` from `../hooks/git-exec` (already imported in archive-merged.js; returns `{ failure, stdout }`).
- Produces: `decideArchive` returning `{ action: 'skip', reason: 'console-never-rendered' }` for `consoleState === 'none'`; `resolvePrState` results additionally carrying `mergeCommit` (`{ oid }` or null, gh's own shape); `archiveMerged` skipping with reasons `'local-behind-merge'` / `'merge-commit-unknown'`.

- [ ] **Step 1: Flip the existing `'none'` pin and add the new decideArchive test (write failing tests)**

In `tests/reconcile.test.js`, replace the test at ~line 240:

```js
// #1130: archiveMerged only ever iterates NON-terminal runs, so a missing
// console.json here always means wrap-up never rendered a console for this
// run — not the empty-console fast path, which ends with close-run (status
// clean) + the archive-run verb and never reaches this sweep. Archiving on
// 'none' swept live runs with pending staged decisions (the #657 incident).
test('decideArchive: merged + console never rendered -> skip, not archive', () => {
  assert.deepStrictEqual(
    decideArchive({ number: 3, state: 'MERGED' }, 'none'),
    { action: 'skip', reason: 'console-never-rendered' },
  );
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177" && node --test tests/reconcile.test.js 2>&1 | grep -B1 -A8 "never rendered"`
Expected: FAIL — current code returns `{ action: 'archive' }`.

- [ ] **Step 3: Implement the decideArchive change**

In `plugin/bin/lib/reconcile/archive-merged.js`, change `decideArchive`'s final clauses to:

```js
  if (consoleState === 'unresolved') return { action: 'skip', reason: 'console-unresolved' };
  // #1130: this sweep's population is non-terminal runs only
  // (iterRunDirsWithState skips status:'clean'), so an absent console.json
  // here always means wrap-up never rendered a console for this run — never
  // the empty-console fast path, which closes the run terminal and archives
  // via the archive-run verb without ever reaching this sweep. Archiving on
  // mere PR-merge swept live runs with pending staged decisions (#657).
  if (consoleState === 'none') return { action: 'skip', reason: 'console-never-rendered' };
  return { action: 'archive' };
```

Also update the `readConsoleState` doc comment at ~line 73: the parenthetical `(no console.json rendered — archival under the "or no console rendered" clause is not blocked on it)` is now false — reword to `(no console.json rendered — #1130: blocks this sweep's archival; the empty-console fast path archives via the archive-run verb instead)`.

- [ ] **Step 4: Add `mergeCommit` to the PR list fields**

In `plugin/bin/lib/reconcile/pr-state.js` line ~37:

```js
const PR_LIST_ARGS = ['pr', 'list', '--state', 'all', '--json', 'number,state,mergedAt,updatedAt,mergeCommit'];
```

(Additive — every existing consumer reads named fields off the parsed objects; `pickGoverningPr` and callers are shape-tolerant. `gh pr list --json mergeCommit` returns `{"mergeCommit": {"oid": "…"}}` for merged PRs, `null` otherwise.)

- [ ] **Step 5: Write the failing archiveMerged ancestry test**

Append to `tests/reconcile.test.js` (module-scope note: this suite already stubs `resolvePrState` where needed — follow the file's existing stubbing pattern for archiveMerged if one exists; otherwise test the extracted helper directly). Implement the check as a small exported pure-ish helper so it is testable without a live `gh`:

```js
const { localHasMerge } = require('../plugin/bin/lib/reconcile/archive-merged');

// #1130: gh can report MERGED before the local main checkout has
// fast-forwarded to include the merge commit. Archiving then moves only the
// gitignored half (work/ arrives via the merge) — the #657 symptom.
test('localHasMerge: merge commit not in local history -> false; present -> true; unknown oid shape -> null', () => {
  const root = makeRepo(); // reuse this file's existing git fixture helper, or git-fixtures.js's gitRepo()
  const head = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.strictEqual(localHasMerge(root, { oid: head }), true);
  assert.strictEqual(localHasMerge(root, { oid: 'f'.repeat(40) }), false);
  assert.strictEqual(localHasMerge(root, null), null);
  assert.strictEqual(localHasMerge(root, {}), null);
});
```

(If `tests/reconcile.test.js` has no local git-repo fixture, import `gitRepo` from `./helpers/git-fixtures`.)

- [ ] **Step 6: Run to verify it fails**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177" && node --test tests/reconcile.test.js 2>&1 | grep -B1 -A8 "localHasMerge"`
Expected: FAIL with `localHasMerge is not a function`.

- [ ] **Step 7: Implement `localHasMerge` and wire it into `archiveMerged`**

In `plugin/bin/lib/reconcile/archive-merged.js`:

```js
// #1130: gh's MERGED state is a remote fact; the local main checkout may not
// have fast-forwarded to include the merge commit yet. The run dir's tracked
// work/ subtree only reaches the main checkout via that merge, so archiving
// early moves only the gitignored half and strands work/ (the #657 symptom).
// true = merge commit is in local history; false = definitively not (safe to
// retry next pass); null = oid unavailable/malformed — treated by the caller
// as not-yet-verifiable, same skip-and-retry.
function localHasMerge(root, mergeCommit) {
  const oid = mergeCommit && typeof mergeCommit.oid === 'string' && /^[0-9a-f]{40}$/.test(mergeCommit.oid)
    ? mergeCommit.oid : null;
  if (!oid) return null;
  const r = runGit(['merge-base', '--is-ancestor', oid, 'HEAD'], root);
  return r.failure ? false : true;
}
```

In `archiveMerged`'s loop, after `decideArchive` returns `{ action: 'archive' }` and before the `dryRun` check:

```js
    const hasMerge = localHasMerge(root, prState.mergeCommit);
    if (hasMerge !== true) {
      skipped.push({ runDir: dir, reason: hasMerge === false ? 'local-behind-merge' : 'merge-commit-unknown' });
      continue;
    }
```

Export `localHasMerge` from the module's exports.

- [ ] **Step 8: Run the reconcile suites**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177" && node --test tests/reconcile.test.js tests/bin-lib/reconcile/archive-merged.test.js tests/bin-lib/reconcile/pr-state.test.js 2>&1 | tail -10`
Expected: PASS, 0 failures. If any archiveMerged integration test stubbed a merged PR without a `mergeCommit` field and now fails with `merge-commit-unknown`, update the stub to include `mergeCommit: { oid: <the fixture repo's real HEAD> }` — that is the test catching exactly the fail-closed behavior we want.

- [ ] **Step 9: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177" && git add plugin/bin/lib/reconcile/archive-merged.js plugin/bin/lib/reconcile/pr-state.js tests/reconcile.test.js && git commit -m "Gate reconcile archival on a rendered console and local merge ancestry

decideArchive archived on consoleState 'none' — but this sweep only ever
sees non-terminal runs, where 'none' means wrap-up never rendered a console
(the empty-console fast path closes terminal and archives via the
archive-run verb, never this sweep). And gh's MERGED is a remote fact the
local checkout may not have caught up to — archiving then moves only the
gitignored half and strands work/ (the #657 incident's two symptoms).

refs #1130"
```

---

### Task 3: `archive-run` verb console parity, doc sync, full suite

**Files:**
- Modify: `plugin/bin/hooks.js` (the `archive-run` verb, ~line 371)
- Modify: `plugin/skills/wrap-up/cleanup-procedures-execution.md` (Section B — note which preconditions are now code-enforced)
- Test: `tests/archive-run-verb.test.js`

**Interfaces:**
- Consumes: `readConsoleState(runDir)` (already exported from `./lib/reconcile/archive-merged`, already required in the verb's scope via the same module).
- Produces: `archive-run` refusing with `claude-tweaks: archival refused — console-unresolved …` when `console.json` exists and is unresolved. (`'none'` stays allowed here: this verb already requires terminal status, i.e. wrap-up's own `close-run` ran — the empty-console fast path's legitimate route.)

- [ ] **Step 1: Write the failing test**

Append to `tests/archive-run-verb.test.js`, using the file's existing `runDirFixture(status)` and `runHook(args, { cwd, env })` helpers (verified present at the top of that file):

```js
// #1130 AC4: the direct CLI verb is wrap-up's own archival route and already
// requires terminal status, but a run parked with a rendered-but-unanswered
// PR console (console.json present, resolved !== true) could still be
// archived by a mistaken direct call — sweeping staged decisions before the
// human answered. Parity with decideArchive's console-unresolved skip.
test('archive-run: refuses a terminal run whose console.json is rendered but unresolved', () => {
  const { root, runDir } = runDirFixture('clean');
  fs.writeFileSync(path.join(runDir, 'console.json'), JSON.stringify({ commentIds: ['IC_x'], prNumber: 5, items: [], resolved: false }));
  const result = runHook(['archive-run', '--run', runDir], { cwd: root });
  assert.match(result.stdout, /archival refused — console-unresolved/);
  assert.ok(fs.existsSync(path.join(runDir, 'config.yml')), 'run dir must not be moved');
});

// The empty-console fast path (no console.json ever rendered) stays allowed
// here — terminal status means close-run ran, i.e. wrap-up's own flow
// completed. Pin it so the new refusal never over-blocks.
test('archive-run: still archives a terminal run with no console.json at all', () => {
  const { root, runDir, runId } = runDirFixture('clean');
  const result = runHook(['archive-run', '--run', runDir], { cwd: root });
  assert.match(result.stdout, new RegExp(`archived ${runId}`));
  assert.strictEqual(fs.existsSync(runDir), false);
});
```

(If an existing test already pins the no-console archival success path, skip the second test rather than duplicating it.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177" && node --test tests/archive-run-verb.test.js 2>&1 | grep -B1 -A8 "unresolved"`
Expected: FAIL — the verb currently archives (or the refusal line doesn't match).

- [ ] **Step 3: Implement the verb check**

In `plugin/bin/hooks.js`'s `archive-run` handler, after the `NON_TERMINAL` check and before `mainCheckoutRoot`:

```js
    // #1130 AC4: same console gate decideArchive enforces on the reconcile
    // path. 'none' stays allowed here — terminal status means close-run ran,
    // i.e. wrap-up's own flow (incl. the empty-console fast path) completed;
    // only a rendered-but-unanswered console blocks a direct archival.
    const { readConsoleState } = require('./lib/reconcile/archive-merged');
    if (readConsoleState(runDir) === 'unresolved') {
      process.stdout.write('claude-tweaks: archival refused — console-unresolved (console.json rendered but not resolved; answer or resolve the console first)\n');
      return 0;
    }
```

- [ ] **Step 4: Run the verb suite**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177" && node --test tests/archive-run-verb.test.js tests/hooks-dispatcher.test.js 2>&1 | tail -8`
Expected: PASS, 0 failures.

- [ ] **Step 5: Sync Section B's prose**

In `plugin/skills/wrap-up/cleanup-procedures-execution.md` Section B (heading `## B. Pipeline run directory (v4.6.0)`), extend step 2's line — currently exactly `2. Verify the Review Console ran and applied/dismissed all staged items.` — by appending one sentence to it: ` Since #1130 this precondition is also code-enforced at both archival call sites — the reconcile sweep skips a run whose console was never rendered or is unresolved (decideArchive), and the archive-run verb below refuses a rendered-but-unresolved console.` Keep the edit to that one sentence on that one line — do not restructure the section.

- [ ] **Step 6: Full suite**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177" && npm test > /tmp/1130-full.txt 2>&1; tail -8 /tmp/1130-full.txt && grep -c "^not ok" /tmp/1130-full.txt`
Expected: 0 failures (`grep -c` prints 0 and exits 1 — that exit code is fine). Any nonzero count: re-run each failing file in isolation before concluding anything regressed (machine-load flake convention); a conformance/prose-pin test failing on the Section B edit is a real failure — fix the wording to satisfy the pin, never delete the pin.

- [ ] **Step 7: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow+spec-1068-1177" && git add plugin/bin/hooks.js plugin/skills/_shared/cleanup-procedures-execution.md tests/archive-run-verb.test.js && git commit -m "Refuse archive-run on a rendered-but-unresolved console — decideArchive parity

The direct CLI verb checked only terminal status, relying on the caller's
step ordering for the console precondition. Both archival call sites now
enforce it in code (#1130 AC4); Section B's prose records which
preconditions are code-enforced.

refs #1130"
```

---

## Verification against Acceptance Criteria

- **AC1** (no foreign writes into a real run): Task 1's decoy-repo regression test reproduces the incident shape (no cwd anywhere, write-shaped payload, runner cwd inside a real-looking checkout) and pins it closed at the helper level.
- **AC2** (archival only on genuine preconditions): Task 2 blocks `'none'` (console never rendered → skip) and blocks a remote-only MERGED signal until the local checkout contains the merge commit (`local-behind-merge`), each with tests. The two-call dispatch handoff shape is covered by the decideArchive population argument (non-terminal runs are exactly what a parked dispatch leaves behind) plus the `archive-run` unresolved-console refusal in Task 3.
- **AC3** (`npm test` green): Task 3 Step 6.
- **AC4** (both call sites enforce): Task 2 (reconcile sweep) + Task 3 (CLI verb).

## Scope keywords:

decideArchive, readConsoleState, localHasMerge, console-never-rendered, local-behind-merge, runHook, HOOK_SANDBOX
