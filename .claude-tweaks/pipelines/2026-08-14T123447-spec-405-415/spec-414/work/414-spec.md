---
record: 414
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
blocked-by: [411]
surface: backend
---
# 414: Sweep backstop: unarmed ready PRs, unsettled runs, tidy housekeeping auto-merge grant

Surface: backend

## Overview

Extend `_shared/github-pr-scan.md`'s repo-wide scope with the two checks that make PR durability need no surviving session, and give tidy's own housekeeping PRs a sanctioned merge path. Check 1, **unarmed ready PR**: a green, gate-passed, granted, plugin-created PR past an age threshold whose `--auto` was never armed → arm it (granted) or escalate (ungranted). Check 2, **unsettled run**: a pushed run branch whose PR shows no progress plus a live claim or stale `bot:in-progress` past a threshold → surface with the resume command. Improvised per-PR check-in loops become an explicit anti-pattern: durability lives in GitHub's `--auto` plus this scheduled sweep, neither of which dies with a session.

This supersedes and closes #71 (tidy PRs get the housekeeping grant path), #72 (its own recommendation — sweep-based recovery independent of fragile loops — implemented), and #314 (the unsettled-run sweep it requested, made cheap by PR-early visibility). The shipping merge must carry `Fixes #71`, `Fixes #72`, `Fixes #314`.

**Complexity:** Medium
**Estimated tasks:** 6

## Non-Goals

- No new merge mechanics — arming uses `_shared/pr-first-merge.md`'s procedure.
- No auto-merge for *ungranted* anything: ungranted findings surface, humans act.
- No changes to `merge-check`/authorization semantics.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| merge-path | Merge-path conversion | ready |

## Current State

- `skills/_shared/github-pr-scan.md` — repo-wide scope: open-PR classification (awaiting-review info rows, failing-CI high rows), staleness thresholds, Output Contract row prefixes, severity mapping.
- `skills/tidy/SKILL.md` Step 7 — opens housekeeping PRs; Auto-mode routing classifies "Awaiting review" as no-op at every aggressiveness tier (the #71 gap).
- `skills/tidy/step-6-auto.md` — the aggressiveness tier table the new action rows join.
- `skills/_shared/issue-claims.md` — claim blobs and `bot:in-progress` mirror labels (check 2's inputs).
- `skills/_shared/auto-mode-contract.md` — API-write floor: network writes never auto-resolve without an explicit grant; `auto:merge` is the precedent grant shape.
- `skills/_shared/policy-schema.md` — where the new grant key lands.

## Deliverables

- [x] `github-pr-scan.md` repo-wide check: **unarmed ready PR** — item 9, detecting `<!-- claude-tweaks-run: {run-id} -->` or `<!-- tidy-housekeeping-pr -->` markers, gated on not-draft/CI-green/0-unresolved-threads, granted via `auto:merge` on every linked record or `housekeeping-auto-merge`.
- [x] `github-pr-scan.md` repo-wide check: **unsettled run** — item 10, unioning claims-registry blobs and `bot:in-progress` labels, reverse-joining via `closingIssuesReferences`.
- [x] `housekeeping-auto-merge` policy key (default off) in `policy-schema.md`; tidy stamps `<!-- tidy-housekeeping-pr -->` at creation.
- [x] `tidy/step-6-auto.md` rows for both findings; `tidy/SKILL.md` Step 7 documents the grant and the marker.
- [x] Anti-pattern entry in `github-pr-scan.md`: self-scheduled per-PR check-in loops, named, with the sweep as the replacement.
- [x] Thresholds as policy keys with schema defaults: `pr-unarmed-age-hours` (24), `unsettled-age-hours` (24).

## Acceptance Criteria

1. A fixture green granted PR older than threshold with `--auto` unarmed produces the `[pr-unarmed]` row; the same PR ungranted produces the needs-grant row instead.
2. With `housekeeping-auto-merge` set, a marker-stamped green tidy PR is armed on the next sweep (logged AUTO with the grant named); with the key unset it is staged.
3. A fixture branch with a live claim and a silent PR past threshold produces the `[unsettled]` row containing the literal resume command.
4. The severity mapping and Output Contract sections list both new prefixes; existing rows are unchanged (delta review of the file).
5. `npm test` passes.

## Technical Approach

Both checks are read-mostly additions to an existing scan file that already runs behind the forge-detection ladder with explicit `--limit`s. Arming is one `gh pr merge --auto --merge` call under the grant.

### Key Files

- `skills/_shared/github-pr-scan.md` — two checks + contract rows.
- `skills/tidy/SKILL.md`, `skills/tidy/step-6-auto.md` — grant + routing rows + marker.
- `skills/_shared/policy-schema.md` — three new keys.

## Gotchas

- `github-pr-scan.md` is near the 40 KB SKILL ceiling and #204 proposes splitting it by scope — check current size before adding; if the addition crosses the threshold, do the #204 split as a first task rather than shipping an oversized file.
- Scope sections are inlined whole into scan subagents — both new checks must be self-contained within the repo-wide scope section, including their threshold resolution commands.
- The sweep must never arm a PR whose authorization decayed since listing — grant labels, the `housekeeping-auto-merge` policy key, AND gate status (CI/draft/threads) are all re-read immediately before `gh pr merge --auto`.
