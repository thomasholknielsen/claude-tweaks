# Tidy — Step 6 Auto Mode

Step 6's auto branch; `step-6-interactive.md` is its twin. `SKILL.md` resolves `--dry-run` before
reading either — under it, everything Stages and the routing table below is bypassed.

When a pipeline run directory exists (see `_shared/pipeline-run-dir.md` for the resolution order and bash snippet), read `tidy-aggressiveness` from `config.yml` (default `conservative`).

For each finding, route by recommendation type:

| Recommendation | `conservative` (default) | `moderate` | `aggressive` |
|---|---|---|---|
| **Keep** | Auto (no-op) | Auto (no-op) | Auto (no-op) |
| **Needs scoring** (Shape 4 — `ready` record missing risk/size; no mutation, recommends `/claude-tweaks:specify`) | Auto (no-op, always surfaced) | Auto (no-op, always surfaced) | Auto (no-op, always surfaced) |
| **Re-triage** (Shape 5 — `bot:blocked`; no mutation, recommends `/claude-tweaks:backlog refine`) | Auto (no-op, always surfaced) | Auto (no-op, always surfaced) | Auto (no-op, always surfaced) |
| **Awaiting review** (a fresh/clean, non-stale open PR surfaced by `github-pr-scan.md`'s `repo-wide` scope; no mutation, informational only) | Auto (no-op, always surfaced) | Auto (no-op, always surfaced) | Auto (no-op, always surfaced) |
| **Acceptance-gap** (closed record with no acceptance disposition — surfaced by `github-pr-scan.md`'s `acceptance-gap` scope under `work-backend: github-issues`, or by `step-1-records.md`'s Shape 8 under `work-backend: local-files`; no mutation on either driver, recommends `/claude-tweaks:demo #{n}` / `{id}`) | Auto (no-op, always surfaced) | Auto (no-op, always surfaced) | Auto (no-op, always surfaced) — never auto-applied at any tier, on either driver; disposing a closed record is a judgment call the auto-mode contract keeps off the silenced list (`_shared/auto-mode-contract.md`). Unlike the Open family gate row below, no write is being deferred here: the finding recommends a command and stages nothing, so the two drivers need no separate reasoning |
| **Open family gate** (decomposition family complete with no acceptance disposition on the parent — surfaced by `github-pr-scan.md`'s `family-gate` scope under `work-backend: github-issues`, or by `step-1-records.md`'s Shape 7 under `work-backend: local-files`; composes the parent's Verification Brief and applies `demo:pending` / `acceptance: pending` — the resolved `tidy/actions-{github-issues,local-files}.md`'s `## Open family gate`, both reusing `wrap-up/verification-brief.md`'s Family-Gate Procedure) | Stage | Stage | Stage — **on both drivers, for two different reasons.** Under `github-issues` it posts a comment and adds a label: an outward-facing GitHub API write, not undoable via file edit or `git revert`. `_shared/auto-mode-contract.md`'s reversibility floor requires `high` (undoable via file edit or `git revert`) for anything to auto-resolve, and its never-reversible list separately forbids "network calls beyond reads (no API writes, no message sends)" at every tier regardless of mode — that write cannot clear either bar no matter how safe or precondition-only it is. Under `local-files` it is a record-file edit under git, which clears the reversibility floor outright; what fails there is the same contract's **confidence** floor — the write is not a mechanical flag flip but the composition of a Verification Brief, an authored artifact a human then reads as the basis for a sign-off verdict, plus the assertion that a family is complete. It also **latches**, on either driver: `familyGateState` reads the parent's disposition before any leaf, so once the gate is on, every future evaluation returns `gated` and no sweep looks at that family again — an auto-applied wrong brief becomes the input a human signs off against with its own cause erased from the data (`[IL-96]`'s shape), and reverting the bytes does not revert the verdict given against them. Keeping both drivers on this tier is also what keeps `[family-gate]` one finding with one behavior rather than two that diverge by store. `/claude-tweaks:wrap-up`'s own zero-staging application of the identical write is not a counter-example on either driver: it is an unconditional step of a pipeline a human already launched against one named record, and appears in no tier table anywhere; `/tidy`'s Step 6 table is the decision surface this row lives on, not that pipeline. Opening the gate never applies `demo:approved`/`demo:changes-requested` either way — that stays exclusively `/claude-tweaks:demo`'s job, staged and human-only, unaffected by this row's own tier. Staging costs one batch approval for the whole set, not one prompt per finding. Once approved, this action re-verifies the gate is still `due` with freshly read state before doing anything — never trusts the scan's own snapshot, which may be stale by the time Step 7 runs. |
| **Delete** (stale temp files, broken symlinks, marked-as-specified design docs, merged worktrees/branches, orphaned plans whose related spec is complete) | Auto-apply | Auto-apply | Auto-apply |
| **Delete** (any case requiring judgment, excluding backlog records — old plans whose spec status is unclear, design docs with no specs; see the dedicated backlog-record Delete rows below for `local-files`- and `github-issues`-backend findings) | Stage | Auto-apply | Auto-apply |
| **Delete** (stale backlog record, `local-files` backend — Shape 1's "Stale" recommendation; deletes a git-tracked file, same reversibility tier as the row above) | Stage | Auto-apply | Auto-apply |
| **Absorb** (backlog record overlaps an existing record, `local-files` backend — see the dedicated backlog-record Absorb row below for `github-issues`) | Stage | Auto-apply | Auto-apply |
| **Promote** (ready for brainstorm/`/specify` pipeline) | Stage | Stage | Auto-apply |
| **Defer** (`local-files` — pure file update) | Stage | Auto-apply | Auto-apply |
| **Defer** (`github-issues` — label + possible milestone creation, outward-facing) | Stage | Stage | Stage — visible to collaborators; never auto-applied per the auto-mode contract's reversibility floor |
| **Sync to GitHub** (local record exists under `work-backend: github-issues`) | Stage | Stage | Stage — creates GitHub-visible state; never auto-applied per the auto-mode contract's reversibility floor |
| **Delete** (backlog record, `github-issues` backend — closes a GitHub issue) | Stage | Stage | Stage — visible to collaborators; never auto-applied per the auto-mode contract's reversibility floor |
| **Absorb** (backlog record, `github-issues` backend — closes a GitHub issue) | Stage | Stage | Stage — visible to collaborators; never auto-applied per the auto-mode contract's reversibility floor |
| **Fix now** (registry entries pointing to non-existent files) | Stage | Stage | Stage — fixing requires judgment about which side to keep |
| **Add rule to CLAUDE.md** (cross-spec patterns) | Stage | Stage | Stage — CLAUDE.md never edited autonomously |
| **Design record drift** (Step 4.9's `[doctor]` findings; no mutation, informational) | Auto (no-op, always surfaced) | Auto (no-op, always surfaced) | Auto (no-op, always surfaced) — there is no tier at which this becomes an action. The scan step never edits a project file: applying an `auto` finding means `doctor.mjs --fix`, which rewrites `PRODUCT.md`, and `_shared/auto-mode-contract.md` reserves that for explicit human approval. A skipped scan surfaces nothing at all. |
| **Close (GitHub) / Resolve thread** (outward-facing GitHub mutations) | Stage | Stage | Stage — visible to collaborators and may trigger notifications; never auto-applied per the auto-mode contract's reversibility floor |
| **Capture** (PR/issue → backlog record) | Stage | Stage | Stage — new backlog-record writes are on the auto-mode contract's never-silenced list (`_shared/auto-mode-contract.md`: "Work-record creation") |

**Log entries:** Write each auto-resolution to `{run-dir}/decisions.md` per `_shared/auto-decision-log.md`. Example entries:
```
AUTO 11:14:32 — Step 6: deleted stale backlog record "{title}" (5 weeks old). Reversibility: med (commit {hash}).
STAGED 11:14:35 — Step 6: absorb proposal for backlog record "{title}" into #42. Stage path: staged/tidy-absorb-1.md.
```

Auto-applied items are committed. Staged items surface at the Wrap-Up Review Console for batch approval (`/wrap-up`'s Phase 4) when `/tidy` runs as part of a pipeline.

**Standalone auto:** When `/tidy` runs standalone in `auto` mode (no parent pipeline run dir), follow the Standalone auto fallback in `_shared/pipeline-run-dir.md` — create `.claude-tweaks/pipelines/{ISO-timestamp}-tidy-standalone/` with `decisions.md` and `staged/`. The audit log stays on. Apply `tidy-aggressiveness` from `.claude-tweaks/policy.yml` (see `_shared/policy-schema.md`) as the routing key. Present staged items in a Pending Review section at the end of the report (this is the bookend-end for the standalone run; no separate Review Console).

#### Archival compaction (every Standalone-auto firing, any scope)

This runs on every Standalone-auto firing regardless of scope — it's about aging out prior standalone runs, not about this run's own findings.

Before writing this run's own report, scan `.claude-tweaks/pipelines/` for two kinds of aged-out run directories:

- **Standalone runs** (name matches `*-standalone`) whose ISO-timestamp prefix is more than 30 days old — compacted on age alone, same as always.
- **Abandoned non-standalone runs** — a `/flow`-orchestrated run directory (no `-standalone` suffix) whose ISO-timestamp prefix is more than 30 days old AND whose `run-state.json` status is not `active` (`interrupted`, or the file is missing/unreadable). This covers a run that stopped at an interactive HARD-GATE and was never resumed or wrapped up — it never reaches `/wrap-up`'s successful-closure archival, so without this rule it would sit on disk indefinitely with no cleanup path. The `status` check (absent from the standalone rule, which compacts on age alone) exists so a genuinely long-running, still-`active` pipeline is never swept purely for being old.

For each matched directory:

1. Read its `decisions.md`.
2. Append its content to `.claude-tweaks/pipelines/archive/index-{YYYY-MM}.md` (the month derived from the run's own timestamp, not today's date — a run compacted late still files under the month it actually ran), creating the file if absent. Prefix the appended block with the run's own directory name as a header so entries stay attributable.
3. Move the run directory to `.claude-tweaks/pipelines/archive/{run-id}/` (same target `/wrap-up` uses for completed pipeline runs — see `wrap-up/cleanup-procedures.md` Section B).
4. Log one `AUTO` line to *this* firing's own `decisions.md`: `AUTO {time} — Archival: compacted {run-id} (age: {N} days) into index-{YYYY-MM}.md. Reversibility: high (archive is additive, nothing deleted).`

Skipped staged items inside a compacted run are preserved verbatim in the archive (not silently dropped) — same rule `/wrap-up`'s own archival already follows.

