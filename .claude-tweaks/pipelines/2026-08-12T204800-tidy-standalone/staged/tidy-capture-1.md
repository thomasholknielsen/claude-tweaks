# Staged Capture proposal — stale `family:parent` label reference

**Source:** /claude-tweaks:tidy, 2026-08-12, Step 4.8 GitHub scan

## Problem

Today's "parent-issue vocabulary rename" (specs #339, #340, #341, merged 2026-08-12) renamed
the `family:parent` label to `parent-issue` on every issue. Verified: `gh issue list --label
"family:parent" --state all` returns zero results.

Three files still hardcode the retired label literal in their `gh` scan snippets:

- `skills/_shared/github-pr-scan.md` — `family-gate` scope (`--label family:parent --state open`)
  and `acceptance-gap` scope's leaf-exclusion fetch (`--label family:parent --state all`)
- `skills/tidy/step-1-records.md` — references the same vocabulary in its Shape 7/8 discussion
- `skills/_shared/work-record.md` — label taxonomy reference

## Effect

- `family-gate` scope always returns zero findings now, silently — confirmed 5 families are
  genuinely still gate-due (#306, #293, #288, #284, #263) that this scope no longer surfaces.
- `acceptance-gap`'s leaf-exclusion (`hasParent`) can never match, so every decomposed leaf of
  every family now falsely counts as an acceptance gap — inflating the count with an unknown
  number of false positives (today's run reported ~184; true count is lower).

## Recommended fix

Update the `--label family:parent` literals in the three files above to `--label parent-issue`.
Mechanical, low-risk — same shape as the rename work already done in specs #339-341.

## Recommendation

**Capture** — file as a new backlog record via `/claude-tweaks:capture`, referencing specs
#339-341 as context for the rename and this file for the affected sites.
