# Tidy Orphaned-Ledger Scan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/claude-tweaks:tidy`'s Step 4 an orphaned-ledger scan so a `docs/plans/*-ledger.md` file left behind by a pipeline that never reached wrap-up gets surfaced (`[ledger]`) with a Delete/Keep recommendation, instead of sitting invisible forever.

**Architecture:** Extend Step 4's existing main-thread glob (it already reads `docs/superpowers/plans/` and `~/.claude/plans/`) to also glob `docs/plans/*-ledger.md`, and classify each match by whether a directory under `.claude-tweaks/pipelines/` (excluding `archive/`) still exists for it — same cost class as the existing plan scan, no new agent dispatch. Wire the new `[ledger]` finding into the existing `Delete` action-vocabulary row that already covers "orphaned plans whose related spec is complete" (`step-6-auto.md`), rather than inventing a new row. Fix the two places that currently assert the gap is unclosed (`SKILL.md`'s scan-steps table, `docs/skill-graph.md`'s `/tidy` relationship row).

**Tech Stack:** Markdown skill-prose only — no executable code. `/claude-tweaks:tidy`'s Step 4 is read and interpreted by the orchestrating LLM at sweep time, not run by a script.

**Spec:** `.claude-tweaks/pipelines/2026-08-23T195754-spec-113/work/113-spec.md`

## Global Constraints

