# Wrap-Up Cleanup Procedures

Canonical home for the wrap-up cleanup enumeration. Loaded by `/claude-tweaks:wrap-up` Step 5 (planning), Step 9 (summary checklist), Step 10 (execution), and by `review-console.md` (Section 7 of the Review Console). All four call sites reference this list — do NOT duplicate the table inline elsewhere.

## Canonical cleanup list

Eight cleanup actions, executed in order (Step 10) and surfaced together (Step 5, Step 9, Review Console). **Ordering rule, first half: pipeline run directory archival (item 8) is always last.** Items 4, 6, and 7 read or write files under `$RUN_DIR` — the worktree/carrier-commit check reads the materialized header from `${RUN_DIR}/work/`, the ephemeral-server teardown reads `${RUN_DIR}/ephemeral-server.txt`, and the issue claim release reads the same materialized header again — and once the run directory is archived none of those paths resolve any more. State this as an unconditional rule, not a closed list: any future cleanup item that reads or writes `$RUN_DIR` belongs before item 8 too, not just the three named here.

**Ordering rule, second half: item 4's own worktree-removal sub-step must not destroy `$RUN_DIR`'s gitignored content before it's copied out.** Under `worktree.always`, `$RUN_DIR` lives inside the worktree; `git worktree remove` (Section C step 5) deletes the entire worktree filesystem tree, including `config.yml`/`decisions.md`/`events.jsonl`/`staged/` (gitignored — only `work/` is git-tracked and survives via commit + merge). Item 8's own archival step runs too late to prevent this on its own, since item 4 already completed by the time item 8 runs. Section C therefore copies `$RUN_DIR`'s gitignored content out to the main checkout *before* its own worktree-removal sub-step (see Section C step 4) — item 8 (Section B) then only needs to `git mv` the already-merged `work/` subdirectory into the same archive path and confirm the pre-copied gitignored files are already there.

| # | Cleanup | Procedure ref | Condition | Deferred under `MULTISPEC_REVIEW_DEFER=1`? |
|---|---------|---------------|-----------|--------------------------------------------|
| 1 | Execution plans | Delete plan files in `docs/superpowers/plans/` and `~/.claude/plans/` related to this spec. (Design docs `*-design.md` in `docs/superpowers/specs/` should already be gone — `/specify` deletes them. If any remain, delete now.) | spec-based work | No (idempotent — leave to per-spec wrap-up) |
| 2 | Open items ledger | Delete via `/ledger`'s delete operation, only after Step 8.5 confirms zero open items | ledger exists | No (idempotent) |
| 3 | Design wrapper caches | Section A below — delete `*-audit.json`, `*-recommendations.json`, `*-declined.json` in `docs/plans/` | design wrapper active | **Yes — defer to parent `/flow` console** |
| 4 | Git worktree | Section C below — complete feature branch via `/superpowers:finishing-a-development-branch`, then remove worktree + delete merged branch | worktree strategy | **Yes — defer to parent `/flow` console** |
| 5 | Record/spec lifecycle | Record mode, `work-backend: github-issues`: no-op — closure is close-via-merge (items 4 and 7 stamp the carrier commit and release the claim). Record mode, `work-backend: local-files`: on 100% completion (confirmed by `/claude-tweaks:review`), call `closeRecord(path)` (`bin/lib/issues/local-store.js`) on the record's file and commit — the record stays on disk as history, excluded from `queryRecords`' default results. Legacy spec-file alias (no materialized header): unchanged pre-materialization behavior — delete the spec file (if 100% complete) or update its status; update `specs/INDEX.md` (remove completed entries) | spec-based work | No (idempotent — does not interact with parent multi-spec archival either way) |
| 6 | Ephemeral dev server | Section D below — kill the auto-started dev server tracked in `{run-id}/ephemeral-server.txt` | `ephemeral-server.txt` exists | **Yes — server stays up across specs; parent `/flow` kills it once after the consolidated console** |
| 7 | Issue claim release | Section E below — release `refs/claims/issue-{n}` for the spec's materialized header | materialized header present (`${RUN_DIR}/work/*-spec.md`) | **Yes — defer to parent `/flow` console** (release follows the merge decision; releasing before the consolidated console would let another agent grab the issue while the work sits unmerged) |
| 8 | Pipeline run directory | Section B below — archive (do not delete) to `.claude-tweaks/pipelines/archive/{run-id}/` | run dir exists | **Yes — parent `/flow` owns archival** |

