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

**Item 1's `spec-based work` condition is deliberate, not an oversight, for conversation-based work** (brainstorm → `/superpowers:writing-plans` → `/superpowers:subagent-driven-development`, no `/specify` involved — see `/claude-tweaks:wrap-up` Step 1's work-context table). With no spec file, the execution plan under `docs/superpowers/plans/` is the only durable record of what was built and why — deleting it would leave nothing behind. Leave these plans in place; do not delete them just because the work is done.

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

**Not included in this cleanup:** `.claude-tweaks/design/score-history.jsonl` — the persistent, cross-run design-score history log written by `/claude-tweaks:design review`'s score capture (`skills/design/modes/review.md` Step 4.5). Unlike the per-spec caches above, it is committed to git and accumulates across every spec's review run by design. Never delete, truncate, or reset it as part of wrap-up cleanup or any other skill's cleanup procedure — doing so destroys the trend this log exists to provide.

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
2. **Stamp the closing-keyword carrier commit.** When any spec on the branch carries
   `recon-issue:` frontmatter, and *before* handing off to
   `/superpowers:finishing-a-development-branch`, commit an empty carrier commit on the feature
   branch from inside the worktree:

   ```bash
   git commit --allow-empty -m "$(printf 'Fixes #%s\n' "${ISSUES[@]}")"
   ```

   One `Fixes #{issue}` line per resolved issue on the branch. Skip if a carrier commit for
   these issues already exists on the branch (`git log {branch} --grep="Fixes #{issue}"` —
   avoids duplicate empty commits if this step re-runs after an interruption).

   **Why a dedicated commit, not the merge artifact:** `/superpowers:finishing-a-development-branch`'s
   own git mechanics give the closing keyword no reliable home otherwise. Its "Merge locally"
   option runs a bare `git merge <feature-branch>` with no `--no-ff` — git fast-forwards
   silently whenever possible, producing **no merge commit at all** to carry a message into.
   Its "Push and Create PR" option only runs `git push` — it never calls `gh pr create`, so
   there is no PR body either. Stamping the feature branch itself sidesteps both: the keyword
   travels with the branch regardless of which of the four options gets chosen (fast-forward
   merge, non-ff merge, push+PR — even one the user creates manually afterward — or
   keep-as-is), because GitHub scans every commit that reaches the default branch, not just a
   merge commit or PR body. See "Close-via-merge" in `_shared/issue-claims.md` for the full
   contract, including the multi-terminal parallel path (`flow/worktree-merge.md`), which
   performs its own merge directly with `--no-ff` and does not need this carrier commit.
3. Verify the feature branch was completed (merged, PR created, or discarded) via `/superpowers:finishing-a-development-branch`:
   - **Already completed** → proceed to step 4.
   - **Not completed** → run `/superpowers:finishing-a-development-branch` now (do not stop and ask the user to run it separately). Present the merge/PR/discard options as the skill normally would, unmodified — step 2's carrier commit already guarantees closure regardless of which option is chosen, so this skill's own literal git commands need no adaptation. After the branch is completed, proceed to step 4.
   In `current-branch` mode (no worktree, no branch finish) there is no feature branch to stamp
   — the carrier is the final wrap-up commit message instead: include the same
   `Fixes #{issue}` lines there; GitHub closes the issues when that commit reaches the default
   branch (the operative instruction lives in wrap-up SKILL.md Step 10's commit procedure,
   since Section C is skipped when no worktree exists).
4. Remove the worktree: `git worktree remove {path}`.
5. If the branch was merged (not kept for PR), delete it: `git branch -d {branch}`.

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

If the spec's frontmatter carries `recon-issue: <n>` (stamped by `/specify`'s issue-ingestion
path — either invoked directly on an issue reference, or via `/claude-tweaks:flow #{issue}`'s
hand-off, which itself calls `/specify #{issue}`), the pipeline holds `refs/claims/issue-<n>`
per `_shared/issue-claims.md`.
Release it only after the branch outcome is known (item 5 completes first — the execution
order of the canonical list guarantees this):

1. **Multi-spec defer check:** if `MULTISPEC_REVIEW_DEFER=1`, skip this section — the parent
   `/flow` releases all claims once after its consolidated Review Console and merge.
2. Map the outcome from `/superpowers:finishing-a-development-branch` to a release reason:
   merged → `merged: spec {spec}`; PR opened → `pr-opened: spec {spec}`; discarded →
   `abandoned: spec {spec}`. Set `$LINK` to the merge commit sha/URL (merged), the PR URL
   (pr-opened), or empty (abandoned).
   In `current-branch` mode (no branch finish): the reason is `merged: spec {spec}` and
   `$LINK` is the final wrap-up commit sha — and that wrap-up commit's MESSAGE must carry the
   closing keywords (one `Fixes #{issue}` line per resolved issue; see Section C's carrier
   note). This applies per spec's own wrap-up commit in multi-spec current-branch runs.
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
6. **Remove the tier label** when the outcome was `merged:` or `pr-opened:` and the issue
   carries `status:approved` or `status:fast-track`: `gh issue edit "$ISSUE" --remove-label status:approved`
   (or `status:fast-track`, whichever is present) (reversible; log to `decisions.md`). Leave
   the label on `abandoned:` — it is the standing retry request. Skip silently when no tier
   label is present.
7. **Remove `status:in-progress`; restore `parked` if applicable.** Always remove
   `status:in-progress` (`gh issue edit "$ISSUE" --remove-label status:in-progress`) —
   best-effort, log a warning and continue on failure. Then, only when the outcome reason is
   `abandoned: spec {spec}` (i.e. NOT `merged:`/`pr-opened:`) AND the spec's frontmatter carries
   `recon-was-parked: true`: restore `parked` — bootstrap the label if missing (same
   check-then-create pattern as `backlog`), then `gh issue edit "$ISSUE" --add-label parked`.
   Skip restoration silently when `recon-was-parked` is absent, or when the outcome was
   `merged:`/`pr-opened:` (the spec shipped or is under review — the issue should stay
   unparked). Best-effort — on failure, log a warning and continue; `/tidy` Step 4.7's backstop
   check catches a restoration that silently failed.
8. Log each release, `status:in-progress` removal, and `parked` restoration to `decisions.md`
   (status `AUTO`, reason string as detail).

If no spec has `recon-issue:` frontmatter, skip silently.
