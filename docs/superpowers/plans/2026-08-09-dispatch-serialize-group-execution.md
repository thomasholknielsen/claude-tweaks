# Dispatch: Serialize Group Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close #155's shared-worktree hazard by making `/claude-tweaks:dispatch` Step 5 process selected groups strictly sequentially — the dispatching session itself switches worktrees between groups, since a Task-tool subagent can never get its own worktree — and rename `dispatch-pick-max-concurrent`/`--concurrent` to `dispatch-batch-size`/`--batch-size` to match the new (sequential-count, not concurrency-slot) meaning.

**Architecture:** Extract the group-processing loop's ordering guarantee into a small, unit-testable module (`bin/lib/issues/sequential-dispatch.js`) that models "enter worktree for group N → dispatch its Task agent → wait for terminal outcome → tear the worktree down → only then move to group N+1." `skills/dispatch/SKILL.md` Step 5's prose is rewritten to describe this exact mechanism (replacing the current "parallel Task agent, each owns its own worktree" banner) and cites the module as the canonical shape, the same way Step 2 already cites `bin/lib/issues/grouping.js`. The config key and CLI flag rename follows the deprecated-alias pattern already documented in `_shared/auto-mode-contract.md`'s tiered posture (one warn-tier notice per invocation, no behavior change to the alias's effect).

**Tech Stack:** Node.js (`node --test`), markdown skill files (no build step — SKILL.md is read directly by the LLM at runtime).

## Global Constraints

