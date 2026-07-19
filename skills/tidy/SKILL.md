---
name: claude-tweaks:tidy
description: Use when the backlog needs hygiene — review stale backlog records, parked-trigger wakes, unsynced local records, and orphaned plans/worktrees
---
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.


# Tidy

Periodic backlog hygiene to keep the spec system healthy. Run when the backlog feels cluttered, before a brainstorming session, or on a regular cadence.

```
/claude-tweaks:capture → /claude-tweaks:challenge → /superpowers:brainstorming → /claude-tweaks:specify → /claude-tweaks:build → /claude-tweaks:review → /claude-tweaks:wrap-up
                                                                          ↑
                                               [ /claude-tweaks:tidy ] (maintenance loop)
                                            ^^^^ YOU ARE HERE ^^^^
```

## When to Use

- The backlog is getting long (10+ records)
- Starting a new brainstorming session (clean the landscape first)
- After completing a batch of specs (check what's unblocked)
- Monthly hygiene pass
- When `/claude-tweaks:help` flags issues
- Just want a narrower check (e.g. `/claude-tweaks:tidy --scope=github` for GitHub issue triage only, skipping everything except Step 4.8) — see "Scope Selection" below

## Input

`$ARGUMENTS` is parsed as `[--scope=<name>[,<name>...]]`. With no `--scope` argument, /tidy scans everything — the open work-record queue (per `work-backend` — see `scan-procedures.md` Step 1), design docs, plans, worktrees, and the doc registry from their canonical locations — exactly as before `--scope` existed. `--scope` narrows the run to a subset of that sweep; see "Scope Selection" below for the full taxonomy and rules. An aggressiveness override (when needed) is read from the active pipeline run's `config.yml` (Manifesto `tidy-aggressiveness` lever), not from arguments — unaffected by `--scope`.

## Scope Selection

By default (no `--scope` argument) /tidy runs every scan step below — the full sweep, unchanged from before this feature existed. `--scope=<name>[,<name>...]` (comma-separated, no spaces) narrows a run to just the named step groups:

| Scope | Steps covered |
|---|---|
| `backlog` | 1 |
| `specs` | 1, 5 |
| `docs` | 3 |
| `plans` | 4 |
| `git` | 4.5 |
| `registry` | 4.6 |
| `claims` | 4.7 |
| `github` | 4.8 |
| `patterns` | 5.5 |

Rules:

- **Unknown scope name** — stop before dispatching anything and report the invalid name(s) alongside this table. Do not partially run a request that mixes one valid and one invalid name.
- **`backlog` and `specs` both draw from Step 1's single record-scan query** (the former Steps 1 and 2 merged into one record scan — see "Scan steps" below) — `specs` additionally pulls in Step 5's sizing review over `ready` records, mirroring the pre-merge `specs` scope's Step 2+5 grouping. No other scope pulls in another — Step 5.5 (`patterns`) is self-contained (git-log only) and no longer depends on Step 1's output, so it doesn't imply `specs`.
- **Scoped runs use the identical Step 6 report/approval, Step 7 execution, and Step 7.5 verification** as a full sweep — only the set of findings feeding them is narrower. The Step 7 commit message names the scope explicitly (see Step 7.5 below); an unscoped full run's commit message is unchanged.

## Steps 1-4.8: Scan Everything

> **No decisions during scanning.** Steps 1-4.8 silently collect all findings. Everything is presented as one batch in Step 6 for approval. This replaces the previous per-item decision model.

> **Parallel execution:** Dispatch every step selected by the active scope (all of Steps 1, 3, 4, 4.5, 4.6, 4.7, and 4.8 for an unscoped/full run; a `--scope`-filtered subset otherwise, per "Scope Selection" above) as parallel Task agents — each scan is independent (Work Records, Design Docs + Briefs, Plans, Git, Doc Registry, Issue Claims, GitHub PRs/Issues). Each agent returns findings in the `[type] item — detail — recommendation` format. Step 3's classification tables are inlined directly into its agent prompt (see Step 3 below) so subagents have everything they need. After the selected parallel scans complete, run Step 5 and/or Step 5.5 sequentially when either is in scope. Step 5 depends on Step 1's record-scan results (its `ready`, unclaimed rows), which is why `specs` pulls in both Step 1 and Step 5 (per "Scope Selection" above); Step 5.5 is independent (git-log only) and runs sequentially purely for report-assembly ordering, not a data dependency. Assemble all findings into the Step 6 report.
>
> **Contract:** Each agent follows `_shared/subagent-output-contract.md` — minimal input, status line first, output template inlined verbatim. Model tier: Fast.
>
> **Model tier:** Fast (Haiku) — each scan is a mechanical read of a single data source (the open work-record queue, design-doc directory, plan directory, `git worktree list` + branches, REGISTRY, issue-claim refs + comments, gh PR/issue queries). No cross-cutting analysis at the per-scan level; Step 5/5.5 do the synthesis sequentially in the main thread.
>
> **Output template (each agent must follow exactly):**
>
> ```markdown
> OUTPUT FORMAT (required):
> Return ONLY a markdown table, no preamble:
>
> | Severity | Path:Line | Finding | Evidence |
> |---|---|---|---|
> | critical | src/auth.ts:42 | Missing token expiry check | uses `<` not `<=` |
> | medium | src/api.ts:180 | Unhandled rejection | line 184: `await fetch(...)` no try/catch |
>
> Severity scale: critical / high / medium / low / info
> If no findings: return literal text "No findings."
> Do not add narration, headers, or summaries before or after the table.
> ```
>
> Each agent's first reply line must be one of `DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED`, then the Template A table verbatim. Agents do not invent a new schema.
>
> **Tidy-specific column semantics (for the dispatcher, not the agents):** when the dispatcher receives Template A rows back from each scan agent, it interprets the four standard columns in this skill's vocabulary — Severity = recommendation urgency (`info` for Keep, `low` for routine cleanup, `medium` for Promote/Absorb/Defer, `high` for stale-Delete or registry break); Path:Line = the artifact (the record reference — `#{n}` under `github-issues`, the local record path under `local-files` — `docs/REGISTRY.md`, or a worktree path); Finding = `[type] item — short detail` (e.g., `[backlog] "Build redis cache" — 5 weeks old`); Evidence = the recommendation (`Delete — stale` / `Promote — ready for brainstorm` / `Absorb → #42`). The dispatcher merges all agents' Template A tables into the Step 6 report using these semantics. **Template A itself is unchanged** — the remapping is purely how the dispatcher reads it.

### Scan steps (data sources + collection format)

Read `scan-procedures.md` in this skill's directory for the full classification tables, age thresholds, and per-step rules. The dispatcher inlines the relevant section into each agent's prompt so subagents have everything they need.

| Step | Data source | Output prefix |
|------|-------------|--------------|
| 1 | Open work records — `gh issue list` (`github-issues`) or `queryRecords('specs', {})` (`local-files`) via `bin/lib/issues/{record,local-store}.js` | `[backlog]` / `[parked]` / `[unsynced]` / `[scoring]` / `[blocked]` / `[legacy]` |
| 3 | `docs/superpowers/specs/*-design.md`, `docs/plans/*-brief.md` | `[doc]` |
| 4 | `docs/superpowers/plans/`, `~/.claude/plans/` | `[plan]` |
| 4.5 | `git worktree list`, `git branch --list "build/*"` | `[git]` |
| 4.6 | `docs/REGISTRY.md` | `[registry]` |
| 4.7 | `gh api git/matching-refs/claims/` + issue comments | `[claim]` |
| 4.8 | `gh pr list` / `gh issue list --label by:code-health` / `--label by:harness-health` / `--label by:journey-health` / `--label by:docs-health` per `_shared/github-pr-scan.md` (`repo-wide` scope) | `[pr]`, `[gh-issue]` |
| 5 (sequential, after Step 1) | `ready` records not yet claimed | `[sizing]` |
| 5.5 (sequential, independent of Step 1) | Recent git history of review/wrap-up commits | `[pattern]`, `[health]` |

There is no Step 2 — it merged into Step 1 (see Scope Selection above). The rest of the numbering is unchanged from before this merge, including the decimal sub-steps under Step 4, so existing cross-references from other skills keep pointing at the right step.

---

## Action Vocabulary

Every recommendation in the tidy report uses one of these actions. Each action is atomic — either fully executed or not at all. Do not commit partial state (e.g., deleting a backlog record without creating the destination artifact).

| Action | What It Means | Execution | Removes from Source? |
|--------|--------------|-----------|---------------------|
| **Delete** | Item is no longer needed — stale, already implemented, or out of scope | `local-files`: remove the record file (`specs/{id}-{slug}.md`). `github-issues`: (1) comment explaining why (audit trail — never close silently), (2) `gh issue close {n} --reason "not planned"` — close-not-planned-with-comment. | Yes (file) / issue closes (GitHub) |
| **Defer** | Valid but not timely — park with a trigger condition | `local-files`: `writeRecord` (`bin/lib/issues/local-store.js`) with `facets.stage: 'parked'` (supersedes any other stage value — the two are mutually exclusive) and the trigger appended to the body as a `**Trigger:** {condition}` line (plus `**Watched paths:** {paths}` when the trigger names files) — same file, updated in place, compose-then-write-once. `github-issues`: (1) build the base payload via `recordPayload({..., parked: true})` (`bin/lib/issues/record.js`), first appending a `**Watched paths:** {paths}` line to the body when the trigger names files — plain body text; `recordPayload` doesn't take a watched-paths field, the same way `/specify`'s metadata block is composed manually rather than passed through it — write to a temp file, (2) `gh issue edit {n} --body-file <temp file>`, (3) bootstrap the `parked` label if missing (per `_shared/label-bootstrap.md`'s canonical `LABELS_JSON` pair), then `gh issue edit {n} --add-label parked`, (4) if the trigger names a moment in time, attach a GitHub Milestone: `gh api repos/{owner}/{repo}/milestones --jq '.[].title'` to check existence, `gh api repos/{owner}/{repo}/milestones -f title="{name}"` to create if absent, `gh issue edit {n} --milestone "{name}"` to attach. | No (file, same file updated in place) / issue stays open, relabeled (GitHub) |
| **Absorb** | Scope belongs in an existing record | Both backends: (1) integrate scope into the target record's Deliverables, Acceptance Criteria, and Technical Approach — not as an appendix, as first-class content. `local-files`: (2) update the target record's file in place, (3) delete the absorbed record's file. `github-issues`: (2) comment naming the target (`Absorbed into #{M}.`), (3) `gh issue close {n} --reason "not planned"`. | Yes (file) / issue closes (GitHub) |
| **Promote** | Ready for `/claude-tweaks:specify` | No mutation on either backend — the record already exists and is the durable pointer; recommend `/claude-tweaks:specify {ref}` directly (`#{n}` under `github-issues`, the bare id under `local-files`). `/specify`'s Shaping mode removes `parked` (if present) and stamps `ready` on the record in place — see `_shared/work-record.md` and `specify/SKILL.md`'s Shaping mode; there is no separate entry to delete. If a record is re-parked after promotion (a later `/tidy` Defer) and still gets dispatched, `/flow`'s materialization step stamps `parked-at-shaping: true` on the build-time header (`flow/materialize.md`), and `/wrap-up`'s Section E restores `parked` on an abandoned outcome — Step 4.7's backstop (`scan-procedures.md`) catches a restoration that silently failed. | No — record unchanged, mutation deferred to `/specify` |
| **Keep** | No action needed | None | No |
| **Sync to GitHub** | A local record carries `unsynced: true` while `work-backend: github-issues` — mirror it to an issue now | Build the payload via `recordPayload` (`bin/lib/issues/record.js`) from the local record's own facets — `type` (guessed the same way `/capture`'s Guessing-the-Type heuristic does, when `facets.type` was never stamped), `origin` when present (`facets.origin`; omitted for a human-shaped record, e.g. a `/specify` decomposition leaf, which carries no `by:*` label by design), `risk`/`effort` when present, `ready: facets.stage === 'ready'`, `parked: facets.stage === 'parked'`. For a parked record, judge the trigger the same way Defer's `github-issues` branch does — file-shaped trigger → append `**Watched paths:**`; moment-in-time → attach/create a milestone after creation. Bootstrap the labels the payload assembled (per `_shared/label-bootstrap.md`), then `gh issue create --title ... --body-file ... --label ...` (repeat `--label` per entry in `recordPayload`'s returned array; add `--type {t}` under `work-types: native`, or the matching `type:{t}` label under `work-types: labels`). Delete the local record file only after `gh issue create` confirms success. | Yes — moves to GitHub, local file deleted |
| **Close (GitHub)** | Open PR or issue is stale or superseded — close it upstream | (1) Comment on the PR/issue explaining why (the comment is the audit trail — never close silently), (2) `gh pr close {n}` / `gh issue close {n}` | N/A — GitHub state |
| **Resolve thread** | Review-thread concern was addressed by a later commit | GraphQL `resolveReviewThread` mutation — only with commit evidence (a commit touching the flagged lines) | N/A — GitHub state |
| **Capture** | PR feedback or GitHub issue needs local follow-up | Files a new backlog record (no stage label / no `stage:` facet) via `/claude-tweaks:capture`'s own write path, referencing the PR/thread/issue URL | No — creates a backlog record |

