# Wrap-Up Cleanup Procedures

Loaded by `/claude-tweaks:wrap-up` Step 5. Each procedure is independent; all run sequentially.

This file contains three cleanup procedures executed in order:

- **A. Design wrapper caches** — silent cleanup of per-spec caches written by `/claude-tweaks:design`.
- **B. Pipeline run directory** — archive on success, leave for inspection on failure (multi-spec defer aware).
- **C. Worktree** — merge handoff to `/superpowers:finishing-a-development-branch`, worktree removal, branch deletion.

Two unrelated cleanups (Execution Plans and Open Items Ledger) are simple enough to remain inline in SKILL.md Step 5; they execute before this file's procedures run.

---

## A. Design wrapper caches (v4.5.0)

Delete the per-spec caches written by `/claude-tweaks:design` alongside the ledger:

- `docs/plans/YYYY-MM-DD-{feature}-audit.json` — written by `review` mode; consumed by `polish`. Stale after the spec ships.
- `docs/plans/YYYY-MM-DD-{feature}-recommendations.json` — written by `survey` mode (via `/flow` pipeline summary). Used to detect declines on re-runs; obsolete once the spec is wrapped up.
- `docs/plans/YYYY-MM-DD-{feature}-declined.json` — written by `/flow` decline detection. Obsolete once the spec is wrapped up.

Resolve each path using the same date+feature prefix as the ledger filename. Glob `docs/plans/*-audit.json`, `*-recommendations.json`, and `*-declined.json` matching the spec slug as a fallback when the ledger filename is unavailable. Missing files are not errors — they mean the spec did not exercise the corresponding mode.

Cleanup is silent — no user prompt. The caches are pipeline state, not user-authored content. Resolves the Phase 2 carry-over open item flagged in `skills/design/SKILL.md` (audit cache cleanup); recommendations + declined caches use the same pattern.

---

## B. Pipeline run directory (v4.6.0)

If a pipeline run directory exists for this work (see `_shared/pipeline-run-dir.md` for the resolution order and bash snippet):

1. **Multi-spec defer check:** if `MULTISPEC_REVIEW_DEFER=1` is set, **skip this section entirely**. The parent `/flow` orchestration owns archival of the multi-spec parent dir after its consolidated Review Console completes. The per-spec subdirectory stays in place under the parent.
2. Verify the Review Console (Step 8.6) ran and applied/dismissed all staged items.
3. Move the run directory to `.claude-tweaks/pipelines/archive/{run-id}/` — this preserves the audit trail (`decisions.md`, `config.yml`, and any skipped staged items) for future reference.
4. Skipped staged items remain in the archive; they are NOT silently dropped.

Do NOT delete the run directory outright — the auto-decision log is project history (for the user's calibration of project policy), not pipeline state.

If no pipeline run directory exists (interactive mode, or pre-v4.6 pipeline), skip this section silently.

---

## C. Git Worktree (worktree strategy only)

If the build used worktree git strategy, clean up the worktree directory:

1. Run `git worktree list` to find worktrees associated with this spec's feature branch.
2. Verify the feature branch was completed (merged, PR created, or discarded) via `/superpowers:finishing-a-development-branch`:
   - **Already completed** → proceed to step 3.
   - **Not completed** → run `/superpowers:finishing-a-development-branch` now (do not stop and ask the user to run it separately). Present the merge/PR/discard options as the skill normally would. After the branch is completed, proceed to step 3.
3. Remove the worktree: `git worktree remove {path}`.
4. If the branch was merged (not kept for PR), delete it: `git branch -d {branch}`.

If no worktree exists for this spec, skip this section silently.
