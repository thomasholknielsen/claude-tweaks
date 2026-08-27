# teardownTargets env-prefix normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `teardownTargets()` in `plugin/bin/lib/hooks/pre-tool-use.js` must recognize `env git worktree remove <path>` (and other #590-normalized wrapper shapes) as a `git worktree remove` teardown target, the same way it already recognizes the bare form — closing the gap where `env`-prefixed removal bypasses the teardown gate entirely.

**Architecture:** `plugin/bin/lib/hooks/git-command.js` already implements this exact lead-normalization for `gitTargets()` (#590) via its internal `findGitLead(t, dir)` function, which walks past leading `NAME=value` assignments and the `env` builtin (with env's own flags, including `-C`/`--chdir`) to find the real `git`/`.../git` lead token. That function is not currently exported. `teardownTargets()` currently checks `toks[0] !== 'git'` directly (line ~339), which misses every wrapped form. The fix exports `findGitLead` and swaps `teardownTargets()`'s literal check for the same `findGitLead` + `skipGlobalFlags` pattern `gitTargets()` already uses, so both functions share one normalization implementation rather than duplicating it.

**Tech Stack:** Plain Node.js (no external deps), `node --test`.

**Spec:** `work/1308-spec.md` (materialized from GitHub issue #1308)

## Global Constraints

- Do not expand the compound-command surface `teardownTargets()` accepts beyond adding wrapper-prefix normalization — its header comment states it deliberately does not extend the compound-command surface #174 tracks.
- Ambiguity resolves to allow (never fabricate a target) — preserve the existing "any other flags, multiple positionals, or parse doubt skip that segment" rule.
- Reuse `git-command.js`'s existing `findGitLead`, do not reimplement a second copy of the #590 normalization logic.

---

### Task 1: Export `findGitLead` and use it in `teardownTargets()`

**Files:**
- Modify: `plugin/bin/lib/hooks/git-command.js` — add `findGitLead` to `module.exports`
- Modify: `plugin/bin/lib/hooks/pre-tool-use.js` — import `findGitLead`; replace the `toks[0] !== 'git'` check in `teardownTargets()` with the same `findGitLead`-based lead resolution `gitTargets()` already uses
- Modify: `tests/teardown-gate.test.js` — regression test for the `env` wrapper shape

**Interfaces:**
- Consumes: `findGitLead(t, dir)` → `{ index, dir, unprovable }` (already defined in `git-command.js`, just needs exporting)
- Produces: nothing consumed by a later task (single task)

- [x] **Step 1: Write the failing regression test**

Add to `tests/teardown-gate.test.js`, alongside the existing "whole-branch review" global-flag tests (same dispatcher-level `runHook` pattern):

```javascript
// #1308: teardownTargets used to check toks[0] !== 'git' directly, so a
// command-wrapper prefix (env, and whatever else #590's findGitLead
// normalizes) defeated the parser and let the raw removal through
// completely ungated.
test('#1308: Bash `env git worktree remove <abs-path>` on an active run\'s worktree is denied', () => {
  const root = fixtureRoot();
  const wt = addWorktree(root);
  makeRun(root, JSON.stringify({ status: 'active', worktree: wt }));
  const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: `env git worktree remove ${wt}` }, cwd: root });
  const r = runHook(['pre-tool-use'], { input: payload, cwd: root });
  const out = JSON.parse(r.stdout);
  assert.strictEqual(out.hookSpecificOutput.permissionDecision, 'deny');
});
```

Run: `cd "$WORKTREE" && node --test tests/teardown-gate.test.js`
Expected: FAIL — new test fails (`toks[0]` is `'env'`, not `'git'`, so `teardownTargets()` returns `[]` and the gate allows).

- [x] **Step 2: Export `findGitLead` from `git-command.js`**

In `plugin/bin/lib/hooks/git-command.js`, add `findGitLead` to the existing `module.exports` line (currently `{ gitTargets, fileWriteTargets, mkdirTargets, splitSegments, tokenize, forEachCommandSegment, skipGlobalFlags, WRITE_SHAPES }`).

- [x] **Step 3: Use `findGitLead` in `teardownTargets()`**

In `plugin/bin/lib/hooks/pre-tool-use.js`:
- Add `findGitLead` to the existing `require('./git-command')` destructure (line ~27).
- Replace the Bash-branch body inside `teardownTargets()`'s `forEachCommandSegment` callback: swap `if (toks[0] !== 'git') return;` plus the immediately-following `skipGlobalFlags(toks, 1, effCwd)` call for the same two-step pattern `gitTargets()` already uses — `findGitLead(toks, effCwd)` to locate the real `git` lead (returning early on `lead.index === -1` or `lead.unprovable`), then `skipGlobalFlags(toks, lead.index + 1, lead.dir)` in place of the old `skipGlobalFlags(toks, 1, effCwd)`.

- [x] **Step 4: Add a bare-form non-regression assertion**

Add a second small test (or extend Step 1's) asserting the bare `git worktree remove <path>` form still resolves to the identical target — a plain unit-level check against `teardownTargets()` directly is fine here since the function is small and deterministic; export `teardownTargets` from `pre-tool-use.js`'s `module.exports` if a direct unit test is more precise than two dispatcher-level `runHook` calls, comparing the two calls' `path`/`source` output for equality.

- [x] **Step 5: Run the regression test and confirm PASS**

Run: `cd "$WORKTREE" && node --test tests/teardown-gate.test.js`
Expected: PASS — every test in the file, including the new one.

- [x] **Step 6: Run the full suite**

Run: `cd "$WORKTREE" && npm test`
Expected: PASS — no regressions elsewhere (`gitTargets()`'s own tests unaffected since `findGitLead`'s behavior is unchanged, only its export surface grows).

- [x] **Step 7: Commit**

```bash
git -C "$WORKTREE" add plugin/bin/lib/hooks/git-command.js plugin/bin/lib/hooks/pre-tool-use.js tests/teardown-gate.test.js
git -C "$WORKTREE" commit -m "Normalize env-prefixed git lead in teardownTargets — closes #590-family gap for the teardown gate (refs #1308)"
```
