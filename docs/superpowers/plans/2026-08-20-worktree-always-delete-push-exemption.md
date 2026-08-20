# Worktree-Always Delete-Only-Push Exemption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exempt a content-free, ref-only `git push <remote> --delete <branch>` (or `git push <remote> :<branch>`) from the `worktree-always` gate's `push` coverage, and improve the gate's deny message for any other denied push to name the sanctioned branch-delete fallback.

**Architecture:** Mirror the existing `isPolicyOnlyCommit` exemption's discipline (`bin/lib/hooks/pre-tool-use.js`): a whole-command allowlist regex, checked in `checkWorktreeRequired`'s per-target loop, admitted into `GATE_COVERAGE.exemptions` alongside the existing `commit: 'policy-only'` field. **Deviation from the record's stated Technical Approach:** the record's Key Files list names `bin/lib/hooks/git-command.js`'s `gitTargets()` as a change site, on the assumption the exemption needs per-segment token parsing. It does not — a branch-delete push's target is fully determined by the command text alone (unlike a commit, whose staged content isn't visible from the command string), so the whole-command regex check that the commit exemption already uses is sufficient and strictly safer: it fails closed on a compound command (`git push origin --delete x && rm -rf /`) for free, because the regex requires the *entire* command string to be nothing but the one push. Threading a per-target `deleteOnly` flag through `gitTargets()` would need a *second*, independent guard against exactly that compound case, duplicating the commit exemption's already-proven mechanism instead of reusing it. `git-command.js` and `WRITE_SHAPES` are therefore untouched by this plan, matching the record's own Acceptance Criteria ("No change is made to `hooks/hooks.json`'s matcher list, `WRITE_SHAPES`, or any harness-facing configuration").

**Tech Stack:** Node.js (`node --test`), no external dependencies.

**Spec:** `.claude-tweaks/pipelines/2026-08-20T073254-record-658/work/658-spec.md` (record #658) — this plan implements Deliverables 1-4 and their Acceptance Criteria in full, with the file-location correction noted below.

## Global Constraints

- Deliverable 1's decision — **exempt** `git push <remote> --delete <branch>` / `git push <remote> :<branch>` — is recorded in the shipped code (a comment on the new allowlist regex), not left implicit.
- No change to `hooks/hooks.json`'s matcher list, `WRITE_SHAPES`, or any harness-facing configuration.
- `npm test` passes in full at the end of this plan.
- **File-location correction:** the record's Deliverable 4 and Key Files cite `skills/_shared/policy-schema.md`'s "worktree-always coverage block" and "Consequence for procedures" paragraph. That content was moved to `plugin/skills/_shared/policy-schema-coverage.md` per #635 (confirmed by reading both files — `policy-schema.md` is now a one-line pointer stub). This plan edits `policy-schema-coverage.md`, the file `tests/hooks-gate-coverage.test.js` actually reads, not `policy-schema.md`.
- The commit-exemption's allowlist-regex style (`POLICY_COMMIT_ALLOWLIST`, `bin/lib/hooks/pre-tool-use.js:184-186`) is the literal template for the new regex: whole-command match, default-deny by construction (nothing not spelled out matches), reusing the file's existing `CQ_SINGLE`/`CQ_DOUBLE`/`CQ_BARE`/`CQ_ARG` building blocks rather than inventing new ones.

---

### Task 1: Failing tests for the delete-only push exemption

**Files:**
- Modify: `tests/hooks-policy-exemption.test.js:18` (import line), and append a new test section after line 168 (end of the existing commit-exemption block, before the "review findings" section)

**Interfaces:**
- Consumes: `pre.run({ input, runDir, runState, cwd })` (existing fixture, already imported as `pre` at the top of this file), `gitRepoWithCommit()`, `withPolicy(repo, content)`, `bashInput(command, cwd)`, `assertAllowed(out)`, `assertDenied(out)` — all already defined in this file, lines 26-61.
- Produces: expects `pre.isDeleteOnlyPush(command)` (function, `command: string | any -> boolean`) and `pre.DELETE_ONLY_PUSH_ALLOWLIST` (a frozen `RegExp`) to exist on the module exported by `../plugin/bin/lib/hooks/pre-tool-use` — neither exists yet; Task 2 adds them. This task's tests **must fail** until Task 2 lands.

- [ ] **Step 1: Update the import line to pull in the not-yet-existing exports**

Change line 18 from:

```js
const { isPolicyOnlyCommit, POLICY_COMMIT_ALLOWLIST } = pre;
```

to:

```js
const { isPolicyOnlyCommit, POLICY_COMMIT_ALLOWLIST, isDeleteOnlyPush, DELETE_ONLY_PUSH_ALLOWLIST } = pre;
```

- [ ] **Step 2: Insert the new test section**

Insert the following new section immediately after line 168 (the `});` closing `'commit shapes that must stay denied: -a, --amend, compound, -C'`) and before line 170's `// ─── review findings: shapes the first cut allowed and must not ─────────────` comment:

```js
// ─── delete-only push exemption: allowlist match, whole-command only (#658) ─

test('git push origin --delete my-branch from a non-isolated checkout is allowed', () => {
  const repo = gitRepoWithCommit();
  withPolicy(repo, 'worktree-always: true\n');
  const out = pre.run({ input: bashInput('git push origin --delete my-branch', repo), runDir: null, runState: null, cwd: repo });
  assertAllowed(out);
});

test('git push origin :my-branch (refspec-delete form) from a non-isolated checkout is allowed', () => {
  const repo = gitRepoWithCommit();
  withPolicy(repo, 'worktree-always: true\n');
  const out = pre.run({ input: bashInput('git push origin :my-branch', repo), runDir: null, runState: null, cwd: repo });
  assertAllowed(out);
});

test('an ordinary content push (git push origin main) stays denied', () => {
  const repo = gitRepoWithCommit();
  withPolicy(repo, 'worktree-always: true\n');
  const out = pre.run({ input: bashInput('git push origin main', repo), runDir: null, runState: null, cwd: repo });
  assertDenied(out);
});

test('a compound command riding on a delete-only push stays denied, fail-closed', () => {
  const repo = gitRepoWithCommit();
  withPolicy(repo, 'worktree-always: true\n');
  const out = pre.run({ input: bashInput('git push origin --delete my-branch && rm -rf /', repo), runDir: null, runState: null, cwd: repo });
  assertDenied(out);
});

test('a delete-only push with an extra flag stays denied, fail-closed', () => {
  const repo = gitRepoWithCommit();
  withPolicy(repo, 'worktree-always: true\n');
  const out = pre.run({ input: bashInput('git push origin --delete my-branch --force', repo), runDir: null, runState: null, cwd: repo });
  assertDenied(out);
});

test('the denied push message names the branch-delete fallback', () => {
  const repo = gitRepoWithCommit();
  withPolicy(repo, 'worktree-always: true\n');
  const out = pre.run({ input: bashInput('git push origin main', repo), runDir: null, runState: null, cwd: repo });
  assertDenied(out);
  const reason = out.json.hookSpecificOutput.permissionDecisionReason;
  assert.ok(reason.includes('gh api -X DELETE'), `deny message must name the gh api fallback: ${reason}`);
  assert.ok(reason.includes('gh pr merge --delete-branch'), `deny message must name the gh pr merge fallback: ${reason}`);
});

test('DELETE_ONLY_PUSH_ALLOWLIST matches exactly the admitted shapes', () => {
  const shouldMatch = [
    'git push origin --delete my-branch',
    'git push origin :my-branch',
    'git push origin --delete feature/my-branch',
    '  git   push   origin   --delete   my-branch  ',
  ];
  for (const command of shouldMatch) {
    assert.ok(DELETE_ONLY_PUSH_ALLOWLIST.test(command), `expected a match: ${JSON.stringify(command)}`);
  }
  const shouldNotMatch = [
    'git push origin main',
    'git push origin --delete my-branch --force',
    'git push origin --delete my-branch && rm -rf /',
    'git push origin --delete',
    'FOO=1 git push origin --delete my-branch',
    '/usr/bin/git push origin --delete my-branch',
    'git -C . push origin --delete my-branch',
    'git push -f origin --delete my-branch',
    'git push origin --delete my-branch extra-branch',
  ];
  for (const command of shouldNotMatch) {
    assert.ok(!DELETE_ONLY_PUSH_ALLOWLIST.test(command), `expected no match: ${JSON.stringify(command)}`);
  }
});

test('isDeleteOnlyPush fails closed on non-string / garbage input without throwing', () => {
  assert.strictEqual(isDeleteOnlyPush(null), false);
  assert.strictEqual(isDeleteOnlyPush(undefined), false);
  assert.strictEqual(isDeleteOnlyPush(42), false);
});
```

- [ ] **Step 3: Run the new tests and confirm they fail**

Run: `node --test tests/hooks-policy-exemption.test.js`
Expected: FAIL — `pre.isDeleteOnlyPush is not a function` / `Cannot read properties of undefined (reading 'test')` on `DELETE_ONLY_PUSH_ALLOWLIST`, and the `assertAllowed`/message-content assertions fail because the exemption doesn't exist yet.

- [ ] **Step 4: Commit**

```bash
git add tests/hooks-policy-exemption.test.js
git commit -m "Add failing tests for the delete-only push exemption (#658)"
```

---

### Task 2: Implement the delete-only push exemption in pre-tool-use.js

**Files:**
- Modify: `plugin/bin/lib/hooks/pre-tool-use.js:99-102` (GATE_COVERAGE.exemptions), `:217` (insert new regex/predicate after `isPolicyOnlyCommit`), `:590` (insert the exemption check after the commit exemption), `:609-622` (deny message), `:771-782` (module.exports)
- Test: `tests/hooks-policy-exemption.test.js` (from Task 1 — no further edits, just re-run)

**Interfaces:**
- Consumes: `CQ_SINGLE`, `CQ_DOUBLE`, `CQ_BARE`, `CQ_ARG` (module-scope regex-fragment constants already defined at `pre-tool-use.js:178-181`); `denyResult(reason)` (existing helper).
- Produces: `isDeleteOnlyPush(command: string) -> boolean`, `DELETE_ONLY_PUSH_ALLOWLIST: RegExp` — both exported from the module, consumed by Task 1's tests and by `checkWorktreeRequired`'s own per-target loop in this same file.

- [ ] **Step 1: Add the new field to `GATE_COVERAGE.exemptions`**

In `plugin/bin/lib/hooks/pre-tool-use.js`, change:

```js
  exemptions: Object.freeze({
    paths: Object.freeze([`${toPosix(PIPELINE_STATE_DIR)}/`, toPosix(POLICY_FILE)]),
    commit: 'policy-only',
  }),
```

to:

```js
  exemptions: Object.freeze({
    paths: Object.freeze([`${toPosix(PIPELINE_STATE_DIR)}/`, toPosix(POLICY_FILE)]),
    commit: 'policy-only',
    push: 'delete-only',
  }),
```

- [ ] **Step 2: Add the allowlist regex and predicate**

Immediately after `isPolicyOnlyCommit`'s closing `}` (the line reading `}` at line 217, right before the `// Kept returning \`string | null\`...` comment at line 219), insert:

```js

// The delete-only push exemption's allowlist grammar (spec #658, Deliverable
// 1's decision: EXEMPT): admits EXACTLY `git push <remote> --delete <branch>`
// or `git push <remote> :<branch>` — one remote, one branch, nothing else —
// no other flag, no shell operator (&&, ;, |, $(), backticks), no env-var
// prefix, no path to git other than the bare word. Mirrors
// POLICY_COMMIT_ALLOWLIST's whole-command, default-deny-by-construction
// discipline directly: a compound command or an extra flag/positional simply
// fails to match, the same way a compound commit does above. Unlike the
// commit exemption, this needs no extra git query — a branch-delete push's
// ref target is fully determined by the command text alone (a commit's
// staged content is not), so the regex match is the whole check.
const DELETE_ONLY_PUSH_ALLOWLIST = Object.freeze(new RegExp(
  `^\\s*git\\s+push\\s+${CQ_ARG}\\s+(?:--delete\\s+${CQ_ARG}|:${CQ_BARE})\\s*$`,
));

function isDeleteOnlyPush(command) {
  return typeof command === 'string' && DELETE_ONLY_PUSH_ALLOWLIST.test(command);
}
```

- [ ] **Step 3: Wire the exemption into `checkWorktreeRequired`'s per-target loop**

Change:

```js
    if (action === 'commit' && isPolicyOnlyCommit(bashCommand, ctx.cwd)) continue;
```

to:

```js
    if (action === 'commit' && isPolicyOnlyCommit(bashCommand, ctx.cwd)) continue;
    // The delete-only push exemption (#658): ONLY for a target this loop
    // resolved from a 'push' action, and only when the ENTIRE command
    // matches the allowlist grammar above.
    if (action === 'push' && isDeleteOnlyPush(bashCommand)) continue;
```

- [ ] **Step 4: Improve the deny message for a push target**

Change:

```js
    return denyResult(
      // Derived from GATE_COVERAGE rather than spelled out, so widening
      // the gate can never leave this message describing the old reach
      // — the failure this whole binding exists to prevent (#70, #138).
      `claude-tweaks: this project requires an isolated worktree for ` +
      `${GATE_COVERAGE.tools.join('/')}, git ${GATE_COVERAGE.gitActions.join('/')}, and Bash ` +
      `${GATE_COVERAGE.bashWriteShapes.join('/')} writes (not every possible Bash write shape — ` +
      `see _shared/policy-schema-coverage.md's worktree-always coverage block; exempt: ` +
      `${GATE_COVERAGE.exemptions.paths.join(', ')} and an allowlisted (${GATE_COVERAGE.exemptions.commit}) commit) ` +
      `(policy: worktree-always in .claude-tweaks/policy.yml). You're currently working in ` +
      `a non-isolated checkout (${repoRoot}). Set one up first: invoke /superpowers:using-git-worktrees, ` +
      `then follow \`_shared/worktree-setup.md\`'s post-creation catch-up before any other action, ` +
      `then retry this edit inside the new worktree.`,
    );
```

to:

```js
    const retryGuidance = action === 'push'
      ? `If you're trying to delete a branch whose worktree is already gone, there is nothing to ` +
        `"retry inside a worktree" — use \`gh api -X DELETE repos/{owner}/{repo}/git/refs/heads/{branch}\` ` +
        `or \`gh pr merge --delete-branch\` instead. Otherwise, set one up first: invoke ` +
        `/superpowers:using-git-worktrees, then follow \`_shared/worktree-setup.md\`'s post-creation ` +
        `catch-up before any other action, then retry this push inside the new worktree.`
      : `Set one up first: invoke /superpowers:using-git-worktrees, then follow ` +
        `\`_shared/worktree-setup.md\`'s post-creation catch-up before any other action, ` +
        `then retry this edit inside the new worktree.`;
    return denyResult(
      // Derived from GATE_COVERAGE rather than spelled out, so widening
      // the gate can never leave this message describing the old reach
      // — the failure this whole binding exists to prevent (#70, #138).
      `claude-tweaks: this project requires an isolated worktree for ` +
      `${GATE_COVERAGE.tools.join('/')}, git ${GATE_COVERAGE.gitActions.join('/')}, and Bash ` +
      `${GATE_COVERAGE.bashWriteShapes.join('/')} writes (not every possible Bash write shape — ` +
      `see _shared/policy-schema-coverage.md's worktree-always coverage block; exempt: ` +
      `${GATE_COVERAGE.exemptions.paths.join(', ')}, an allowlisted (${GATE_COVERAGE.exemptions.commit}) commit, ` +
      `and an allowlisted (${GATE_COVERAGE.exemptions.push}) push) ` +
      `(policy: worktree-always in .claude-tweaks/policy.yml). You're currently working in ` +
      `a non-isolated checkout (${repoRoot}). ${retryGuidance}`,
    );
```

- [ ] **Step 5: Export the new symbols**

Change:

```js
module.exports = {
  run,
  GATE_COVERAGE,
  PIPELINE_STATE_DIR,
  POLICY_FILE,
  isPipelineBookkeeping,
  isPolicyFile,
  isPolicyOnlyCommit,
  POLICY_COMMIT_ALLOWLIST,
  shadowPipelineRunDir,
  checkPipelineShadowGuard,
};
```

to:

```js
module.exports = {
  run,
  GATE_COVERAGE,
  PIPELINE_STATE_DIR,
  POLICY_FILE,
  isPipelineBookkeeping,
  isPolicyFile,
  isPolicyOnlyCommit,
  POLICY_COMMIT_ALLOWLIST,
  isDeleteOnlyPush,
  DELETE_ONLY_PUSH_ALLOWLIST,
  shadowPipelineRunDir,
  checkPipelineShadowGuard,
};
```

- [ ] **Step 6: Run Task 1's tests and confirm they now pass**

Run: `node --test tests/hooks-policy-exemption.test.js`
Expected: PASS — every test added in Task 1 is green.

- [ ] **Step 7: Run the pre-existing `hooks-pre-tool-use.test.js` and `hooks-git-command.test.js` suites to confirm no regression**

Run: `node --test tests/hooks-pre-tool-use.test.js tests/hooks-git-command.test.js`
Expected: PASS — this task touched neither `git-command.js` nor any behavior those suites cover other than the (unmodified) generic push-deny path, so both suites should be unaffected.

- [ ] **Step 8: Commit**

```bash
git add plugin/bin/lib/hooks/pre-tool-use.js
git commit -m "Exempt a content-free, ref-only branch-delete push from the worktree-always gate (#658)"
```

---

### Task 3: Sync the coverage-pinning test and canonical prose

Task 2 widened `GATE_COVERAGE.exemptions` with a `push` field that `tests/hooks-gate-coverage.test.js`'s `'policy-schema-coverage.md's coverage block lists exactly the gate's exemptions'` test does not yet know about — that test's `expected` array is still `[...paths, commit]`, so it will now be comparing a 3-item expectation against `policy-schema-coverage.md`'s still-3-item prose, which happens to still pass by coincidence (both sides are stale in the same way). This task updates both the test and the prose together so they describe the real, 4-item exemption set and would actually fail if they diverged again.

**Files:**
- Modify: `tests/hooks-gate-coverage.test.js:74`
- Modify: `plugin/skills/_shared/policy-schema-coverage.md:13,31,33`

**Interfaces:**
- Consumes: `GATE_COVERAGE.exemptions.push` (added in Task 2).
- Produces: nothing new — this task only re-synchronizes existing contracts.

- [ ] **Step 1: Run the gate-coverage suite to see the stale-but-still-passing state**

Run: `node --test tests/hooks-gate-coverage.test.js`
Expected: PASS (misleadingly) — the test's `expected` array doesn't include `GATE_COVERAGE.exemptions.push` yet, so it isn't comparing against the real 4-field exemption set. This step is a checkpoint, not a red bar — Step 2 makes the test meaningful again, and Step 4 confirms it's still green once it actually reflects reality.

- [ ] **Step 2: Update the pinning test's expected array**

In `tests/hooks-gate-coverage.test.js`, change:

```js
  const expected = [...GATE_COVERAGE.exemptions.paths, GATE_COVERAGE.exemptions.commit];
```

to:

```js
  const expected = [...GATE_COVERAGE.exemptions.paths, GATE_COVERAGE.exemptions.commit, GATE_COVERAGE.exemptions.push];
```

- [ ] **Step 3: Run the suite again and confirm it is now genuinely red**

Run: `node --test tests/hooks-gate-coverage.test.js`
Expected: FAIL — `'policy-schema-coverage.md's coverage block lists exactly the gate's exemptions'` fails: the test now expects 4 tokens on the `- Exemptions:` line, but the prose still has 3.

- [ ] **Step 4: Update the coverage block's Exemptions line**

In `plugin/skills/_shared/policy-schema-coverage.md`, change:

```
- Exemptions: `.claude-tweaks/pipelines/`, `.claude-tweaks/policy.yml`, and an allowlisted `policy-only` commit
```

to:

```
- Exemptions: `.claude-tweaks/pipelines/`, `.claude-tweaks/policy.yml`, an allowlisted `policy-only` commit, and an allowlisted `delete-only` push
```

- [ ] **Step 5: Update the second-exemption paragraph**

In the same file, change the paragraph beginning `The second (#537):` (line 31) — specifically its last two sentences, currently:

```
...a rename or copy *into* that path is rejected on its status letter, since `--name-only` would collapse it to a single misleading line. `git push` stays gated regardless. Both exemptions fail closed: anything unprovable about a path, a command's grammar, or the staged set keeps the deny.
```

to:

```
...a rename or copy *into* that path is rejected on its status letter, since `--name-only` would collapse it to a single misleading line. A third exemption (#658) admits a content-free, ref-only `git push`: the **entire command string** matches `git push <remote> --delete <branch>` or `git push <remote> :<branch>` — one remote, one branch, nothing else, the same no-other-flag/no-shell-operator/no-env-var-prefix/no-path-to-git discipline as the commit allowlist, minus the staged-set check (a push's ref target is determined by the command text alone, unlike a commit's content). Any other `git push` — a content push, or a delete-shaped attempt riding a compound command or an extra flag — stays gated. All three exemptions fail closed: anything unprovable about a path, a command's grammar, or the staged set keeps the deny.
```

- [ ] **Step 6: Update the "Consequence for procedures" paragraph**

In the same file, change:

```
**Consequence for procedures.** A `git push` from the main checkout is denied even after `close-run` clears the E1 worktree assignment (that clears wrong-checkout enforcement, not this policy). A merge followed by a push must therefore be **two separate Bash calls** — the merge from the main checkout, the push from inside a linked worktree. Chaining them into one command gets the whole invocation denied before either half runs, since the gate inspects the full command string up front. The one exception: an isolated `.claude-tweaks/policy.yml` edit plus its allowlisted, policy-only-staged commit may now both run from a main checkout without a worktree.
```

to:

```
**Consequence for procedures.** A `git push` from the main checkout is denied even after `close-run` clears the E1 worktree assignment (that clears wrong-checkout enforcement, not this policy) — unless the push is the bare branch-delete shape above, which is exempt for exactly that post-teardown moment: once a worktree is gone there is nothing left to "retry inside" it, so `git push <remote> --delete <branch>` (or the `:<branch>` refspec form) is allowed straight from the main checkout. A merge followed by a content push must therefore be **two separate Bash calls** — the merge from the main checkout, the push from inside a linked worktree. Chaining them into one command gets the whole invocation denied before either half runs, since the gate inspects the full command string up front — this includes chaining a branch delete onto anything else, which loses its own exemption the same way. Two exceptions run from a main checkout without a worktree: an isolated `.claude-tweaks/policy.yml` edit plus its allowlisted, policy-only-staged commit, and a bare branch-delete push. Any push shape outside the allowlist — including one that only resembles a branch delete — is denied with a message naming the sanctioned fallback: `gh api -X DELETE repos/{owner}/{repo}/git/refs/heads/{branch}` or `gh pr merge --delete-branch`.
```

- [ ] **Step 7: Run the gate-coverage suite and confirm it passes again**

Run: `node --test tests/hooks-gate-coverage.test.js`
Expected: PASS — prose and code agree again, this time genuinely covering the push exemption.

- [ ] **Step 8: Commit**

```bash
git add tests/hooks-gate-coverage.test.js plugin/skills/_shared/policy-schema-coverage.md
git commit -m "Sync worktree-always coverage prose and its pinning test with the delete-only push exemption (#658)"
```

---

### Task 4: Full verification

**Files:** none (verification only)

**Interfaces:** none

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — every suite green, including the three touched above and every suite this plan didn't intentionally touch.

- [ ] **Step 2: Re-check every Acceptance Criterion from the spec against what shipped**

Walk `.claude-tweaks/pipelines/2026-08-20T073254-record-658/work/658-spec.md`'s `## Acceptance Criteria` section line by line against the diff from Tasks 1-3:
- Deliverable 1's decision recorded even if declined → satisfied: the regex's own header comment states "Deliverable 1's decision: EXEMPT" (Task 2 Step 2).
- `gitTargets('git push origin --delete my-branch', cwd)` / `:my-branch` recognized as exempt in a new test case, compound/flag-augmented variant still denies → satisfied via `pre.run()`-level behavioral tests instead of `gitTargets()` directly (Task 1) — see this plan's Architecture section for why the exemption lives in `pre-tool-use.js` rather than `git-command.js`, and confirm the compound/extra-flag denial tests (Task 1's `'a compound command...'` and `'...with an extra flag...'` cases) are present and green.
- `git push origin main` unaffected → satisfied (Task 1's `'an ordinary content push...'` test).
- Improved deny message asserted by a test covering the branch-delete-push scenario → satisfied (Task 1's `'the denied push message names the branch-delete fallback'` test).
- `policy-schema.md`'s coverage block and paragraph updated, `tests/hooks-gate-coverage.test.js` continues to pass → satisfied against the corrected file, `policy-schema-coverage.md` (Task 3) — note this correction explicitly when reporting back, since the spec names the wrong filename.
- No change to `hooks/hooks.json`, `WRITE_SHAPES`, or harness-facing config → satisfied (neither file touched by any task).
- `npm test` passes in full → confirmed in Step 1.

- [ ] **Step 3: Confirm working tree is clean**

Run: `git status --short`
Expected: no output — every change from Tasks 1-3 is already committed.
