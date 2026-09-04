# Bookkeeping-Stamps Gate Scratchpad Scoping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the bookkeeping-stamps gate (`checkBookkeepingStampsGate` in `plugin/bin/lib/hooks/pre-tool-use.js`) from denying an Edit/Write/NotebookEdit whose own target path resolves outside the run's worktree/main-checkout entirely — a session scratchpad path, or a completely unrelated repository — narrowing its file-tool branch to the same scope its Bash/git-write branch already enforces.

**Architecture:** The file-tool branch of `checkBookkeepingStampsGate` currently gates on the CALLING SESSION's cwd being inside a linked worktree (`wtDetect.repoInfo(ctx.cwd)`), but never checks whether the actual write TARGET is inside that same worktree/repo. The Bash/git-write branch already has an analogous "Foreign repos" scoping check (`isGitWrite` block, compares each git target's `mainCheckoutRoot` against the worktree's own). This plan adds the missing target-scoping check to the file-tool branch, using the same provable/fail-closed posture (`wtDetect.repoInfo`'s `indeterminate` flag) the existing path exemptions (`isPipelineBookkeeping`, `isStampsGateExemptTarget`) already use — a definitively-not-a-repo or definitively-different-repo target no-ops the gate; an unprovable (indeterminate) target falls through to the existing (denying) behavior, unchanged.

**Tech Stack:** Node.js (`node --test`), no external dependencies — this is a pure addition inside an existing hook module and its existing test file.

**Spec:** GitHub issue #1678 (materialized at `.claude-tweaks/pipelines/2026-09-01T044830-record-1678/work/1678-spec.md`) — "bookkeeping-stamps gate may deny session-scratchpad writes outside its documented scope."

## Global Constraints

