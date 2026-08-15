---
record: 336
origin: human
risk: low
size: low
ceremony: fast-lane
grants: []
surface: infra
---
# 336: Add an early-warning tier to the 40KB SKILL.md ceiling check before it's hit

Surface: infra

## Current State

CLAUDE.md's 40KB soft ceiling for `SKILL.md`/sub-files is enforced by `bin/lib/skill-audit/tests/context-cost.test.js`'s `CEILING_BYTES = 40 * 1024` — a binary pass/fail exactly at the limit, with no warning tier as a file approaches it. The module already exports `headroom(entry)` (bytes remaining under the ceiling) and a "reports the payload total and the tightest headroom" test that logs the single tightest file informationally, but nothing flags every file that's close, and nothing fires until the ceiling is actually crossed.

`skills/dispatch/SKILL.md` and `skills/wrap-up/review-console.md` were both already at/near the ceiling before an unrelated session's edits tipped them over, surfacing as a blocking test failure on those edits rather than as an earlier, easier-to-plan-around signal.

## Deliverables

- Add a warning (non-failing) check to `context-cost.test.js` — or a separate lightweight check — that flags any `SKILL.md`/sub-file at or above ~90% of `CEILING_BYTES`, without failing the test.
- Surface the warning somewhere visible (test output, or a line in `npm test`'s summary) so it's noticed before an unrelated edit forces a reactive extraction under time pressure.

## Acceptance Criteria

- [ ] A file at 90-100% of the ceiling produces a visible warning without failing `npm test`.
- [ ] A file at or over 100% still fails as today (no change to the existing hard-fail behavior).
- [ ] A file well under 90% produces no warning.

## Technical Approach

Extend `context-cost.test.js`: for every entry from `measureSkills(REPO)` and `measureSubFiles(REPO)`, compute proximity to the ceiling from the existing `headroom(entry)` export (or `entry.bytes / CEILING_BYTES` directly) and filter to the half-open range `[0.9 * CEILING_BYTES, CEILING_BYTES)` — deliberately excluding files already `>= CEILING_BYTES`, since those are covered by the existing hard-fail tests below. For each match, `console.warn`/`console.log` the file's name and percent-of-ceiling, matching the existing informational-logging style in "reports the payload total and the tightest headroom" (`console.log`, no `assert`). No new dependency or separate script needed — this rides the same `measureSkills`/`measureSubFiles`/`CEILING_BYTES` exports the hard-fail tests already import.

## Gotchas

- `node:test` has no built-in "warn but don't fail" primitive — this has to be a plain `console.warn`/`console.log` line inside a passing test, not a framework feature, matching the existing informational-logging pattern already in the file.
- Keep the warning range half-open (`< CEILING_BYTES`) so it never re-flags a file the hard-fail tests already caught — a file exactly at or over the ceiling should produce the existing failure only, not both a warning and a failure.

## Original request

Add an early-warning tier to the 40KB SKILL.md ceiling check before it's hit

## Current State

CLAUDE.md's 40KB soft ceiling for `SKILL.md`/sub-files is enforced by `bin/lib/skill-audit/tests/context-cost.test.js`'s `CEILING_BYTES = 40 * 1024` — a binary pass/fail exactly at the limit, with no warning tier as a file approaches it.

`skills/dispatch/SKILL.md` and `skills/wrap-up/review-console.md` were both already at/near the ceiling before an unrelated session's edits tipped them over, surfacing as a blocking test failure on those edits rather than as an earlier, easier-to-plan-around signal.

## Deliverables

- Add a warning (non-failing) check to `context-cost.test.js` — or a separate lightweight check — that flags any `SKILL.md`/sub-file at or above ~90% of `CEILING_BYTES`, without failing the test.
- Surface the warning somewhere visible (test output, or a line in `npm test`'s summary) so it's noticed before an unrelated edit forces a reactive extraction under time pressure.

## Acceptance Criteria

- [ ] A file at 90-100% of the ceiling produces a visible warning without failing `npm test`.
- [ ] A file at or over 100% still fails as today (no change to the existing hard-fail behavior).
- [ ] A file well under 90% produces no warning.

Refs #293 (parent tracking issue for the dispatch Auto-merge gate fix family this record follows on from).
