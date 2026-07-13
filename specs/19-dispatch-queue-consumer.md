---
tier: 1
status: not-started
progress: 0
blocked-by: [18]
surface: backend
---

# 19: /dispatch — the queue consumer (new skill)

## Overview

New skill `/claude-tweaks:dispatch`: the thin queue-protocol wrapper between the gate and the executor — `select → claim group → invoke /flow → settle (release / revoke / report)`. Three selection forms over one protocol: bare `/dispatch` (interactive picklist over the authorized queue), `/dispatch next` (system picks the next group — the headless unit a routine schedules), `/dispatch #N` (direct). **No drain mode** — a session shepherding N pipeline runs accumulates context until it rots; throughput is routine cadence × single-group firings. The consolidated multi-group Review Console dies with drain. Dispatch never grants; it only revokes on failure (`auto:merge` off on any failure; at the retry ceiling remove `auto:*`, add `bot:blocked`, notify). Triage's old dispatch mode, its routine template, and `flow/multispec-review-console.md`'s dispatch-consolidation duties retire.

**Complexity:** High
**Estimated tasks:** 8

## Non-Goals

- No changes to `/flow` internals (spec 20 owns materialization; dispatch invokes `/flow #N…` as an opaque executor).
- No grant issuance, ever — the permission matrix's hard line.
- No `local-files` support: headless dispatch is github-issues only (RBAC + atomic refs — the design's stated boundary). Bare `/dispatch` on a local-files repo reports this and points at manual `/build`/`/flow`.
- Migration of live `tier:*` issues — later plan.

## Current State

- `skills/triage/SKILL.md` — the entire `dispatch` workflow to be extracted: `$RUN_ID` resolution, Step 1 pull (tier labels, skip `status:*`), Step 2 claims (201/422 + `claimStatus` four-row fold), Step 2.5 grouping (`extractKeyFiles` + `groupByFileOverlap` from issue bodies), Step 3 capped-concurrent Task dispatch with the pipeline-execution output template + `CLAIM_RUN_ID` threading, Step 4 retry ceiling (ownership check, release, `countFailedAttempts`/`attemptFailedCommentBody`, failure-downgrade rule), auto-merge gate (4 layers + branch-guarded `--no-ff` merge + `close-run`), consolidated console, Configuration table.
- `skills/triage/routine-template.yml` — schedules `triage dispatch`.
- `skills/flow/multispec-review-console.md` — consolidated console format dispatch reuses.
- `_shared/issue-claims.md` — group-claim rule added by spec 13.

## Deliverables

- [ ] New `skills/dispatch/SKILL.md` (standard structure: frontmatter, interaction directive, lifecycle diagram, When to Use, Input, workflow, Next Actions, CSC, Anti-Patterns, Relationship) implementing the three forms; queue = open + `auto:build` + no `bot:*` + unclaimed.
- [ ] Selection: bare → batch table of the authorized queue (grouped by file overlap first; rows are groups) + one AskUserQuestion pick; `next` → first group by this literal ordering: `priority:high` > `priority:medium` > `priority:low` > unprioritized, oldest-first within each band (a group's rank = its highest-priority member); `#N` → that record's whole group (its overlap partners come along — claiming a group member alone is forbidden).
- [ ] Claiming: **all members of the group before starting any** (per `_shared/issue-claims.md`'s group-claim rule); per-member 201/422 handling with the four-row `claimStatus` fold; on partial group claim (some members contested live), release own claims, log, skip the group this firing.
- [ ] Execution: one Task agent per group (bare-mode multi-pick runs up to `dispatch-pick-max-concurrent`; `next` runs exactly one), agent invokes `CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow #{n}[,#{m}…]`, output template inlined per subagent contract (status line + GROUP/OUTCOME/MANIFEST lines — port from triage's current template).
- [ ] Settle: success → nothing (wrap-up released the claim; close-via-merge closed the record); failure → ownership check (`claim.runId === $RUN_ID`), release claim, revoke `auto:merge` if present (failure-downgrade rule: any failure permanently drops merge autonomy), attempt count via `retry.js`, at ceiling remove `auto:*` + add `bot:blocked` + `PushNotification`; below ceiling leave `auto:build` for a future firing.
- [ ] Auto-merge gate for `auto:merge` groups: port the four layers (grant present at dispatch; scoring eligibility; runtime cleanliness — no review findings ≥ medium; blast-radius caps `automerge-max-lines`/`automerge-max-files`) and the branch-guarded `--no-ff` merge procedure incl. `close-run` and conflict-abort-to-pending-review fallback, verbatim in mechanics.
- [ ] New `skills/dispatch/routine-template.yml` scheduling `/claude-tweaks:dispatch next`; delete `skills/triage/routine-template.yml`; excise the dispatch workflow from `skills/triage/SKILL.md` (coordinate with spec 18 — this spec owns the deletion; 18 owns the rewrite of what remains).
- [ ] Reporting: per-firing output is one group's outcome; headless outcomes append to the rolling digest (cross-reference `/tidy`'s digest mechanism — spec 21); pending-review parks (branch + run dir wait for a human). Remove dispatch-consolidation duties from `multispec-review-console.md` (file survives for `/flow`'s own multi-record runs).

## Acceptance Criteria

1. `skills/dispatch/SKILL.md` exists with all standard sections; its queue query is stated as open + `auto:build` + no `bot:*` + unclaimed; nowhere does it add `auto:*` or `ready`.
2. `grep -n "drain" skills/dispatch/SKILL.md` — the word appears only in a rationale note explaining why drain does not exist (context rot), never as a mode.
3. The group-claim-all rule and the partial-claim release path are specified; `/dispatch #N` documents pulling the whole overlap group.
4. Failure-downgrade stated as unconditional: any failed run revokes `auto:merge` before retry; ceiling behavior removes `auto:*`, adds `bot:blocked`, notifies.
5. `skills/triage/routine-template.yml` is deleted; `skills/dispatch/routine-template.yml` exists and its prompt is `/claude-tweaks:dispatch next`.
6. The four-layer auto-merge gate and branch-guard merge procedure appear in dispatch (grep for `--no-ff`, `close-run`, `automerge-max-lines`); `grep -n "auto-merge\|fast-track" skills/triage/SKILL.md` returns 0 workflow matches.
7. `npm test` passes (skill-md tests updated where they assert triage content).

## Technical Approach

This is largely a *move* with vocabulary translation: triage's dispatch Steps 1–4 + auto-merge gate → dispatch's protocol, `tier:*`→grants, `status:*`→`bot:*`, spec-derivation removed (records are pre-shaped; `/flow #N` materializes directly — no `/specify` call in the dispatch path). Keep `$RUN_ID` resolution via the standalone-auto run dir and `CLAIM_RUN_ID` threading exactly as today (the ownership-check lesson). Config keys (`dispatch-retry-ceiling`, `automerge-max-lines`, `automerge-max-files`, `dispatch-pick-max-concurrent`) read from CLAUDE.md/policy.yml; old `triage-*` keys accepted as legacy aliases with a one-line note.

## Gotchas

- **The bundle path loses its `/specify` call** — today's dispatch derives specs for bundles before `/flow`; under the new model a granted record is already spec-shaped, so a bundle is just `/flow #A,#B`. Do not port the derivation loop.
- Two overlapping `next` firings must not split a group — group membership computes over *unclaimed* records only, and claim-all-before-start makes the race window per-group, not per-member.
- `PushNotification` only at ceiling and for auto-merge FYIs — not per-firing noise (notification-fatigue rule).
- Subagent prompts: inline the output template literally; anchor working directory (worktree `pwd`/`git rev-parse` check); `refs #N` not `closes #N` in any commit the agent writes mid-pipeline (close-via-merge owns closing).
- Deleting triage's routine template requires checking for live routines referencing it — surface a migration note, don't silently orphan (the promise-and-executor rule).

## Key Files

- `skills/dispatch/SKILL.md` (new), `skills/dispatch/routine-template.yml` (new)
- `skills/triage/SKILL.md`, `skills/triage/routine-template.yml` (delete)
- `skills/flow/multispec-review-console.md`
- `bin/lib/issues/{claims,retry,grouping,record}.js` (consumers)
