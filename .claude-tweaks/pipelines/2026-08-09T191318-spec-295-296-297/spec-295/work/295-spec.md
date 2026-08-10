---
record: 295
origin: human
risk: medium
ceremony: standard
grants: []
fingerprint: dispatch-autonomy-model:serialize-group-execution
surface: backend
---
# 295: Dispatch: serialize group execution to close the shared-worktree hazard (closes #155)

Surface: backend

## Overview

`/claude-tweaks:dispatch` Step 5's own banner instructs: "Dispatch every selected group as a
parallel Task agent — each runs independently, owns its own worktree." That capability does not
exist. A Task-tool subagent launched from within a session is **launched cwd-pinned to the
dispatching session's own worktree**, and every route to independent isolation is refused —
`EnterWorktree` explicitly refuses "a subagent with a cwd override." A single-group firing never
surfaces this, because the dispatching session's own worktree works fine as a de facto per-firing
worktree when there's only one tenant. #155 documents the resulting sharp edge when there are
two: a group carrying `auto:merge` committed onto the shared branch while a sibling group without
the grant was still building, which would have published a build-only record to `main` with no
review had the sibling not detected the collision and self-aborted.

This leaf rewrites dispatch's Step 5 execution model from parallel to sequential. The mechanism:
since a dispatched Task agent can never get its own worktree, the **dispatching session itself**
(not the subagent) switches worktree/branch between groups — entering a fresh worktree for group
N, dispatching group N's Task agent (which inherits that cwd), waiting for it to reach a terminal
outcome, cleaning that worktree up through the normal wrap-up teardown path, then entering a new
worktree for group N+1. Only the dispatching session can do this switch, and it can only do one
switch at a time — which is exactly why serialization, not a policy dial, is the fix. This makes
the branch-sharing hazard structurally unrepresentable: there is never a moment two groups'
subagents are both inheriting a cwd, because there is never a moment the dispatching session has
switched into two worktrees at once. `dispatch-pick-max-concurrent` is redefined and renamed to
`dispatch-batch-size`, since its meaning genuinely changes from a concurrency dial (which never
actually worked) to a per-firing sequential batch size.

**Complexity:** Medium
**Estimated tasks:** 7

## Non-Goals

- True concurrent execution across groups (spawning independent cloud sessions, one worktree
  each) — a legitimate future phase if firing cadence × batch size ever becomes a real
  bottleneck, not attempted here.
- Changing `auto:merge` grant semantics or the authorization boundary itself — #155's own
  Non-Goals, inherited.
- Splitting each group's build/test from review/polish/wrap-up into independent Task calls — a
  separate leaf, blocked by this one.
- Pushing pending-review branches for durability — a separate leaf, blocked transitively. This
  leaf does not need it: removing a group's worktree between groups does not delete that group's
  branch or commits — `git worktree remove` (or the standard wrap-up teardown route) removes only
  the working-directory copy; the branch ref persists in the repository regardless. A
  `pending-review` group's commits survive worktree resolution exactly as they do today.

## Current State

- `skills/dispatch/SKILL.md` Step 5 documents (and instructs) parallel Task-agent execution with
  independent worktrees per group — a promise the dispatching session's own cwd-pinning behavior
  cannot keep for more than one concurrent group.
- The Configuration table's `dispatch-pick-max-concurrent` (default `3`) is read as a concurrency
  dial; it has never actually achieved concurrent execution, since no group has ever obtained
  genuine filesystem isolation from a sibling while another was also in flight.
- `--concurrent <n>` (Input table) is the matching per-firing CLI override.
- #155's own investigation confirmed every attempted remedy for per-subagent worktree isolation
  fails: `EnterWorktree`, `git worktree add` + `EnterWorktree`, direct `Write`, `git -C`, and an
  `isolation: "worktree"` probe subagent were all refused or structurally inadequate — all five
  were attempts to give the *subagent* its own escape route. None attempted having the
  *dispatching session* do the switching, which is what this leaf implements.
- Groups are already claimed in a specific order by Step 3's own selection logic: priority-then-
  age for `next`, human-picked order for bare mode, explicit-list order for `#N,#M,...`. This
  leaf reuses that same order as the sequential processing order — no new ordering rule is
  introduced.

## Deliverables

- [ ] Step 5's banner and execution loop in `skills/dispatch/SKILL.md` rewritten: the
  **dispatching session** enters a fresh worktree for group N, dispatches group N's Task agent
  (which inherits that cwd), waits for a terminal outcome (`merged | pr-opened | pending-review |
  failed | blocked`), tears the worktree down via the standard wrap-up cleanup route, then enters
  a fresh worktree for group N+1. Groups process in the same order Step 3's selection already
  established — no new ordering logic.
- [ ] `dispatch-pick-max-concurrent` renamed to `dispatch-batch-size` in the Configuration table,
  with the redefined meaning: number of groups a firing processes sequentially before stopping,
  not concurrent slots
- [ ] `dispatch-pick-max-concurrent` retained as a deprecated, warn-once alias: reading it from
  `.claude-tweaks/policy.yml` emits exactly one warning per dispatch invocation (a warn-tier
  `systemMessage` per `_shared/auto-mode-contract.md`'s tiered posture) and applies its value to
  `dispatch-batch-size`. Removal condition, stated explicitly in the deprecation note: once this
  repo's own `.claude-tweaks/policy.yml` and README config-key table cite only the new name,
  checked at the next minor release.
- [ ] `--concurrent <n>` CLI flag (Input table) renamed to `--batch-size <n>`; `--concurrent` kept
  as the same deprecated, warn-once alias
- [ ] This repo's own `.claude-tweaks/policy.yml` confirmed against the new key (it currently sets
  no explicit value for this key, so no line needs adding — only the Configuration table's
  documented default changes meaning)