The detailed procedures for items 3, 4, 6, 7, and 8 follow — see each row's Procedure ref column for its Section letter. Items 1, 2, and 5 are simple enough to execute inline at Step 10 without a dedicated sub-procedure.

**Item 5's three framings, in one line each.** A record-mode run under `github-issues` has no legacy spec file to delete and no `specs/INDEX.md` entry to remove — the record's own lifecycle closes via the merge/PR/commit that carries `Fixes #{issue}` (items 4 and 7), a wrap-up-owned label/claim operation, not a file deletion. A record-mode run under `local-files` has a real file to close (there is no GitHub issue whose own closed state does this job) — `closeRecord` marks it `closed: true` in place, mirroring GitHub's closed-not-deleted semantics, then this step commits the change (a local-files record is a tracked file, unlike a GitHub issue edit). A legacy spec-file-mode run (the numeric alias, no materialized header) keeps the pre-materialization behavior verbatim. Migrating a project's remaining `specs/*.md` files off the legacy alias entirely is a one-time, project-level concern outside wrap-up's per-run scope — not something this step performs.

## Multi-spec defer behavior

Under `MULTISPEC_REVIEW_DEFER=1`, Step 10 SKIPS state-changing cleanups marked "Yes" in the table above (items 3, 4, 6, 7, and 8). Those defer to `/flow`'s consolidated multi-spec Review Console at end-of-run. Items 1, 2, and 5 still execute — they are idempotent and do not interfere with parent-orchestrated cleanup of design caches, run dirs, or worktrees.

The full list of Step 10's deferred-under-MULTISPEC actions:

