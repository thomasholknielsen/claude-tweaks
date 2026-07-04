# Wrap-Up Cleanup Procedures

Canonical home for the wrap-up cleanup enumeration. Loaded by `/claude-tweaks:wrap-up` Step 5 (planning), Step 9 (summary checklist), Step 10 (execution), and by `review-console.md` (Section 6 of the Review Console). All four call sites reference this list — do NOT duplicate the table inline elsewhere.

## Canonical cleanup list

Eight cleanup actions, executed in order (Step 10) and surfaced together (Step 5, Step 9, Review Console):

| # | Cleanup | Procedure ref | Condition | Deferred under `MULTISPEC_REVIEW_DEFER=1`? |
|---|---------|---------------|-----------|--------------------------------------------|
| 1 | Execution plans | Delete plan files in `docs/superpowers/plans/` and `~/.claude/plans/` related to this spec. (Design docs `*-design.md` in `docs/superpowers/specs/` should already be gone — `/specify` deletes them. If any remain, delete now.) | spec-based work | No (idempotent — leave to per-spec wrap-up) |
| 2 | Open items ledger | Delete via `/ledger`'s delete operation, only after Step 8.5 confirms zero open items | ledger exists | No (idempotent) |
| 3 | Design wrapper caches | Section A below — delete `*-audit.json`, `*-recommendations.json`, `*-declined.json` in `docs/plans/` | design wrapper active | **Yes — defer to parent `/flow` console** |
| 4 | Pipeline run directory | Section B below — archive (do not delete) to `.claude-tweaks/pipelines/archive/{run-id}/` | run dir exists | **Yes — parent `/flow` owns archival** |
| 5 | Git worktree | Section C below — complete feature branch via `/superpowers:finishing-a-development-branch`, then remove worktree + delete merged branch | worktree strategy | **Yes — defer to parent `/flow` console** |
| 6 | Spec lifecycle (file + INDEX) | Delete the spec file (if 100% complete) or update its status; update `specs/INDEX.md` (remove completed entries) | spec-based work | No (idempotent — the spec being deleted does not interact with parent multi-spec archival) |
| 7 | Ephemeral dev server | Section D below — kill the auto-started dev server tracked in `{run-id}/ephemeral-server.txt` | `ephemeral-server.txt` exists | **Yes — server stays up across specs; parent `/flow` kills it once after the consolidated console** |
| 8 | Issue claim release | Section E below — release `refs/claims/issue-{n}` for each spec with `recon-issue:` frontmatter | spec frontmatter has `recon-issue:` | **Yes — defer to parent `/flow` console** (release follows the merge decision; releasing before the consolidated console would let another agent grab the issue while the work sits unmerged) |

The detailed procedures for items 3–5, 7, and 8 follow. Items 1, 2, and 6 are simple enough to execute inline at Step 10 without a sub-procedure.

## Multi-spec defer behavior

Under `MULTISPEC_REVIEW_DEFER=1`, Step 10 SKIPS state-changing cleanups marked "Yes" in the table above (items 3, 4, 5, 7, and 8). Those defer to `/flow`'s consolidated multi-spec Review Console at end-of-run. Items 1, 2, and 6 still execute — they are idempotent and do not interfere with parent-orchestrated cleanup of design caches, run dirs, or worktrees.

The full list of Step 10's deferred-under-MULTISPEC actions:

