---
record: 886
origin: capture
risk: low
size: low
ceremony: fast-lane
grants: []
surface: backend
---
# 886: design-wrapper polish: verify claimed commands_invoked against git diff evidence
## Current State

`polish` is the wrapper's only code-modifying mode and its `commands_invoked` return is narrative — nothing in `modes/polish.md` checks that claimed command dispatches actually changed files. `/flow`'s shared re-verify cycle catches breakage, but a polish that reports `commands_invoked` non-empty while producing zero diff passes re-verify trivially and reads as a clean success. Direct precedent in this repo's maintainer notes: parallel fix-agents reporting detailed fake success (specific test counts) with zero actual git diff. This is the feedback rubric's Report-fidelity lens: status claims must match what happened.

## Deliverables

`modes/polish.md` output-contract addition: after dispatch completes, run `git diff --stat` (scoped to the resolved target files) and carry a diff summary field in the return

Anomaly rule: `commands_invoked` non-empty + empty diff → the return states the anomaly explicitly (distinct value, never `ok`), and the caller-rendered summary line surfaces it — no silent success

Conformance test pinning the new prose (anomaly rule + diff-evidence requirement) in the existing skill-prose suite pattern

## Acceptance Criteria

polish return carries diff evidence whenever `commands_invoked` is non-empty

The empty-diff anomaly is representable and rendered distinctly from success and from `{skipped}`

A command that legitimately produces no change (already-conformant code) is reportable as such — the anomaly wording distinguishes "ran, nothing to change" claims from unverifiable claims

`npm test` green

_Filed by `capture` via specShapedBody._
