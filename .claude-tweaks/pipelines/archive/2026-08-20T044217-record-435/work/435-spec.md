---
record: 435
origin: human
risk: low
size: medium
ceremony: standard
grants: [build]
surface: backend
---
# 435: wrap-up residue-sweep's remedy:auto fixes bypass PR under pr-first, same shape as #424's tidy gap

Surface: backend

## Current State

`_shared/scratch-worktree.md` is consumed by three callers: `/claude-tweaks:tidy` Step 7.5 (fixed
in #424 to branch on `integration-model` under `worktree-always: true` — `pr-first` now pushes a
branch and opens a marker-stamped PR instead of merging back directly), `flow/worktree-merge.md`
(already routes its own `pr-first` merges through `_shared/pr-first-merge.md` instead of
`scratch-worktree.md` — confirmed unaffected, no gap), and `wrap-up/residue-sweep.md`.

`residue-sweep.md`'s `remedy: auto` findings (an unlocked stale worktree, a merged-but-undeleted
branch, a claim blob for a closed issue, a missing release-triple entry, an un-archived pipeline
run dir) provision a scratch worktree, apply each remedy as its own commit, then merge back
directly into the integration branch via `scratch-worktree.md` §5 (`git push . <sha>:{integration-branch}`,
or the main-checkout `git merge --ff-only` fallback) — with no branch on `integration-model` at
all. This is the same shape #424 found and fixed for tidy's Step 7.5, but here it remains
unconditional regardless of `pr-first`/`local-merge`.

Confirmed still open (verified against the live file at shaping time): `scratch-worktree.md`'s own
"Cross-caller `pr-first` check (#424)" section already documents this gap and names this issue by
number — "filed separately as #435 rather than fixed here, since #424's own scope kept this file's
mechanics minimal/zero and residue-sweep fixes have no existing PR/marker convention to wire up the
way tidy's did." So the gap's existence is not new information; what's still missing is a recorded
decision and, if warranted, the fix itself.

Under `pr-first`, `_shared/integration-model.md`'s stated model is "origin is truth — every merge
happens on GitHub." A residue-sweep fix landing via a direct local merge + push to the integration
branch bypasses that for whatever mechanical housekeeping commit residue-sweep produces — the same
bypass tidy's Step 7 used to have before #424.

## Deliverables