- Item 3 (Design caches) — parent /flow owns design-cache archival across all specs
- Item 4 (Pipeline run dir archival) — parent /flow archives the multi-spec parent dir after consolidated console
- Item 5 (Worktree removal) — parent /flow handles worktree teardown after consolidated console approves cross-spec changes
- Item 7 (Ephemeral dev server) — the auto-started server is shared across all specs in the run; parent /flow kills it once after the consolidated console (killing it per-spec would force every later spec's visual review to restart it)
- Item 8 (Issue claim release) — parent /flow releases all claims once, after the consolidated console and worktree merge decide each spec's outcome

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
3. **Mark the run terminal** — before archiving, run `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" close-run --run "$RUN_DIR"` so close-run lifts E1 enforcement (clears the worktree assignment and marks the run clean). E2/E3 logging for that run stops at close-run too — a terminal (clean) run is no longer resolved by the hook dispatcher, so no further events get appended. Archival (step 4) is bookkeeping that moves the directory for the audit trail — it is not the logging cutoff.
4. Move the run directory to `.claude-tweaks/pipelines/archive/{run-id}/` — this preserves the audit trail (`decisions.md`, `config.yml`, and any skipped staged items) for future reference.
5. Skipped staged items remain in the archive; they are NOT silently dropped.

Do NOT delete the run directory outright — the auto-decision log is project history (for the user's calibration of project policy), not pipeline state.

If no pipeline run directory exists (interactive mode, or pre-v4.6 pipeline), skip this section silently.

---

## C. Git Worktree (worktree strategy only)

If the build used worktree git strategy, clean up the worktree directory:

1. Run `git worktree list` to find worktrees associated with this spec's feature branch.
2. Verify the feature branch was completed (merged, PR created, or discarded) via `/superpowers:finishing-a-development-branch`:
   - **Already completed** → proceed to step 3.
   - **Not completed** → run `/superpowers:finishing-a-development-branch` now (do not stop and ask the user to run it separately). Present the merge/PR/discard options as the skill normally would. After the branch is completed, proceed to step 3.
   When any spec on the branch carries `recon-issue:` frontmatter, the merge artifact must
   carry the closing keywords (see "Close-via-merge" in `_shared/issue-claims.md`): pass
   `Fixes #{issue}` lines — one per issue — in the PR body (PR option) or the merge commit
   message (merge option). The user's merge/push closes the issues; the agent never runs
   `gh issue close`.
3. Remove the worktree: `git worktree remove {path}`.
4. If the branch was merged (not kept for PR), delete it: `git branch -d {branch}`.

If no worktree exists for this spec, skip this section silently.

---

## D. Ephemeral dev server (v4.11.0)

If `/visual-review` or `/stories` auto-started a dev server during this run (`dev-url-detection.md` "Ephemeral server start"), it recorded the PID, port, and worktree root in `{run-dir}/ephemeral-server.txt`.

1. **Multi-spec defer check:** if `MULTISPEC_REVIEW_DEFER=1` is set, **skip this section** — the server is shared across all specs in the run. The parent `/flow` kills it once after the consolidated Review Console (otherwise each later spec's visual review would have to restart it).
2. Read `{run-dir}/ephemeral-server.txt`. Stop the process: `kill {pid}` (fall back to `lsof -ti tcp:{port} | xargs kill` if the PID is stale).
3. Confirm the port is free, then delete `ephemeral-server.txt`.

This only stops servers *this pipeline started*. A dev server the user was already running (or one on the main checkout) is never touched — it was never recorded in `ephemeral-server.txt`.

If no `ephemeral-server.txt` exists, skip this section silently (the run used an already-running server, or visual review degraded to code-only).

---

## E. Issue claim release (v5.3.0)

If the spec's frontmatter carries `recon-issue: <n>` (stamped by `/flow --from-recon` spec
derivation), the pipeline holds `refs/claims/issue-<n>` per `_shared/issue-claims.md`.
Release it only after the branch outcome is known (item 5 completes first — the execution
order of the canonical list guarantees this):

1. **Multi-spec defer check:** if `MULTISPEC_REVIEW_DEFER=1`, skip this section — the parent
   `/flow` releases all claims once after its consolidated Review Console and merge.
2. Map the outcome from `/superpowers:finishing-a-development-branch` to a release reason:
   merged → `merged: spec {spec}`; PR opened → `pr-opened: spec {spec}`; discarded →
   `abandoned: spec {spec}`.
3. **Ownership check (per `_shared/issue-claims.md`, "Release triggers").** Fetch the issue's
   comments and fold through `claimStatus`. If `claim.runId` is not this run's `$RUN_ID`, a
   successor holds the lock — skip the delete AND the comment, log
   `AUTO — skipped release of issue #{issue}: claim held by run {claim.runId}`, and continue.
4. Generate the release comment with `releasePayload`, delete the ref, post the comment:

   ```bash
   node -e "const c=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/issues/claims.js');
     console.log(c.releasePayload({issueNumber:Number(process.argv[1]),runId:process.argv[2],
     reason:process.argv[3],link:process.argv[4]||undefined,now:Date.now()}).commentBody)" \
     "$ISSUE" "$RUN_ID" "$REASON" "$LINK" \
     > "${RUN_DIR}/release-${ISSUE}.md"
   gh api -X DELETE "repos/{owner}/{repo}/git/refs/claims/issue-${ISSUE}"
   gh issue comment "$ISSUE" --body-file "${RUN_DIR}/release-${ISSUE}.md"
   ```

5. A 404/422 from the ref delete means the claim was already released or swept — log it and
   still post the release comment (the comment trail should record the outcome). Any other
   failure: retry once, then log and continue — TTL is the backstop, never block wrap-up.
6. Log each release to `decisions.md` (status `AUTO`, reason string as detail).

If no spec has `recon-issue:` frontmatter, skip silently.
