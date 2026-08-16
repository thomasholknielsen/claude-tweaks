# Resume-to-Merge Confirmation Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a structured `AskUserQuestion` confirmation (PR number, CI status, files changed) before an agent re-invokes `/claude-tweaks:flow "{target}" wrap-up` to resume a parked/pending-review dispatch run outside the actual Review Console.

**Architecture:** Purely a documentation change to `skills/dispatch/SKILL.md`'s "Resuming a parked run" paragraph (Reporting section) — insert a new "Confirm before resuming" sub-paragraph, sourcing PR number/URL, CI status, and changed-files count from `gh pr` calls (or local-worktree equivalents under `integration-model: local-merge`), before the existing re-invocation instructions.

**Tech Stack:** Markdown skill file; no runtime code. Verified via `grep` assertions and `npm test` (skill-conventions.test.js's interaction-directive/diagram checks must keep passing).

**Spec:** `.claude-tweaks/pipelines/2026-08-16T064016-spec-531/work/531-spec.md` (materialized from issue #531)

## Global Constraints

- The confirmation must be a single decision → one `AskUserQuestion` call, one option marked Recommended — matches this project's canonical Interaction style directive (CLAUDE.md / every skill's banner).
- Must show PR number, CI status, and files changed (spec's Deliverables).
- Declining must stop the resume without merging (spec's Acceptance Criteria).
- Must not turn the resume into a multi-step wizard (spec's Gotchas).

---

### Task 1: Add the confirmation gate to dispatch/SKILL.md's "Resuming a parked run" section

**Files:**
- Modify: `skills/dispatch/SKILL.md` (the "Resuming a parked run." paragraph, currently a single paragraph in the `## Reporting` section)

**Interfaces:**
- Consumes: nothing (prose-only, no code interfaces)
- Produces: nothing consumed by other tasks (single-task plan)

- [ ] **Step 1: Capture the current paragraph verbatim for the diff**

Run:
```bash
grep -n "Resuming a parked run" -A 1 skills/dispatch/SKILL.md
```
Expected: one match at the paragraph's opening line, confirming the anchor text is still present and unchanged before editing.

- [ ] **Step 2: Insert the confirmation gate**

Edit `skills/dispatch/SKILL.md`, replacing:

```
**Resuming a parked run.** "Resumes that session" above is not literal — the Task-tool subagent that hit the console has already exited by the time anyone reads this report, and there is no way to re-attach to it. The actual resume mechanism is re-adopting the same run directory: `PIPELINE_RUN_DIR="{run-dir}" /claude-tweaks:flow "{target}" wrap-up`, run from inside the group's still-assigned worktree (`{run-dir}`'s own worktree — parking never clears a run's worktree assignment, so it is still there). This re-enters the same Review Console live, and its own teardown is what invokes `/superpowers:finishing-a-development-branch` and `wrap-up/cleanup-procedures.md` Section E (claim release, `auto:build`/`bot:in-progress` label removal) as one step — never hand-chain `/claude-tweaks:demo` (acceptance only, never merges — see its own Anti-Patterns table) with `/superpowers:finishing-a-development-branch` and then reconstruct Section E's claim/label bookkeeping by hand; that skips the console and its automated cleanup entirely, doing by hand what resuming the console already does as a unit. `{run-dir}` and `{target}` are the same values this run was invoked with — `{run-dir}` is this group's own minted directory (Step 4 above), the same value the claim's `runId` already carries, so re-adopting it is all resuming needs. Under `integration-model: pr-first`, the same PR `_shared/pr-early-run-lifecycle.md` opened at run start carries the same `### Resume` pointer.
```

with:

```
**Resuming a parked run.** "Resumes that session" above is not literal — the Task-tool subagent that hit the console has already exited by the time anyone reads this report, and there is no way to re-attach to it. The actual resume mechanism is re-adopting the same run directory: `PIPELINE_RUN_DIR="{run-dir}" /claude-tweaks:flow "{target}" wrap-up`, run from inside the group's still-assigned worktree (`{run-dir}`'s own worktree — parking never clears a run's worktree assignment, so it is still there).

**Confirm before resuming.** Before running the re-invocation above — including when a human triggers the resume conversationally (e.g. replying "merge!" in chat) rather than by typing the command directly — call `AskUserQuestion`:
- `question`: `"Resume {target} toward merge? PR #{number} ({url}), CI: {status}, files changed: {count-or-list}. Declining leaves the run parked."`, `header`: `"Resume run"`, `multiSelect`: `false`
- Option 1 — `label`: `"Resume (Recommended)"`, `description`: `"Re-invoke the resume command above — re-enters the Review Console for final approval"`
- Option 2 — `label`: `"Cancel"`, `description`: `"Leave the run parked; do nothing"`

Source the confirmation's values live, never from a stale report: PR number/URL from the run's `run-state.json` `pr` field (or `gh pr list --repo {owner}/{repo} --head {branch}` when unset), CI status from `gh pr checks {number}` (or `gh pr view {number} --json statusCheckRollup`, summarized as `passing`/`failing`/`pending`), and files changed from `gh pr diff {number} --name-only` (a count, or the list when short — 5 files or fewer). Under `integration-model: local-merge` (no PR — `_shared/integration-model.md`), substitute the branch name and worktree path for the PR reference, `git -C {worktree} diff --stat {integration-branch}...HEAD` for files changed, and CI status reads `not applicable — local-merge`. Declining (option 2) stops here — nothing below runs, and the run stays parked exactly as it was; this is the one path where "resuming" does not proceed toward the console at all.

This re-enters the same Review Console live, and its own teardown is what invokes `/superpowers:finishing-a-development-branch` and `wrap-up/cleanup-procedures.md` Section E (claim release, `auto:build`/`bot:in-progress` label removal) as one step — never hand-chain `/claude-tweaks:demo` (acceptance only, never merges — see its own Anti-Patterns table) with `/superpowers:finishing-a-development-branch` and then reconstruct Section E's claim/label bookkeeping by hand; that skips the console and its automated cleanup entirely, doing by hand what resuming the console already does as a unit. `{run-dir}` and `{target}` are the same values this run was invoked with — `{run-dir}` is this group's own minted directory (Step 4 above), the same value the claim's `runId` already carries, so re-adopting it is all resuming needs. Under `integration-model: pr-first`, the same PR `_shared/pr-early-run-lifecycle.md` opened at run start carries the same `### Resume` pointer.
```

- [ ] **Step 3: Verify the insertion landed and is well-formed**

Run:
```bash
grep -n "Confirm before resuming" skills/dispatch/SKILL.md
grep -c 'header.*"Resume run"' skills/dispatch/SKILL.md
```
Expected: one match for "Confirm before resuming"; exactly one match for the `"Resume run"` header (no duplicate block from a bad replace). Also re-run Step 1's grep and confirm the original anchor sentence ("Resumes that session" above is not literal...") is still present unchanged directly beneath the bold lead.

- [ ] **Step 4: Run the skill-conventions test file**

Run: `node --test tests/skill-conventions.test.js`
Expected: PASS — the interaction-directive and dispatch-diagram checks are unaffected by an edit deep in the Reporting section (past the `## Reporting` heading, well outside the first-15-lines diagram window `skill-conventions.test.js` checks for `dispatch`).

- [ ] **Step 5: Commit**

```bash
git add skills/dispatch/SKILL.md
git commit -m "Add resume-to-merge AskUserQuestion confirmation gate to dispatch's Resuming a parked run"
```
