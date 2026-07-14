# Spec 21: Dashboards and Hygiene — /tidy and /help on Live Record Queries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/tidy`'s backlog-file + spec-directory + GitHub-issue scans collapse into ONE record scan with facet-based findings; `/help` renders live stage counts from one list call; `_shared/github-pr-scan.md` moves to the new taxonomy. Evidence tier, digest, notifications, archival survive with renamed queries.

**Architecture:** One `gh issue list --state open --json number,title,labels,milestone,updatedAt --limit 200` + `parseRecordFacets` feeds both skills (tidy findings; help counts); local driver via `queryRecords`. Steps 3-4.6 of tidy (worktree/plan/design-doc/registry scans) unchanged. `/tidy` still never grants and never runs downstream skills.

## Global Constraints

- Work from: `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-13-23` — verify `pwd` + `git rev-parse --show-toplevel`.
- **Finding shapes (the record scan, replacing tidy Steps 1/2/4.8):** backlog record stale (>4 weeks untouched); parked trigger met (milestone due / watched-path commit — evidence-tier procedures unchanged); `unsynced` local record → Sync (F9: covers `specs/{id}-{slug}.md` records with `unsynced: true` facets under `work-backend` — the promise capture/specify already cite); `ready` + unscored → "needs scoring" flag for `/triage`; `bot:blocked` → surface for human re-triage; open record whose flagged code is gone → Close-with-comment (evidence row unchanged); **legacy taxonomy present** (any open issue carrying `tier:*`, `status:*`, or `backlog`-era labels) → "retired vocabulary — invisible to the grants pipeline; needs migration/re-triage" (read-only flag).
- **Action Vocabulary rewrite:** Delete→close-not-planned-with-comment; Defer→`parked` (+milestone/watched-paths trigger); Absorb (was Merge)→integrate into `#M`, comment, close not-planned; Promote→recommend `/claude-tweaks:specify #{n}` (no mutation); Keep; Sync to GitHub (from `unsynced` local records via `recordPayload`); Close/Resolve-thread/Capture unchanged. Scope taxonomy: `inbox` scope → `backlog`; `specs` scope = the record queue, not a directory.
- Aggressiveness routing: same reversibility floors, renamed actions; the four never-auto GitHub-mutation rows survive VERBATIM in new vocabulary.
- **F11 (tidy's share):** `tidy/SKILL.md:114` (cites spec-template's deleted "frontmatter reference") → cite `_shared/work-record.md` + materialize.md's header; `:125`/`:388` ("/specify Step 8 deletes it") → shaped-in-place framing (Promote = recommend `/specify #{n}`; nothing to delete); `scan-procedures.md:175-192` spec-era rules die with the merged scan. help/context-flow.md is spec 23's — do NOT touch it.
- Step 4.7 claim sweep: mechanics unchanged; `status:in-progress` → `bot:in-progress`.
- **github-pr-scan.md:** repo-wide queries → `--label ready`; pending-authorization = `ready` ∧ no `auto:*` ∧ no `bot:*`; `bot:blocked` count; backlog-state count (open, no stage labels); digest "Pending authorization" line reads the new query; **the auto-merge counter greps BOTH `[fast-lane]` (legacy commits) and `[auto-merge]` (dispatch's tag)**; Detection Ladder untouched.
- **help/status-scan.md:** stage counts (backlog / parked / ready / authorized / building / blocked) from one list call + facet parse; drop INDEX.md + spec-directory reads; PR/current-branch stages keep; `groupByFileOverlap` conflict stage feeds from open in-flight records; triage-queue counts → the new pending-authorization definition.
- Digest dedup note: finding-type names change → one firing re-notifies open findings under new keys (accepted, one-time — say it).
- `routine-template-github-triage.yml`: verify args (`--scope=github` unaffected by the inbox→backlog rename; if the template names a renamed scope, fix it).
- ACs 1-6 = completion contract. Sweep rule per touched file. Tests updated same-task (tidy/help skill-md assertions exist per AC 6 — grep first). No emojis.

---

### Task 1: tidy — SKILL.md + scan-procedures.md (+ routine template check)

- The merged record scan (one finding table with the seven shapes above), Action Vocabulary, aggressiveness table, evidence tier (exactly four auto-apply shapes, `parked`-removal rows intact — AC 4), Step 4.7 rename, scope-table rename, F11 fixes, digest/notification/archival query renames, Anti-Patterns/Relationship updates (dispatch/work-record/record.js rows; bidirectional).
- scan-procedures.md: classification tables → facet vocabulary; `**Stage:**`/`**Deferred:**` file-era staleness rules deleted; age thresholds keep.
- Verify: `grep -n "INDEX.md" skills/tidy/SKILL.md skills/tidy/scan-procedures.md` → 0 (AC 1); `grep -rn "specs/backlog\|\*\*Stage:\*\*" skills/tidy/` → 0 outside legacy notes (AC 2); no `inbox` scope in the --scope table (AC 2); evidence tier = four rows (AC 4); `grep -c "bot:in-progress" skills/tidy/SKILL.md` ≥ 1; `grep -n "status:in-progress" skills/tidy/` → 0; `grep -n "scope=github" skills/tidy/routine-template-github-triage.yml` (unaffected confirmation); npm test tail.
- Commit: `Collapse tidy scans into one record scan — facet findings, renamed actions, bot labels`

### Task 2: _shared/github-pr-scan.md

- Queries + pending-authorization definition + bot:blocked/backlog counts + digest line + the dual-tag auto-merge counter; Detection Ladder byte-untouched.
- Verify: `grep -n "tier:\|--label code-health\|--label harness-health\|--label backlog" skills/_shared/github-pr-scan.md` → 0 (AC 3); `grep -n "ready" skills/_shared/github-pr-scan.md | head -3`; `grep -n "auto-merge\|fast-lane" skills/_shared/github-pr-scan.md | head -3` (both tags); npm test tail.
- Commit: `Move github-pr-scan onto the record taxonomy — ready-based pending authorization, dual-tag merge counter`

### Task 3: help — SKILL.md + status-scan.md

- Stage-count line covering all five spine states + blocked (AC 5); one list call + parseRecordFacets; INDEX/spec-dir reads dropped from status-scan.md; conflict stage from open records; triage-queue counts renamed; Relationship rows (dispatch, work-record).
- Verify: `grep -n "INDEX.md" skills/help/status-scan.md` → 0 (AC 1/5); `grep -in "backlog / parked / ready\|backlog, parked, ready" skills/help/status-scan.md | head -2` (spine counts); `grep -n "specs/" skills/help/status-scan.md | head -5` (no spec-directory scan reads outside legacy notes); npm test tail.
- Commit: `Render help status from live record queries — five-state spine counts`

### Task 4: Spec-21 acceptance sweep

- ACs 1-6 re-run + F9 verification (`grep -in "unsynced" skills/tidy/SKILL.md skills/tidy/scan-procedures.md` — Sync finding present, covers work-backend records) + F11 tidy-share verification (the two dangling pointers GONE: `grep -n "frontmatter reference\|Step 8" skills/tidy/SKILL.md` → 0 stale hits) + `npm test`.
- Fix findings (spec-21 files only), re-run until clean. Commit only if fixes.
