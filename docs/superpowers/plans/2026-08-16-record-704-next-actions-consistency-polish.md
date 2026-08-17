# Record 704 — Next Actions Close-out Consistency Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the six `## Next Actions` close-out sites that #646's review flagged into line with `docs/skill-authoring.md`'s Skill-handoffs convention, after first amending that convention to formally accommodate annotated non-command action lines.

**Architecture:** Markdown-only edits, no code. Task 1 fixes the convention sentence (and its fixed annotation wording, `not a slash command`) that every later task is measured against; Tasks 2–6 are one surgical edit each to a named block; Task 7 is a corpus-wide scan of every `## Next Actions` block for the same three defect classes, classifying conditional-recommendation blocks as conformant rather than "fixing" them. Every task ends with the targeted conformance suites; the whole-branch `npm test` runs centrally after the last commit (build Common Step 5), not inside a task.

**Tech Stack:** Markdown; `node --test` (built-in) for the conformance suites; `wc -c` for the 40 KB SKILL.md ceiling.

**Spec:** `.claude-tweaks/pipelines/2026-08-16T230928-spec-704/work/704-spec.md` (materialized from GitHub issue #704 — read it in full before starting; its `## Acceptance Criteria` are the source of every verification grep below).

## Global Constraints

- Every `skills/**/SKILL.md` and every lazy-loaded sub-file must stay ≤ 40 960 bytes (`tests/bin-lib/skill-audit/context-cost.test.js`). Current worktree sizes: `skills/tidy/SKILL.md` 40 699 (261 bytes headroom — **do not grow it**), `skills/build/SKILL.md` 39 253 (~1.7 KB headroom). Measure `wc -c` after every edit to those two files.
- The `> **Interaction style:** …` directive line at the top of every SKILL.md is byte-pinned across all skills (`tests/skill-conventions.test.js`, `tests/bin-lib/skill-audit/house-structure.test.js`). **Never edit that line in any file** — the convention change lives only in `docs/skill-authoring.md`'s Skill handoffs bullet.
- The four health-sweep SKILL.md files (`code-health`, `docs-health`, `harness-health`, `journey-health`) share byte-identical sections pinned by `tests/health-filing-parity.test.js`. **Do not edit any of them.**
- Never write an unresolved-placeholder token (the three that `_shared/work-record.md`'s spec-shaped-body check greps for, context-free) anywhere in an edited file — paraphrase ("a deferred-work comment") instead.
- Commit messages: `{Verb} {what} — {detail}` (imperative, no conventional-commit prefix), each ending with `refs #704` — write `refs`, never `closes`/`fixes` (the PR body already carries `Fixes #704`; a per-commit closing keyword would close the issue on merge of an unfinished branch).
- Work only inside this worktree: `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-704` (branch `worktree-flow-spec-704`). Before the first edit run `pwd` and `git rev-parse --show-toplevel` and confirm both print that path; if they don't, STOP and report — do not edit.
- Under this project's `worktree-always` gate, Bash commands must be plain: no heredocs, no `&&`-chained multi-command lines with redirects, no `for` loops. One command per call; use the Edit tool for file edits.
- Targeted suites per task (run these, not the full suite): `node --test tests/bin-lib/skill-audit/context-cost.test.js tests/bin-lib/skill-audit/house-structure.test.js tests/skill-conventions.test.js`. The full `npm test` runs once, centrally, after all tasks.

---

### Task 1: Convention accommodation for annotated non-command action lines

**Files:**
- Modify: `docs/skill-authoring.md` (the "Skill handoffs (Next Actions)" bullet, currently line 47)
- Verify only (no edit): `skills/tidy/SKILL.md:225-243` (its "not a slash command" wording is the incumbent this task fixes as canonical)

**Interfaces:**
- Consumes: nothing.
- Produces: the literal annotation marker `not a slash command` as the fixed wording every later task uses for a non-command line; the convention sentence Tasks 3, 4, and 7 cite.

- [ ] **Step 1: Confirm the current bullet text and that no test pins it**

Run: `grep -n 'A single surviving option still renders as a one-line block' docs/skill-authoring.md`
Expected: exactly one hit, on the Skill handoffs bullet (line 47).

Run: `grep -rln 'one paste-ready command per line' tests bin`
Expected: no output (nothing pins this bullet's prose).

Run: `grep -c 'not a slash command' skills/tidy/SKILL.md`
Expected: `2` (the derivation paragraph and the rendered line — the incumbent wording).

- [ ] **Step 2: Insert the accommodation sentence**

Use the Edit tool on `docs/skill-authoring.md`. Find this exact substring inside the Skill handoffs bullet:

```
A single surviving option still renders as a one-line block: markdown costs no interaction, so there is no minimum option count.
```

Replace it with:

```
A single surviving option still renders as a one-line block: markdown costs no interaction, so there is no minimum option count. A line may name a **non-command action** — an in-session step to execute, a file to open, a URL to visit — only when its annotation carries the literal marker `not a slash command`, so a reader scanning for paste-ready commands can tell it apart at a glance (`tidy/SKILL.md`'s Approve line is the canonical example); prefer a genuine command form (`open {path}`, `gh issue view {url} --web`) whenever one exists.
```

- [ ] **Step 3: Verify**

Run: `grep -c 'literal marker `not a slash command`' docs/skill-authoring.md`
Expected: `1`

Run: `grep -c 'not a slash command' skills/tidy/SKILL.md`
Expected: still `2` — tidy is untouched (the incumbent wording is the fixed wording; Deliverable 6 is satisfied by verification, no edit).

Run: `wc -c skills/tidy/SKILL.md`
Expected: `40699` (unchanged).

Run: `node --test tests/bin-lib/skill-audit/context-cost.test.js tests/bin-lib/skill-audit/house-structure.test.js tests/skill-conventions.test.js`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add docs/skill-authoring.md
git commit -m "Accommodate annotated non-command action lines in the Skill handoffs convention — fixes the marker wording as 'not a slash command', refs #704"
```

---

### Task 2: build — `(when ...)` qualifiers on the two review lines

**Files:**
- Modify: `skills/build/SKILL.md:315-331` (the `## Next Actions` rendered block)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing downstream.

- [ ] **Step 1: Confirm the current lines (the "failing" state)**

Run: `grep -n '`/claude-tweaks:review {N} full` — code + visual review$' skills/build/SKILL.md`
Expected: one hit (the bare line, no qualifier).

Run: `grep -n '`/claude-tweaks:review {N}` — code review$' skills/build/SKILL.md`
Expected: one hit (the bare line, no qualifier).

- [ ] **Step 2: Edit the two rendered lines**

Use the Edit tool on `skills/build/SKILL.md`. Find this exact two-line substring (the first two lines of the rendered block that follows the "Once the signals are resolved…" paragraph):

```
`/claude-tweaks:review {N} full` — code + visual review
`/claude-tweaks:review {N}` — code review
```

Replace with:

```
`/claude-tweaks:review {N} full` — code + visual review (when UI changed and a browser is available)
`/claude-tweaks:review {N}` — code review (when no UI change or no browser)
```

Leave the signal table and the paragraph above the block untouched — the exclusivity rule stated there stays as-is; only the rendered lines gain qualifiers.

- [ ] **Step 3: Verify**

Run: `grep -c 'code + visual review (when' skills/build/SKILL.md`
Expected: `1`

Run: `grep -c '— code review (when' skills/build/SKILL.md`
Expected: `1`

Run: `wc -c skills/build/SKILL.md`
Expected: a number ≤ 40960 (it should be about 39 340).

Run: `node --test tests/bin-lib/skill-audit/context-cost.test.js tests/bin-lib/skill-audit/house-structure.test.js tests/skill-conventions.test.js`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add skills/build/SKILL.md
git commit -m "Qualify build's two mutually-exclusive review close-out lines with (when ...) — refs #704"
```

---

### Task 3: visualize — one bolded (recommended) command line, command-form path line, drop the calling-flow line

**Files:**
- Modify: `skills/visualize/SKILL.md:117-123` (the `## Next Actions` block)

**Interfaces:**
- Consumes: Task 1's convention (a non-command line needs the `not a slash command` marker; prefer a command form).
- Produces: nothing downstream.

- [ ] **Step 1: Confirm the current block**

Run: `grep -n 'recommended if more signals matched' skills/visualize/SKILL.md`
Expected: one hit.

Run: `grep -n '^Continue the calling flow' skills/visualize/SKILL.md`
Expected: one hit.

Run: `grep -n '^{path} — open to view' skills/visualize/SKILL.md`
Expected: one hit.

- [ ] **Step 2: Rewrite the three rendered lines**

Use the Edit tool on `skills/visualize/SKILL.md`. Find this exact substring:

```
After generating, render as plain markdown (docs/skill-authoring.md's Skill handoffs convention):

`/claude-tweaks:visualize <type> <topic>` — generate another diagram (recommended if more signals matched)
Continue the calling flow — return to wherever this was invoked from (journey commit, spec summary, review findings)
{path} — open to view the generated diagram (when persisted)
```

Replace with:

```
After generating, render as plain markdown (docs/skill-authoring.md's Skill handoffs convention). This block only renders standalone (see the Component-Skill Contract below), so there is no calling flow to return to — the lines are the diagram itself and the next diagram:

**`/claude-tweaks:visualize <type> <topic>`** — generate another diagram, when more signals matched (recommended)
`open {path}` — view the generated diagram (when persisted)
```

Rationale to keep in mind (do not add it to the file): the "Continue the calling flow" line described a pipeline context in which the block is never rendered, so it is dropped rather than annotated; the `{path}` line becomes a real command (`open {path}`), so it needs no `not a slash command` marker.

- [ ] **Step 3: Verify**

Run: `grep -c '^\*\*`/claude-tweaks:visualize <type> <topic>`\*\* — .*(recommended)$' skills/visualize/SKILL.md`
Expected: `1`

Run: `grep -c '^Continue the calling flow' skills/visualize/SKILL.md`
Expected: `0`

Run: `grep -c '^`open {path}` — view the generated diagram (when persisted)$' skills/visualize/SKILL.md`
Expected: `1`

Run: `node --test tests/bin-lib/skill-audit/context-cost.test.js tests/bin-lib/skill-audit/house-structure.test.js tests/skill-conventions.test.js`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add skills/visualize/SKILL.md
git commit -m "Give visualize's close-out one bolded (recommended) command line and a command-form path line — refs #704"
```

---

### Task 4: feedback — the created-issue line becomes a paste-ready command

**Files:**
- Modify: `skills/feedback/SKILL.md:361-367` (the `## Next Actions` block)

**Interfaces:**
- Consumes: Task 1's convention (prefer a command form over a bare URL).
- Produces: nothing downstream.

- [ ] **Step 1: Confirm the current line**

Run: `grep -n '^{created issue URL} — the filed issue, for reading or follow-up$' skills/feedback/SKILL.md`
Expected: one hit.

- [ ] **Step 2: Edit the line**

Use the Edit tool on `skills/feedback/SKILL.md`. Find this exact substring:

```
{created issue URL} — the filed issue, for reading or follow-up
```

Replace with:

```
`gh issue view {created issue URL} --web` — open the filed issue for reading or follow-up
```

(`gh issue view` accepts a full issue URL as its argument, so the URL the skill already has in hand at Step 8 slots straight in — no owner/repo derivation needed.)

- [ ] **Step 3: Verify**

Run: `grep -c '^{created issue URL}' skills/feedback/SKILL.md`
Expected: `0`

Run: `grep -c '^`gh issue view {created issue URL} --web` — open the filed issue' skills/feedback/SKILL.md`
Expected: `1`

Run: `node --test tests/bin-lib/skill-audit/context-cost.test.js tests/bin-lib/skill-audit/house-structure.test.js tests/skill-conventions.test.js`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add skills/feedback/SKILL.md
git commit -m "Turn feedback's created-issue close-out line into a paste-ready gh command — refs #704"
```

---

### Task 5: flow/worktree-merge.md — bold the re-run line as (recommended)

**Files:**
- Modify: `skills/flow/worktree-merge.md:107-112` (the `## Next Actions` block)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing downstream.

- [ ] **Step 1: Confirm the current block**

Run: `grep -n '^`/claude-tweaks:flow {spec} worktree {remaining steps}` — re-run for any failed specs$' skills/flow/worktree-merge.md`
Expected: one hit (plain, unbolded).

- [ ] **Step 2: Edit the line**

Use the Edit tool on `skills/flow/worktree-merge.md`. Find:

```
`/claude-tweaks:flow {spec} worktree {remaining steps}` — re-run for any failed specs
```

Replace with:

```
**`/claude-tweaks:flow {spec} worktree {remaining steps}`** — re-run for any failed specs (recommended)
```

Leave the `/claude-tweaks:help` line plain.

- [ ] **Step 3: Verify**

Run: `grep -c '^\*\*`/claude-tweaks:flow {spec} worktree {remaining steps}`\*\* — re-run for any failed specs (recommended)$' skills/flow/worktree-merge.md`
Expected: `1`

Run: `grep -c '(recommended)' skills/flow/worktree-merge.md`
Expected: `1` (exactly one recommended line in the file).

Run: `node --test tests/pr-first-merge.test.js tests/merge-verification-gate-conformance.test.js tests/bin-lib/skill-audit/context-cost.test.js`
Expected: all pass (the first two pin other parts of this file — confirm the edit didn't disturb them).

- [ ] **Step 4: Commit**

```bash
git add skills/flow/worktree-merge.md
git commit -m "Bold the re-run line as (recommended) in flow/worktree-merge.md's close-out — refs #704"
```

---

### Task 6: help/policy.md — inline gate-classification sentence at the surviving AskUserQuestion

**Files:**
- Modify: `skills/help/policy.md` (the "**Otherwise**, the mode's ONE `AskUserQuestion` call" paragraph inside `## Next Actions (apply path)`, currently around line 119)

**Interfaces:**
- Consumes: nothing.
- Produces: nothing downstream.

- [ ] **Step 1: Confirm the current paragraph and that the phrase is absent**

Run: `grep -n '^\*\*Otherwise\*\*, the mode.s ONE `AskUserQuestion` call' skills/help/policy.md`
Expected: one hit.

Run: `grep -c 'terminal menu' skills/help/policy.md`
Expected: `0`

- [ ] **Step 2: Add the classification sentence**

Use the Edit tool on `skills/help/policy.md`. Find this exact substring:

```
**Otherwise**, the mode's ONE `AskUserQuestion` call (`multiSelect: true`):
```

Replace with:

```
**Otherwise**, the mode's ONE `AskUserQuestion` call (`multiSelect: true`). This call is a **blocking apply/write gate** — it decides which lines get written to `.claude-tweaks/policy.yml` before the skill can finish — so it falls under docs/skill-authoring.md's "decisions that block the skill from finishing" clause; it is not a terminal menu, and the plain-markdown close-out rule does not apply to it:
```

- [ ] **Step 3: Verify**

Run: `grep -c 'not a terminal menu' skills/help/policy.md`
Expected: `1`

Run: `grep -c 'blocking apply/write gate' skills/help/policy.md`
Expected: `1`

Run: `wc -c skills/help/policy.md`
Expected: ≤ 40960 (about 13 900).

Run: `node --test tests/bin-lib/skill-audit/context-cost.test.js tests/bin-lib/skill-audit/house-structure.test.js`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add skills/help/policy.md
git commit -m "Classify help/policy.md's surviving AskUserQuestion inline as a blocking apply/write gate — refs #704"
```

---

### Task 7: Corpus-wide consistency scan of every `## Next Actions` block

**Files:**
- Read: every `skills/**/*.md` file containing a `## Next Actions` or `### Next Actions` heading (38 blocks at plan time)
- Modify: only a file whose block shows a same-class defect that a one-line change fixes (none expected beyond Tasks 2–6; see the classification rules below)
- Do NOT modify: `skills/code-health/SKILL.md`, `skills/docs-health/SKILL.md`, `skills/harness-health/SKILL.md`, `skills/journey-health/SKILL.md` (byte-identical pinned sections), or any `> **Interaction style:**` line

**Interfaces:**
- Consumes: Task 1's convention (marker wording `not a slash command`).
- Produces: a markdown scan table (block → verdict) in this task's completion report, which the orchestrator appends to PR #710's description.

- [ ] **Step 1: List every block**

Run: `grep -rn -E '^#{2,3} Next Actions' skills/`
Expected: a list of ~38 `file:line:heading` rows. Keep this list — it is the scan's row set.

- [ ] **Step 2: Classify each block against the three defect classes**

For each block, read the block (from its heading to the next heading of the same or higher level) and record one verdict per class:

- **(a) Two mutually-exclusive command lines without `(when ...)` qualifiers** — defect only when the block's intro prose says two listed lines are exclusive AND neither line carries a qualifier. A block that renders one line chosen by prose rule (e.g. "when X, bold line 1; otherwise line 2") with qualifiers present is conformant.
- **(b) Zero bolded `(recommended)` lines in a block that renders ≥ 1 command line** — defect only when the block has no recommended slot at all. A **conditional-recommendation block** — one whose intro prose states when the bold/(recommended) marker applies (e.g. code-health's "When high-severity issues were filed, bold the `/claude-tweaks:specify` line and suffix it `(recommended)`; otherwise render all four lines unranked", routine's "Right after a `create` operation … bolded … after `update` or `status`, no line is bolded", design-wrapper's per-return-shape table) — is **conformant**: the recommended slot exists and its rule is stated. Record it as `conformant (conditional recommendation, rule stated)`.
- **(c) A non-command action line without the `not a slash command` marker** — a rendered line (not the block's intro/instruction prose) that names an in-session step, a bare file path, or a bare URL, with no backticked command and no marker. A URL rendered by a health sweep as part of a command argument (`/claude-tweaks:specify <issue-url-or-title>`) is a command line, not a hit.

- [ ] **Step 3: Fix same-class one-line hits, defer anything structural**

For each hit that is a genuine one-line fix of class (a)/(b)/(c) and is NOT in the do-not-modify list: apply it with the Edit tool, following the exact forms Tasks 2–5 used (`(when …)` suffix; `**`cmd`** — annotation (recommended)`; a command form or the `not a slash command` marker). For a hit that needs structural rework, or sits in a do-not-modify file, do NOT edit — record it as `deferred: {one-line reason}` in the table so the orchestrator can file a follow-up record.

- [ ] **Step 4: Verify**

Run: `node --test tests/bin-lib/skill-audit/context-cost.test.js tests/bin-lib/skill-audit/house-structure.test.js tests/skill-conventions.test.js tests/health-filing-parity.test.js`
Expected: all pass.

If any file was edited: `wc -c` on each edited SKILL.md — every value ≤ 40960.

- [ ] **Step 5: Commit (only if Step 3 edited anything) and report**

If files were edited:

```bash
git add skills/
git commit -m "Apply the same-class Next Actions consistency fixes the corpus scan surfaced — refs #704"
```

Regardless of edits, end the task with the scan table in this exact shape (one row per block; `verdict` is `conformant`, `conformant (conditional recommendation, rule stated)`, `fixed in Task N`, `fixed here`, or `deferred: …`):

```markdown
| Block | (a) exclusive lines | (b) recommended slot | (c) non-command lines | Verdict |
|---|---|---|---|---|
| skills/backlog/SKILL.md `## Next Actions` | … | … | … | … |
```

Include a one-line count footer: `Scanned {N} blocks — {x} fixed in Tasks 2–6, {y} fixed here, {z} deferred, {w} conformant.`
