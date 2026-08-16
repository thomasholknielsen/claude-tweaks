---
files:
  - skills/tidy/step-6-auto.md
  - skills/tidy/SKILL.md
  - skills/tidy/scan-procedures.md
  - bin/lib/reconcile/release-merged.js
  - bin/lib/reconcile/archive-branches.js
  - bin/lib/reconcile/reap-merged.js
---

# Tidy Standalone-Auto Report: Verb-Grouped Sections and Reconcile-Converged Rows

**Persona:** claude-tweaks maintainer (or a scheduled tidy Routine firing) running periodic backlog hygiene on a `pr-first` project with `auto-mode: default-on`.
**Goal:** One report that separates what tidy already did, what it will do on a click, and what only the human can do — with every actionable line ending in a paste-ready command, and mechanical cleanups (issue-closed claim releases, abandoned-branch archival) already converged by reconcile rather than staged for approval.
**Entry point:** `/claude-tweaks:tidy` standalone in auto mode (no parent pipeline run dir), interactively or as the weekly scheduled Routine.
**Success state:** The report renders the four literal sections — **Applied automatically**, **Approve ({N})**, **Yours ({N})**, **Clean:** — empty sections omitted (Clean always present); reconcile-converged outcomes (released claims on closed issues, archived/deleted abandoned branches) appear under Applied with their evidence reason; every Yours line carries its fully-qualified command; Next Actions derives from Approve/Yours (Apply-all-staged first when Approve is non-empty, capped at 4 options total).

## Steps

### 1. Scans run — reconcile converges first
- **Action:** Tidy's scan procedures run `reconcile()` at their own trigger points. Under `pr-first`, the release check drops claims on merged-PR evidence (`merged: reconciled from PR #{n}`) or issue-closed evidence (`issue-closed: reconciled from #{n}`), the archive-branches check deletes cherry-equivalent plugin-owned branches and tags-then-deletes aged unmerged ones, and the reap check removes merged runs' worktrees — a locked worktree with a live owner is reap's skip, reported with its reason, never broken. Under `local-merge`, only `reap`'s legacy ancestry check runs — everything else keeps staging.
- **Expect:** No approval prompt for any of this — these are reconcile's background-convergence writes, outside the skill-side auto-mode contract; tidy only reports the results.

### 2. Findings route by the table, not judgment
- **Action:** Each scan finding routes per `step-6-auto.md`'s tier table (default `moderate`): reversible git-tracked cleanups auto-apply, outward-facing GitHub writes stage, no-op findings surface with their command.
- **Expect:** The section a finding lands in is a stated function of its routing outcome (bucket mapping) — executed/converged → Applied; staged-executable → Approve; command-carrying no-ops → Yours; Keep/clean scans → Clean (counted, never itemized). Nothing renders information-only.

### 3. The report renders before any question
- **Action:** The hard gate requires the rendered report in the same response, above any `AskUserQuestion`.
- **Expect:** No box-drawing tables; records as `#{N} "{title}"` (titles from the scan agents' own findings — no per-row `gh issue view`); `{run-dir}/decisions.md` referenced by path exactly once.

### 4. Next Actions close the loop
- **Action:** The closing question derives from the report: "Apply all staged ({N})" first when Approve is non-empty, then up to Yours items (capped so the total never exceeds 4 options), then the help dashboard.
- **Expect:** A finding class that keeps staging run after run reads as a missing routing rule (the principle stated once in `step-6-auto.md`'s preamble) — the Approve bucket should trend empty as routing rows (or reconcile checks) absorb recurring classes; the durable exception is outward-facing GitHub writes, forbidden at every tier by the auto-mode contract.
