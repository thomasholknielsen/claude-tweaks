---
tier: 1
status: not-started
progress: 0
blocked-by: [20]
surface: backend
---

# 21: Dashboards and hygiene — /tidy and /help on live record queries

## Overview

`/tidy` and `/help` stop scanning parallel stores and query the record system directly. `/tidy`'s backlog-file scan (Step 1), spec-directory scan (Step 2), and GitHub-issue scan (Step 4.8) collapse into **one record scan** with facet-based findings (stale backlog records, parked-trigger wakes, unsynced local records, unscored `ready` records, `bot:blocked` needing re-triage); the INDEX-drift and legacy-file scans die with their structures. `/help`'s dashboard renders live counts by stage / grants / bot state and the pending-authorization queue. `_shared/github-pr-scan.md`'s queries move to the new taxonomy.

**Complexity:** Medium
**Estimated tasks:** 7

## Non-Goals

- PR-scan mechanics (stale PRs, review threads, CI state) unchanged — only issue-side queries and vocabulary move.
- The evidence tier, rolling digest, notification dedup, and archival compaction survive as-is with renamed queries.
- `/tidy` still never grants (`auto:*`) and never runs downstream skills.
- Worktree/plan/design-doc/registry scans (Steps 3–4.6) unchanged.

## Current State

- `skills/tidy/SKILL.md` — Steps 1–5.5 with scope taxonomy (`inbox`,`specs`,`github`,…); Action Vocabulary (Delete/Defer/Merge/Promote/Keep/Sync/Close/Resolve/Capture) with per-backend execution; aggressiveness routing incl. four never-auto GitHub-mutation rows; evidence tier (4 shapes incl. `parked`-label removal on milestone/watched-path evidence); rolling digest + notification + archival.
- `skills/tidy/scan-procedures.md` — per-step classification tables (age thresholds, `**Stage:**` fields, `**Deferred:**` staleness).
- `skills/help/SKILL.md`, `status-scan.md` — pipeline status stages incl. spec/INDEX reads, triage-queue counts; `reference-card.md`, `context-flow.md` (spec 23 owns those two).
- `skills/_shared/github-pr-scan.md` — repo-wide scope queries `gh issue list --label code-health/--label harness-health/--label backlog`; pending-authorization = no tier label.

## Deliverables

- [ ] `/tidy`: replace Steps 1/2/4.8's issue+file+spec-dir scans with one record scan — github driver: `gh issue list --state open` + `parseRecordFacets`; local driver: `local-store.js` `queryRecords`. Finding shapes: backlog record stale (>4 weeks untouched), parked trigger met (milestone due / watched-path commit — evidence tier unchanged), `unsynced` local record → Sync, `ready` + unscored → "needs scoring" flag for `/triage`, `bot:blocked` → surface for human re-triage, open record whose flagged code is gone → Close-with-comment (evidence tier row unchanged), **legacy taxonomy present** (any open issue carrying `tier:*`, `status:*`, or `backlog`-era labels) → surface "retired vocabulary — invisible to the grants pipeline; needs migration/re-triage" so pre-6.0 issues can never be silently orphaned (read-only flag; the migration plan does the relabeling).
- [ ] Action Vocabulary rewrite: Delete→close-not-planned-with-comment; Defer→`parked` (+milestone/watched-paths via `parkedIssuePayload`-equivalent in `record.js`); Absorb (was Merge)→integrate into `#M`, comment, close not-planned; Promote→recommend `/specify #{n}` (no mutation — unchanged stance); Keep; Sync to GitHub (from `unsynced` local records); Close/Resolve-thread/Capture unchanged. Update scope taxonomy: `inbox` scope name → `backlog`; `specs` scope now means the record queue, not a directory.
- [ ] `scan-procedures.md`: rewrite classification tables to facet vocabulary; delete `**Stage:**`/`**Deferred:**`-field staleness rules (file-era); keep age thresholds.
- [ ] Aggressiveness routing table: same reversibility floors, rows renamed to the new actions; never-auto rows (GitHub-visible mutations) survive verbatim in new vocabulary.
- [ ] `_shared/github-pr-scan.md`: repo-wide queries → `--label ready` (pending-authorization = `ready` without `auto:*` and without `bot:*`), `bot:blocked` count, backlog-state count (open, no stage labels); digest "Pending authorization" line reads the new query.
- [ ] `/help` `status-scan.md`: stage counts (backlog / parked / ready / authorized / building / blocked) from one list call + facet parse; drop INDEX.md and spec-directory reads; keep PR/current-branch stages; `groupByFileOverlap` conflict stage now feeds from open in-flight records.
- [ ] Update both SKILL.md scope tables, Anti-Patterns, Relationship rows; digest/notification/archival sections get query renames only.

## Acceptance Criteria

1. `grep -n "INDEX.md" skills/tidy/SKILL.md skills/tidy/scan-procedures.md skills/help/status-scan.md` → 0 matches (migration notes excepted).
2. `grep -rn "specs/backlog\|\\*\\*Stage:\\*\\*" skills/tidy/` → 0 matches outside legacy notes; the `--scope` table has no `inbox` scope (renamed `backlog`).
3. `github-pr-scan.md`'s pending-authorization definition is `ready` ∧ no `auto:*` ∧ no `bot:*`; no `tier:`/`backlog`-label queries remain anywhere in the file.
4. `/tidy`'s evidence-tier table still lists exactly four auto-apply shapes, expressed in new vocabulary (`parked` removal rows intact).
5. `/help` renders a stage-count line covering all five spine states + blocked; no read of `specs/INDEX.md` remains in `status-scan.md`.
6. `npm test` passes (tidy/help skill-md assertions updated).

## Technical Approach

One `gh issue list --state open --json number,title,labels,milestone,updatedAt --limit 200` feeds both skills' issue-side needs (tidy findings; help counts) — facet parsing is local, cheap, and consistent via `parseRecordFacets`. Parked-trigger evidence checks reuse today's milestone/`git log`-on-watched-paths procedures unchanged. Keep tidy's parallel-agent dispatch structure; only the scan-step set shrinks.

## Gotchas

- The digest dedup keys on `{number}:{finding-type}` — finding-type names change with the vocabulary; note that one firing after migration re-notifies open findings under new keys (accepted, one-time).
- `/tidy` Step 4.7 (claim sweeps) is untouched but its label references (`status:in-progress`) → `bot:in-progress`.
- The four never-auto rows exist because GitHub mutations are collaborator-visible — reversibility floors are contract, not style; port exactly.
- Scope-name rename (`inbox`→`backlog`) breaks saved routine args — the github-triage routine template's `--scope=github` is unaffected, but check the template for any renamed scope reference.

## Key Files

- `skills/tidy/SKILL.md`, `skills/tidy/scan-procedures.md`, `skills/tidy/routine-template-github-triage.yml` (verify args)
- `skills/help/SKILL.md`, `skills/help/status-scan.md`
- `skills/_shared/github-pr-scan.md`