`Capture`, `Close (GitHub)`, and `Resolve thread` are unaffected by `work-backend` — they behave identically on both drivers.

### Why "Promote" keeps the record in place

The lifecycle is: backlog record → brainstorm (optional) → `/claude-tweaks:specify` shapes it to `ready`. "Promote" means the item is ready to enter that pipeline — but the record itself, not a separate file, is the only tracking artifact at every stage (`_shared/work-record.md`: "The GitHub issue (or its `local-files` twin) is the one durable work record"). There is nothing to delete when promoting: `/claude-tweaks:specify`'s Shaping mode edits the same record in place, stamping `ready` and removing `parked`.

### Absorb means integrate, not append

When absorbing a backlog record (backlog- or parked-stage) into an existing record, the absorbed content must be indistinguishable from original content. Add new deliverables to the Deliverables checklist, new assertions to Acceptance Criteria, new architectural notes to Technical Approach, and new caveats to Gotchas. Do NOT create an "Absorbed Scope" appendix section at the bottom of the record — that creates second-class content that `/superpowers:writing-plans` may miss or treat differently.

---

## Step 6: Present Tidy Report and Approve

### Auto mode (aggressiveness-based routing)

When a pipeline run directory exists (see `_shared/pipeline-run-dir.md` for the resolution order and bash snippet), read `tidy-aggressiveness` from `config.yml` (default `conservative`).