- Item 3 (Design caches) — parent /flow owns design-cache archival across all specs
- Item 4 (Worktree removal) — parent /flow handles worktree teardown after consolidated console approves cross-spec changes
- Item 6 (Ephemeral dev server) — the auto-started server is shared across all specs in the run; parent /flow kills it once after the consolidated console (killing it per-spec would force every later spec's visual review to restart it)
- Item 7 (Issue claim release) — parent /flow releases all claims once, after the consolidated console and worktree merge decide each spec's outcome
- Item 8 (Pipeline run dir archival) — parent /flow archives the multi-spec parent dir after consolidated console

---

## A. Design wrapper caches (v4.5.0)

Delete the per-spec caches written by `/claude-tweaks:design-wrapper` alongside the ledger:

- `docs/plans/YYYY-MM-DD-{feature}-audit.json` — written by `review` mode; consumed by `polish`. Stale after the spec ships.
- `docs/plans/YYYY-MM-DD-{feature}-recommendations.json` — written by `survey` mode (via `/flow` pipeline summary). Used to detect declines on re-runs; obsolete once the spec is wrapped up.
- `docs/plans/YYYY-MM-DD-{feature}-declined.json` — written by `/flow` decline detection. Obsolete once the spec is wrapped up.

Resolve each path using the same date+feature prefix as the ledger filename. Glob `docs/plans/*-audit.json`, `*-recommendations.json`, and `*-declined.json` matching the spec slug as a fallback when the ledger filename is unavailable. Missing files are not errors — they mean the spec did not exercise the corresponding mode.

Cleanup is silent — no user prompt. The caches are pipeline state, not user-authored content. Resolves the Phase 2 carry-over open item flagged in `skills/design-wrapper/SKILL.md` (audit cache cleanup); recommendations + declined caches use the same pattern.

**Not included in this cleanup:** `.claude-tweaks/design/score-history.jsonl` — the persistent, cross-run design-score history log written by `/claude-tweaks:design-wrapper review`'s score capture (`skills/design-wrapper/modes/review.md` Step 4.5). Unlike the per-spec caches above, it is committed to git and accumulates across every spec's review run by design. Never delete, truncate, or reset it as part of wrap-up cleanup or any other skill's cleanup procedure — doing so destroys the trend this log exists to provide.

---

## B. Pipeline run directory (v4.6.0)

If a pipeline run directory exists for this work (see `_shared/pipeline-run-dir.md` for the resolution order and bash snippet):

1. **Multi-spec defer check:** if `MULTISPEC_REVIEW_DEFER=1` is set, **skip this section entirely**. The parent `/flow` orchestration owns archival of the multi-spec parent dir after its consolidated Review Console completes. The per-spec subdirectory stays in place under the parent.
2. Verify the Review Console (Step 8.6) ran and applied/dismissed all staged items.
3. **Mark the run terminal** — before archiving, run `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" close-run --run "$RUN_DIR"` so close-run lifts E1 enforcement (clears the worktree assignment and marks the run clean). E2/E3 logging for that run stops at close-run too — a terminal (clean) run is no longer resolved by the hook dispatcher, so no further events get appended. Archival (step 4) is bookkeeping that moves the directory for the audit trail — it is not the logging cutoff.
4. **Move the `work/` subdirectory** to `.claude-tweaks/pipelines/archive/{run-id}/work/` — the materialized record files (`materialize.md`'s "committed as audit trail, never gitignored" contract) are git-tracked, unlike the rest of the run directory: move it with `git mv` (mandatory — the archive path itself is gitignored, so a plain `mv` + `git add` is rejected and the tracked files would register as deletions; `git mv` preserves the tracked rename regardless of the ignore rule).
5. **Gitignored content** (`config.yml`, `decisions.md`, `events.jsonl`, `staged/`): **worktree-strategy runs** — already copied to this same archive path by Section C's pre-removal copy step (Section C step 4, which runs *before* the worktree is removed); confirm the files are present here, do not re-move them — the worktree they would move *from* no longer exists by the time this step runs. **`current-branch` mode** (no worktree ever existed to lose them to) — move them here directly with a plain `mv`, same destination as `work/`'s but without `git mv` since they were never tracked.
6. Skipped staged items remain in the archive; they are NOT silently dropped.

Do NOT delete the run directory outright — the auto-decision log is project history (for the user's calibration of project policy), not pipeline state.

If no pipeline run directory exists (interactive mode, or pre-v4.6 pipeline), skip this section silently.

---

## C. Git Worktree (worktree strategy only)

If the build used worktree git strategy, clean up the worktree directory:

1. Run `git worktree list` to find worktrees associated with this spec's feature branch.
2. **Stamp the closing-keyword carrier commit — worktree strategy, single-terminal path only.**
   Skip this step entirely when this run is part of a multi-terminal-parallel dispatch destined
   for `flow/worktree-merge.md`'s reconciliation merge (the run was launched via
   `/claude-tweaks:flow {spec} worktree` alongside sibling terminals, not a solo worktree run) —
   that merge stamps its own `Fixes #{issue}` lines directly (`--no-ff`, per "Close-via-merge" in
   `_shared/issue-claims.md`), and a carrier commit here would double-stamp the closing
   reference. Otherwise, check for a materialized header — glob `${RUN_DIR}/work/*-spec.md`
   (the file `skills/flow/materialize.md` writes and never deletes) and read each match's
   header `record:` field:

   ```bash
   ISSUES=()
   for f in "${RUN_DIR}"/work/*-spec.md; do
     [ -e "$f" ] || continue
     ISSUES+=("$(grep -m1 '^record:' "$f" | sed 's/^record: *//')")
   done
   if [ "${#ISSUES[@]}" -gt 0 ]; then
     git commit --allow-empty -m "$(printf 'Fixes #%s\n' "${ISSUES[@]}")"
   fi
   ```

   One `Fixes #{issue}` line per resolved issue on the branch — *before* handing off to
   `/superpowers:finishing-a-development-branch`, from inside the worktree. A legacy
   spec-file-mode run (no `#N` origin, no materialized header — "pure-local", per
   `materialize.md`'s alias) has no `work/` file: the loop above finds nothing, `$ISSUES` stays
   empty, and this step is a no-op — no carrier commit, no closing keyword, because there was
   never an issue to close. Skip the commit if one for these issues already exists on the
   branch (`git log {branch} --grep="Fixes #{issue}"` — avoids duplicate empty commits if this
   step re-runs after an interruption).

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
3. Verify the feature branch reached an outcome (merged, PR created, discarded, or explicitly kept as-is) via `/superpowers:finishing-a-development-branch`:
   - **Already completed (merged, PR created, or discarded)** → proceed to step 4.
   - **Not yet decided** → run `/superpowers:finishing-a-development-branch` now (do not stop and ask the user to run it separately). Present the merge/PR/discard/keep-as-is options as the skill normally would, unmodified — step 2's carrier commit already guarantees closure regardless of which option is chosen, so this skill's own literal git commands need no adaptation. Then branch on the outcome:
     - **Merged, PR created, or discarded** → proceed to step 4.
     - **Kept as-is** → the user is deliberately continuing work in this worktree. Skip steps 4-6 below entirely for this spec (do NOT remove the worktree, do NOT delete the branch) and skip Section E (issue claim release) — the claim stays held since the work is still in progress; releasing it here would let another agent claim an issue that's still mid-work. Note in the wrap-up summary that this spec's worktree/branch/claim cleanup is deliberately incomplete, pending a future finish decision (a later re-run of `/superpowers:finishing-a-development-branch`, directly or via `/claude-tweaks:wrap-up`).
   In `current-branch` mode (no worktree, no branch finish) there is no feature branch to stamp
   — the carrier is the final wrap-up commit message instead: include the same
   `Fixes #{issue}` lines there; GitHub closes the issues when that commit reaches the default
   branch (the operative instruction lives in wrap-up SKILL.md Step 10's commit procedure,
   since Section C is skipped when no worktree exists).
4. **Copy `$RUN_DIR`'s gitignored content out to the main checkout — before removing the worktree.**
   `$RUN_DIR` (`config.yml`, `decisions.md`, `events.jsonl`, `staged/`) lives inside the worktree
   under `worktree.always` and is gitignored — only `work/` is git-tracked and survives worktree
   removal via commit + merge. Step 5 below (`git worktree remove`) deletes the entire worktree
   filesystem tree, including these gitignored files, unless they're copied out first:

   ```bash
   MAIN_CHECKOUT=$(dirname "$(git rev-parse --git-common-dir)")
   ARCHIVE_DEST="$MAIN_CHECKOUT/.claude-tweaks/pipelines/archive/$(basename "$RUN_DIR")"
   mkdir -p "$ARCHIVE_DEST"
   for f in config.yml decisions.md events.jsonl; do
     [ -e "$RUN_DIR/$f" ] && cp "$RUN_DIR/$f" "$ARCHIVE_DEST/$f"
   done
   [ -d "$RUN_DIR/staged" ] && [ "$(ls -A "$RUN_DIR/staged" 2>/dev/null)" ] && cp -r "$RUN_DIR/staged" "$ARCHIVE_DEST/staged"
   ```

   A plain `cp` via Bash — not the `Write`/`Edit` tool, not `git commit` — so the `worktree.always`
   PreToolUse gate does not deny it (`bin/lib/hooks/pre-tool-use.js`'s `checkWorktreeRequired`
   only gates `Edit`/`Write`/`NotebookEdit` and a Bash command whose `gitTargets` resolves a
   `commit` action; a bare `cp` matches neither). `git rev-parse --git-common-dir` resolves the
   shared `.git` directory regardless of which worktree the command runs from; stripping the
   trailing `.git` segment gives the main checkout root. Section B's archival step (item 8, above)
   then only needs to `git mv` the already-merged `work/` subdirectory into this same archive path
   — the gitignored half already landed here, before removal.

   **Multi-spec shared-worktree interaction (open question, not resolved here):** this record's
   reproduction and fix cover the single-record/single-spec worktree case only — where the
   worktree is torn down once, at the end of one pipeline's own wrap-up. A
   `MULTISPEC_SHARED_WORKTREE=1` run's `$RUN_DIR` may resolve differently (per-spec subdirectory
   of a parent multi-spec run dir), and per Section B's Multi-spec defer check, item 4 (this
   section) is deferred to the parent `/flow`'s consolidated console under
   `MULTISPEC_REVIEW_DEFER=1` regardless — so this step's per-spec invocation is skipped in that
   mode already (see "Multi-spec defer behavior" above) and does not need separate handling here.
   Whether the parent `/flow`'s own end-of-run worktree teardown needs an equivalent pre-removal
   copy step is a follow-up, not covered by this fix.
5. Remove the worktree: `git worktree remove {path}`.
6. If the branch was merged (not kept for PR), delete it: `git branch -d {branch}`.

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

If a materialized header exists for this spec (`${RUN_DIR}/work/*-spec.md` — the file
`skills/flow/materialize.md` writes and never deletes; read its `record:` field directly, there
is no pre-deletion capture step to route around), the pipeline holds `refs/claims/issue-<n>`
(`<n>` = the header's `record:` value) per `_shared/issue-claims.md`. Release it only after the
branch outcome is known (item 4, Git Worktree, completes first — the execution order of the
canonical list guarantees this):

Before any step below runs a `gh` command, run the Detection Ladder from
`_shared/github-pr-scan.md` (checks 1-3). A ladder failure here is a hard gate, not a fail-open
skip — Section E exists specifically to write GitHub state (release claims, remove labels); if
`gh` is unavailable there is nothing safe to degrade to. Report the specific failing check and
stop before attempting any release.

1. **Multi-spec defer check:** if `MULTISPEC_REVIEW_DEFER=1`, skip this section — the parent
   `/flow` releases all claims once after its consolidated Review Console and merge.
2. Map the outcome from `/superpowers:finishing-a-development-branch` to a release reason:
   merged → `merged: spec {spec}`; PR opened → `pr-opened: spec {spec}`; discarded →
   `abandoned: spec {spec}`. Set `$LINK` to the merge commit sha/URL (merged), the PR URL
   (pr-opened), or empty (abandoned). **Kept as-is has no release reason here** — per Section C
   step 3, this whole section is skipped for that outcome; the claim stays held while the work
   continues.
   In `current-branch` mode (no branch finish): the reason is `merged: spec {spec}` and
   `$LINK` is the final wrap-up commit sha — and that wrap-up commit's MESSAGE must carry the
   closing keywords (one `Fixes #{issue}` line per resolved issue; see Section C's carrier
   note). This applies per spec's own wrap-up commit in multi-spec current-branch runs.
3. **Ownership check (per `_shared/issue-claims.md`, "Release triggers").** Resolve `$RUN_ID`
   first: `RUN_ID="${CLAIM_RUN_ID:-$(basename "$PIPELINE_RUN_DIR")}"`. `CLAIM_RUN_ID` is set by
   `/flow` whenever *its own* caller set it (dispatch always does for both issue-mode singletons
   and multi-spec bundles — see `dispatch/SKILL.md`'s "Step 5: Dispatch — one Task agent per
   group") — the issue was claimed under that run
   id, a different and earlier one than this pipeline's own `PIPELINE_RUN_DIR`, so using the
   latter here would make every dispatch-originated release wrongly conclude "a successor holds
   the lock" and skip the delete and the comment on every success. A spec reaching this point
   through any other path (a human running `/flow #{issue}` directly, or a spec merely *derived
   from* an issue with no live claim) falls back to this pipeline's own run id — the only value
   used here before this distinction existed. Fetch the issue's comments and fold through
   `claimStatus`. If `claim.runId` is not the resolved `$RUN_ID`, a successor holds the lock —
   skip the delete AND the comment, log
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
6. **Remove grants** when the outcome was `merged:` or `pr-opened:`: remove `auto:build` and
   `auto:merge`, whichever are present (`gh issue edit "$ISSUE" --remove-label auto:build` /
   `--remove-label auto:merge`, best-effort per label) — reversible, log each removal to
   `decisions.md`. Skip issues released as `abandoned:` (the grant is the standing retry
   request) and issues carrying no `auto:*` label. See "Grant revocation" and the "Release
   triggers" table in `_shared/issue-claims.md`.
7. **Remove `bot:in-progress`; restore `parked` if applicable.** Always remove
   `bot:in-progress` (`gh issue edit "$ISSUE" --remove-label bot:in-progress`) — best-effort,
   log a warning and continue on failure. Then, only when the outcome reason is
   `abandoned: spec {spec}` (i.e. NOT `merged:`/`pr-opened:`) AND the materialized header
   (`${RUN_DIR}/work/*-spec.md` — read directly; per the step above, the file is never deleted
   before this point) carries `parked-at-shaping: true` (`materialize.md`'s field for exactly
   this restore-on-abandon case): restore `parked` — bootstrap the label if missing (per
   _shared/label-bootstrap.md, LABELS_JSON = [['parked', 'Deferred backlog entry, waiting on a
   trigger condition']]), then `gh issue edit "$ISSUE" --add-label parked`. Skip restoration
   silently when no materialized header exists (legacy spec-file-mode run) or
   `parked-at-shaping` is absent, or when the outcome was `merged:`/`pr-opened:` (the record
   shipped or is under review — it should stay unparked). Best-effort — on failure, log a
   warning and continue; `/tidy` Step 4.7's backstop check catches a restoration that silently
   failed.
8. Log each release, grant removal, `bot:in-progress` removal, and `parked` restoration to
   `decisions.md` (status `AUTO`, reason string as detail).

If no spec has a materialized header, skip silently.