- [ ] `skills/dispatch/settle-and-merge.md` checked for any prose or logic assuming concurrent
  groups; corrected if found
- [ ] A test exercising the real Step 5 scheduling/dispatch-ordering logic with stubbed Task()
  calls — dispatching two groups in one firing where one carries `auto:merge` and one doesn't —
  asserting (a) the second group's Task call is never issued until the first group's worktree has
  been torn down, and (b) the two groups build on distinct branches. Revert the fix and confirm
  the test fails (#155's own Acceptance Criterion 5).

## Acceptance Criteria

1. Given a firing that selects 2+ groups, the dispatching session does not enter group 2's
   worktree, and group 2's Task agent is not created, until group 1's Task agent has reached a
   terminal outcome and group 1's worktree has been torn down via the standard cleanup route.
2. `dispatch-batch-size` (default `3`) controls how many groups one firing processes
   sequentially, in the order Step 3's selection already establishes; a project's `policy.yml`
   still setting `dispatch-pick-max-concurrent` continues to work, with one warning logged per
   invocation, until the alias is removed.
3. A test reproducing #155's exact scenario (one `auto:merge` group, one without, dispatched in
   the same firing) asserts they build on different branches, and that the second group's
   worktree is never entered while the first group's Task agent is still running. Reverting the
   serialization change makes this test fail.
4. `skills/dispatch/SKILL.md`'s own text no longer claims parallel Task-agent execution with
   independent worktrees anywhere, and instead describes the dispatching-session-switches-
   worktrees mechanism explicitly.
5. The re-verification of #222's and #268's file overlap against their actual diffs (see Gotchas)
   is performed at this leaf's build start, and its outcome (disjoint, or requires coordination)
   is recorded in this leaf's own PR description or a follow-up comment — not merely resolved
   silently in-session.
6. `npm test` green.
7. This leaf's merge commit closes #155.

## Technical Approach

### Key Files

- `skills/dispatch/SKILL.md` — Step 5's banner, execution loop; Input table's
  `--concurrent`/`--batch-size` row; Configuration table's
  `dispatch-pick-max-concurrent`/`dispatch-batch-size` row
- `skills/dispatch/settle-and-merge.md` — check for concurrency assumptions
- `.claude-tweaks/policy.yml` — this repo's own key confirmation
- `tests/` — new serialization test (exact path chosen against this repo's existing dispatch test
  conventions), exercising the scheduling logic with stubbed Task() calls rather than live
  subagent spawns

## Gotchas

- Step 4's claiming (batch-claiming all selected groups' whole file-overlap groups up front) is
  explicitly NOT part of this change — it stays as-is. It is pure GitHub label/claim-blob writes
  with no filesystem hazard, and keeping it up-front protects group 2's claim from a racing
  second firing even while group 1 is still executing. Groups claimed but not reached within
  `dispatch-batch-size` this firing are simply not processed this firing — they remain claimed and
  are picked up by a later firing or expire via the existing 72h claim TTL; no new TTL/handoff
  mechanism is needed.
- A multi-group firing's wall-clock time now scales linearly with group count instead of being
  bounded by the slowest group — an accepted, documented trade-off (dispatch only fires on a
  schedule with nobody waiting synchronously), not a regression to flag at review time.
- Related: #222 ("Dispatch-site profile sweep and session-inherit protection", currently `Blocked
  by #216`) also edits `skills/dispatch/SKILL.md` around Step 5's `[Use: {Profile}]` grammar
  line. #222's own body already notes "line-level disjoint from [#155's] edits, but re-verify at
  build start" for a *different* overlap — that reasoning does not automatically transfer here,
  since this leaf's rewrite is structurally broader (the whole per-group dispatch template, not
  just the `[Use: ...]` line). Re-verify disjointness against #222's actual diff at build start
  (see Acceptance Criterion 5) rather than assuming it still holds.
- Related: #268 ("Trust ladder: failure classifications and reverts write negative evidence that
  auto-revokes a class") also edits `skills/dispatch/settle-and-merge.md` (a persist instruction
  on the existing Settle write, in the failure-classification section) — a different sub-section
  of the same file. Re-verify disjointness at build start (see Acceptance Criterion 5).
- IL-51/IL-43: if this leaf's own tasks are dispatched to parallel implementer subagents, don't
  give them independent git access — sequence commits centrally, since they would otherwise race
  on the shared index exactly like the hazard this leaf exists to fix.
- Red-team (all three personas) independently converged on the same gap in an earlier draft of
  this leaf: "worktree fully resolved" was undefined. The Overview and Deliverables above now
  state the mechanism explicitly (dispatching session switches worktrees between groups, not the
  subagent) — if a future edit reintroduces vagueness here, that is the specific failure mode to
  watch for.

## Build Notes

#222/#268 overlap re-verification at build start (2026-08-09): both #222 and #268 are still
open, unbuilt records (confirmed via `gh issue view` — both `state: OPEN`, both `ready`) — no
branch/PR exists yet for either, so disjointness is re-verified against their spec-declared Key
Files only (as already noted in this spec's own Gotchas), not an actual diff. #222 declares
skills/dispatch/SKILL.md's `[Use: {Profile}]` grammar line (Step 5's `[Use: ...]` footer) — this
leaf's Step 5 rewrite replaced the banner and execution-loop paragraph above that line, not the
line itself; confirmed during implementation that the `[Use: ...]` footer needed no edit. #268
declares a persist instruction inside settle-and-merge.md's failure-classification section — this
leaf made no edit to settle-and-merge.md (verified: no concurrent-groups assumption found there
either). Both remain disjoint from this leaf's actual diff.


<!-- work-fingerprint: dispatch-autonomy-model:serialize-group-execution -->
