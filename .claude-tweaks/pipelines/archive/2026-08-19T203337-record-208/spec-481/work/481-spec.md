---
record: 481
origin: capture
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
surface: backend
---
# 481: Fix 4 residual dispatch-claims stale-attribution mentions after #464

Surface: backend

## Current State

`#464` (closed) moved claim acquisition out of `/dispatch` and into `/flow`'s pre-flight Step 2.8
(`claim-targets.md`) — dispatch now only selects, mints the run directory, and hands off; it no
longer performs the claim write itself. That branch's final whole-branch review (commit
`2bf066df`) grep-swept the repo for the resulting stale-attribution defect and fixed 9+ instances
across `flow/SKILL.md`, `failure-cards.md`, `issue-claims.md`, `work-record.md` (one location), and
`github-write-transport.md`, but missed 4 more, confirmed still present today (line numbers below
are current — the ones cited when this record was filed have drifted since, as intervening
commits changed file length; grep for the quoted phrase, not the line number):

- `skills/_shared/work-record.md:377` — the `/dispatch` row of the Consumers table reads
  `"Queue consumer — claims authorized records, invokes /flow, settles..."`, attributing the claim
  write to dispatch.
- `skills/flow/steps-and-gates.md:122-124` — `"/flow performs no selection, filtering, or claiming
  of its own; see /claude-tweaks:dispatch (selection + claiming) and /claude-tweaks:backlog refine
  (authorization) for that logic."` This is a near-duplicate of the sentence #464's review-fix
  commit already corrected in `flow/SKILL.md`'s Input table, which now reads: `"/flow claims its
  named targets itself at Step 2.8 (claim-targets.md), whether the invocation came from dispatch's
  hand-off or a human running /flow #{n} directly against any record carrying no live claim."`
- `skills/backlog/SKILL.md:22` — the lifecycle diagram labels the `/claude-tweaks:dispatch` node
  `(claims + executes)`.
- `skills/backlog/SKILL.md:36` — `"Not for: ... claiming or building anything
  (/claude-tweaks:dispatch's job) ..."` — the "building" half is accurate (dispatch does invoke
  `/flow`, which builds); only "claiming" is stale.
- `skills/help/context-flow.md:33` — `"... and /claude-tweaks:dispatch (claims the authorized
  record's file-overlap group and hands it to /claude-tweaks:flow) ..."`.

## Deliverables

- [ ] Rewrite `skills/_shared/work-record.md`'s `/dispatch` Consumers-table row to describe
      dispatch as selecting, minting the run dir, and handing off — not as performing the claim.
- [ ] Rewrite `skills/flow/steps-and-gates.md` lines 122-124 to match the corrected pattern already
      applied in `flow/SKILL.md`'s Input table: `/flow` performs no selection/filtering of its own
      (still `/claude-tweaks:dispatch`'s job) but claims its own named targets at Step 2.8, whether
      via dispatch's hand-off or a direct human `/flow #{n}` invocation.
- [ ] Rewrite `skills/backlog/SKILL.md:22`'s diagram label and `:36`'s prose so neither attributes
      the claim action to dispatch.
- [ ] Rewrite `skills/help/context-flow.md:33`'s prose so it no longer attributes the claim action
      to dispatch.

## Acceptance Criteria

1. `grep -n "claims authorized records" skills/_shared/work-record.md` returns no match after the
   fix.
2. `grep -n "dispatch (selection + claiming)" skills/flow/steps-and-gates.md` returns no match
   after the fix, and the corrected sentence states that `/flow` claims its own targets at Step 2.8
   (matching `flow/SKILL.md`'s Input table wording).
3. `grep -n "claims + executes" skills/backlog/SKILL.md` and `grep -n "claiming or building
   anything (\`/claude-tweaks:dispatch\`'s job)" skills/backlog/SKILL.md` both return no match
   after the fix; the "building" attribution to dispatch's hand-off remains accurate.
4. `grep -n "claims the authorized record's file-overlap group" skills/help/context-flow.md`
   returns no match after the fix.
5. No other prose, mechanical meaning, or line outside the 4 named sites changes in these
   files — this is a wording-only correction, not a behavior change.
6. `npm test` passes (skill-prose-conformance suite covers these files; none of the 4 stale
   phrases above are byte-pinned by an existing test, confirmed by grep against `tests/` before
   filing).

## Technical Approach

Apply the same rewrite pattern #464's whole-branch-review commit `2bf066df` already used at the
9+ instances it fixed: describe `/dispatch` as selecting/minting/handing off, and `/flow`
(Step 2.8, `claim-targets.md`) as the actor performing the claim write, regardless of whether the
invocation is dispatch's hand-off or a direct human `/flow #N`. Re-grep each file for the quoted
stale phrase immediately before editing — don't trust a cited line number, since 3 of the 4 sites
have already drifted from the numbers in the original report.

### Key Files

- `skills/_shared/work-record.md` — Consumers table, `/dispatch` row.
- `skills/flow/steps-and-gates.md` — Record-reference input section, final sentence.
- `skills/backlog/SKILL.md` — lifecycle diagram (line 22) and the "Not for" bullet (line 36).
- `skills/help/context-flow.md` — the utility-skills paragraph between the two Artifact Flow
  diagrams.

## Gotchas

- Line numbers cited anywhere in this record (including the original report) are pointers, not
  addresses — files have moved since; re-grep the literal quoted phrase before editing.
- `skills/help/context-flow.md:17` (the Artifact Flow diagram's `"Dispatch claims + builds"` node
  label) carries the identical defect class in the same file but is **not** one of the 4 sites
  named in scope here — leave it alone; if it's worth fixing, that's a separate record so this
  one's diff stays reviewable against its own stated scope.

## Original request

Fix 4 residual dispatch-claims stale-attribution mentions after #464

**Related:** #464

Context: #464's final whole-branch review ran a grep sweep for the stale-attribution defect it was
fixing (dispatch's own docs claiming dispatch performs the claim write, when flow's Step 2.8 does
it now) and found 4 more live instances outside that branch's touched file set.

Scope: Fix these 4 sites to attribute claiming to flow's Step 2.8, matching the pattern #464
already applied to 9+ other instances:
- skills/_shared/work-record.md:357
- skills/flow/steps-and-gates.md:122-124 (near-duplicate of the sentence #464 already fixed in
  flow/SKILL.md's Input table)
- skills/backlog/SKILL.md:22,36
- skills/help/context-flow.md:33

