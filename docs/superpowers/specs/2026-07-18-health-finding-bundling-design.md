# Health Skills — Root-Cause Finding Bundling — Design

## Goal

Port `code-health`'s existing `relatedAnchors` bundling mechanism to `docs-health`, `harness-health`, and `journey-health` (the last scoped to coverage findings only), so that multiple findings sharing the same category and the same underlying root cause file as **one** GitHub issue instead of N near-duplicate ones.

## Motivation

Real evidence: a `/claude-tweaks:docs-health` run in an external repo (see `2026-07-18-health-filing-gate-design.md` for the fuller incident) filed 5 separate GitHub issues from one doc audit. Re-examining them: only 2 of the 5 (`#1051` — a stale Auto-detect Patterns row, `#1052` — a stale research/ table) actually trace to the same root cause, a competitor-tracking migration that replaced a single `registry.yaml` with 33 per-competitor wiki pages. The other 3 (`#1053` untracked plan files, `#1054` stale superpowers bullets, `#1055` an off-by-one journey count) are genuinely independent root causes that happened to surface in the same audit. Filing `#1051` and `#1052` as two separate issues, when a human fixing one would naturally fix the other in the same pass (both are "update this doc to reflect the migration"), is exactly the tracker-flooding pattern `code-health` already recognizes and solves.

`code-health`'s Anti-Patterns table already names this precisely: *"Splitting one recurring root cause into N near-duplicate issues instead of bundling | Floods the tracker with issues that are really one fix applied at N call sites. Use `relatedAnchors` to cover every occurrence in a single finding instead."* Its implementation (`bin/lib/code-health/validate-finding.js`, `bin/lib/code-health/issue-payload.js`, and the "Bundling rule" prose in `skills/code-health/SKILL.md`'s Step 6) is mature, tested, and requires no invention — only translation from code-health's `anchor` (a `relfile#Symbol` code location) to each target skill's own location vocabulary (`section`, a free-text or enum heading name).

The three other health skills don't fit identically:
- **`docs-health`** — `section` is a free-text heading name within one `target` doc. Direct structural match to code-health's scenario: one audited unit (a doc, instead of a code slice) can have multiple `section`s drift for the same external reason.
- **`harness-health`** — same free-text `section`-within-`target` shape as docs-health, but only for `kind: "patch"` findings; `kind: "new-skill"` candidates have no `section` to bundle by.
- **`journey-health`** — `section` is a **fixed 4-value enum** (`files-frontmatter` / `self-review` / `coverage` / `live-check`) naming which check produced the finding, not a document location. Its self-review step (`_shared/journey-self-review.md`) emits at most one finding per violated check per audit, so the "N distinct locations, one root cause" scenario barely arises for `files-frontmatter`/`self-review`/`live-check`. The one place multiple same-category findings can genuinely arise in a single firing is the coverage scan (Step 3), which can emit several `coverage`-category findings (multiple uncovered-step groups, multiple orphaned stories) that could share one root cause (e.g., a single batch story deletion causing several coverage gaps at once). Bundling is scoped there only.

## Architecture

### A. New optional field — `relatedSections`

Added to the Finding Shape of `docs-health`, `harness-health` (patch findings only), and `journey-health` (coverage findings only): an optional array of strings, each a sibling `section` value sharing this finding's root cause. Named `relatedSections` rather than reusing code-health's `relatedAnchors` — these three skills key on `section` (a doc heading or check-type name), not a code anchor, and the field name should say what it actually holds.

### B. Bundling rule (per skill, adapted from code-health's Step 6 prose)

Same shape as code-health's existing rule: *when multiple findings share both the same `category` and the same root-cause explanation, file **one** finding — pick the clearest/most representative occurrence as the primary `section`, list every other occurrence in `relatedSections`, make `reason` state the shared root cause explaining all of them, and make `description` (the acceptance criteria) require every listed section fixed, not just the primary one. Only bundle occurrences that share both `category` AND the root cause — never bundle unrelated findings just because they're in the same doc/journey.*

