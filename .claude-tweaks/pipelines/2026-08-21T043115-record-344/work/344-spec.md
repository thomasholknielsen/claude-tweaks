---
record: 344
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
surface: backend
---
# 344: Rename parentGateState's leaves parameter to subIssues across code and prose call sites

Surface: backend

## Current State
Follow-up to the parent-issue vocabulary rename (#338 family, shipped via #339/#340/#341). `parentGateState({ leaves, parentLabels })` (bin/lib/issues/acceptance.js) deliberately kept its pre-rename `leaves` parameter name so #340's prose call sites stayed stable during the atomic rename (spec 339's Technical Approach pinned this). Residual record-class `leaf`/`leaves` nouns also survive in bin test comments/titles (grouping.test.js:266,274; record.test.js:514 area; trust.test.js:195-198) — outside #339's enumerated scope.

## Deliverables
- [ ] Rename the `leaves` parameter (and `leaf` loop variable) to `subIssues`/`subIssue` in acceptance.js
- [ ] Update every prose call site passing `{ leaves, parentLabels }` (skills/_shared/github-pr-scan.md, skills/tidy/step-1-records.md, skills/wrap-up/verification-brief.md — re-derive at build time)
- [ ] Sweep the residual bin test-comment/title leaf nouns (grouping.test.js:266,274; record.test.js:514 area; trust.test.js:195-198)

## Acceptance Criteria
1. `grep -rn '{ leaves' bin/ skills/` returns zero matches (parameter renamed everywhere, one atomic change)
2. Full npm test passes

## Technical Approach
Trigger: any time after v6.79.0 ships — the rename is self-contained now that #340's call sites exist (already shipped). Rename `leaves`/`leaf` to `subIssues`/`subIssue` in `parentGateState`'s signature and body in `bin/lib/issues/acceptance.js`, then update each prose call site listed above to match, and sweep the residual test-comment/title nouns in the three test files. One atomic change spanning code and prose, mirroring how #340's rename was executed.

## Gotchas
- Filed automatically by the 339/340/341 flow run's Review Console under the `unattended` autonomy ceiling (`queueWriteAutoFile`); origin: review deferral, spec 339 — this record is a scoped residual cleanup, not new scope.
- Re-derive the exact prose call-site line numbers at build time (skills/_shared/github-pr-scan.md, skills/tidy/step-1-records.md, skills/wrap-up/verification-brief.md) since they may have shifted since this record was filed.

## Original request

Rename parentGateState's leaves parameter to subIssues across code and prose call sites

Follow-up to the parent-issue vocabulary rename (#338 family, shipped via #339/#340/#341).

## Current State
`parentGateState({ leaves, parentLabels })` (bin/lib/issues/acceptance.js) deliberately kept its pre-rename `leaves` parameter name so #340's prose call sites stayed stable during the atomic rename (spec 339's Technical Approach pinned this). Residual record-class `leaf`/`leaves` nouns also survive in bin test comments/titles (grouping.test.js:266,274; record.test.js:514 area; trust.test.js:195-198) — outside #339's enumerated scope.

## Deliverables
- [ ] Rename the `leaves` parameter (and `leaf` loop variable) to `subIssues`/`subIssue` in acceptance.js
- [ ] Update every prose call site passing `{ leaves, parentLabels }` (skills/_shared/github-pr-scan.md, skills/tidy/step-1-records.md, skills/wrap-up/verification-brief.md — re-derive at build time)
- [ ] Sweep the residual bin test-comment/title leaf nouns

## Acceptance Criteria
1. `grep -rn '{ leaves' bin/ skills/` returns zero matches (parameter renamed everywhere, one atomic change)
2. Full npm test passes

Trigger: any time after v6.79.0 ships — the rename is self-contained once #340's call sites exist.

Filed automatically by the 339/340/341 flow run's Review Console under the `unattended` autonomy ceiling (queueWriteAutoFile); origin: review deferral, spec 339.