For each finding, route by recommendation type:

| Recommendation | `conservative` (default) | `moderate` | `aggressive` |
|---|---|---|---|
| **Keep** | Auto (no-op) | Auto (no-op) | Auto (no-op) |
| **Legacy taxonomy present** (Shape 7 — read-only flag; `/tidy` never relabels it) | Auto (no-op, always surfaced) | Auto (no-op, always surfaced) | Auto (no-op, always surfaced) |
| **Needs scoring** (Shape 4 — `ready` record missing risk/effort; no mutation, recommends `/claude-tweaks:specify`) | Auto (no-op, always surfaced) | Auto (no-op, always surfaced) | Auto (no-op, always surfaced) |
| **Re-triage** (Shape 5 — `bot:blocked`; no mutation, recommends `/claude-tweaks:triage`) | Auto (no-op, always surfaced) | Auto (no-op, always surfaced) | Auto (no-op, always surfaced) |
| **Awaiting review** (a fresh/clean, non-stale open PR surfaced by `github-pr-scan.md`'s `repo-wide` scope; no mutation, informational only) | Auto (no-op, always surfaced) | Auto (no-op, always surfaced) | Auto (no-op, always surfaced) |
| **Delete** (stale temp files, broken symlinks, marked-as-specified design docs, merged worktrees/branches, orphaned plans whose related spec is complete) | Auto-apply | Auto-apply | Auto-apply |
| **Delete** (any case requiring judgment, excluding backlog records — old plans whose spec status is unclear, design docs with no specs; see the dedicated backlog-record Delete row below for `github-issues`-backend findings) | Stage | Auto-apply | Auto-apply |
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

**Standalone auto:** When `/tidy` runs standalone in `auto` mode (no parent pipeline run dir), follow the Standalone auto fallback in `_shared/pipeline-run-dir.md` — create `.claude-tweaks/pipelines/{ISO-timestamp}-tidy-standalone/` with `decisions.md` and `staged/`. The audit log stays on. Apply `tidy-aggressiveness` from CLAUDE.md as the routing key. Present staged items in a Pending Review section at the end of the report (this is the bookend-end for the standalone run; no separate Review Console).

#### Evidence tier (`--scope=github` routine firings only)

This subsection applies only inside the Standalone-auto path above — an interactive invocation or a `/tidy` run embedded in a larger pipeline never reads `tidy-routine-autonomy` and never auto-mutates on evidence; those runs always route through the aggressiveness table exactly as documented there, unaffected by this flag's value.

When this Standalone-auto firing's scope includes `github` (Step 4.8 ran), read `tidy-routine-autonomy` from CLAUDE.md (default `conservative`). Under `conservative`, nothing in this subsection applies — every GitHub-mutation finding routes through the table above exactly as always (all four "Stage — never auto-applied" rows stay staged).

Under `evidence-based`, before staging any of the following four finding shapes, check whether it carries the specific cite-able evidence listed. If it does, auto-apply the mutation instead of staging it, and log the evidence literally:

| Finding shape | Evidence required | Auto-applied action |
|---|---|---|
| Unresolved review thread whose flagged file:line a later commit touches | The commit SHA that touches those lines | Resolve thread (GraphQL `resolveReviewThread`) |
| Parked record, `milestoneDueOn` is in the past | The due date itself | `gh issue edit {n} --remove-label parked`, then comment citing the due date |
| Parked record, a `watchedPaths` entry has a matching commit in `git log` since the record was parked | The commit SHA `git log` returns | `gh issue edit {n} --remove-label parked`, then comment citing the commit SHA and touched path |
| Code-health/harness-health/journey-health/docs-health issue whose flagged code is demonstrably removed or rewritten since filing (a diff shows the flagged lines gone or materially changed) | The diff reference (commit range or PR number) | `gh issue close {n} --reason "not planned"` after a comment citing the diff reference |

These four are the only shapes this tier ever touches. Every other GitHub-mutation finding — stale-PR close-or-resume, PR-superseded-by-equivalent-work, a stale backlog record past 4 weeks (delete-or-promote), and any "still valid" code-health/harness-health/journey-health/docs-health assessment — is a judgment call per `_shared/github-pr-scan.md`'s own findings table and stays staged regardless of `tidy-routine-autonomy`. Note that removing the `parked` label is the entire mutation for the two Promote-evidence rows above — this tier never auto-runs `/claude-tweaks:specify`; the record simply becomes visible as a plain backlog record again, same as if a human had removed `parked` by hand.

Log entries follow the same format as the table above, e.g.:
```
AUTO 03:14:02 — Step 6 (evidence tier): resolved thread on PR #88 — commit a1b2c3d touches src/auth.ts:42-48 (the flagged lines). Reversibility: low (GitHub state; thread can be manually re-opened).
AUTO 03:14:09 — Step 6 (evidence tier): removed `parked` label from issue #142 — milestone "Q3 launch" due date 2026-08-01 has passed. Reversibility: med (label re-addable; commented with cited evidence).
```

#### Rolling digest (`--scope=github` routine firings only)

Every Standalone-auto `--scope=github` firing updates one rolling digest artifact in place — never creates a new one per firing.

**Identity:**
- `work-backend: github-issues` (or any project with a reachable GitHub remote, regardless of which record-storage backend is active — this is about where the digest lives, not the record-storage choice): find the digest issue via `gh issue list --search "Tidy GitHub-Triage Digest in:title" --state open --json number,title,body`, then confirm the match by checking its body contains the exact marker `<!-- tidy-digest-marker -->` (title alone is not sufficient — do not match on title only). If found, `gh issue edit {n} --body-file <file>`. If not found (first-ever firing, or the issue was manually closed), `gh issue create --title "Tidy GitHub-Triage Digest" --body-file <file>` once.
- `work-backend: local-files` with no reachable GitHub remote: rewrite `.claude-tweaks/tidy-digest.md` in place and commit it.

**Structure**, exactly four sections in this order:

```markdown
<!-- tidy-digest-marker -->
# Tidy GitHub-Triage Digest

Last updated: {ISO timestamp}

## Auto-applied

- {finding} — {action} — {timestamp}

## Auto-mutated with evidence

- {finding} — {action} — evidence: {literal evidence cited} — {timestamp}

## Still needs your review

- {finding} — {recommendation} — (still open as of {timestamp})

**Pending authorization:** {N} records awaiting a grant
- #{number}: {title}

**Blocked:** {N} records hit their retry ceiling
- #{number}: {title}

**Backlog:** {N} records with no stage label
- #{number}: {title}

## Pipeline Funnel

| Transition | Median | Sample size |
|---|---|---|
| Shaping latency (filed → ready) | {duration} | {N} |
| Grant latency (ready → authorized) | {duration} | {N} |
| Build latency (authorized → closed) | {duration} | {N} |

Retry rate: {rate}% ({failedAttempts}/{totalAttempts} across sampled records)

Wontfix rate by origin:
| Origin | Rate |
|---|---|
| {by:code-health, etc.} | {rate}% ({wontfix}/{total}) |
```

Each bucket's bullet list is one `- #{number}: {title}` line per entry in that bucket's list (`pendingList`/`blockedList`/`backlogList` from `github-pr-scan.md` item 8) — omit both the summary line and the bullet list together when a bucket's count is 0. No cap on list length: if a bucket holds 40 records, all 40 render.

Because Step 4.8 runs as a dispatched Task agent bound to the Output Contract's `[queue]` row (bare counts only, per `github-pr-scan.md`'s Output Contract section) — not the underlying `pendingList`/`blockedList`/`backlogList` arrays item 8's script computes internally — the digest-writing step sources these bullets by re-running item 8's query itself, directly, after Steps 1-4.8 complete (the orchestrator has its own `gh`/`node` access; this is not something any Step 4.8 subagent does). This is a second, cheap invocation of the same single `gh issue list --state open` query item 8 already runs once for the `[queue]` row's counts — not a change to the Output Contract shared by every other tidy scan step.