- risk:low, size:low, ceremony:fast-lane (this record's own labels/verdict) — keep the change narrowly scoped to the file-tool branch's target-scoping check; no redesign of the gate's other four scoping rules.
- Fail CLOSED on ambiguity: an unprovable (`indeterminate: true`) target must continue to deny exactly as it does today — only a DEFINITIVE "not a repo" or "different repo" answer may exempt. This matches every other exemption already in this file (`isPipelineBookkeeping`, `isStampsGateExemptTarget`) and is explicitly required by the Acceptance Criteria's own framing (a regression test, not a broadened default-allow).
- `docs/hooks.md`'s "Five scoping rules" list (the file's own prose-facing enumeration of this gate's scoping behavior) must be updated alongside the code change — this file is cited by name in the issue's Deliverables ("If in scope: update docs/hooks.md...") and, regardless of which Deliverable branch applies, the existing "Five scoping rules keep it from over- or under-firing" list becomes inaccurate the moment a sixth rule is added without also updating the count and the list.

---

### Task 1: Add file-tool target scoping to `checkBookkeepingStampsGate`

**Files:**
- Modify: `plugin/bin/lib/hooks/pre-tool-use.js` (the `checkBookkeepingStampsGate` function, currently starting at line 1129 — search for `function checkBookkeepingStampsGate` since line numbers shift as the file changes)
- Test: `tests/hooks-bookkeeping-stamps-gate.test.js`

**Interfaces:**
- Consumes: `wtDetect.repoInfo(p, opts)` (from `./worktree-detect`, already required in `pre-tool-use.js` as `wtDetect`) — returns `{ repoRoot, isLinkedWorktree, indeterminate }`; a path with no git repo anywhere in its ancestry (e.g. a session scratchpad) resolves to a DEFINITIVE negative: `{ repoRoot: null, indeterminate: false }` (verified in `plugin/bin/lib/hooks/worktree-detect.js`'s `repoInfo`: `if (failure) return { repoRoot: null, isLinkedWorktree: false, indeterminate: isIndeterminate(failure) }` — git's own "not a git repository" answer is `failure` but NOT `isIndeterminate`, so this is a clean, provable negative, not an unprovable one).
- Consumes: `wtDetect.mainCheckoutRoot(p)` (from `./worktree-detect`, already required) — returns the main checkout root a path belongs to, or `null` when unresolvable. Already used by the existing "Foreign repos" `isGitWrite` block a few lines above the insertion point.
- Consumes: `safeReal(p)` — already defined in `pre-tool-use.js` (used by the existing `isGitWrite` Foreign-repos block).
- Consumes: `fileToolTargetPath(toolName, toolInput)` — already defined in `pre-tool-use.js` (used by `isStampsGateExemptTarget`); returns the file tool's target path string, or `null`.
- Produces: no new exported symbol — this is a behavioral change inside the existing `checkBookkeepingStampsGate` function, which is already exported (`module.exports.checkBookkeepingStampsGate`) and already tested via `pre.run(...)` in `tests/hooks-bookkeeping-stamps-gate.test.js`.

- [ ] **Step 1: Write the failing regression tests**

Open `tests/hooks-bookkeeping-stamps-gate.test.js`. Find the `// --- I2: path and foreign-repo exemptions ---` section (currently around line 509) and its two `(I2.2)` tests ending around line 572, immediately before the `// --- I3: integration-model comes from the run's own pin, not a fresh detection ---` comment. Insert three new tests immediately after the second `(I2.2)` test (after its closing `});`, before the `// --- I3` comment line):

```javascript
test('bookkeeping-stamps gate (I2.3, #1678): an Edit to a path outside any git repo at all (a session scratchpad) is not this run\'s business -> allow', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  // A plain mkdtemp dir with no `git init` — provably outside any git repo,
  // the same shape as a Claude Code session scratchpad directory
  // (/private/tmp/claude-<uid>/<slug>/<session-id>/scratchpad/**).
  const scratchpad = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-bsg-scratch-'));
  const { run } = mkRunDir(projectDir(), null, undefined);
  const out = pre.run({
    input: editInput(path.join(scratchpad, 'pr-body.md')),
    runDir: run,
    runState: { status: 'active' },
    cwd: wt,
  });
  assert.deepStrictEqual(out, {}, 'a Write whose target is outside any git repo must not be denied by this run\'s bookkeeping gate');
});

test('bookkeeping-stamps gate (I2.3, #1678): an Edit to a path inside an unrelated repository is not this run\'s business -> allow', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const foreign = gitRepo();
  const { run } = mkRunDir(projectDir(), null, undefined);
  const out = pre.run({
    input: editInput(path.join(foreign, 'notes.md')),
    runDir: run,
    runState: { status: 'active' },
    cwd: wt,
  });
  assert.deepStrictEqual(out, {}, 'a Write whose target is inside an unrelated repository must not be denied by this run\'s bookkeeping gate');
});

test('bookkeeping-stamps gate (I2.3, #1678): control — an Edit whose target is inside THIS run\'s own worktree still denies (scoping narrows, it does not disable, the gate)', () => {
  const main = gitRepo();
  const wt = linkedWorktreeOf(main);
  commitMaterializedSpec(wt, path.join('work', '991-spec.md'));
  const { run } = mkRunDir(projectDir(), null, undefined);
  const out = pre.run({
    input: editInput(path.join(wt, 'src', 'x.js')),
    runDir: run,
    runState: { status: 'active' },
    cwd: wt,
  });
  assert.ok(out.json, 'expected a deny — the target is this run\'s own worktree, unchanged from existing behavior');
  assert.strictEqual(out.json.hookSpecificOutput.permissionDecision, 'deny');
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `node --test tests/hooks-bookkeeping-stamps-gate.test.js`
Expected: FAIL — the two `(I2.3, #1678)` "-> allow" tests fail (`assert.deepStrictEqual(out, {})` fails because `out.json` is a deny), since the file-tool branch does not yet scope on the target path. The third (control) test passes already — it exercises existing, unchanged behavior.

- [ ] **Step 3: Implement the file-tool target-scoping check**

In `plugin/bin/lib/hooks/pre-tool-use.js`, inside `checkBookkeepingStampsGate`, find this existing block (the "Foreign repos" scoping for the Bash branch):

```javascript
  if (isGitWrite) {
    const mainRoot = safeReal(wtDetect.mainCheckoutRoot(wtRoot));
    if (mainRoot) {
      const ownsATarget = commandGitTargets.some(
        (t) => safeReal(wtDetect.mainCheckoutRoot(t.dir)) === mainRoot,
      );
      if (!ownsATarget) return {};
    }
  }
  if (isStampsGateExemptTarget(ctx)) return {};
```

Replace it with (adding a new `isFileTool` block before the existing `isStampsGateExemptTarget` line, leaving the `isGitWrite` block untouched):

```javascript
  if (isGitWrite) {
    const mainRoot = safeReal(wtDetect.mainCheckoutRoot(wtRoot));
    if (mainRoot) {
      const ownsATarget = commandGitTargets.some(
        (t) => safeReal(wtDetect.mainCheckoutRoot(t.dir)) === mainRoot,
      );
      if (!ownsATarget) return {};
    }
  }

  // Foreign-target scoping for the file-tool branch (#1678): an
  // Edit/Write/NotebookEdit whose OWN target path resolves outside any git
  // repository at all (a session scratchpad, e.g. under
  // /private/tmp/claude-*/.../scratchpad/**) — or inside an unrelated repo
  // entirely — is not this run's implementation work, mirroring the
  // Foreign-repos rule the isGitWrite branch already applies above. The
  // isFileTool branch previously gated on `ctx.cwd` (the calling session)
  // being inside a linked worktree, with no check that the write's own
  // TARGET was anywhere near that worktree — this closes that gap. Fails
  // CLOSED on an unprovable target (`indeterminate: true`), matching every
  // other file-tool exemption in this file (isPipelineBookkeeping,
  // isStampsGateExemptTarget): only a DEFINITIVE "not a repo" or "different
  // repo" answer exempts; an unresolvable target falls through to the
  // existing (denying) checks below, unchanged.
  if (isFileTool) {
    const fileTargetPath = fileToolTargetPath(toolName, ctx.input && ctx.input.tool_input);
    if (fileTargetPath) {
      const { repoRoot: targetRoot, indeterminate: targetIndeterminate } = wtDetect.repoInfo(fileTargetPath);
      if (!targetIndeterminate) {
        const mainRoot = safeReal(wtDetect.mainCheckoutRoot(wtRoot));
        const targetMainRoot = targetRoot ? safeReal(wtDetect.mainCheckoutRoot(targetRoot)) : null;
        if (mainRoot && targetMainRoot !== mainRoot) return {};
      }
    }
  }

  if (isStampsGateExemptTarget(ctx)) return {};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/hooks-bookkeeping-stamps-gate.test.js`
Expected: PASS — all tests in the file pass, including the three new `(I2.3, #1678)` tests.

- [ ] **Step 5: Run the full hooks test suite to check for regressions**

Run: `node --test tests/hooks-pre-tool-use.test.js tests/hooks-bookkeeping-stamps-gate.test.js tests/hooks-policy-exemption.test.js tests/hooks-gate-coverage.test.js`
Expected: PASS — no regression in the sibling gate suites (`hooks-gate-coverage.test.js` pins `GATE_COVERAGE` itself, which this change does not touch; `hooks-policy-exemption.test.js` exercises `isPolicyFile`/policy.yml behavior, which this change also does not touch — both are run here only as a blast-radius check on the same file).

- [ ] **Step 6: Commit**

```bash
git add plugin/bin/lib/hooks/pre-tool-use.js tests/hooks-bookkeeping-stamps-gate.test.js
git commit -m "Scope bookkeeping-stamps gate's file-tool branch to the run's own repo (refs #1678)"
```

---

### Task 2: Update `docs/hooks.md`'s scoping-rules prose

**Files:**
- Modify: `docs/hooks.md` (the Bookkeeping-stamps gate bullet list — find via `grep -n "Five scoping rules" docs/hooks.md`)

**Interfaces:**
- Consumes: nothing new — this task documents Task 1's code change; no code dependency.
- Produces: nothing consumed by later tasks — this is the plan's last task.

- [ ] **Step 1: Read the current prose**

Run: `grep -n "Five scoping rules\|Foreign repos\." docs/hooks.md`

Confirm the exact current wording of the "Five scoping rules keep it from over- or under-firing:" sentence and the existing "**Foreign repos.**" bullet (both currently inside the single long Bookkeeping-stamps-gate paragraph/list near the top of `docs/hooks.md`, around line 19-24 as of this plan's writing — re-locate via the grep above since the file may have shifted).

- [ ] **Step 2: Update the count and add the sixth bullet**

Change "Five scoping rules keep it from over- or under-firing:" to "Six scoping rules keep it from over- or under-firing:".

Immediately after the existing **Foreign repos.** bullet (the one describing the Bash-branch `mainRoot`/`t.dir` comparison), add a new bullet:

```markdown
  - **Foreign targets (file-tool branch, #1678).** The Edit/Write/NotebookEdit branch mirrors the Foreign-repos rule above: a file-tool call's own write TARGET — not just the calling session's `cwd` — is resolved via `wtDetect.repoInfo`, and a target that is definitively outside any git repository (a session scratchpad) or inside an unrelated repository no-ops the gate. Same unprovable-case posture as every other file-tool exemption here: an `indeterminate` target (git ran but gave no usable answer) is never exempted by this rule and falls through to the ordinary stamp-missing deny.
```

- [ ] **Step 3: Verify the edit**

Run: `grep -n "Six scoping rules\|Foreign targets (file-tool branch" docs/hooks.md`
Expected: both lines present, confirming the count was updated and the new bullet landed.

- [ ] **Step 4: Run the doc-prose conformance suite**

Run: `node --test tests/skill-prose-conformance*.test.js 2>&1 | tail -30` (adjust the glob if this repo's actual filename differs — check with `ls tests/ | grep -i prose` first) — this repo's CLAUDE.md notes prose in `plugin/skills/**/*.md` is pinned by conformance tests; `docs/hooks.md` itself is outside `plugin/skills/`, so this step is a precaution, not an expected-necessary gate. If no matching test file exists, skip this step — there is nothing to run.

- [ ] **Step 5: Commit**

```bash
git add docs/hooks.md
git commit -m "docs/hooks.md: document the bookkeeping-stamps gate's new file-tool target scoping (refs #1678)"
```
