---
record: 296
origin: human
risk: medium
ceremony: standard
grants: []
fingerprint: dispatch-autonomy-model:split-build-review-task-calls
blocked-by: [295]
surface: backend
---
# 296: Dispatch: split each group's build/test and review/polish/wrap-up into independent Task calls

Surface: backend

## Overview

A live dispatch test on 2026-08-09 (bundle #264,#223,#221,#220,#179) self-reported that build,
test, and review ran as one continuous agent context instead of genuinely separate dispatches —
the adversarial, fresh-eyes property `/review`'s own multi-lens dispatch contract
(`skills/review/SKILL.md` Step 3, `review-effort` tiers, Cross-Lens Debate at `high`+) is supposed
to provide never actually applied, because nothing in dispatch's Step 5 forces the separation
structurally.

This leaf splits each group's single Task dispatch into two sequential Task() calls:
`CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow #{n} build,test`, then — only after that call returns
cleanly — `CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow #{n} review,polish,wrap-up`. The second call
is a brand-new agent with zero conversation history from the first, and its own prompt (the
per-group dispatch template, unchanged in shape from today's single-call version) never echoes a
summary of the first call's outcome — it contains only the record numbers and `CLAIM_RUN_ID`. That
guarantees conversational isolation, but the guarantee this leaf actually needs is stronger:
**the second call's review must re-derive its own verdict from raw artifacts (the actual diff,
the actual test run output) rather than trusting any claim the first call made — including claims
persisted to files** (`decisions.md`, ledger entries, staged proposals) the second call's own
`/wrap-up` pass may read. Conversational isolation alone doesn't guarantee that; this leaf states
it as an explicit requirement (see Deliverables/AC below).

This reuses existing plumbing rather than inventing new infrastructure: `/flow`'s `[steps]`
argument already documents this exact resume shape, `_shared/pipeline-run-dir.md`'s resolution
order already lets a fresh agent with no `PIPELINE_RUN_DIR` env var locate the right run by
spec-slug match, and `run-state.json` already tracks the run's worktree assignment durably in the
main checkout, independent of any one session.

**Complexity:** Medium
**Estimated tasks:** 8

## Non-Goals

- Building a `dispatch-review-effort-floor` policy key or an after-the-fact
  artifact-verification check — an earlier version of this design proposed both; superseded by
  this leaf's structural approach (see Gotchas).
- Fixing #280 (pipeline-run-dir resolution's worktree-local fallback gap) — a related,
  already-filed bug this leaf depends on for reliability but does not fix.
- Pushing pending-review branches for durability — a separate leaf, blocked by this one.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #295 | Dispatch: serialize group execution to close the shared-worktree hazard (closes #155) | Blocked by |

## Current State

- `skills/dispatch/SKILL.md` Step 5 (once #295 lands) dispatches one Task agent per group,
  sequentially, which internally invokes `/claude-tweaks:flow #{n}` — build, test, review,
  polish, wrap-up all inside that single agent's own conversation context.
- `CLAIM_RUN_ID` is already-existing plumbing: Step 5's current (pre-this-leaf) dispatch template
  already exports it before invoking `/claude-tweaks:flow`, and `/flow` already threads it through
  to `/wrap-up`'s release step as the ownership-check comparison value. This leaf's second call
  reuses the same export, unchanged.
- `/flow`'s `[steps]` argument already supports resuming a run from a named step
  (`skills/flow/steps-and-gates.md`: "single step = resume from that step onward"; `/flow 42
  review`, `/flow 42 review,wrap-up` are named examples) — unused by dispatch today.
- `_shared/pipeline-run-dir.md`'s Resolution order step 2: "most-recent matching directory...
  whose `spec-slug` segment matches the current spec" — already lets an agent with no
  `PIPELINE_RUN_DIR` env var find an existing run.
- `run-state.json` (main checkout, hook-maintained via `record-worktree`/`close-run`) already
  tracks a run's worktree assignment durably, independent of any one session.
- `worktree.always`'s wrong-checkout hook documentedly treats a commit from a session different
  than the one that recorded the worktree as allowed-with-warning (`wd-foreign-session`), not a
  denial — this leaf's own Deliverables list confirming that in this specific two-call scenario,
  not re-litigating the hook's general behavior.
- Dispatch's Settle step (Step 6, `settle-and-merge.md`) already reads a group's Task-agent report
  by its `GROUP:`/`OUTCOME:`/`MANIFEST:` output template regardless of which Task invocation
  produced it — Settle has no dependency on build/test and review having run in the same call.

## Deliverables

- [ ] Step 5's per-group dispatch template in `skills/dispatch/SKILL.md` split into two
  sequential Task() calls: `CLAIM_RUN_ID="{RUN_ID}" /claude-tweaks:flow #{n} build,test`, then —
  only after that call returns `DONE` or `DONE_WITH_CONCERNS` — `CLAIM_RUN_ID="{RUN_ID}"
  /claude-tweaks:flow #{n} review,polish,wrap-up`. A first-call status of `NEEDS_CONTEXT` or
  `BLOCKED` is treated as failure for this purpose: the second call is never dispatched (matches
  Acceptance Criterion 4).
- [ ] The second call's Task prompt is the existing per-group dispatch template, unmodified in
  shape — it names only the record number(s) and `CLAIM_RUN_ID`, never a summary of the first
  call's result. The dispatching session's own Step 5 logic must not compose or forward any such
  summary.
- [ ] The second call's review step re-derives its own build/test verdict from raw artifacts
  (actual test run output, actual diff) rather than trusting the first call's claims — whether
  those claims are conversational (impossible to see anyway, given zero shared history) or
  written to `decisions.md`/ledger/staged artifacts during the first call. State this explicitly
  in the review step's own instructions, since file-based state is readable across the two calls
  even though conversation history is not.
- [ ] `skills/flow/steps-and-gates.md` documents this two-call shape as a supported, intentional
  consumer of the `[steps]` resume contract, not merely an incidental one
- [ ] The first call's report format for its intermediate (`build,test`-only) outcome resolved and
  documented as an explicit vocabulary distinct from `/flow`'s terminal outcome list (`merged |
  pr-opened | pending-review | failed | blocked`) — e.g. `build-test-ok | build-test-failed |
  build-test-blocked` — sufficient for the dispatching session to gate the second call per the
  first Deliverable above.
- [ ] A fixture-based unit test: a scripted first-call transcript/artifact set containing a
  deliberately false claim (e.g. an incorrect "all tests pass" statement written into a fixture
  `decisions.md`), confirming the second call's review logic does not repeat that claim
  uncritically — it re-derives its verdict from the fixture's actual test-output artifact instead
  (Acceptance Criterion 3).
- [ ] Verified: the second call successfully commits into the first call's worktree in a real
  two-call dispatch run, and the resulting `wd-foreign-session` warn event does not block the
  commit — recorded as evidence in this leaf's own build (a documented manual/observed run), since
  this specific behavior isn't practical to assert in a unit test.

## Acceptance Criteria

1. For a dispatched group, two distinct Task() invocations occur — verifiable in the dispatching
   session's own tool-call history — not one.
2. The second Task's agent, given only the record number(s), `CLAIM_RUN_ID`, and `PIPELINE_RUN_DIR`
   (all three substituted as literal placeholders in its dispatch prompt — none is a summary of the
   first call's findings), locates and resumes the first Task's run directory and worktree with no
   other input. (Revised during build: this AC originally assumed `_shared/pipeline-run-dir.md`'s
   spec-slug matching alone would resume the run with no extra input. Build-time review found that
   assumption false — `/flow` always creates a fresh run directory unless handed one explicitly —
   so the mechanism now threads `PIPELINE_RUN_DIR` through the same inline-substitution channel as
   `CLAIM_RUN_ID`. See Build Notes.)
3. The fixture-based test (Deliverables) confirms the second call's review re-derives its verdict
   from artifact content rather than trusting a planted false claim, whether that claim was
   written to a fixture transcript or a fixture `decisions.md`/ledger entry.
4. If the first call reports `NEEDS_CONTEXT` or `BLOCKED` (or fails to report at all), the second
   call is never dispatched.
5. `npm test` green.

## Technical Approach

### Key Files

- `skills/dispatch/SKILL.md` — Step 5's per-group dispatch template, now two Task() calls
- `skills/flow/steps-and-gates.md` — document the two-call resume shape as intentional
- `skills/_shared/pipeline-run-dir.md` — no change expected; confirmed by this leaf's own testing
  that its existing resolution order already supports this reuse

## Gotchas

- This supersedes an earlier, rejected design for this same gap: a `dispatch-review-effort-floor`
  policy key plus an after-the-fact artifact-verification check on the run dir. Both were dropped
  once it became clear the real guarantee — a reviewing mind that didn't participate in the
  build — is achievable structurally by splitting the Task-call boundary, rather than needing to
  be policed after the fact. Do not reintroduce either mechanism; they would be redundant with
  the structural fix and add complexity for nothing.
- Red-team's Skeptical Reviewer found the sharpest gap in an earlier draft: conversational
  isolation alone does not guarantee judgment isolation, because the second call still reads
  file-based state (`decisions.md`, staged artifacts) the first call wrote. The Deliverables above
  now require the second call to re-derive its verdict from raw artifacts regardless of channel —
  if a future edit weakens this back to "trusts whatever it finds," that is the specific failure
  mode to watch for.
- Related: #280 ("pipeline-run-dir resolution: no fallback for a worktree-local run dir when
  harness isolation blocks main-checkout anchoring") documents a real edge case where the
  resolution mechanism this leaf depends on can fail to find the right run — specifically when
  harness-level sandboxing blocks all main-checkout writes for a session, forcing the run dir to
  be created worktree-locally instead. This leaf does not fix #280. If that edge case fires
  during one of this leaf's own dispatch-originated runs, the second Task call may fail to locate
  the first call's run dir — prefer failing loudly (report `NEEDS_CONTEXT` or `BLOCKED`) over
  silently creating a fresh, disconnected run.
- Related: #222 (`skills/dispatch/SKILL.md` overlap) — same caveat as #295's own Gotchas:
  re-verify disjointness at build start, since this leaf also rewrites Step 5's per-group
  template.
- IL-63: MCP tools are only invocable from the calling agent's own turn, not a spawned
  subprocess — this leaf does not need MCP tools for the handoff between the two Task calls (the
  run-dir + worktree resolution mechanism is filesystem/git-based), noted here only to rule the
  idea out explicitly rather than have it resurface at build time.

## Build Notes

wd-foreign-session safety re-verified against the actual hook code (2026-08-10):
`bin/lib/hooks/pre-tool-use.js`'s worktree-assignment check contains an early
`if (actual === assigned) continue;` allow (line 276) that runs BEFORE the foreign-session
branch. Both of #296's two Task() calls inherit the same cwd (the dispatching session's
currently-entered worktree for this group, unchanged between the two calls per #295's
design — the dispatching session only switches worktrees between groups). So every commit
either call makes has `actual === assigned`, and the foreign-session branch is never reached
at all in the normal flow — stronger than this spec's own Deliverables assumed ("the
resulting wd-foreign-session warn event does not block the commit"): the event does not fire
in the first place. It would only fire if the second call's commits somehow targeted a
worktree different from the first call's, which this design does not produce.

#222 overlap re-verification at build start (2026-08-10): #222 remains open/unbuilt
(confirmed via `gh issue view` — `state: OPEN`, `ready` label) — disjointness re-verified
against its spec-declared Key Files only. #222 declares `skills/dispatch/SKILL.md`'s
`[Use: {Profile}]` grammar line; this leaf's edits (Task 1's extraction, Task 3's
Singleton/Bundle-group and gate-paragraph rewrite, plus the fix-round's execution-loop
correction) are scoped to different regions of the same file and do not touch the
`[Use: ...]` line. Disjoint.

Architecture Alignment (2026-08-10, post final-review + re-review fix rounds): the final
whole-branch review found AC2's original "spec-slug matching alone resumes the run" claim
false — `/flow` always creates a fresh `PIPELINE_RUN_DIR` unless one is already set to an
existing directory on entry. Fixed by threading `PIPELINE_RUN_DIR` through the same
inline-substitution channel as `CLAIM_RUN_ID` (never an exported shell variable — a
dispatched Task agent inherits no environment) and adding an adopt-if-set branch to `/flow`
Step 3 (`flow/steps-and-gates.md`'s "Adopting an inherited run directory"). AC2 above
updated to match. This went through two review rounds before the full sending+receiving
chain was verified connected (first round fixed the sending half only and was not caught
until a second scoped re-review traced the chain end-to-end) — a direct guard test
(`tests/dispatch-flow-rundir-handoff.test.js`) now pins both halves so a future edit to
either side fails the suite rather than shipping silently a third time.

A residual risk surfaced during the fix rounds and filed separately rather than fixed here
(out of this leaf's scope — a mitigation would touch the ledger resolve gate or add new
`unattended-tier` scope): the first-call-failure teardown path (`/flow {target} wrap-up`,
routed through wrap-up's own cleanup per `[IL-116]`) itself reaches `/flow`'s nothing-left-
behind ledger gate, which is not silenced by `auto` and requires per-item human input a
headless `dispatch next` firing cannot supply. Tracked as
https://github.com/thomasholknielsen/claude-tweaks/issues/298.

<!-- work-fingerprint: dispatch-autonomy-model:split-build-review-task-calls -->