**Dedup (applies to the "Still needs your review" finding rows only — the other two sections are a fresh append per firing since they're already-resolved actions, and the three enumerated buckets below "Still needs your review" — Pending authorization/Blocked/Backlog — are regenerated fresh from a live query each firing, not appended-and-deduped, so a record dropping out between firings needs no removal step):** before adding a row, compute its key as `{PR or issue number}:{finding-type}` (e.g. `142:stale-pr`, `88:unresolved-thread`). Read the digest's current "Still needs your review" section and check for a row with a matching key (match on the PR/issue number and finding-type substring in the existing row text — both are always present in the rendered row). If found, update only that row's `(still open as of {timestamp})` suffix to the current firing's timestamp — do not add a second row, and do not mark this finding as new-this-firing (see the Notification subsection below, which fires only on new-this-firing findings). If not found, append a new row and mark it new-this-firing — this is either a genuinely new finding or one whose finding-type changed materially for the same number (e.g. a PR that was `Review` last firing is now `CI-red` — a different finding-type key, so a new row).

**Pipeline Funnel (regenerated fresh each firing, not appended-and-deduped — same treatment as the three enumerated buckets above, not the finding rows):** sample closed records from the last 90 days (bounds the `gh api` cost on a digest rewritten every firing) via `gh issue list --state closed --json number,labels,stateReason,createdAt,closedAt --search "closed:>{90-days-ago}"`. For each sampled record, fetch its labeled/unlabeled timeline events (`gh api repos/{owner}/{repo}/issues/{n}/timeline --jq '.[] | select(.event == "labeled" or .event == "unlabeled")'`) and its comments (for retry-rate input), then compute:

```bash
node -e "
  const { computeStageDurations, computeWontfixRate, summarizeFunnel } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/metrics.js');
  const { countFailedAttempts } = require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/retry.js');
  const sampled = require('/tmp/tidy-funnel-sample.json'); // [{createdAt, closedAt, events, labels, stateReason, comments}]
  const perIssueDurations = sampled.map((r) => computeStageDurations(r));
  const wontfixByOrigin = computeWontfixRate(sampled.map((r) => ({ labels: r.labels, stateReason: r.stateReason })));
  const failedAttempts = sampled.reduce((sum, r) => sum + countFailedAttempts(r.comments), 0);
  const totalAttempts = sampled.length;
  console.log(JSON.stringify(summarizeFunnel(perIssueDurations, wontfixByOrigin, { failedAttempts, totalAttempts })));
"
```

Render the `## Pipeline Funnel` section from the result — `medianMs`/`sampleSize` per transition into the table, `retryRate` into the retry-rate line, `wontfixByOrigin` into the wontfix table. **Omit the entire section** (not a table of zeroes or dashes) when the 90-day sample is empty — a new or low-volume project has nothing meaningful to report yet.

#### Notification (`--scope=github` routine firings only)

After the digest is written, call `PushNotification` at most once per firing, and only when at least one row in "Still needs your review" was marked new-this-firing by the dedup step above (a genuinely new finding, or an existing finding whose finding-type materially changed) — not merely because the section is non-empty. A lingering, unresolved-but-unchanged finding that only got its `(still open as of {timestamp})` suffix bumped does NOT by itself trigger a fresh notification; per the design's own stated goal, dedup exists specifically to stop the same open finding from re-notifying every cycle, not just to stop it from appearing twice in one render. Compose the notification body from the new-this-firing findings specifically, e.g. `"{N} new items need your review — {top new finding title}. See the Tidy GitHub-Triage Digest."` (`{N}` here is the count of new-this-firing rows, not the section's total row count). Never fire when no row was marked new-this-firing (including an all-clear firing, or a firing where everything in the section is a carried-over timestamp bump) — this keeps the signal high-value; a routine firing every 3 hours that notified on every unresolved item would train the user to ignore it.