- Prose-only change confined to four files: `plugin/skills/tidy/scan-procedures.md`, `plugin/skills/tidy/SKILL.md`, `plugin/skills/tidy/step-6-auto.md`, `docs/skill-graph.md`.
- No new scan agent, no new CLI, no new test fixture — this rides on Step 4's existing main-thread execution and the existing `Delete`/`Keep` action vocabulary.
- Match a ledger to its pipeline run directory by **substring**, not exact equality: a ledger's `{feature}` slug (`_shared/ledger-format.md`: "matches the execution plan or spec topic") is descriptive prose chosen at ledger-creation time, while a pipeline run directory's `{spec-slug}` (`_shared/pipeline-run-dir.md`) follows the stricter `spec-{n}`/`record-{n}`/topic-slug convention — the two are independently derived and only coincide in the common case (an automated `/flow`/`/build` run), never guaranteed identical.
- The spec's second orphan criterion ("no open work record references it") is judgment applied by whoever reads the Step 6 report, not a mechanical grep across every open record's body — Step 4 stays in the main thread precisely because its rule set is cheap; a full open-record body scan would defeat that (spec's own Technical Approach note).

---

### Task 1: Extend Step 4's scan, wire the Delete row, and fix the two stale docs

**Files:**
- Modify: `plugin/skills/tidy/scan-procedures.md:39-51` (Step 4: Audit Execution Plans)
- Modify: `plugin/skills/tidy/SKILL.md:86` (scan-steps table, Step 4 row)
- Modify: `plugin/skills/tidy/step-6-auto.md:31` (Delete — orphaned-plans row)
- Modify: `docs/skill-graph.md:323` (`/tidy` relationship row under `/ledger`'s edges)

**Interfaces:**
- Consumes: nothing — this is the only task in the plan.
- Produces: nothing another task reads — this is the only task in the plan.

- [ ] **Step 1: Extend `scan-procedures.md`'s Step 4 with the ledger glob**

Read the current section first:

```bash
sed -n '39,51p' plugin/skills/tidy/scan-procedures.md
```

Expected current content:

```markdown
## Step 4: Audit Execution Plans

Scan `docs/superpowers/plans/` for execution plan files and `~/.claude/plans/`.

| Status | Recommendation |
|--------|---------------|
| Related spec is complete | Delete |
| Related spec is in progress | Keep |
| No related spec found | Delete (orphan) |
| Very old, spec not started | Delete |

→ Collect each as: `[plan] {filename} — {recommendation}`
```

Replace lines 39-51 with:

```markdown
## Step 4: Audit Execution Plans

Scan `docs/superpowers/plans/` for execution plan files and `~/.claude/plans/`.

| Status | Recommendation |
|--------|---------------|
| Related spec is complete | Delete |
| Related spec is in progress | Keep |
| No related spec found | Delete (orphan) |
| Very old, spec not started | Delete |

→ Collect each as: `[plan] {filename} — {recommendation}`

Also glob `docs/plans/*-ledger.md` — the per-feature pipeline ledgers `/claude-tweaks:ledger` creates (`docs/plans/YYYY-MM-DD-{feature}-ledger.md`, `_shared/ledger-format.md`) and `/claude-tweaks:wrap-up` Step 10 deletes on successful completion. A pipeline that never reaches wrap-up leaves its ledger behind permanently; nothing else sweeps for it.

For each matched file, extract its `{feature}` slug (the filename with the leading `YYYY-MM-DD-` date and the trailing `-ledger.md` suffix stripped) and check `.claude-tweaks/pipelines/` (every entry except `archive/`) for a directory whose name contains that slug as a substring — a pipeline run directory's own `{spec-slug}` (`_shared/pipeline-run-dir.md`) commonly embeds the same feature identifier (e.g. ledger `2026-08-14-record-390-ledger.md` ↔ run directory `2026-08-14T…-record-390`), though the two naming schemes are independently derived and not guaranteed identical:

| Status | Recommendation |
|--------|---------------|
| A directory under `.claude-tweaks/pipelines/` (not `archive/`) matches the slug | Keep |
| No matching directory anywhere under `.claude-tweaks/pipelines/` (absent, or present only under `archive/`) | Delete (orphan) |

Absence of the run directory is the safer orphan signal than file age alone — a pipeline that's merely paused, not abandoned, still has its run directory on disk (just inactive); only a genuinely finished-and-archived or abandoned-and-swept run leaves the ledger with nothing to match. Before recommending Delete, also sanity-check that no open work record's body references the ledger's filename or feature slug — a quick judgment read, not a scripted grep across every open record (Step 4 stays in the main thread precisely because its rule set is cheap).

→ Collect each as: `[ledger] {filename} — {recommendation}`
```

- [ ] **Step 2: Verify the edit landed correctly**

```bash
sed -n '39,75p' plugin/skills/tidy/scan-procedures.md
```

Expected: the file now contains both the original `[plan]` table and the new `[ledger]` section, in that order, with no stray blank lines or broken table syntax. Confirm `## Step 4.5: Audit Git Worktrees, Build Branches, and Artifact Residue` (the next heading) still immediately follows the new content with exactly one blank line before it.

- [ ] **Step 3: Update `SKILL.md`'s scan-steps table row for Step 4**

Read the current row:

```bash
grep -n '^| 4 (main thread, parallel with the agent batch) | `docs/superpowers/plans/`' plugin/skills/tidy/SKILL.md
```

Expected current row (single line, in the `| Step | Data source | Output prefix |` table):

```
| 4 (main thread, parallel with the agent batch) | `docs/superpowers/plans/`, `~/.claude/plans/` | `[plan]` |
```

Replace it with:

```
| 4 (main thread, parallel with the agent batch) | `docs/superpowers/plans/`, `~/.claude/plans/`, `docs/plans/*-ledger.md` | `[plan]`, `[ledger]` |
```

- [ ] **Step 4: Verify the `SKILL.md` edit landed correctly**

```bash
grep -n '^| 4 (main thread' plugin/skills/tidy/SKILL.md
```

Expected: one line, reading exactly as the replacement above (confirm no duplicate row was created).

- [ ] **Step 5: Wire `[ledger]` Delete into `step-6-auto.md`'s existing orphaned-plans row**

Read the current row:

```bash
grep -n 'orphaned plans whose related spec is complete' plugin/skills/tidy/step-6-auto.md
```

Expected current row (line ~31, in the Recommendation/conservative/moderate/aggressive table):

```
| **Delete** (stale temp files, broken symlinks, marked-as-specified design docs, merged worktrees/branches, orphaned plans whose related spec is complete, aged `artifact` residue findings — `remedy: auto`, gitignored declared-transient QA screenshots/traces past the 30-day window) | Auto-apply | Auto-apply | Auto-apply |
```

Replace `orphaned plans whose related spec is complete` with `orphaned plans whose related spec is complete, orphaned ledger files with no matching pipeline run directory`, leaving every other word and all three tier cells (`Auto-apply | Auto-apply | Auto-apply`) unchanged — the ledger orphan signal (run-directory absence) is the same confidence class as the existing plan-orphan signal (no related spec), so it belongs in the same row rather than a new one.

- [ ] **Step 6: Verify the `step-6-auto.md` edit landed correctly**

```bash
grep -n 'orphaned ledger files with no matching pipeline run directory' plugin/skills/tidy/step-6-auto.md
```

Expected: exactly one match, on the same row as `orphaned plans whose related spec is complete`, with the three `Auto-apply` cells still present and unchanged.

- [ ] **Step 7: Fix the stale `/tidy` relationship row in `docs/skill-graph.md`**

Read the current row:

```bash
grep -n "does not currently scan ledger files" docs/skill-graph.md
```

Expected current row (line ~323):

```
| `/tidy` | `/ledger` creates the per-feature ledger files at `docs/plans/*-ledger.md`, consumed by `/build`, `/test`, `/review`, `/wrap-up`, and `/flow` during a pipeline run, and deleted at `/wrap-up`'s Phase 4 execution step on successful completion. `/tidy` does not currently scan ledger files — no step in `tidy/scan-procedures.md` reads `docs/plans/*-ledger.md`, so a stale or orphaned ledger left by a pipeline that never reached wrap-up is not surfaced by a `/tidy` sweep today. Known gap. |
```

Replace it with:

```
| `/tidy` | `/ledger` creates the per-feature ledger files at `docs/plans/*-ledger.md`, consumed by `/build`, `/test`, `/review`, `/wrap-up`, and `/flow` during a pipeline run, and deleted at `/wrap-up`'s Phase 4 execution step on successful completion. `/tidy` Step 4 also globs `docs/plans/*-ledger.md` (`tidy/scan-procedures.md`) and surfaces a `[ledger]` finding for any ledger whose matching pipeline run directory is absent from `.claude-tweaks/pipelines/` (or present only under `archive/`) — a pipeline that never reached wrap-up no longer leaves its ledger permanently invisible. |
```

- [ ] **Step 8: Verify the `skill-graph.md` edit landed correctly**

```bash
grep -n "does not currently scan ledger files" docs/skill-graph.md
grep -n "also globs .docs/plans/\*-ledger.md." docs/skill-graph.md
```

Expected: the first command finds nothing (the stale "Known gap" sentence is gone); the second finds exactly one match, on the `/tidy` row.

- [ ] **Step 9: Resolve the three confirmed-orphaned ledgers (spec's Deliverables, first-pass cleanup)**

Re-verify each still has no matching pipeline run directory (nothing should have changed since the spec was shaped, but re-verify per `_shared/reverify-before-write.md`'s discipline rather than trusting the spec's snapshot):

```bash
find .claude-tweaks/pipelines -maxdepth 1 -iname "*390*" -o -iname "*392*" -o -iname "*422*"
```

Expected: no output (still no matching run directory anywhere, including `archive/`). If this now prints a match for any of the three, drop that one file from this step — its pipeline reappeared or was archived — and only delete the remaining confirmed-orphaned ones.

Delete the confirmed orphans:

```bash
git rm docs/plans/2026-08-14-392-delete-consumerless-code-ledger.md docs/plans/2026-08-14-record-390-ledger.md docs/plans/2026-08-14-record-422-ledger.md
```

- [ ] **Step 10: Verify the deletion staged correctly**

```bash
git status --short docs/plans/
```

Expected: three `D  docs/plans/...` lines, one per deleted file, and nothing else under `docs/plans/` staged.

- [ ] **Step 11: Run the full test suite**

```bash
npm test 2>&1 | tail -40
```

Expected: no new failures introduced by this change (any failures present before this task started, per a baseline `git stash`-free re-run in isolation, are pre-existing and out of scope — see CLAUDE.md's flake-tolerance note).

- [ ] **Step 12: Commit**

```bash
git add plugin/skills/tidy/scan-procedures.md plugin/skills/tidy/SKILL.md plugin/skills/tidy/step-6-auto.md docs/skill-graph.md
git commit -m "Add /tidy scan step for orphaned docs/plans/*-ledger.md files (#113)"
```

The three `git rm` deletions from Step 9 are already staged — this commit includes them alongside the prose changes in one commit (the deletions are this record's own "first pass" Deliverable, not a separate concern).