- `npm test` must stay green throughout (per CLAUDE.md's Commands section and #295's Acceptance Criterion 6).
- Deprecated `dispatch-pick-max-concurrent` / `--concurrent` continue to work with one warning per invocation until removed — no silent breaking rename (CLAUDE.md's expand-contract discipline for shipped skill contracts).
- IL-51/IL-43: this plan's own tasks, if dispatched to parallel implementer subagents, must not be given independent git access — sequence commits centrally.
- Every commit message uses "refs #295" — never "closes #295" (see spec's Gotchas / dispatch dispatch-template convention) — the actual closing keyword lands on the merge commit, not an intermediate task commit.

---

### Task 1: Sequential group-dispatch scheduler module

**Files:**
- Create: `bin/lib/issues/sequential-dispatch.js`
- Test: `bin/lib/issues/tests/sequential-dispatch.test.js`

**Interfaces:**
- Produces: `runGroupsSequentially(groups, { enterWorktree, dispatchTask, teardownWorktree })` — async function. `groups` is an array (opaque group objects/ids). `enterWorktree(group)` returns a Promise resolving to an opaque `worktree` handle. `dispatchTask(group, worktree)` returns a Promise resolving to an opaque `outcome`. `teardownWorktree(worktree)` returns a Promise. Returns `Promise<Array<{ group, outcome }>>`, in input order. This is the canonical, testable shape of the fix: `skills/dispatch/SKILL.md` Step 5 (Task 3 below) describes the dispatching session following this exact same enter→dispatch→teardown→next sequence via its own tool calls (Task-tool calls are not Node-invocable, so the live orchestration is prose-driven — this module exists so the ordering *guarantee* is unit-testable rather than only prose).

- [ ] **Step 1: Write the failing test — reproduces #155's exact scenario**

```javascript
// bin/lib/issues/tests/sequential-dispatch.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { runGroupsSequentially } = require('../sequential-dispatch');

function deferred() {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
}

test('#155 scenario: group 2 worktree is never entered while group 1 is still active', async () => {
  const groupA = { id: 'A', autoMerge: true };
  const groupB = { id: 'B', autoMerge: false };
  const activeWorktrees = new Set();
  const maxConcurrentSeen = { value: 0 };
  const enteredOrder = [];
  const branchOf = new Map();

  const groupAGate = deferred();

  async function enterWorktree(group) {
    const worktree = `wt-${group.id}`;
    activeWorktrees.add(worktree);
    maxConcurrentSeen.value = Math.max(maxConcurrentSeen.value, activeWorktrees.size);
    enteredOrder.push(group.id);
    branchOf.set(group.id, `flow/spec-${group.id}`);
    return worktree;
  }

  async function dispatchTask(group) {
    if (group.id === 'A') {
      await groupAGate.promise; // group A's Task agent takes a while
      return 'pending-review';
    }
    return 'merged';
  }

  async function teardownWorktree(worktree) {
    activeWorktrees.delete(worktree);
  }

  const runPromise = runGroupsSequentially([groupA, groupB], { enterWorktree, dispatchTask, teardownWorktree });

  // While group A's task is still pending, group B must NOT have entered a worktree yet.
  await Promise.resolve();
  await Promise.resolve();
  assert.strictEqual(enteredOrder.includes('B'), false, 'group B entered a worktree before group A finished');

  groupAGate.resolve();
  const results = await runPromise;

  assert.strictEqual(maxConcurrentSeen.value, 1, 'more than one worktree was ever active at once — this is exactly the #155 hazard');
  assert.deepStrictEqual(enteredOrder, ['A', 'B'], 'groups must be processed in order');
  assert.notStrictEqual(branchOf.get('A'), branchOf.get('B'), 'groups must build on distinct branches');
  assert.deepStrictEqual(
    results.map((r) => r.outcome),
    ['pending-review', 'merged'],
  );
});

test('reverting to concurrent (Promise.all) dispatch fails the same invariant', async () => {
  // This models what today's (pre-fix) "parallel Task agent" behavior does, and proves the
  // test above actually discriminates: running the two mock groups concurrently — the exact
  // shape #295 removes — violates the single-active-worktree invariant.
  async function runGroupsConcurrently(groups, { enterWorktree, dispatchTask, teardownWorktree }) {
    return Promise.all(groups.map(async (group) => {
      const worktree = await enterWorktree(group);
      const outcome = await dispatchTask(group, worktree);
      await teardownWorktree(worktree);
      return { group, outcome };
    }));
  }

  const groupA = { id: 'A' };
  const groupB = { id: 'B' };
  const activeWorktrees = new Set();
  const maxConcurrentSeen = { value: 0 };
  const gate = deferred();

  async function enterWorktree(group) {
    const worktree = `wt-${group.id}`;
    activeWorktrees.add(worktree);
    maxConcurrentSeen.value = Math.max(maxConcurrentSeen.value, activeWorktrees.size);
    return worktree;
  }
  async function dispatchTask(group) {
    if (group.id === 'A') await gate.promise;
    return 'ok';
  }
  async function teardownWorktree(worktree) {
    activeWorktrees.delete(worktree);
  }

  const runPromise = runGroupsConcurrently([groupA, groupB], { enterWorktree, dispatchTask, teardownWorktree });
  await Promise.resolve();
  await Promise.resolve();
  gate.resolve();
  await runPromise;

  assert.strictEqual(maxConcurrentSeen.value, 2, 'sanity check: concurrent dispatch DOES trigger the #155 hazard (2 worktrees active at once)');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test bin/lib/issues/tests/sequential-dispatch.test.js`
Expected: FAIL — `Cannot find module '../sequential-dispatch'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// bin/lib/issues/sequential-dispatch.js
'use strict';
// Canonical, testable shape of #295's fix for #155 (shared-worktree hazard):
// a Task-tool subagent is always launched cwd-pinned to the dispatching
// session's own worktree, so two groups' subagents can never be independently
// isolated while both are in flight. The remedy is having the DISPATCHING
// SESSION (not the subagent) switch worktrees between groups, one at a time.
// skills/dispatch/SKILL.md Step 5 documents the live orchestration (Task-tool
// calls are not Node-invocable, so that orchestration is prose-driven); this
// module pins the ordering guarantee so a regression is unit-testable.

async function runGroupsSequentially(groups, { enterWorktree, dispatchTask, teardownWorktree }) {
  const results = [];
  for (const group of groups) {
    const worktree = await enterWorktree(group);
    const outcome = await dispatchTask(group, worktree);
    await teardownWorktree(worktree);
    results.push({ group, outcome });
  }
  return results;
}

module.exports = { runGroupsSequentially };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test bin/lib/issues/tests/sequential-dispatch.test.js`
Expected: PASS (both tests)

- [ ] **Step 5: Commit**

```bash
git add bin/lib/issues/sequential-dispatch.js bin/lib/issues/tests/sequential-dispatch.test.js
git commit -m "Add sequential-dispatch scheduler module for dispatch Step 5 (refs #295)"
```

---

### Task 2: Verify `settle-and-merge.md` has no concurrent-groups assumption

**Files:**
- Read-only check: `skills/dispatch/settle-and-merge.md`

**Interfaces:**
- Consumes: none (read-only verification task)
- Produces: a one-line confirmation note for this leaf's PR description (Acceptance Criterion / Deliverable item — "checked, corrected if found")

- [ ] **Step 1: Grep for concurrency assumptions**

```bash
grep -n "concurrent\|parallel\|multiple group" skills/dispatch/settle-and-merge.md
```

Expected: the only match is the existing "concurrent session switching the shared checkout" guard (a DIFFERENT session touching the main checkout, unrelated to sibling dispatch groups) — no logic assumes two dispatch groups are ever in flight at once. Read the full file to confirm by eye, not just the grep.

- [ ] **Step 2: Record the outcome**

No code change required — `settle-and-merge.md` already treats one group's merge as fully sequential (its own Step-6 Settle and Auto-merge gate procedures run per-group, never batched). Note this finding verbatim for the PR description: "settle-and-merge.md checked — no concurrent-groups assumption found; its one 'concurrent session' guard is about a different session touching the main checkout, not sibling dispatch groups."

- [ ] **Step 3: Commit**

Nothing to commit for this task (read-only verification) — the note carries forward to Task 6's PR description, not a commit.

---

### Task 3: Rewrite Step 5's banner and execution loop in `skills/dispatch/SKILL.md`

**Files:**
- Modify: `skills/dispatch/SKILL.md:274-331` (Step 5 heading, the `> **Parallel execution:**` banner, and the execution-loop paragraph)

**Interfaces:**
- Consumes: `runGroupsSequentially`'s documented shape from Task 1 (cited, not imported — SKILL.md is prose)
- Produces: none (documentation-only task)

- [ ] **Step 1: Replace the Step 5 heading and banner**

Current (lines 274-276):
```markdown
### Step 5: Dispatch — one Task agent per group

> **Parallel execution:** Dispatch every selected group as a parallel Task agent — each runs independently, owns its own worktree, and returns the GROUP/OUTCOME/MANIFEST template below. Assemble results after all agents complete.
```

Replace with:
```markdown
### Step 5: Dispatch — one group at a time, sequentially

> **Sequential execution, not parallel.** A Task-tool subagent is always launched cwd-pinned to the *dispatching session's* own worktree — there is no route to giving two concurrently-running subagents independent worktrees (`EnterWorktree` refuses a subagent cwd override; see #155). The fix is structural, not a policy dial: the **dispatching session itself** switches worktrees between groups. For group N, enter a fresh worktree, dispatch group N's Task agent (which inherits that cwd), wait for its terminal status line (DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED) and OUTCOME line below, tear that worktree down via the standard cleanup route, THEN enter a fresh worktree for group N+1. Never enter group N+1's worktree, and never dispatch its Task agent, while group N's is still running. This is the same enter→dispatch→teardown→next sequence `bin/lib/issues/sequential-dispatch.js`'s `runGroupsSequentially` pins as a unit-testable invariant — that module is what a regression here should be checked against.
```

- [ ] **Step 2: Replace the execution-loop paragraph**

Current (line 278):
```markdown
Work through the selected group(s) — bare / `#N,#M,...`: as many as were picked, up to `{effective-concurrent}` (Step 3's resolved `--concurrent` override, or `dispatch-pick-max-concurrent` when absent) running at once, remainder queued for a freed slot; `next` / `#N`: exactly one. Each group becomes one Task agent with its own worktree (created via `/superpowers:using-git-worktrees` exactly as a normal `/flow` invocation would — do not pre-create or share a worktree path across groups). There is no per-firing timeout, only the concurrency throttle — nothing elsewhere in this codebase imposes one (existing parallel-Task dispatch sites, e.g. `/help`'s Stage 1-7, already wait for all dispatched agents regardless of duration).
```

Replace with:
```markdown
Work through the selected group(s) in the order Step 3's selection already established — bare / `#N,#M,...`: up to `{batch-size}` (Step 3's resolved `--batch-size` override, or `dispatch-batch-size` when absent) groups **processed one after another this firing**, remainder left claimed for a later firing to pick up; `next` / `#N`: exactly one, unaffected by batch size. Each group becomes one Task agent with its own worktree (created via `/superpowers:using-git-worktrees` exactly as a normal `/flow` invocation would — do not pre-create or share a worktree path across groups), but only after the previous group's Task agent has reached a terminal outcome and its worktree has been torn down through the standard wrap-up cleanup route. There is no per-group timeout — nothing elsewhere in this codebase imposes one (existing parallel-Task dispatch sites, e.g. `/help`'s Stage 1-7, wait for all dispatched agents regardless of duration; this is the same "no timeout" posture, just applied to a sequential loop instead of a concurrent one). A multi-group firing's wall-clock time now scales linearly with group count instead of being bounded by the slowest group — an accepted, documented trade-off (dispatch only fires on a schedule with nobody waiting synchronously), not a regression to flag at review time.
```

- [ ] **Step 3: Update the per-group Task prompt's `[Use: ...]` footer reference (no content change needed)**

Read lines 290-329 (the `Task()` prompt block) and confirm it needs no edit — it already describes a single group's own dispatch shape (worktree creation, status line, OUTPUT FORMAT) with no claim about concurrency; the concurrency claim lived only in the banner/paragraph replaced above. If any wording there implies "runs alongside other groups," fix it inline; expected: none does.

- [ ] **Step 4: Commit**

```bash
git add skills/dispatch/SKILL.md
git commit -m "Rewrite dispatch Step 5 from parallel to sequential worktree-switching (refs #295)"
```

---

### Task 4: Rename `dispatch-pick-max-concurrent`/`--concurrent` to `dispatch-batch-size`/`--batch-size`

**Files:**
- Modify: `skills/dispatch/SKILL.md` (frontmatter `argument-hint`, Input table, Step 3's `{effective-concurrent}` resolution paragraph and all its later references, Configuration table)

**Interfaces:**
- Consumes: none
- Produces: the renamed config key/flag other tasks and future dispatch runs read

- [ ] **Step 1: Frontmatter and Input table**

`skills/dispatch/SKILL.md:4` — change:
```
argument-hint: "[next|#N[,#M...]] [--claim-only] [--concurrent <n>] [--priority high|medium|low]"
```
to:
```
argument-hint: "[next|#N[,#M...]] [--claim-only] [--batch-size <n>] [--priority high|medium|low]"
```

`skills/dispatch/SKILL.md:52` (Input table's `--concurrent <n>` row) — change the row's flag name to `--batch-size <n>` and update its description to state the renamed meaning (per-firing sequential batch count, not a concurrency slot count), then add a second row directly beneath it:

```markdown
| `--concurrent <n>` (deprecated alias) | Deprecated alias for `--batch-size <n>` — same effect, logs one warn-tier notice per invocation. Removal condition: once this repo's own `.claude-tweaks/policy.yml` and README config-key table cite only `--batch-size`, checked at the next minor release. |
```

- [ ] **Step 2: Step 3's resolution paragraph and later references**

`skills/dispatch/SKILL.md:47` (bare-mode Input table row) — change `dispatch-pick-max-concurrent` to `dispatch-batch-size`.

`skills/dispatch/SKILL.md:188` — change:
```markdown
Resolve `{effective-concurrent}` first — `--concurrent <n>` if present on this invocation (Input table above), else `dispatch-pick-max-concurrent` from Configuration below (CLI arg beats project policy, per `_shared/auto-mode-card.md`'s precedence order). Then one `AskUserQuestion`:
```
to:
```markdown
Resolve `{batch-size}` first — `--batch-size <n>` if present on this invocation (or its deprecated `--concurrent <n>` alias, which also emits the one-time warn-tier notice), else `dispatch-batch-size` from Configuration below (CLI arg beats project policy, per `_shared/auto-mode-card.md`'s precedence order). Then one `AskUserQuestion`:
```

`skills/dispatch/SKILL.md:190` — change the question wording from "up to `{effective-concurrent}` concurrently" to "up to `{batch-size}` groups this firing (processed one after another)".

`skills/dispatch/SKILL.md:191` — change "the top `{effective-concurrent}` groups" to "the top `{batch-size}` groups".

`skills/dispatch/SKILL.md:193` — change "Selecting more groups than `{effective-concurrent}` is not an error — the extra selections queue and start as slots free (Step 5), same as overlapping `next` firings do across routine windows." to "Selecting more groups than `{batch-size}` is not an error — the extra selections stay claimed for a later firing to process (Step 5 no longer runs them this firing at all, since there are no concurrent slots to free), same posture overlapping `next` firings already have across routine windows."

- [ ] **Step 3: Configuration table**

`skills/dispatch/SKILL.md:356` — change:
```markdown
| `dispatch-pick-max-concurrent` | `3` | Maximum groups (bundles or singleton records) a firing runs at once; remaining groups queue for a freed slot. |
```
to:
```markdown
| `dispatch-batch-size` | `3` | Maximum groups (bundles or singleton records) one firing processes sequentially, in the order Step 3's selection establishes; remaining groups stay claimed for a later firing. |
| `dispatch-pick-max-concurrent` (deprecated alias) | — | Deprecated alias for `dispatch-batch-size` — reading it from `.claude-tweaks/policy.yml` emits one warn-tier notice per invocation and applies its value to `dispatch-batch-size`. Removal condition: once this repo's own `.claude-tweaks/policy.yml` and README config-key table cite only `dispatch-batch-size`, checked at the next minor release. |
```

`skills/dispatch/SKILL.md:358` — change "**Per-firing CLI overrides:** `--concurrent <n>` (Input table above) overrides `dispatch-pick-max-concurrent` for this invocation only" to "**Per-firing CLI overrides:** `--batch-size <n>` (or its deprecated `--concurrent <n>` alias, Input table above) overrides `dispatch-batch-size` for this invocation only".

- [ ] **Step 4: Sweep for any remaining literal occurrences**

```bash
grep -n "effective-concurrent\|dispatch-pick-max-concurrent\|--concurrent" skills/dispatch/SKILL.md
```

Expected: only the two intentional "deprecated alias" rows added in Steps 1 and 3 above remain — every other occurrence should be gone. Fix any missed occurrence.

- [ ] **Step 5: Commit**

```bash
git add skills/dispatch/SKILL.md
git commit -m "Rename dispatch-pick-max-concurrent/--concurrent to dispatch-batch-size/--batch-size (refs #295)"
```

---

### Task 5: Confirm `.claude-tweaks/policy.yml`'s own key

**Files:**
- Read-only check: `.claude-tweaks/policy.yml`

- [ ] **Step 1: Check for an explicit value**

```bash
grep -n "dispatch-pick-max-concurrent\|dispatch-batch-size" .claude-tweaks/policy.yml
```

Expected: no match (this repo currently sets no explicit value for this key — the spec's own Current State already confirms this) — no edit needed. If a match is found (drift since spec-authoring time), update it to `dispatch-batch-size` in the same edit.

- [ ] **Step 2: Nothing to commit if no match found.** If an edit was needed, commit it:

```bash
git add .claude-tweaks/policy.yml
git commit -m "Update policy.yml to dispatch-batch-size (refs #295)"
```

---

### Task 6: Re-verify #222/#268 file-overlap disjointness and final verification

**Files:**
- Read-only check: current state of #222 and #268 (via `gh issue view`)
- No source files modified in this task

**Interfaces:**
- Consumes: none
- Produces: the disjointness note required by Acceptance Criterion 5 (recorded in this leaf's own commit message / PR description, per the spec)

- [ ] **Step 1: Check #222 and #268's actual current diffs against this leaf's edits**

```bash
gh issue view 222 --json state,labels,title
gh issue view 268 --json state,labels,title
```

Both are expected to still be open, unbuilt records (no branch/PR exists yet to diff against) — in that case, disjointness is re-verified against their **spec-declared** `### Key Files` only (already done at materialization time — #295 vs #296: `skills/dispatch/SKILL.md`; #295 vs #297: `skills/dispatch/settle-and-merge.md`), and the note below states that explicitly rather than claiming a diff-level check that isn't yet possible.

- [ ] **Step 2: Record the outcome verbatim for the PR description**

```
#222/#268 overlap re-verification at build start (2026-08-09): both #222 and #268 are still
open, unbuilt records — no branch/PR exists yet for either, so disjointness is re-verified
against their spec-declared Key Files only (as already noted in #295's own Gotchas), not an
actual diff. #222 declares skills/dispatch/SKILL.md's `[Use: {Profile}]` grammar line (Step 5's
`[Use: ...]` footer) — this leaf's Step 5 rewrite (Task 3) replaces the banner and execution-loop
paragraph above that line, not the line itself; Task 3 Step 3 explicitly confirmed the `[Use:
...]` footer needs no edit. #268 declares a persist instruction inside settle-and-merge.md's
failure-classification section — this leaf makes no edit to settle-and-merge.md (Task 2). Both
remain disjoint from this leaf's actual diff.
```

- [ ] **Step 3: Run the full test suite**

```bash
npm test
```

Expected: all tests pass, including the new `bin/lib/issues/tests/sequential-dispatch.test.js`.

- [ ] **Step 4: Commit (if Step 2's note needs to land as a file)**

No source change — the note from Step 2 is carried forward into this leaf's PR description at `/claude-tweaks:wrap-up` (or into the materialized spec file's own "Notes" if a durable in-repo record is wanted). No commit for this task unless the plan's execution decides to append the note to `.claude-tweaks/pipelines/2026-08-09T191318-spec-295-296-297/spec-295/work/295-spec.md` under a new `## Build Notes` section — do that now for durability:

```bash
git add .claude-tweaks/pipelines/2026-08-09T191318-spec-295-296-297/spec-295/work/295-spec.md
git commit -m "Record #222/#268 disjointness re-verification (refs #295)"
```

---

## Self-Review Notes (for the plan author, not the implementer)

- **Spec coverage:** Every Deliverable in #295 maps to a task above — Step 5 rewrite (Task 3), config rename with deprecated alias (Task 4), `.claude-tweaks/policy.yml` confirmation (Task 5), `settle-and-merge.md` check (Task 2), the stubbed-Task() scheduling test reproducing #155 (Task 1). Acceptance Criteria 1-2 are covered by Task 1's test + Task 3/4's prose; AC3 (`skills/dispatch/SKILL.md` no longer claims parallel execution) is covered by Task 3 Step 1's replacement banner + Task 4 Step 4's sweep; AC5 (#222/#268 re-verification) is Task 6; AC6 (`npm test` green) is Task 6 Step 3; AC7 (merge commit closes #155) happens at this leaf's own merge, outside this plan's scope (wrap-up/finishing-a-development-branch's job).
- **Placeholder scan:** No TBD/TODO — every step has literal file paths, code, and commands.
- **Type consistency:** `runGroupsSequentially`'s signature is defined once in Task 1 and referenced (not redefined) in Task 3's prose citation.