Note: the finding-type vocabulary this section keys on changed with this rename (`inbox`/`deferred`-era names → the new Shape names) — one firing right after migration re-notifies every still-open finding under its new key, since the old key no longer matches. Accepted as a one-time cost, not a bug.

#### Archival compaction (every Standalone-auto firing, any scope)

Unlike the evidence tier, digest, and notification subsections above (which are `--scope=github`-specific), this compaction sweep runs on every Standalone-auto `/tidy` firing regardless of scope — it's about aging out prior standalone runs, not about this run's own findings.

Before writing this run's own report, scan `.claude-tweaks/pipelines/` for standalone run directories (matching `*-standalone`) whose ISO-timestamp prefix is more than 30 days old. For each:

1. Read its `decisions.md`.
2. Append its content to `.claude-tweaks/pipelines/archive/index-{YYYY-MM}.md` (the month derived from the run's own timestamp, not today's date — a run compacted late still files under the month it actually ran), creating the file if absent. Prefix the appended block with the run's own directory name as a header so entries stay attributable.
3. Move the run directory to `.claude-tweaks/pipelines/archive/{run-id}/` (same target `/wrap-up` uses for completed pipeline runs — see `wrap-up/cleanup-procedures.md` Section B).
4. Log one `AUTO` line to *this* firing's own `decisions.md`: `AUTO {time} — Archival: compacted {run-id} (age: {N} days) into index-{YYYY-MM}.md. Reversibility: high (archive is additive, nothing deleted).`

Skipped staged items inside a compacted run are preserved verbatim in the archive (not silently dropped) — same rule `/wrap-up`'s own archival already follows.

### Interactive mode (batch approval)

Present all collected findings as a single report. Every item has a pre-filled recommendation from the scanning steps.

