# Step 10 — Execute Approved Actions and Verify

Loaded by `/claude-tweaks:wrap-up` Step 10 when at least one approved action exists. Holds the dry-run preview branch, the `MULTISPEC_REVIEW_DEFER` skip list, the full apply list, the closing-keyword carrier commit, and the verification checklist that gates the closure line.

**Dry-run mode.** When `--dry-run` was passed (Step 1's Flags), skip actual execution entirely — print each planned cleanup / configuration / skill / acceptance-labeling action as a preview line instead of running it, skip the final commit and the closing line, and stop after Step 9's summary. This applies whether Step 8.6 rendered (which already previewed instead of applied — see `review-console.md`'s "Dry-run mode") or was skipped (interactive mode, standalone wrap-up).

Execute the cleanup planned in Step 5 (canonical list in `cleanup-procedures.md`) plus the configuration / skill updates approved at the Review Console (Step 8.6) or batch decision (Step 9). The 8 cleanup items, in execution order, are defined in `cleanup-procedures.md`'s canonical list — do not re-enumerate here. Filter rows by Condition.

**MULTISPEC_REVIEW_DEFER branch:** When `$MULTISPEC_REVIEW_DEFER=1` is set, Step 10 SKIPS the state-changing cleanups marked deferred in `cleanup-procedures.md` (items 3 Design caches, 4 Git worktree, 6 Ephemeral dev server, 7 Issue claim release, 8 Pipeline run dir archival). Those defer to `/flow`'s consolidated multi-spec Review Console at end-of-run, which has authority to apply or override them across all specs in the run. Step 10 still executes the idempotent cleanups (items 1 Execution plans, 2 Open items ledger, 5 Record/spec lifecycle) — those do not interact with parent-orchestrated cleanup.

After the cleanup, also apply:

- **Documentation** — apply the registry / doc edits collected in Step 7.7 and approved at the Console or batch
- **CLAUDE.md, rules** — apply the edits collected in Step 6 and Step 7.9 and approved at the Console or batch
- **New docs from missing-doc detection** — for a `[doc] {file} — Create: …` row (wrap-up's own D2 gap-detection, `docs-health-integration.md`), scaffold the new file from the matching section of `skills/_shared/diataxis-genre-templates.md` and fill in real content from this work's session context, then register it in `docs/REGISTRY.md` if a registry exists
- **Docs-health restructural filings** — for restructural docs-health findings (`docs-health-integration.md`'s D1) approved at the Console or batch, re-run `validate-findings` without `--dry-run` and file each surviving payload via `gh issue create`, per that file's filing procedure
- **Decision records (ADRs)** — write the approved `docs/decisions/NNNN-{slug}.md` files (Step 6.2) using the template in `_shared/decision-records.md`, and add them to `docs/REGISTRY.md` if a registry exists
- **Skill updates** — apply patches and create new skills (Step 7 staged or approved items)
- **Acceptance labeling** (record mode only — a materialized header exists for this run) — for testable records, gate on a clean visual-review pass (triggering one now via Step 2.5's safety net if `/review` only produced a recommendation), then apply `demo:pending` and post the Verification Brief. **Gate the read:** only when this run is record mode *and* the record is testable, read `verification-brief.md` in this skill's directory for the full bootstrap, safety-net, sourcing, and posting procedure. Conversation-based work and the legacy spec-file alias have no work record to label — skip this bullet and do not read the file (that file's own header states the same restriction)

Commit with a message summarizing the wrap-up actions. When the run is `current-branch` mode
and a materialized header exists for this spec (`${RUN_DIR}/work/*-spec.md` — its `record:`
field is the issue number), include one `Fixes #{issue}` line per resolved issue in this commit
message — it is the closing-keyword carrier for current-branch runs (see
`cleanup-procedures.md` Section C); GitHub closes the issues when the commit reaches the
default branch. A legacy spec-file-mode run (no materialized header) carries no closing
keyword — there was never an issue to close.

### Verify execution

Before emitting the closure line, confirm every approved action actually ran:

- Spec file deleted or status updated (legacy spec-file-mode alias only — record mode has no spec file) — `ls specs/{N}*.md` returns nothing (or `git status` shows the status edit committed)
- INDEX.md updated (legacy spec-file-mode alias only — record mode never touches it) — `git log -1 --stat specs/INDEX.md` shows this run's commit
- Plans + ledger removed — `ls docs/superpowers/plans/*{spec-slug}* docs/plans/*-ledger.md` returns nothing
- Design caches deleted (when applicable) — no `*-audit.json` / `*-recommendations.json` / `*-declined.json` for this spec remain in `docs/plans/`
- Pipeline run dir archived — `.claude-tweaks/pipelines/{run-id}/` is gone; `.claude-tweaks/pipelines/archive/{run-id}/` exists, with the `work/` subdirectory (when present) still git-tracked at its new path (skipped when `MULTISPEC_REVIEW_DEFER=1`)
- Worktree removed (worktree strategy) — `git worktree list` no longer shows the feature worktree path
- Closing-keyword carrier commit landed (worktree strategy + a materialized header was present for this spec) — `git log {default-branch} --grep="Fixes #{issue}"` shows the carrier commit for each resolved issue once merged (or `git log {feature-branch} --grep=...` if the branch is still open under "keep as-is" or a pending PR)
- Acceptance labeling landed (record mode only) — `work-backend: github-issues`: `gh issue view {issue} --json labels -q '.labels[].name'` includes `demo:pending` and the issue's last comment contains `## Verification Brief` with a `### Confirmed` section; `work-backend: local-files`: the record's body contains `## Verification Brief` with a `### Confirmed` section and its frontmatter has `acceptance: pending`. For a testable record, confirm the safety-net gate actually resolved (no high/critical visual-review finding left unfixed) before this line was reached.

If any approved action did not land, do NOT emit the closure line. Surface the gap (`BLOCKED — cleanup step {N} did not complete: {reason}`) and stop.
