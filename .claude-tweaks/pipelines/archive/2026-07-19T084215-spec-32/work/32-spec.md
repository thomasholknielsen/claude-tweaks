---
record: 32
origin: capture
risk: medium
effort: medium
grants: []
surface: backend
---
Surface: backend

## Current State

`wrap-up/cleanup-procedures.md`'s canonical cleanup list executes item 4 (Git Worktree, Section C) *before* item 8 (Pipeline run directory, Section B) — Section C's own step 4 runs `git worktree remove {path}` well before Section B's archival step ever runs. Under `worktree.always`, `$RUN_DIR` (`config.yml`, `decisions.md`, `events.jsonl`, `staged/`) is created *inside* the worktree (per this project's own CLAUDE.md note on `materialize.md`'s worktree-first adaptation) and is gitignored — only the `work/` subdirectory (materialized record files) is git-tracked and survives via commit + merge. `git worktree remove` deletes the entire worktree filesystem tree, taking every gitignored `$RUN_DIR` file with it. Section B's archival step (`Move the run directory to .claude-tweaks/pipelines/archive/{run-id}/`) never gets a chance to run against a live `$RUN_DIR` for worktree-strategy runs, because by the time item 8 executes, item 4 has already deleted it.

The canonical list's own stated "Ordering rule: pipeline run directory archival (item 8) is always last" addresses a *different* concern (items 4/6/7 need to read `$RUN_DIR` before archival relocates it) — it says nothing about item 4's own worktree-*removal* sub-step destroying `$RUN_DIR`'s gitignored content before item 8 (or anything else) can copy it out.

**Directly reproduced live** while wrapping up record #14 in this same session: ran Section B's archival (`git mv` for `work/`, plain `mv` for `config.yml`/`decisions.md`/`events.jsonl`/`staged/`) entirely *inside* the worktree, fast-forwarded `main`, then removed the worktree per Section C step 4. Confirmed after removal: `config.yml`, `decisions.md`, `events.jsonl`, and `staged/` were gone from `.claude-tweaks/pipelines/archive/2026-07-19T074028-spec-14/` in the main checkout — only `work/14-spec.md` survived (git-tracked, merged before removal). Exactly the failure mode this record describes, reproduced with a fresh timestamp, independent of the original #18/#19 incident.

## Deliverables

- Add a step to `cleanup-procedures.md` Section C, immediately before its existing step 4 (`git worktree remove {path}`): copy `$RUN_DIR`'s gitignored contents (`config.yml`, `decisions.md`, `events.jsonl`, `staged/`) out to the **main checkout's** `.claude-tweaks/pipelines/archive/{run-id}/` path — not the worktree's own copy of that path, which would be destroyed by the same removal. Resolve the main checkout root from inside the worktree via `git rev-parse --git-common-dir` (strip the trailing `/.git`) — the same resolution mechanism this project's own CLAUDE.md already documents elsewhere for worktree-vs-main-checkout path resolution. Use a plain `cp -r` via Bash (not the `Write`/`Edit` tool, not `git commit`) — per this project's own `worktree.always` PreToolUse gate, only `Edit`/`Write`/`NotebookEdit`/`git commit` are denied in the main checkout; a raw filesystem copy is not gated.
- Update Section B (item 8) to reflect the split: for worktree-strategy runs, the gitignored-content copy already landed in the main checkout via Section C's new pre-removal step — Section B's remaining job is to `git mv` the merged `work/` subdirectory into the same archive path (this naturally happens in the main checkout, after the branch merges) and confirm the pre-copied gitignored files are present alongside it. For `current-branch` mode (no worktree, no premature-deletion risk), Section B performs the original full move procedure unchanged.
- Update the canonical list's "Ordering rule" note (top of the file) to state both halves explicitly: item 8 must not run *before* items 4/6/7 finish reading `$RUN_DIR` (existing rule), AND item 4's own worktree-removal sub-step must not destroy `$RUN_DIR`'s gitignored content before it's copied out (the new rule this fix adds).

## Acceptance Criteria

- A worktree-strategy wrap-up run's `config.yml`, `decisions.md`, `events.jsonl`, and `staged/*` (when non-empty) are present in the main checkout's `.claude-tweaks/pipelines/archive/{run-id}/` after the run completes and the worktree is removed — verified by an end-to-end run (build a small test record, wrap it up with worktree strategy, inspect the archive path in the main checkout after completion).
- Re-running this record's own reproduction scenario (archive inside the worktree, merge, remove the worktree) no longer loses `config.yml`/`decisions.md`/`events.jsonl`/`staged/` — the fixed procedure's pre-removal copy step must be exercised, not just the existing (destructive) archival step.
- `current-branch` mode wrap-up runs are unaffected — no worktree exists, so Section B's original procedure still applies unchanged; confirm no regression via a `current-branch` mode wrap-up run.
- The updated Section C step correctly resolves the main checkout root when run from a nested worktree path (`git rev-parse --git-common-dir` stripped of `/.git`) — verify against this project's own worktree layout (`.claude/worktrees/{name}`).

## Technical Approach

### Key Files

- `skills/wrap-up/cleanup-procedures.md` — Section C (new pre-removal copy step, before existing step 4), Section B (updated to reflect the split responsibility), and the canonical list's "Ordering rule" note at the top of the file.

Resolve `$RUN_ID` the same way Section E already does (`RUN_ID="${CLAIM_RUN_ID:-$(basename "$PIPELINE_RUN_DIR")}"` — reuse, don't reinvent) for the archive destination path.

## Gotchas

- Don't just reorder item 8 before item 4 wholesale — item 8 running too early breaks items 4/6/7's own reads of `$RUN_DIR` (the materialized header, `ephemeral-server.txt`), which is exactly what the existing "ordering rule" note already protects against. The fix is a targeted pre-removal copy inside Section C, not a full reorder.
- The git-tracked `work/` subdirectory does NOT need this treatment — it already survives worktree removal via commit + merge, which is why only the four gitignored paths (`config.yml`, `decisions.md`, `events.jsonl`, `staged/`) need the new copy step.
- Confirm the `cp -r` genuinely isn't gated by the `worktree.always` PreToolUse hook before relying on it — this record's Current State cites the documented gate scope (`Edit`/`Write`/`NotebookEdit`/`git commit` only) but the actual implementer should re-verify against `bin/lib/hooks/pre-tool-use.js` directly rather than trust this record's restatement.
- `MULTISPEC_REVIEW_DEFER=1` runs defer item 4 (worktree removal) to the parent `/flow`'s consolidated console entirely — this fix's pre-removal copy step should apply wherever the *parent* `/flow` orchestration ultimately calls worktree removal too, not just the per-spec Section C path.

## Original request

wrap-up's run-dir archival can still delete decisions.md before it's copied, despite the CLAUDE.md note

**Related:** none

Context: #18's dispatch run hit worktree.always forcing the run-dir to live inside the worktree, and correctly did cp before worktree-remove, documenting the order as a CLAUDE.md Don't bullet. #19's run (minutes later, same repo, CLAUDE.md already updated) removed the worktree before archiving anyway, permanently losing that run's decisions.md/config.yml. A prose note in CLAUDE.md was not enough to prevent the same ordering mistake on the very next run.

Scope: wrap-up/cleanup-procedures.md Section B needs the correct order (archive-copy, then remove) written as the literal executable step under worktree.always, not left as a CLAUDE.md cross-reference a future run has to remember to apply.
