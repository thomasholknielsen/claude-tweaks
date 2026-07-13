---
tier: 1
status: not-started
progress: 0
blocked-by: [14]
surface: backend
---

# 18: /triage as the pure human gate

## Overview

`/triage` becomes single-purpose: an interactive, human-present authorization gate over the unified record queue. It pulls open `ready` ungranted records of **any origin** (health-filed, captured, human-filed alike), renders the batch table with a mechanical recommendation from `recommendGrants` (risk×effort), and applies the grants the human confirms: `auto:build`, optionally + `auto:merge`. "Flag back" replaces `tier:needs-review`: remove `ready`, comment why — the record returns to backlog state for more shaping. The headless `dispatch` mode moves out entirely (spec 19). Before granting, the gate re-verifies the body is actually spec-shaped (**labels are projection, not truth**) — a `ready` label on an unshaped body gets flagged back, not granted.

**Complexity:** Medium
**Estimated tasks:** 5

## Non-Goals

- No dispatch/claiming/execution logic remains here (spec 19).
- No routine template for triage (retired — dispatch owns scheduling; spec 19).
- Never grants on `local-files` records (headless dispatch is github-only; grants on local records are recorded by hand if a human wants them — out of scope here).
- No changes to `_shared/github-pr-scan.md`'s Detection Ladder (still the preflight, still a hard gate).

## Current State

- `skills/triage/SKILL.md` — bare invocation Steps 1–4 (pull `code-health`/`harness-health` issues, filter tiered, `recommendTier`, batch table, apply `tier:*` with `status:blocked` strip) + the entire `dispatch` workflow (Steps 1–4, claims, grouping, Task dispatch, retry ceiling, auto-merge gate, consolidated console) + Configuration table + routine references.
- `bin/lib/issues/tier.js` — rewritten by spec 14 (`recommendGrants`, colon-form extraction).

## Deliverables

- [ ] Rewrite Step 1: pull open records with `ready`, without `auto:*`, without `bot:*` — origin-agnostic (`gh issue list --label ready --state open`, then facet-filter via `parseRecordFacets`); no producer-label queries.
- [ ] Step 2: `recommendGrants` per record; unscored records (no risk/effort) recommend no grants — table shows "needs scoring → flag back or score now" (human may supply scoring inline; gate stamps it with the grant).
- [ ] Step 3 batch table: `# / Record / Origin / Risk / Effort / Recommended` where Recommended ∈ {`auto:build`, `auto:build + auto:merge`, `flag back`}; one AskUserQuestion (apply all / override / flag some), free-text overrides per convention.
- [ ] Step 3.5 (new): body-shape re-verification for every record about to be granted, per `_shared/work-record.md`'s spec-shaped definition (sections present, non-empty, no unresolved placeholder markers — deliberately structural-plus-minimal; content quality stays human judgment) — a failing record's row auto-downgrades to flag-back with a comment naming what's missing; cite the invariant by name.
- [ ] Step 4 apply: bootstrap-then-add grants per `_shared/label-bootstrap.md`; when granting a record carrying `bot:blocked`, strip `bot:blocked` (re-authorization after ceiling — same rationale as today's `status:blocked` strip); flag-back = remove `ready` + comment; log every action to the standalone run dir's `decisions.md`.
- [ ] Rewrite Next Actions (offer `/dispatch` picklist / `/dispatch next` / re-run triage), Anti-Patterns (grant-only-interactively survives verbatim in new vocabulary; add "never grant on a `ready` label alone — re-verify the body"), Relationship table (dispatch as the consumer; producers as feeders).

## Acceptance Criteria

1. `grep -n "dispatch" skills/triage/SKILL.md` matches only references to the *separate* `/dispatch` skill (hand-off prose, Next Actions, Relationship table) — no workflow steps, no claim/retry/auto-merge/console procedures remain.
2. `grep -n "tier:approved\|tier:fast-track\|tier:needs-review\|status:blocked\|status:in-progress" skills/triage/SKILL.md` returns 0 matches (a single migration-note line excepted).
3. Step 1 pulls by `ready` with no `by:*`/producer filter; the SKILL.md states origin-agnosticism explicitly.
4. The body-shape re-verification step exists, runs before any grant, and its downgrade-to-flag-back behavior is specified with the comment content.
5. The security sentence appears literally: `auto:*` labels are only ever added by an interactive human session; machinery may only remove them.
6. `grep -n "routine" skills/triage/SKILL.md` returns no triage-owned routine creation (references to `/routine create dispatch` allowed).

## Technical Approach

The gate stays a thin two-query + one-table + one-apply flow. Re-verification fetches bodies only for rows about to be granted (not the whole queue) — projection for listing, truth before action. Keep the Detection Ladder preflight as a hard gate. Grants for records that are sub-issue leaves: no parent-state check needed (parents are never `ready` by construction — spec 17); a leaf may be granted while siblings stay ungranted.

## Gotchas

- Two sessions triaging concurrently: label adds are idempotent (`--add-label` twice is safe); last-writer-wins on flag-back vs grant is acceptable for a human-vs-human race — note it, don't engineer around it.
- The `bot:blocked` strip on re-grant mirrors today's rule for `status:blocked` — without it, dispatch's skip rule would ignore the fresh authorization forever (documented incident).
- Don't fetch 100 bodies for the table — list with labels only; bodies only at the re-verification step.

## Key Files

- `skills/triage/SKILL.md`
- `bin/lib/issues/tier.js`, `bin/lib/issues/record.js` (consumers)
