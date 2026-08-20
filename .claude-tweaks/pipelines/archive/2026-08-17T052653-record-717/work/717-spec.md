---
record: 717
origin: capture
risk: medium
size: low
ceremony: fast-lane
grants: [build]
surface: infra
---
# 717: Run-dir archival must run on every console path — move to Shared teardown; residue.js backstop for the 104-dir backlog

Origin: session evaluation of the #620-#625 /flow run (via /claude-tweaks:feedback; self-reference routed the findings to local records)

Defer-reason: genuinely-larger

## Current State

multispec-review-console.md carries "archive the parent run dir" inside the "On approval" branch (step 7); the `consoleAutoResolve` informational path skips that branch, so an unattended run’s teardown released claims, removed labels, applied demo:pending, undrafted the PR — and left `.claude-tweaks/pipelines/{run-id}/` un-archived with run-state `clean/session-end`. The checkout now holds 104 un-archived run dirs against 20 in `archive/`. Same root-cause family as #714: behavior attached to one resolution branch instead of shared teardown — the file already fixed this shape for claim release.

## Deliverables

- [ ] `flow/multispec-review-console.md`: move archival from "On approval" step 7 into Shared teardown (runs on approval, override, and consoleAutoResolve identically); mirror in `wrap-up/cleanup-procedures.md`’s ownership row if its wording implies the approval branch
- [ ] `bin/residue.js`: a sweep finding for a closed/clean run dir still outside `archive/` (`remedy: auto` — the move is mechanical), so the existing backlog drains one run per wrap-up instead of growing

## Acceptance Criteria

1. `grep -n "archive" skills/flow/multispec-review-console.md` shows archival under Shared teardown, not On approval.
2. `node bin/residue.js` (or its test fixture) reports un-archived closed run dirs with `remedy: auto`; `tests/` covers the new finding kind.
3. After one wrap-up cycle on a fixture with a closed unarchived run dir, the dir sits under `archive/`.

_Filed by `capture` via specShapedBody._