```markdown
## Tidy Report — {date}

### Actions

| # | Type | Item | Recommendation |
|---|------|------|---------------|
| 1 | Backlog | "{title}" (4+ weeks) | Delete — stale |
| 2 | Backlog | "{title}" (2 weeks) | Keep — still fresh |
| 3 | Backlog | "{title}" (clean, ready) | Promote — /claude-tweaks:specify #{n} |
| 4 | Backlog | "{title}" (overlaps #{m}) | Absorb → #{m} |
| 5 | Parked | "{title}" (valid, not timely) | Defer — trigger: {condition} |
| 6 | Parked | "{title}" (trigger met) | Promote — trigger fired |
| 7 | Scoring | "{title}" (ready, unscored) | Flag for scoring — /claude-tweaks:specify #{n} |
| 8 | Blocked | "{title}" (bot:blocked) | Re-triage — /claude-tweaks:triage |
| 9 | Legacy | "{title}" (carries tier:approved) | Retired vocabulary — needs migration/re-triage |
| 10 | Sizing | "{title}" (ready, 12 tasks implied) | Split into two records |
| 11 | Design doc | "{filename}" (specified) | Delete |
| 12 | Plan | "{filename}" (orphaned) | Delete |
| 13 | Worktree | "{path}" (merged) | Remove |
| 14 | Branch | "build/{name}" (merged) | Delete |
| 15 | Backlog (unsynced) | "{title}" — local-only under `work-backend: github-issues` | Sync to GitHub |

### Cross-Spec Patterns (if any)

| # | Pattern | Seen In | Recommended |
|---|---------|---------|-------------|
| 16 | {description} | Specs {list} | Add rule to CLAUDE.md |
| 17 | {description} | Specs {list} | Promote to spec |

*Patterns are informational — they highlight systemic issues across multiple specs. Address them to prevent the same findings from recurring.*

### Summary
- Backlog: {X} records ({Y} stale, {Z} ready to promote)
- Parked: {X} records ({Y} trigger-met, {Z} still waiting)
- Ready, unscored: {N} — needs `/claude-tweaks:specify`
- `bot:blocked`: {N} — needs `/claude-tweaks:triage`
- Legacy taxonomy: {N} records — needs migration
- Plans to clean: {D} design docs, {E} execution plans
- Git cleanup: {F} worktrees, {G} build branches
```

Immediately after presenting the report above, call `AskUserQuestion`:

- `question`: `"How do you want to handle these tidy actions?"`, `header`: `"Tidy actions"`, `multiSelect`: `false`
- Option 1 — `label`: `"Apply all (Recommended)"`, `description`: `"Apply all recommendations shown above"`
- Option 2 — `label`: `"Override specific items"`, `description`: `"Tell me which #s to change"`

