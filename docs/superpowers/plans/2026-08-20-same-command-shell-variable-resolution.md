# Same-Command Shell Variable Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach `bin/lib/hooks/git-command.js`'s shared segment-walk to resolve a simple same-command `NAME=value` shell-variable assignment into a `$NAME`/`${NAME}` token before classifying it as a `cd`/write target, so the `worktree-always` gate correctly denies a same-command-variable write whose resolved target is inside the policed repo — a coverage gap today, not the originally-reported (and non-existent) denial.

**Architecture:** Add a `Map<name, literal-value>` to `forEachCommandSegment()`'s existing single-pass closure, alongside the `cd`-tracked `effCwd` it already carries. A segment that is exactly one `NAME=value` token updates the map (or deletes the entry when its own value is unresolvable) and is otherwise skipped; every other segment's tokens are substituted against the map before `resolveCd`/`resolveWriteTarget`/`skipGlobalFlags` ever see them. One substitution point serves both `gitTargets()` and `fileWriteTargets()`, since both already flow through this shared walk.

**Tech Stack:** Node.js, `node --test` (built-in test runner), no external dependencies.

**Spec:** `.claude-tweaks/pipelines/2026-08-20T044329-record-630/work/630-spec.md` (GitHub issue #630) — the plan argues from that spec; read both.

## Global Constraints

- Scoped entirely to `plugin/bin/lib/hooks/git-command.js` plus `tests/hooks-git-command.test.js` and `tests/hooks-pre-tool-use.test.js` — no other file changes.
- No recursive/chained substitution: a value that is itself `$OTHER` is never resolved through a second hop.
- No widening beyond same-command text: a variable referenced but never assigned within the command stays unresolvable (never falls back to a real environment value).
- `npm test` must pass in full at the end (per repo CLAUDE.md and the spec's Acceptance Criterion 7).

---

### Task 1: Track same-command literal assignments and substitute them into tokens

**Files:**
- Modify: `plugin/bin/lib/hooks/git-command.js:144-162` (the `forEachCommandSegment` region, plus new helpers immediately above it)
- Test: `tests/hooks-git-command.test.js`

**Interfaces:**
- Consumes: existing `stripQuotes(s)` (`plugin/bin/lib/hooks/git-command.js:69`), existing `isUnresolvable(raw)` (`:112`), existing `resolveCd(effCwd, raw)` (`:135`), existing `splitSegments`/`tokenize`.
- Produces: `forEachCommandSegment(command, cwd, handler)` keeps its existing signature and external behavior for every non-assignment segment, except tokens now arrive at `handler` (and at the internal `cd` branch) already substituted. No new exports are required — `gitTargets()`, `fileWriteTargets()`, and `mkdirTargets()` need zero changes; they already consume whatever `forEachCommandSegment` hands them.

- [ ] **Step 1: Write the failing tests in `tests/hooks-git-command.test.js`**

Update the existing test (the shape this change deliberately makes resolvable) and add the new tests it requires, right after it (after the test currently at line 34, before the "a newline inside a quoted commit message" test at line 36):

```js
test('a shell-variable cd, assigned earlier in the same command, resolves via the tracked assignment', () => {
  assert.deepStrictEqual(
    gitTargets('MKT="/wt/spec-1"\ncd "$MKT" && git commit -m "x"', '/repo'),
    [{ action: 'commit', dir: '/wt/spec-1' }],
  );
});

test('a cd referencing a variable with no same-command assignment stays unresolvable', () => {
  assert.deepStrictEqual(
    gitTargets('cd "$SOME_VAR" && git commit -m "x"', '/repo'),
    [],
  );
});

test('fileWriteTargets resolves a same-command literal assignment substituted into a write target', () => {
  assert.deepStrictEqual(
    fileWriteTargets('SP=/private/tmp/foo; sed -i "" -e "s/x/y/" "$SP/file.md" && grep -c x "$SP/file.md"', '/repo'),
    [{ action: 'edit', file: '/private/tmp/foo/file.md' }],
  );
});

test('a dynamic/unresolvable assignment value is never chained — target stays unresolvable', () => {
  assert.deepStrictEqual(
    fileWriteTargets('SP=$(pwd); sed -i "" -e "s/x/y/" "$SP/file.md"', '/repo'),
    [],
  );
});

test('a later re-assignment of the same name overrides the earlier one', () => {
  assert.deepStrictEqual(
    fileWriteTargets('SP=/a; SP=/b; sed -i "" -e "s/x/y/" "$SP/file.md"', '/repo'),
    [{ action: 'edit', file: '/b/file.md' }],
  );
});

test('a later re-assignment to an unresolvable value drops the earlier mapping — no stale substitution', () => {
  assert.deepStrictEqual(
    fileWriteTargets('SP=/a; SP=$(pwd); sed -i "" -e "s/x/y/" "$SP/file.md"', '/repo'),
    [],
  );
});
```

Also reword the now-superseded test at line 29-34 (`'a shell-variable cd on its own line, preceded by an unrelated statement, is unresolvable — no target (never falls back to the stale cwd)'`) — this is the one deliberate pinned-test change the spec calls for. Replace it with:

```js
test('a shell-variable cd on its own line, preceded by an unrelated statement, resolves via the same-command assignment (no fallback to the stale cwd — the assignment IS the proof)', () => {
  assert.deepStrictEqual(
    gitTargets('MKT="/wt/spec-1"\ncd "$MKT" && git commit -m "x"', '/repo'),
    [{ action: 'commit', dir: '/wt/spec-1' }],
  );
});
```

(This duplicates the new "resolves via the tracked assignment" test above — keep only one copy; fold the reworded original into the new test rather than having both, so there is exactly one test for this exact command string, reworded in place rather than appended twice.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/dispatch-record-630" && node --test tests/hooks-git-command.test.js`
Expected: the reworded test and the five new tests FAIL (current code returns `[]` for all of them since same-command assignments are never tracked or substituted); every other existing test in the file still PASSES.

- [ ] **Step 3: Implement the assignment-tracking and substitution helpers**

In `plugin/bin/lib/hooks/git-command.js`, insert the following immediately before the existing `forEachCommandSegment` function (i.e., after `resolveCd` at line 142, before line 144's comment block):

```js
// Matches a segment that is exactly one token shaped like a simple literal
// variable assignment: NAME=value / NAME="value" / NAME='value' (bash
// permits no space around `=`, and this regex requires no space inside the
// value either — a value containing an unescaped space tokenizes into more
// than one token, which the length check in updateAssignment below excludes;
// that's an accepted narrowing, not a bug). No `export`, no arrays:
// `export SP=/x` tokenizes to two tokens (`export`, `SP=/x`) and fails the
// length check before this regex ever runs, so `export` needs no separate
// rejection.
const SIMPLE_ASSIGNMENT_RE = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/;

// Classifies raw (pre-substitution) token array `t` as a simple same-command
// assignment and updates `vars` in place; returns whether it was one (the
// caller `continue`s past handler/cd on true, the same way an existing `cd`
// segment already does). A later assignment of the same name overwrites the
// earlier one; an assignment whose OWN value is unresolvable DELETES any
// earlier mapping for that name rather than leaving it in place — the
// variable's value genuinely changed, so continuing to substitute the stale
// earlier value would itself be a fabricated-target risk, the exact thing
// this module's fail-open posture exists to avoid. Deliberately reads the
// RAW (pre-substitution) token, never the substituted one — this is what
// keeps a chained reference (`B=$A/y`) from ever resolving through a second
// hop: `$A/y`'s raw value still contains `$`, so isUnresolvable rejects it
// here, before substitution would otherwise have had a chance to touch it.
function updateAssignment(vars, t) {
  if (t.length !== 1) return false;
  const m = SIMPLE_ASSIGNMENT_RE.exec(t[0]);
  if (!m) return false;
  const [, name, rawValue] = m;
  const value = stripQuotes(rawValue);
  if (isUnresolvable(value)) vars.delete(name);
  else vars.set(name, value);
  return true;
}

// Matches a token's $NAME / ${NAME} reference.
const VAR_REF_RE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g;

// Substitutes a same-command literal assignment into a token, deliberately
// narrow: only a token whose $/backtick content is EXACTLY one $NAME or
// ${NAME} reference to an already-tracked name is rewritten; anything else
// (an unassigned name, a second $ or a backtick elsewhere in the token) is
// returned unchanged and falls through to the existing
// isUnresolvable()/null-target behavior unmodified. Never recursive — the
// substituted value is a literal already proven not to contain `$` (by
// updateAssignment's own isUnresolvable check at assignment time), so there
// is nothing left to re-scan.
function substituteVars(tokens, vars) {
  if (!vars.size) return tokens;
  return tokens.map((tok) => {
    if (!tok.includes('$') || tok.includes('`')) return tok;
    const matches = [...tok.matchAll(VAR_REF_RE)];
    if (matches.length !== 1) return tok;
    if ((tok.match(/\$/g) || []).length !== 1) return tok;
    const m = matches[0];
    const name = m[1] || m[2];
    if (!vars.has(name)) return tok;
    return tok.slice(0, m.index) + vars.get(name) + tok.slice(m.index + m[0].length);
  });
}
```

Then replace the existing `forEachCommandSegment` function body:

```js
function forEachCommandSegment(command, cwd, handler) {
  let effCwd = cwd || '.'; // string, or null meaning UNKNOWN
  for (const seg of splitSegments(command)) {
    const t = tokenize(seg.trim());
    if (!t.length) continue;
    if (t[0] === 'cd') {
      effCwd = resolveCd(effCwd, t[1]);
      continue;
    }
    handler(t, effCwd);
  }
}
```

with:

```js
function forEachCommandSegment(command, cwd, handler) {
  let effCwd = cwd || '.'; // string, or null meaning UNKNOWN
  const vars = new Map(); // name -> literal value, same-command only, no chaining
  for (const seg of splitSegments(command)) {
    const rawT = tokenize(seg.trim());
    if (!rawT.length) continue;
    if (updateAssignment(vars, rawT)) continue;
    const t = substituteVars(rawT, vars);
    if (t[0] === 'cd') {
      effCwd = resolveCd(effCwd, t[1]);
      continue;
    }
    handler(t, effCwd);
  }
}
```

Do not change the function's JSDoc-style comment block above it (lines 144-150 in the original) beyond what's needed to stay accurate — it already documents the single-pass, shared-state rationale this change extends; leave it in place.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/dispatch-record-630" && node --test tests/hooks-git-command.test.js`
Expected: every test in the file PASSES, including the reworded test and the five new ones from Step 1.

- [ ] **Step 5: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/dispatch-record-630"
git add plugin/bin/lib/hooks/git-command.js tests/hooks-git-command.test.js
git commit -m "Resolve same-command literal shell-variable assignments in git-command.js targets (#630)"
```

---

### Task 2: Prove the gate now denies (and still allows) the concrete same-command-variable shapes

**Files:**
- Modify: `tests/hooks-pre-tool-use.test.js` (near the existing `'worktree-required: an unprovable target on a new shape fabricates nothing (#70)'` test at line 667)

**Interfaces:**
- Consumes: `policedRepo()` (`tests/hooks-pre-tool-use.test.js:587`), `decisionOf(out)` (`:592`), `pre.run(...)`, `bashInput(cmd, cwd)` — all already defined earlier in the file; no signature changes.
- Produces: two new `test(...)` blocks; no production code changes in this task (Task 1 already shipped the only production change this spec requires).

- [ ] **Step 1: Write the failing tests**

Insert, immediately after the `'worktree-required: an unprovable target on a new shape fabricates nothing (#70)'` test (which ends at line 682) and before the `'worktree-required: an unexpanded glob still resolves against the cwd and is denied (#70)'` test:

```js
test('worktree-required: a same-command shell variable resolving inside the repo is now denied (#630)', () => {
  const repo = policedRepo();
  const cmd = `WT=${repo}; sed -i 's/x/y/' "$WT/a.js"`;
  const out = pre.run({ input: bashInput(cmd, '/tmp'), runDir: null, runState: null, cwd: '/tmp' });
  assert.strictEqual(decisionOf(out), 'deny', 'a same-command variable resolving inside the policed repo must now be provable and denied');
});

test('worktree-required: a same-command shell variable resolving outside the repo stays allowed (#630)', () => {
  const repo = policedRepo();
  const cmd = 'SP=/private/tmp/elsewhere; sed -i \'\' -e \'s/x/y/\' "$SP/file.md"';
  const out = pre.run({ input: bashInput(cmd, '/tmp'), runDir: null, runState: null, cwd: '/tmp' });
  assert.deepStrictEqual(out, {}, 'a same-command variable resolving outside the repo must still be allowed — no regression for the originally-reported shape');
  void repo; // repo is created only to match policedRepo()'s policy-fixture shape; this command never touches it
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/dispatch-record-630" && node --test tests/hooks-pre-tool-use.test.js`
Expected: `'worktree-required: a same-command shell variable resolving inside the repo is now denied (#630)'` FAILS before Task 1 lands (pre-existing code resolves `[]`/no-target, so the gate allows). After Task 1 has landed (this task runs second, in the same worktree, so Task 1's fix is already present), this test should already PASS — run it anyway to confirm, and treat an unexpected failure here as a signal to re-check Task 1's implementation, not this test.

- [ ] **Step 3: No implementation change needed**

Task 1 already implements the fix `git-command.js` needs; `pre-tool-use.js`'s own repo-membership check is unchanged and already correctly denies/allows once it receives a real (non-null) target. If Step 2 shows both new tests already passing, this step is a no-op — proceed to Step 4.

- [ ] **Step 4: Run the full pre-tool-use suite to verify no regressions**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/dispatch-record-630" && node --test tests/hooks-pre-tool-use.test.js`
Expected: every test in the file PASSES, including the existing `'worktree-required: an unprovable target on a new shape fabricates nothing (#70)'` test unmodified (the `"$SOME_VAR"` case has no same-command assignment, so it must stay unresolvable per Acceptance Criterion 5).

- [ ] **Step 5: Commit**

```bash
cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/dispatch-record-630"
git add tests/hooks-pre-tool-use.test.js
git commit -m "Add gate-level deny/allow coverage for same-command shell-variable targets (#630)"
```

---

### Task 3: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `cd "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/dispatch-record-630" && npm test`
Expected: full PASS — no regressions anywhere else in the suite. This satisfies Acceptance Criterion 7.

- [ ] **Step 2: If anything unrelated fails**

Re-run just that file in isolation (`node --test path/to/file.test.js`) to rule out cross-run interference from concurrent sessions before concluding it's a real regression (per this repo's own CLAUDE.md guidance on flaky counts). If it's a real regression, it must trace back to Task 1's change (the only production-code change in this plan) — investigate `plugin/bin/lib/hooks/git-command.js`'s other consumers (`pre-tool-use.js`'s `GATE_COVERAGE`, `gitTargets`/`fileWriteTargets`/`mkdirTargets` call sites) for an unintended interaction before touching anything else.
