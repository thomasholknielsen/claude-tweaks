# Tidy — Step 6 Auto Mode

Step 6's auto branch; `step-6-interactive.md` is its twin. `SKILL.md` resolves `--dry-run` before
reading either — under it, everything Stages and the routing table below is bypassed.

When a pipeline run directory exists (see `_shared/pipeline-run-dir.md` for the resolution order and bash snippet), read `tidy-aggressiveness` from `config.yml` (default `conservative`).

For each finding, route by recommendation type:

| Recommendation | `conservative` (default) | `moderate` | `aggressive` |
|---|---|---|---|
| **Keep** | Auto (no-op) | Auto (no-op) | Auto (no-op) |
| **Needs scoring** (Shape 4 — `ready` record missing risk/effort; no mutation, recommends `/claude-tweaks:specify`) | Auto (no-op, always surfaced) | Auto (no-op, always surfaced) | Auto (no-op, always surfaced) |
| **Re-triage** (Shape 5 — `bot:blocked`; no mutation, recommends `/claude-tweaks:backlog refine`) | Auto (no-op, always surfaced) | Auto (no-op, always surfaced) | Auto (no-op, always surfaced) |
| **Awaiting review** (a fresh/clean, non-stale open PR surfaced by `github-pr-scan.md`'s `repo-wide` scope; no mutation, informational only) | Auto (no-op, always surfaced) | Auto (no-op, always surfaced) | Auto (no-op, always surfaced) |
| **Acceptance-gap** (closed record with no acceptance label, surfaced by `github-pr-scan.md`'s `acceptance-gap` scope; no mutation, recommends `/claude-tweaks:demo #{n}`) | Auto (no-op, always surfaced) | Auto (no-op, always surfaced) | Auto (no-op, always surfaced) — never auto-applied at any tier; disposing a closed record is a judgment call the auto-mode contract keeps off the silenced list (`_shared/auto-mode-contract.md`) |
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
| **Close (GitHub) / Resolve thread** (outward-facing GitHub mutations) | Stage | Stage | Stage — visible to collaborators and may trigger notifications; never auto-applied per the auto-mode contract's reversibility floor |
| **Capture** (PR/issue → backlog record) | Stage | Stage | Stage — new backlog-record writes are on the auto-mode contract's never-silenced list (`_shared/auto-mode-contract.md`: "Work-record creation") |

**Log entries:** Write each auto-resolution to `{run-dir}/decisions.md` per `_shared/auto-decision-log.md`. Example entries:
```
AUTO 11:14:32 — Step 6: deleted stale backlog record "{title}" (5 weeks old). Reversibility: med (commit {hash}).
STAGED 11:14:35 — Step 6: absorb proposal for backlog record "{title}" into #42. Stage path: staged/tidy-absorb-1.md.
```

Auto-applied items are committed. Staged items surface at the Wrap-Up Review Console for batch approval (`/wrap-up` Step 8.6) when `/tidy` runs as part of a pipeline.

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

