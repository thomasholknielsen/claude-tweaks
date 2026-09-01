# Bookkeeping-Stamps Gate Out-of-Repo Exemption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the bookkeeping-stamps gate (`docs/hooks.md`'s block-tier IL-131 gate) exempt a write target that resolves outside any git repository entirely — e.g. a session scratchpad path or `/tmp` — instead of denying it, without weakening the gate's existing fail-closed posture for in-repo or unprovable targets.

**Architecture:** `isStampsGateExemptTarget` in `plugin/bin/lib/hooks/pre-tool-use.js` currently collapses two different `wtDetect.repoInfo()` outcomes into one `return false` branch: `indeterminate` (git could not answer) and a confirmed `!repoRoot` (git answered "not a repository"). The sibling gate `checkWorktreeRequired` in the same file already treats these as distinct — `indeterminate` stays fail-open-but-tracked, a clean `!repoRoot` is a plain allow (line ~709: `if (!repoRoot) continue; // git answered: not a git repo at all -> allow`). This plan applies the same split to `isStampsGateExemptTarget`: `indeterminate` keeps returning `false` (not exempt, fail-closed — unchanged), a confirmed `!repoRoot` now returns `true` (exempt) instead of `false`.

**Tech Stack:** Node.js (`node --test`), no new dependencies.

**Spec:** `.claude-tweaks/pipelines/2026-09-01T123248-record-1664/work/1664-spec.md`

## Global Constraints