If "Override specific items" is chosen, the follow-up (#s and target values) is ordinary free-text conversation in the next message, per CLAUDE.md's Multi-item decisions convention — not the tool's built-in `Other` field.

Items recommended as "Keep", flagged for scoring/re-triage, or flagged as legacy taxonomy are included for visibility but require no mutation. Only items with an active recommendation (delete, defer, absorb, promote, sync, fix) are executed.

---

## Step 7: Execute Approved Actions

Execute each approved action per the Action Vocabulary table — that table is the canonical reference for per-action execution rules (delete the record / set `stage: parked` in place or add the `parked` label / integrate into the target record / recommend `/claude-tweaks:specify`). Every action must be atomic: complete all its execution steps or none.

Cross-action housekeeping (apply once per run after all actions execute):

- Remove worktrees with `git -C "{REPO_ROOT}" worktree remove {path}`; delete branches with `git -C "{REPO_ROOT}" branch -d {name}` (see Step 4.5 working-directory discipline).

## Step 7.5: Verify Execution

After all actions are applied, verify every decision was fully executed. Present a verification checklist:

```markdown
### Verification

- [x] Deleted: "{title}" — record removed (`specs/{id}-{slug}.md` deleted, or issue #{n} closed with comment)
- [x] Deferred: "{title}" — `specs/{id}-{slug}.md` now `stage: parked` (trigger: {condition}) (`local-files`)
- [x] Deferred: "{title}" — issue #{n} relabeled `parked`{, milestone "{name}" attached} (`github-issues`)
- [x] Synced to GitHub: "{title}" — issue #{n} created (labels: {list}), `specs/{id}-{slug}.md` deleted
- [x] Absorbed: "{title}" → #{m} — integrated into Deliverables/AC, source removed/closed
- [x] Promoted: "{title}" — recommended `/claude-tweaks:specify {ref}`, record unchanged
- [x] Captured: "{title}" — new backlog record with source URL (PR/thread/issue link)
- [x] Closed (GitHub): PR #{n} / issue #{n} — explanatory comment posted, state re-queried as `CLOSED` (`gh pr view {n} --json state` / `gh issue view {n} --json state`)
- [x] Resolved thread: PR #{n} — thread re-queried as `isResolved: true`
- [ ] FAILED: "{title}" — {what went wrong}
```

If any verification fails, fix it before committing. Do not commit partial state.

Commit with a message summarizing the tidy-up. For a scoped run (`--scope` was passed), prefix the message with the scope, e.g. `Tidy (scope: github): closed 2 stale issues, promoted #142` — see "Scope Selection" above. An unscoped full run's commit message is unchanged (no scope prefix).

## Routine Configuration

`/tidy` ships two routine templates. The default, `skills/tidy/routine-template.yml`, is a weekly full-backlog hygiene sweep — instantiate it with:

```
/claude-tweaks:routine create tidy
```

A second variant, `skills/tidy/routine-template-github-triage.yml`, runs only GitHub issue/PR triage (`--scope=github`) on a much tighter cadence, and can be instantiated alongside the default in the same project:

```
/claude-tweaks:routine create tidy --variant=github-triage
```

Both resolve the account- and project-specific values a portable template can't hardcode (which environment, which repo) and create a live cloud Routine via `RemoteTrigger` directly — see `skills/routine/SKILL.md` for the full mechanism, including how `--variant` selects between them. Add `--dry-run` to inspect the assembled configuration before anything is created.

**Unattended execution:** a scheduled firing runs Steps 1-7.5 exactly as an interactive invocation would, except Step 6's Standalone auto fallback takes over in place of the interactive batch-approval prompt — but only when the target project's own CLAUDE.md already sets `auto-mode: default-on` (project policy, not a routine-specific mechanism — see `_shared/auto-mode-contract.md`). A bare scheduled firing (`/claude-tweaks:tidy`, no arguments, no conversation history) has no other way to supply an `auto` mode signal; if the project hasn't configured `auto-mode: default-on`, the routine falls back to interactive and blocks on a batch-approval prompt that will never be answered. When auto-mode is enabled project-wide, safe, atomic actions (stale deletes and cleanly-merged worktree/branch removals) auto-apply per the `conservative` aggressiveness default, and everything requiring judgment is staged to that run's `decisions.md` rather than blocking on input. Nothing is invented here for routines specifically — this is the same Standalone auto path `/tidy` already uses whenever it runs outside a parent pipeline. If Task-based subagent dispatch isn't available in a given cloud routine session, Steps 1-4.8 degrade to running sequentially in the main thread instead of in parallel — same steps, same output, just not parallelized.

> **Billing note:** Routines run inside the subscription; verify automation-credit specifics against the live account.

## Next Actions

Call `AskUserQuestion`:

- `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`
- Option 1 — `label`: `"Help dashboard (Recommended)"`, `description`: `"/claude-tweaks:help — full pipeline status with refreshed counts after the cleanup"`
- Option 2 — `label`: `"Build {N}"`, `description`: `"/claude-tweaks:build {N} — build the highest-priority ready spec surfaced by the tidy report"`
- Option 3 — `label`: `"Specify {topic}"`, `description`: `"/claude-tweaks:specify {topic} — specify an unspecified design doc surfaced by the audit"`
- Option 4 — `label`: `"Triage the queue"`, `description`: `"/claude-tweaks:triage — authorize any ready-but-unscored or bot:blocked records the audit surfaced"`

## Component-Skill Contract

`/claude-tweaks:tidy` is a **standalone-only** maintenance skill — it is not invoked by any parent skill in the workflow. There is no `PIPELINE_RUN_DIR` signal expected as a caller-side argument (the run dir is only resolved internally for the auto-mode aggressiveness routing in Step 6). The `## Next Actions` block always renders. If a future parent skill ever wraps `/tidy` (e.g., a scheduled hygiene pass inside `/flow`), the parent must update this contract; until then, treat parent invocation as not applicable.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Deleting specs without checking if they're implemented | Always scan the codebase first — the spec may be partially or fully built |
| Promoting backlog records directly to specs without brainstorming | Brainstorming catches assumptions that skip straight to implementation |
| Keeping everything "just in case" | Stale items create noise and slow down `/claude-tweaks:help` |
| Presenting items one-at-a-time for individual decisions | Scan silently, present one batch report, let the user approve all or override specific items. Per-item prompts scale badly. |
| Deleting backlog records marked as "Promote" | A promoted record stays open and unchanged until `/claude-tweaks:specify` shapes it — the record itself is the tracking artifact. Deleting it drops the item on the floor. |
| Appending an "Absorbed Scope" section to a record | Absorbed content must be integrated into existing Deliverables, Acceptance Criteria, and Technical Approach. Appendix sections create second-class content that `/superpowers:writing-plans` may miss. |
| Committing without running verification | Always verify every action landed (Step 7.5) before committing. Partial execution creates orphaned or lost items. |
| Clearing a local record before `gh issue create` confirms success | Sync to GitHub writes to GitHub before touching the local file — if the local record is removed first and the GitHub write fails, the item is lost entirely, not just unsynced. |
| Treating Defer (`github-issues` backend) as a single atomic step | It's a multi-step GitHub-side sequence (body edit → label add → possible milestone attach) with no local file involved — if a later step fails after an earlier one succeeded, the record is left partially updated. Report exactly which step failed rather than assuming all-or-nothing. |
| Auto-running downstream skills like `/review`, `/build`, or `/specify` | /tidy never invokes downstream skills autonomously. Recommendations are staged for the user — they require human judgment about timing and scope. |
| Escalating `git branch -d` to `git branch -D` when delete refuses | `-d` refusing means the branch has unmerged work. Surface as `unmerged — manual review required`; never destructive-delete autonomously. |
| Closing a PR/issue without a comment | Silent closes destroy the audit trail and confuse collaborators. Comment first, then close — the comment is the record of why. |
| Resolving review threads without commit evidence | Resolving unaddressed feedback is worse than leaving it open — the concern disappears without being fixed. Evidence means a commit touching the flagged lines. |
| Relabeling a legacy-taxonomy record instead of flagging it | Shape 7 is read-only by design — `/tidy` surfaces retired `tier:*`/`status:*`/`backlog` labels for a dedicated migration pass; it never relabels them itself. |
| Treating an unscored `ready` record as automatically triage-eligible | Labels are projection, not truth — a `ready` label alone doesn't mean scoring happened. Shape 4 exists to catch this proactively, before `/claude-tweaks:triage` has to flag it back reactively. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:capture` | Feeds the backlog records /claude-tweaks:tidy audits |
| `/claude-tweaks:specify` | /claude-tweaks:tidy flags unspecified design docs for /claude-tweaks:specify (Step 3). /claude-tweaks:specify's Shaping mode removes `parked` and stamps `ready` on a promoted record in place — there is no separate backlog entry to delete. |
| `/claude-tweaks:review` | /claude-tweaks:tidy's Step 5.5 scans review summaries for cross-spec patterns (recurring findings, flagged files) |
| `/claude-tweaks:wrap-up` | /claude-tweaks:tidy's Step 5.5 scans wrap-up reflections for cross-spec patterns (recurring gotchas, deferred themes) |
| `/claude-tweaks:help` | /claude-tweaks:help suggests /claude-tweaks:tidy when maintenance signals are detected; both read the same work-record queue via `parseRecordFacets` |
| `_shared/work-record.md` | Taxonomy home — the seven-axis label contract (stage / grants / bot state / origin / scoring / type / acceptance) Step 1's record scan reads, and the permission-matrix row `/tidy` implements: adds/removes `parked` (Defer action / trigger-met wake), removes orphaned `bot:in-progress` (Step 4.7's backstop); never touches `auto:*`. |
| `bin/lib/issues/{record,local-store}.js` | `record.js`'s `parseRecordFacets` facet-parses every open `github-issues` record in Step 1, and its `recordPayload`/`extractFingerprint` back the Sync action's issue-creation payload; `local-store.js`'s `queryRecords`/`writeRecord` are the entire `local-files` driver for the same step. |
| `/claude-tweaks:build` | /claude-tweaks:tidy cleans up leftover worktrees and `build/*` branches from previous builds |
| `/claude-tweaks:init` | /claude-tweaks:tidy Step 4.6 audits doc registry health — flags stale entries, gaps, pattern drift. Suggests `/init update` for tier drift. |
| `/claude-tweaks:ledger` | /ledger creates the per-feature ledger files /tidy scans for stale or orphaned open items during periodic hygiene. /tidy may surface ledgers whose related spec is complete but whose items were never resolved. |
| `/claude-tweaks:code-health` | `/code-health` files improvement findings as `code-health`-labelled records; `/tidy` Step 4.8 audits them — stale/superseded ones are closed (with comment) after batch approval, still-valid ones suggested for `/claude-tweaks:triage`. |
| `/claude-tweaks:harness-health` | `/harness-health` files skill/rule/CLAUDE.md drift findings as `harness-health`-labelled records; `/tidy` Step 4.8 audits them alongside code-health and journey-health records — stale/superseded ones closed after batch approval, still-valid ones suggested for `/claude-tweaks:triage` or direct application. |
| `/claude-tweaks:docs-health` | `/docs-health` files `docs/**` genre-drift/depth-mismatch/findability/staleness findings as `by:docs-health`-labelled records; `/tidy` Step 4.8 audits them alongside code-health, harness-health, and journey-health records — stale/superseded ones closed after batch approval, still-valid ones suggested for `/claude-tweaks:triage`. |
| `/claude-tweaks:routine` | `/routine create tidy` instantiates tidy's `routine-template.yml` into a live, scheduled cloud Routine — the mechanism behind this skill's own "Routine Configuration" section. |
| `/claude-tweaks:triage` | Reciprocal gate relationship: `/tidy`'s Step 1 record scan surfaces `bot:blocked` records (Shape 5) and `ready`-but-unscored records (Shape 4) as candidates for `/claude-tweaks:triage`'s worklist, and its Step 4.8 pending-authorization count (per `_shared/github-pr-scan.md`'s `repo-wide` scope) surfaces in the rolling digest. `/tidy` never grants authorization itself — that stays `/claude-tweaks:triage`'s job. Migration note: pre-6.0 records still carrying retired `tier:*`/`status:*`/`backlog` labels surface via `/tidy`'s legacy-taxonomy finding (Shape 7), not through the gate — see `triage/SKILL.md`'s own Relationship row for the reciprocal note. |
| `/claude-tweaks:review-backlog` | Reciprocal: review-backlog folds `unsynced: true` local fallback records into its survey (surfacing, never fixing them) — `/tidy`'s existing Shape 3 (Step 1) owns the actual sync action. |
| `/claude-tweaks:dispatch` | `/tidy` Step 4.7 surfaces orphaned or stale claims dispatch left behind, and Step 1's Shape 5 surfaces `bot:blocked` records (dispatch's retry-ceiling mark) as re-authorization candidates. A headless dispatch firing's outcome ultimately surfaces on `/tidy`'s own rolling `--scope=github` digest rather than a console dispatch renders itself. |
| `_shared/auto-mode-contract.md` | Single source of truth for auto-mode behavior — read before adding any auto-mode handling. The aggressiveness-routing table in Step 6 (conservative / moderate / aggressive) implements the contract's reversibility/confidence floors for tidy actions. |
| `_shared/pipeline-run-dir.md` | Standalone-auto fallback (Step 6) creates `.claude-tweaks/pipelines/{ts}-tidy-standalone/` with `decisions.md` + `staged/` per this shared procedure. /tidy is on the standalone-auto allowlist. |
| `_shared/subagent-output-contract.md` | Steps 1-4.8 dispatch parallel Task agents per this contract — minimal input, status line first (`DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED`), Template A inlined verbatim. Model tier: Fast. |
| `_shared/issue-claims.md` | Step 4.7 sweeps `refs/claims/*` for stale and orphaned claims per this contract — release only after batch approval, never autonomous. |
| `_shared/github-pr-scan.md` | Step 4.8 sweeps open PRs, code-health, harness-health, journey-health, and docs-health records per this shared procedure (`repo-wide` scope) — detection ladder, staleness thresholds, findings table, severity mapping. Backlog-record queries live in Step 1 now, not here. |
| `flow/materialize.md` | Step 4.7's parked-restoration backstop reads the `record:`/`parked-at-shaping` fields this file defines, on the committed build-time headers under `.claude-tweaks/pipelines/**/work/*-spec.md`. |
| `wrap-up/cleanup-procedures.md` | Section E's claim-release step restores `parked` on an abandoned outcome when the materialized header carries `parked-at-shaping: true`; Step 4.7's backstop above catches a restoration that silently failed there. |
