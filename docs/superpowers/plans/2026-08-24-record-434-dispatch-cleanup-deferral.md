# Dispatch Second-Call Cleanup Deferral Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate the outcome-independent `ExitWorktree`/worktree-removal constraint from issue-claim release and run-dir archival everywhere `skills/dispatch/settle-and-merge.md` and `skills/dispatch/task-prompt.md` currently bundle all three under one "don't run" instruction, and add explicit claim/label/PR state-check guidance before a second-call agent selects its `OUTCOME` value.

**Architecture:** Pure prose edits to two skill files (no code, no schema change). Each of the three bundled passages named in the spec's Current State gets split into two sentences: one citing the structural, outcome-independent worktree constraint (stated once, near the top of `settle-and-merge.md`, where the second call's inherited-worktree fact is first established), one stating claim-release/run-dir-archival's own disposition on its own terms for that branch. A new paragraph is added to `task-prompt.md`'s second-call template (inside the fenced Task-prompt block, since only text inside that block reaches the dispatched agent) directing the agent to check `claims/issue-{n}.json`, labels, and `run-state.json`'s `pr` field before choosing an `OUTCOME` value.

**Tech Stack:** Markdown only.

**Spec:** `.claude-tweaks/pipelines/2026-08-23T224131-record-434/work/434-spec.md` (record #434)

## Global Constraints

- Preserve the genuine bundled-deferral cases (local-merge conflict-abort, and `dispatch/SKILL.md`'s ordinary `pending-review` parking) — these legitimately defer worktree removal, claim release, and archival together because the run isn't finished. Do not force claim release or archival to run on those paths; only remove the *implication* that grouping applies to every outcome for the same reason.
- Do not weaken the structural `ExitWorktree` constraint — a Task-tool subagent that did not itself `EnterWorktree` a worktree still can never tear it down, on any outcome.
- `npm test` (prose-conformance suites) must pass after every edit — no test currently pins the exact bundled prose being replaced (confirmed via grep), so no fixture updates are expected, but re-run after each task to catch anything missed.

---

### Task 1: Split the two bundled passages in `settle-and-merge.md`

**Files:**
- Modify: `plugin/skills/dispatch/settle-and-merge.md` (three edit sites: insert after line 5, replace lines 231-241, replace line 313)

**Interfaces:** None — prose only, no code interfaces.

- [ ] **Step 1: Insert the outcome-independent worktree-constraint paragraph**

Insert this new paragraph immediately after the existing paragraph that ends `"...per **Dispatching-session merge execution** at the end of this file."` (currently line 5), before the `**MCP path, file-wide.**` paragraph:

```markdown
**The `ExitWorktree`/worktree-removal constraint is structural and outcome-independent.** A
Task-tool subagent that did not itself `EnterWorktree` a worktree can never run `ExitWorktree`
or `git worktree remove` on it, regardless of which outcome this call ultimately reports — the
cwd-pinning fact above already explains why the merge itself can't run here; worktree teardown
is blocked for the identical structural reason on every branch below, not only the merge path.
The local-merge Auto-merge-gate branch and the conflict-abort branch (both further down) state
their own claim-release and run-dir-archival disposition separately — neither is inherited from
this constraint.
```

- [ ] **Step 2: Verify the insertion landed**

Run: `grep -n "structural and outcome-independent" plugin/skills/dispatch/settle-and-merge.md`
Expected: one match, positioned before `## Step 6: Settle`.

- [ ] **Step 3: Split the local-merge Auto-merge-gate branch**

Find this paragraph (search for `Do not run \`git merge\`, do not run`):

```markdown
**Both layers pass — merge (`integration-model: local-merge`):** this Task call never touches
the main checkout — a Task-tool subagent launched by dispatch is cwd-pinned to the worktree it
inherited at launch and cannot reach a sibling directory (see the note at the top of this file).
Do not run `git merge`, do not run `ExitWorktree`/`git worktree remove`, and do not run
wrap-up's own Item 4 (worktree removal), Item 7 (issue claim release), or Item 8 (run-dir
archival) — all three depend on a merge that has not happened yet. Items 1, 2, 3, 5, and 6 are
unaffected (not merge-dependent) and may still run normally as part of this call's own wrap-up
execution. Report `OUTCOME: ready-to-merge` (see `task-prompt.md`'s second-call template) and
return — `Dispatching-session merge execution (local-merge fallback)`, below, is what actually
merges, in `dispatch/SKILL.md` Step 6, in the dispatching session's own thread, immediately after
this call's report is read.
```

Replace it with:

```markdown
**Both layers pass — merge (`integration-model: local-merge`):** this Task call never touches
the main checkout — a Task-tool subagent launched by dispatch is cwd-pinned to the worktree it
inherited at launch and cannot reach a sibling directory (see the note at the top of this file).
This call cannot run `git merge`, `ExitWorktree`, or `git worktree remove` — the structural,
outcome-independent constraint stated at the top of this file. Separately, wrap-up's own Item 4
(worktree removal), Item 7 (issue claim release), and Item 8 (run-dir archival) all stay deferred
on this branch specifically because the merge that would make them safe has not happened yet and
this outcome is not terminal — not because they inherit the worktree constraint. Items 1, 2, 3,
5, and 6 are unaffected (not merge-dependent) and may still run normally as part of this call's
own wrap-up execution. Report `OUTCOME: ready-to-merge` (see `task-prompt.md`'s second-call
template) and return — `Dispatching-session merge execution (local-merge fallback)`, below, is
what actually merges, in `dispatch/SKILL.md` Step 6, in the dispatching session's own thread,
immediately after this call's report is read.
```

- [ ] **Step 4: Split the conflict-abort branch**

Find this paragraph (search for `no Item 4/7/8 cleanup on this branch`):

```markdown
**If the merge conflicts, or the branch guard aborts:** `git merge --abort` if a merge is actually in progress. Conflict resolution requires judgment a headless run can't supply. Leave the worktree and run dir parked exactly as an ordinary un-pushed `pending-review` outcome does today (`dispatch/SKILL.md`'s Reporting section) — no Item 4/7/8 cleanup on this branch; a human resuming the parked run handles it normally. **One accepted residual:** `close-run` already ran, above, before this conflict was discovered — unlike a normal `pending-review` outcome, this run is no longer E1-protected while parked. Not fixed here; there is no "reopen-run" mechanic to reverse it. Report this group's outcome as `pending-review` (not `ready-to-merge`, which is a transient signal, never terminal), and log why the auto-merge path was abandoned.
```

Replace it with:

```markdown
**If the merge conflicts, or the branch guard aborts:** `git merge --abort` if a merge is actually in progress. Conflict resolution requires judgment a headless run can't supply. This call cannot run `ExitWorktree`/`git worktree remove` — the same structural constraint stated at the top of this file. Claim release and run-dir archival are also parked here, but for a distinct reason: the run genuinely isn't finished and a human needs to resolve the conflict, exactly the ordinary un-pushed `pending-review` case `dispatch/SKILL.md`'s Reporting section already parks for the same rationale — not because they're grouped with worktree removal. Leave the worktree and run dir parked accordingly; a human resuming the parked run handles all three normally. **One accepted residual:** `close-run` already ran, above, before this conflict was discovered — unlike a normal `pending-review` outcome, this run is no longer E1-protected while parked. Not fixed here; there is no "reopen-run" mechanic to reverse it. Report this group's outcome as `pending-review` (not `ready-to-merge`, which is a transient signal, never terminal), and log why the auto-merge path was abandoned.
```

- [ ] **Step 5: Confirm the old bundled phrasing is gone and grep the sweep list**

Run: `grep -n "Item 4 (worktree removal), Item 7\|no Item 4/7/8 cleanup" plugin/skills/dispatch/settle-and-merge.md`
Expected: no matches (both replaced).

Run the Deliverable 4 sweep across the full corpus (confirms no other passage in this file, `dispatch/SKILL.md`, or `two-call-gate.md` still bundles the three items — this was already checked by hand during planning and should still read the same):
`grep -n "Item 4\|Item 7\|Item 8\|ExitWorktree\|worktree removal" plugin/skills/dispatch/settle-and-merge.md plugin/skills/dispatch/task-prompt.md plugin/skills/dispatch/SKILL.md plugin/skills/dispatch/two-call-gate.md`
Expected: every remaining hit is either (a) inside a "do run" success-path description (`merged` completing all three, or the local-merge fallback's post-merge cleanup), (b) the newly-added structural-constraint paragraph, or (c) two-call-gate.md's unrelated `[IL-116]` teardown-routing note — none is a fresh unaddressed "don't run… because merge" bundling. If a genuinely new bundled instance turns up that Task 1/2 didn't already cover, add a Step here before continuing (do not silently skip it).

- [ ] **Step 6: Commit**

```bash
git add plugin/skills/dispatch/settle-and-merge.md
git commit -m "dispatch: separate worktree-removal constraint from claim/archival deferral in settle-and-merge.md"
```

---

### Task 2: Split the `task-prompt.md` OUTCOME description and add state-check guidance

**Files:**
- Modify: `plugin/skills/dispatch/task-prompt.md` (two edit sites, both inside the second call's fenced Task-prompt block: insert before line 109, replace lines 130-135)

**Interfaces:** None — prose only. Both edits must land **inside** the fenced ` ``` ` block starting at `Task scope: Execute claude-tweaks review+polish+wrap-up...` — text outside that block never reaches the dispatched agent (`_shared/subagent-output-contract.md`'s Input Discipline: agents only see what's in their prompt).

- [ ] **Step 1: Add the OUTCOME-selection state-check paragraph**

Find, inside the fenced block, the line `Status line (required): First line of your reply must be one of: DONE / DONE_WITH_CONCERNS` followed by `/ NEEDS_CONTEXT / BLOCKED.` and a blank line, then `OUTPUT FORMAT (required), after the status line -- return ONLY these lines, no preamble:`.

Insert this new paragraph between the status-line sentence and the `OUTPUT FORMAT` line:

```
Before choosing which OUTCOME value to report, check the record's actual state rather than
inferring it from what this call itself did earlier: read `claims/issue-{n}.json` (does the
claim's `runId` still match this run, is it `live`?), the record's current labels
(`bot:in-progress`, `auto:merge`), and `run-state.json`'s `pr` object (does it already carry a
`number`/`url`, and if so, is that PR still open or already merged?). A completed hand-off (a
`pr` object recorded, or a merge already landed) is not the same state as a genuinely still-open
run awaiting a human -- report `pending-review` only for the latter.
```

- [ ] **Step 2: Verify the insertion landed inside the fenced block**

Run: `grep -n "Before choosing which OUTCOME value to report" plugin/skills/dispatch/task-prompt.md`
Expected: one match, on a line number between the `Status line (required)` line and `OUTPUT FORMAT (required)` line.

- [ ] **Step 3: Split the local-merge OUTCOME description**

Find this paragraph (search for `Stop right after labeling -- do not run worktree removal`):

```markdown
**`integration-model: local-merge`** — report `ready-to-merge` when the group's Auto-merge gate
passed both layers and you already applied acceptance labeling for every member -- never
`merged`. You do not merge yourself on this path: a Task-tool subagent cannot reach the main
checkout. Stop right after labeling -- do not run worktree removal, claim release, or run-dir
archival; the dispatching session completes all three after it merges, per
`settle-and-merge.md`'s Dispatching-session merge execution (local-merge fallback) section.
```

Replace it with:

```markdown
**`integration-model: local-merge`** — report `ready-to-merge` when the group's Auto-merge gate
passed both layers and you already applied acceptance labeling for every member -- never
`merged`. You do not merge yourself on this path: a Task-tool subagent cannot reach the main
checkout, and for the same structural reason (`settle-and-merge.md`'s outcome-independent
constraint) you cannot run worktree removal either. Stop right after labeling. Claim release and
run-dir archival stay deferred too, but for a distinct reason: the merge that would make them
safe hasn't happened yet -- not because they inherit the worktree constraint. The dispatching
session completes all three (worktree removal, claim release, run-dir archival) after it merges,
per `settle-and-merge.md`'s Dispatching-session merge execution (local-merge fallback) section.
```

- [ ] **Step 4: Confirm the old bundled phrasing is gone**

Run: `grep -n "do not run worktree removal, claim release, or run-dir" plugin/skills/dispatch/task-prompt.md`
Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add plugin/skills/dispatch/task-prompt.md
git commit -m "dispatch: add OUTCOME state-check guidance and split cleanup-deferral rationale in task-prompt.md"
```

---

### Task 3: Full verification sweep

**Files:** None modified — verification only.

**Interfaces:** None.

- [ ] **Step 1: Run the full prose-conformance suite**

Run: `npm test`
Expected: all suites pass (no test pinned the old bundled prose, confirmed during planning via `grep -rln` across `tests/` — zero matches).

- [ ] **Step 2: Re-run the Acceptance Criteria checks by hand**

- `grep -n "all three depend on a merge that has not happened yet\|no Item 4/7/8 cleanup on this branch\|do not run worktree removal, claim release, or run-dir" plugin/skills/dispatch/settle-and-merge.md plugin/skills/dispatch/task-prompt.md` — expect zero matches (all three original bundled sentences are gone).
- Read `plugin/skills/dispatch/task-prompt.md`'s second-call template in isolation (no cross-reference to `settle-and-merge.md`) and confirm every `OUTCOME` value's claim/archival disposition is stated or self-evidently deferred without needing `settle-and-merge.md`'s Settle procedure — `merged`/`armed`/`pending-review` (pr-first) and `ready-to-merge` (local-merge) already are; `failed`/`blocked` route to Settle's own procedure by explicit cross-reference (unchanged, out of this record's scope per its Current State, which names only the three passages above).
- Confirm the conflict-abort and `dispatch/SKILL.md` Reporting-section parking cases still legitimately bundle all three deferrals together (Gotcha: don't over-correct into forcing claim/archival on a genuinely-unfinished run) — `grep -n "handles all three normally" plugin/skills/dispatch/settle-and-merge.md` should match the edited conflict-abort paragraph.

- [ ] **Step 3: Commit if Step 2 required any follow-up fixes (no-op otherwise)**

If Step 2 surfaced no additional edits, this task produces no new commit — Tasks 1 and 2 already committed everything.