1. Decide whether residue-sweep's `remedy: auto` fixes should open a PR under `pr-first` +
   `worktree-always` (mirroring #424's tidy fix), or are legitimately exempt as run-closing cleanup
   of the run's own blast radius. Record the decision's rationale, not just the mechanism chosen.
2. If a PR-open path is warranted:
   - Design the marker/grant convention residue-sweep needs — none exists today (unlike tidy, which
     already had `housekeeping-auto-merge` + `<!-- tidy-housekeeping-pr -->` wired up before #424,
     ready to reuse). Decide: what marker HTML comment residue-sweep stamps in its PR body; whether
     a residue-sweep-specific policy lever gates auto-merge arming (a new lever, or reuse of
     `housekeeping-auto-merge`); and whether `github-pr-scan.md`'s `repo-wide` sweep needs a new
     item to recognize a residue-sweep-originated PR as a backstop for anything left unarmed at
     creation time.
   - Apply the same caller-side-conditioning shape #424 used in `tidy/SKILL.md` Step 7.5 to
     `wrap-up/residue-sweep.md`'s `remedy: auto` handling: resolve `integration-model`, and branch —
     `pr-first` pushes the worktree branch and opens a marker-stamped PR (reusing
     `pr-early-run-lifecycle.md`'s create/reopen and compose-body shapes); `local-merge` keeps
     `scratch-worktree.md` §5-6's existing merge-back unchanged.
   - Update `scratch-worktree.md`'s "Cross-caller `pr-first` check (#424)" section to reflect the
     resolution — it currently reads "filed separately as #435 rather than fixed here," which goes
     stale the moment this issue has an actual outcome.
3. If exempt: state that explicitly, with rationale, in the same "Cross-caller `pr-first` check
   (#424)" section — so a future reader who finds residue-sweep's unconditional merge-back doesn't
   re-discover this as an apparent unfixed gap.

## Acceptance Criteria

- [ ] A decision (PR-open vs. exempt) is made and its rationale recorded in `scratch-worktree.md`'s
      "Cross-caller `pr-first` check (#424)" section, replacing the current "filed separately as
      #435 rather than fixed here" placeholder with the actual resolution.
- [ ] If PR-open: `wrap-up/residue-sweep.md`'s `remedy: auto` merge-back branches on
      `integration-model` the same way `tidy/SKILL.md` Step 7.5 does — `pr-first` pushes + opens a
      marker-stamped PR; `local-merge` keeps today's unconditional §5-6 behavior unchanged.
- [ ] If PR-open: the new marker/grant convention is documented wherever it's defined (following
      the `housekeeping-auto-merge` + `<!-- tidy-housekeeping-pr -->` pattern's own documentation
      shape), and `github-pr-scan.md`'s `repo-wide` sweep is updated only if the design calls for a
      sweep-backstop arming path — not required if creation-time arming alone is sufficient.
- [ ] If exempt: no code change to `residue-sweep.md`'s merge-back logic; `scratch-worktree.md`'s
      Cross-caller section states the exemption and its rationale explicitly, replacing the stale
      "filed separately as #435" pointer.
- [ ] `npm test` passes with no regressions — including any prose-conformance suites pinning
      `wrap-up/residue-sweep.md`, `scratch-worktree.md`, or `tidy/SKILL.md` Step 7.5 text.

## Technical Approach

Compare `wrap-up/residue-sweep.md`'s "`remedy: auto` findings and the scratch worktree" section
against `tidy/SKILL.md` Step 7.5's already-shipped `pr-first` branch: tidy resolves
`integration-model` via `resolve-policy.js`, and on `pr-first` skips `scratch-worktree.md` §5-6's
merge-back entirely — instead pushing the worktree branch and opening a PR stamped
`<!-- tidy-housekeeping-pr -->`, reusing `pr-early-run-lifecycle.md`'s create/reopen and
compose-body shapes, then optionally arming `gh pr merge --auto` per the `housekeeping-auto-merge`
policy lever (with a `github-pr-scan.md` `repo-wide` item 9 sweep backstop for anything left
unarmed). `wrap-up/residue-sweep.md`'s own section has no equivalent branch today — apply the same
integration-model resolve-and-branch call at the point where it currently says "provision a
worktree ... apply each remedy as its own commit, then merge back, and record the resulting sha as
that item's `fixed` resolution."

`scratch-worktree.md` itself should not gain new merge mechanics — its own Non-Goals (inherited
from #414) rule that out explicitly. Any `pr-first` branching for residue-sweep belongs in
`wrap-up/residue-sweep.md` (caller-side), the same placement #424 used for tidy — never in the
shared file.

## Gotchas

- `scratch-worktree.md`'s Non-Goals explicitly discourage new merge mechanics in that shared file —
  do the branching in `wrap-up/residue-sweep.md` (caller-side), not in the shared file, mirroring
  #424's placement choice for tidy.
- Unlike tidy, residue-sweep has no existing PR/marker/policy-lever machinery to reuse verbatim — a
  straight copy of tidy's Step 7.5 text would reference `housekeeping-auto-merge` and
  `<!-- tidy-housekeeping-pr -->`, which are tidy-specific. Residue-sweep needs its own lever and
  marker, or an explicit, reasoned decision to share tidy's — don't silently repurpose tidy's marker
  without deciding whether sharing or separating is correct.
- `residue-sweep.md`'s `remedy: record` findings (an open PR outside blast radius, a red suite, a
  locked worktree) are out of scope here — this issue is scoped to `remedy: auto` findings'
  merge-back path only.
- If the decision lands on "exempt," don't leave `scratch-worktree.md`'s Cross-caller section
  reading exactly as it does today post-#424 ("filed separately as #435 rather than fixed here") —
  that phrasing is itself stale once #435 has a resolution; it must be rewritten to state the
  exemption, not merely left as a pointer to an issue that no longer represents open work.

## Original request

wrap-up residue-sweep's remedy:auto fixes bypass PR under pr-first, same shape as #424's tidy gap

**Related:** #429

Surface: backend

## Current State

`_shared/scratch-worktree.md` is consumed by three callers: `/claude-tweaks:tidy` Step 7.5 (fixed
in #424 to branch on `integration-model` under `worktree.always: true` — `pr-first` now pushes a
branch and opens a marker-stamped PR instead of merging back directly), `flow/worktree-merge.md`
(already routes its own `pr-first` merges through `_shared/pr-first-merge.md` instead of
scratch-worktree — confirmed unaffected, no gap), and `wrap-up/residue-sweep.md`.

`residue-sweep.md`'s `remedy: auto` findings (an unlocked stale worktree, a merged-but-undeleted
branch, a claim blob for a closed issue, a missing release-triple entry) provision a scratch
worktree, apply each remedy as its own commit, then merge back directly into the integration
branch (`_shared/scratch-worktree.md` §5) with **no branch on `integration-model` at all** — the
same shape #424 found and fixed for tidy's Step 7.5, but here still unconditional regardless of
`pr-first`/`local-merge`.

## Why this might matter

Under `pr-first`, `_shared/integration-model.md`'s stated model is "origin is truth — every merge
happens on GitHub." A residue fix landing via a direct local merge + push to the integration
branch (as `_shared/scratch-worktree.md` §5-6 does today) bypasses that for whatever mechanical
housekeeping commit residue-sweep produces, the same way tidy's Step 7 used to.

## Why this might NOT matter (worth resolving before treating this as required work)

- These are small, mechanical fixups to residue *this run's own worktree left behind*, discovered
  and fixed during that same run's own wrap-up — arguably closer to "finishing the run's own
  cleanup" than "a new independently-reviewable change."
- Unlike tidy's Step 7 (#414's `housekeeping-auto-merge`/`tidy-housekeeping-pr` marker machinery
  exists specifically to let a *sweep* recognize and auto-arm this PR shape later), there is no
  existing marker/grant convention anywhere in the codebase for a residue-sweep-originated PR — so
  fixing this would mean designing that convention from scratch, not wiring up already-shipped but
  dormant machinery the way #424 did.
- `_shared/scratch-worktree.md`'s own Non-Goals (inherited from #414) explicitly discourage new
  merge mechanics in that shared file; a residue-sweep-specific PR-open path would need the same
  kind of caller-side conditioning #424 used for tidy, not a change to the shared file itself.

## Deliverables (if this is picked up)

- Decide whether `remedy: auto` residue fixes should open a PR under `pr-first` + `worktree.always`
  (mirroring #424's tidy fix) or are legitimately exempt as run-closing cleanup — record the
  decision's rationale, not just the mechanism.
- If a PR-open path is warranted: design the marker/grant convention this would need (there is none
  today), then apply the same caller-side-conditioning shape #424 used in `tidy/SKILL.md` Step 7.5.
- If exempt: state that explicitly in `_shared/scratch-worktree.md`'s Callers section so a future
  reader doesn't re-discover this as an apparent gap.

## Origin

Filed during #424's cross-check deliverable ("Cross-check whether `_shared/scratch-worktree.md`'s
other callers ... have an equivalent gap") — flagged rather than fixed in-place, since #424's own
scope and Gotchas explicitly kept `_shared/scratch-worktree.md` changes minimal/zero and its Key
Files list didn't include `wrap-up/residue-sweep.md`.

