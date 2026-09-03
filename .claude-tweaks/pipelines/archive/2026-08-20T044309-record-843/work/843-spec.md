---
record: 843
origin: capture
risk: low
size: medium
ceremony: standard
grants: [build]
---
# 843: Extract the pre-write reverify pattern into skills/_shared/ (3 independent restatements)

Origin: session evaluation during /claude-tweaks:flow #764's final whole-branch review (via the review's own architecture observations; self-reference routed the findings to local records)

Defer-reason: genuinely-larger

## Current State

The "re-verify live state immediately before a write, right after a long-lived confirmation gate" pattern now has three independent restatements in this repo, with no shared home: `skills/tidy/step-6-auto.md`'s `[parent-gate]` row ("Once approved, this action re-verifies the gate is still `due` with freshly read state before doing anything — never trusts the scan's own snapshot, which may be stale by the time Step 7 runs."), `skills/backlog/refine-mode.md` Step 5's pre-write reverify (#764, closes a real incident where a ~7-hour-stale confirmation let a concurrent session's grant/claim get clobbered), and `skills/_shared/staged-patch.md`'s Review Console re-derivation of a staged patch from its `Invariant:` when the diff has gone stale. All three independently arrive at the same conclusion — a snapshot taken before an unbounded human wait cannot be trusted at write time — with no shared citation between them. Per this repo's own `shared-contract-extraction` skill conventions, three independent restatements of one contract is roughly where extraction starts earning its keep over continued duplication.

## Deliverables

- [ ] Extract the pattern into a new `skills/_shared/*.md` file (e.g. `skills/_shared/reverify-before-write.md`) per the `shared-contract-extraction` skill's own procedure: derive the consumer list (the three sites above), state what each consumer keeps vs. surrenders, and migrate each to cite the shared file instead of restating its own version of the rule.
- [ ] Add the conformance suite `shared-contract-extraction` calls for: pin that each of the three consumer files actually cites the new shared file, so a future edit to any of them can't silently drift back to an uncited restatement.

## Acceptance Criteria

1. `skills/_shared/reverify-before-write.md` (or equivalent name) exists and states the general pattern once.
2. `skills/tidy/step-6-auto.md`, `skills/backlog/refine-mode.md`, and `skills/_shared/staged-patch.md` each cite it rather than restating the rationale inline.
3. A conformance test pins the citation in each of the three files.
4. `npm test` passes.

_Filed by `capture` via specShapedBody._