- **docs-health** (Step 3 — JUDGE): applies to any two-or-more findings within the same target doc audit sharing `category` and root cause.
- **harness-health** (Step 3 — JUDGE): same rule, restricted to `kind: "patch"` findings — `kind: "new-skill"` candidates never carry `relatedSections` (no `section` field to bundle by; `validate-finding.js`'s existing `kind`-conditional required-field block already omits `section` entirely for `new-skill`).
- **journey-health** (Step 3 — COVERAGE SCAN only): applies only to `category: "coverage"` findings emitted within the same coverage-scan firing that share the same root cause. `Step 2`'s light-tier findings (`files-frontmatter`, `self-review`) and `Step 3.5`'s deep-tier (`live-check`) never get `relatedSections` — each of those checks already emits at most one finding per violation by construction, so there is nothing to bundle.

### C. `bin/lib/{skill}/validate-finding.js` — accept the optional field

Mirrors `bin/lib/code-health/validate-finding.js`'s existing `relatedAnchors` check exactly: when present, `relatedSections` must be an array of non-empty strings; absent is valid (undefined passes through unchanged). For `harness-health`, this check applies unconditionally (the field is simply never populated for `new-skill` findings — no special-casing needed in the validator itself, matching how `oldString`/`newString`/`section` are already only required, not forbidden-if-absent, for `new-skill`).

### D. `bin/lib/{skill}/issue-payload.js` — render an "Also affects" line

Mirrors `bin/lib/code-health/issue-payload.js`'s `toIssuePayloadV2`'s existing `relatedBlocks` logic exactly: when `finding.relatedSections` is a non-empty array, prepend an `Also affects: \`section-a\`, \`section-b\`` line to the Current State block; omit entirely when absent or empty.

### E. Anti-Patterns row (per skill)

Same wording as code-health's existing row, adapted: *"Splitting one recurring root cause into N near-duplicate issues instead of bundling | Floods the tracker with issues that are really one fix applied to N sections. Use `relatedSections` to cover every occurrence in a single finding instead."*

## Code Changes

| File | Change |
|---|---|
| `skills/docs-health/SKILL.md` | Step 3 (JUDGE) gains the `relatedSections` field in the Finding Shape JSON + the bundling-rule paragraph; Anti-Patterns row added |
| `bin/lib/docs-health/validate-finding.js` | Accept optional `relatedSections` (array of non-empty strings) |
| `bin/lib/docs-health/issue-payload.js` | Render `Also affects: ...` line when present |
| `bin/lib/docs-health/tests/validate-finding.test.js` | 5 new tests mirroring code-health's `relatedAnchors` coverage exactly (absent-valid, array-accepted, fails-not-array, fails-empty-string-entry, fails-non-string-entry) |
| `bin/lib/docs-health/tests/issue-payload.test.js` | 3 new tests (includes-when-present, omits-when-absent, omits-when-empty-array) |
| `skills/harness-health/SKILL.md` | Step 3 (JUDGE) gains the `relatedSections` field (patch findings only) + the bundling-rule paragraph; Anti-Patterns row added |
| `bin/lib/harness-health/validate-finding.js` | Accept optional `relatedSections` |
| `bin/lib/harness-health/issue-payload.js` | Render `Also affects: ...` line when present (only ever populated for `kind: "patch"`) |
| `bin/lib/harness-health/tests/validate-finding.test.js` | Same 5-test pattern |
| `bin/lib/harness-health/tests/issue-payload.test.js` | Same 3-test pattern |
| `skills/journey-health/SKILL.md` | Step 3 (COVERAGE SCAN) gains the `relatedSections` field (coverage-category findings only) + the bundling-rule paragraph, scoped explicitly to the coverage scan; Anti-Patterns row added |
| `bin/lib/journey-health/validate-finding.js` | Accept optional `relatedSections` |
| `bin/lib/journey-health/issue-payload.js` | Render `Also affects: ...` line when present |
| `bin/lib/journey-health/tests/validate-finding.test.js` | Same 5-test pattern |
| `bin/lib/journey-health/tests/issue-payload.test.js` | Same 3-test pattern |

`code-health` itself needs no changes — it's the existing reference implementation.

## Testing

Real, executable code this time (unlike the filing-gate fix, which was markdown-only): each of the three skills' `validate-finding.js` and `issue-payload.js` gets new unit tests mirroring code-health's existing `relatedAnchors` test coverage exactly (5 validate-finding cases + 3 issue-payload cases per skill = 24 new tests total), folded into the existing `npm test` aggregate. SKILL.md prose changes (Finding Shape + bundling-rule paragraph + Anti-Patterns row) are verified by grep/read-through, same convention as the filing-gate design.

## Non-Goals (explicitly parked / out of scope)

- **`code-health` changes.** It already has this mechanism; nothing to port there.
- **Cross-target bundling** (e.g., two different docs, or two different journeys, sharing one root cause). Scoped to within a single audited unit (one doc, one journey's coverage scan) per firing — matching code-health's own scope ("within the slice being judged").
- **`journey-health`'s `files-frontmatter`, `self-review`, and `live-check` findings.** Structurally incapable of producing bundleable duplicates in one firing (each check emits at most one finding per violation) — adding the field there would be dead code with no real caller.
- **Retroactively bundling already-filed issues** (e.g., closing `#1051`/`#1052` from the motivating incident and re-filing as one). This mechanism only affects future findings; no migration of existing GitHub issues.
- **The broader "first-run flood control" and "Next Actions recommendation" angles** from the original docs-health usability brainstorm — resolved without a design change (see the conversation this design doc originated from): the filing-gate fix already handles arbitrary batch sizes safely, and the Next Actions recommendation logic's existing agent-judgment wording is sufficient.

## Known Touch Points

- `bin/lib/code-health/validate-finding.js` / `issue-payload.js` — the reference implementation this design ports from; read directly during planning to ensure the ported code matches its patterns exactly, not just its spirit.
- `_shared/health-filing-gate.md` — unaffected. Bundling happens at JUDGE time (finding construction), before the FILE step's interactive gate ever sees the findings array; a bundled finding is just one more finding object flowing through the same gate.
- `_shared/journey-self-review.md` / journey-health's coverage-scan procedure — the two mechanisms whose finding-emission loops this design's journey-health scoping decision depends on (confirming which checks can vs. cannot produce bundleable duplicates).