- No change to `isPipelineBookkeeping`/`isPolicyFile`'s own in-repo exemption logic — only `isStampsGateExemptTarget`'s repo-resolution branch changes.
- No change to `indeterminate`'s outcome — it must remain `false` (not exempt), matching this file's documented fail-closed posture for unprovable targets (`isPipelineBookkeeping`'s own comment, cited at `pre-tool-use.js:1035-1037`).
- The gate's main coverage check (cwd-scoped materialize-commit/stamp detection) is unchanged — this plan touches only the per-target exemption helper.

---

### Task 1: Split the `!repoRoot` and `indeterminate` branches in `isStampsGateExemptTarget`

**Files:**
- Modify: `plugin/bin/lib/hooks/pre-tool-use.js:1032-1047` (the `isStampsGateExemptTarget` function and its preceding header comment)
- Modify: `docs/hooks.md` (Bookkeeping-stamps gate section, "Path exemptions" prose — currently around line 22)
- Test: `tests/hooks-bookkeeping-stamps-gate.test.js` (append after the existing I2.1 block, which ends around line 526)

**Interfaces:**
- Consumes: `wtDetect.repoInfo(targetPath)` — already imported in `pre-tool-use.js`, returns `{ repoRoot, isLinkedWorktree, indeterminate }`. No signature change.
- Produces: `isStampsGateExemptTarget(ctx)` still returns a plain `boolean`; only the mapping from `repoInfo()`'s outcome to that boolean changes. `checkBookkeepingStampsGate` (the sole caller) is unaffected — it already treats `isStampsGateExemptTarget(ctx)` as an opaque boolean gate.

- [ ] **Step 1: Write the failing test**

Append to `tests/hooks-bookkeeping-stamps-gate.test.js`, immediately after the existing I2.1 test block (after the `test('bookkeeping-stamps gate (I2.1): the PR-stamp deny message names bin/log-decision.js as the runnable escape hatch', ...)` block, i.e. after line 539's closing `});`):

```javascript
test('bookkeeping-stamps gate (#1664): a write target resolving outside any git repository (session scratchpad) is exempt', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const { run } = mkRunDir(main, null, undefined);
  // A scratchpad-style path that is NOT inside `main` or `wt` and carries no
  // .git anywhere in its ancestry — the exact shape of #1664's repro
  // (composing a draft-PR body outside the repo, between push and PR-record).
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-scratch-'));
  const target = path.join(scratch, 'pr-early-body-991.md');
  const exempt = pre.run({ input: editInput(target), runDir: run, runState: { status: 'active' }, cwd: wt });
  assert.deepStrictEqual(exempt, {}, 'a write target outside any git repository must not be denied by this gate');
});

test('bookkeeping-stamps gate (#1664): control — a target INSIDE the worktree repo (not pipeline bookkeeping) still denies', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const { run } = mkRunDir(main, null, undefined);
  const denied = pre.run({ input: editInput(path.join(wt, 'src', 'x.js')), runDir: run, runState: { status: 'active' }, cwd: wt });
  assert.ok(denied.json && denied.json.hookSpecificOutput, 'control: an in-repo, non-bookkeeping target must still be denied');
  assert.strictEqual(denied.json.hookSpecificOutput.permissionDecision, 'deny');
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `node --test tests/hooks-bookkeeping-stamps-gate.test.js`
Expected: the first new test (`#1664: a write target resolving outside any git repository...`) FAILS — `exempt` is not `{}` but a deny result (`{ json: { hookSpecificOutput: { permissionDecision: 'deny', ... } } }`), because `isStampsGateExemptTarget` currently returns `false` for a confirmed `!repoRoot` target. The second test (the control) PASSES already — it is not a red/green pair, it exists to prove the fix below doesn't over-widen the exemption.

- [ ] **Step 3: Fix `isStampsGateExemptTarget`**

In `plugin/bin/lib/hooks/pre-tool-use.js`, replace the header comment and function at lines 1032-1047:

Replacing:
```javascript
// The target's OWN repo root is resolved per-target rather than assumed to be
// the worktree: run dirs are anchored to the MAIN checkout
// (_shared/pipeline-run-dir.md's Anchoring section), so decisions.md normally
// sits outside the worktree this gate is enforcing in. Anything unprovable
// (no target, indeterminate git, non-repo path) is simply not exempt and
// falls through — the same fail-closed posture isPipelineBookkeeping keeps.
function isStampsGateExemptTarget(ctx) {
  const targetPath = fileToolTargetPath(
    ctx.input && ctx.input.tool_name,
    ctx.input && ctx.input.tool_input,
  );
  if (!targetPath) return false;
  const { repoRoot, indeterminate } = wtDetect.repoInfo(targetPath);
  if (indeterminate || !repoRoot) return false;
  return isPipelineBookkeeping(repoRoot, targetPath) || isPolicyFile(repoRoot, targetPath);
}
```

With:
```javascript
// The target's OWN repo root is resolved per-target rather than assumed to be
// the worktree: run dirs are anchored to the MAIN checkout
// (_shared/pipeline-run-dir.md's Anchoring section), so decisions.md normally
// sits outside the worktree this gate is enforcing in. `indeterminate` (git
// never answered — timeout, missing git, unreadable realpath) stays fail-closed
// and falls through to "not exempt", the same posture isPipelineBookkeeping
// keeps for anything unprovable. A confirmed `!repoRoot` (#1664 — git DID
// answer, definitively "not a git repository at all", e.g. a session
// scratchpad path or /tmp) is a different, provable fact: nothing inside this
// run's worktree or its run dir could have produced that target, so it is
// exempt outright. This mirrors checkWorktreeRequired's own split for the
// identical repoInfo() outcome (`if (!repoRoot) continue; // git answered:
// not a git repo at all -> allow`, above in this file) rather than
// re-deriving the distinction independently.
function isStampsGateExemptTarget(ctx) {
  const targetPath = fileToolTargetPath(
    ctx.input && ctx.input.tool_name,
    ctx.input && ctx.input.tool_input,
  );
  if (!targetPath) return false;
  const { repoRoot, indeterminate } = wtDetect.repoInfo(targetPath);
  if (indeterminate) return false;
  if (!repoRoot) return true;
  return isPipelineBookkeeping(repoRoot, targetPath) || isPolicyFile(repoRoot, targetPath);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/hooks-bookkeeping-stamps-gate.test.js`
Expected: PASS — all tests in the file green, including both new ones.

- [ ] **Step 5: Update `docs/hooks.md`'s Path exemptions prose**

Read the current "Path exemptions" bullet under the Bookkeeping-stamps gate section (`docs/hooks.md`, the line reading roughly: "A file-tool target inside `.claude-tweaks/pipelines/` or at `.claude-tweaks/policy.yml` is exempt, resolved against the *target's* own repo root..."). Append one sentence to that same bullet (do not add a new bullet — this is the same exemption concept, one more case of it):

```
 A target that resolves outside any git repository at all (a session scratchpad path, `/tmp`) is also exempt — git can definitively answer "not a repository," which is a different, provable case from an indeterminate git failure (that stays fail-closed, i.e. still deniable).
```

- [ ] **Step 6: Run the full bookkeeping-stamps-gate suite plus a broader smoke pass**

Run: `node --test tests/hooks-bookkeeping-stamps-gate.test.js tests/hooks-worktree-required-gate.test.js`
Expected: PASS — confirms this change didn't regress the sibling gate whose pattern it mirrors (no code in that file changed, but the naming/behavior parity is worth a joint run).

- [ ] **Step 7: Commit**

```bash
git add plugin/bin/lib/hooks/pre-tool-use.js docs/hooks.md tests/hooks-bookkeeping-stamps-gate.test.js
git commit -m "fix: bookkeeping-stamps gate exempts out-of-repo write targets

refs #1664"
```

---

## Self-Review Notes

- **Spec coverage:** The spec's two Deliverables options were "(a) exclude out-of-repo paths from the covered-write set, OR (b) document the sanctioned inline `--body` path." This plan implements (a) directly at the root cause (`isStampsGateExemptTarget`), which also satisfies both Acceptance Criteria: AC1 (a scratchpad write at the materialize-committed/no-PR-recorded stage no longer denies — Task 1's new test proves this) and AC2 (in-repo covered writes still deny — Task 1's control test, plus the untouched `indeterminate`/`isPipelineBookkeeping`/`isPolicyFile` logic, proves no weakening of [IL-131]).
- **Placeholder scan:** No TBD/TODO; both new test bodies and the full replacement code block are literal, runnable text.
- **Type consistency:** `isStampsGateExemptTarget` keeps its existing `(ctx) -> boolean` signature; no caller elsewhere in `pre-tool-use.js` needs updating.
