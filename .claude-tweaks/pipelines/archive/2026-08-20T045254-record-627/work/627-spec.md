---
record: 627
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
surface: backend
---
# 627: auto-mode-contract: rename the auto-apply "severity floor" vocabulary to ceiling — matches review-auto-apply-ceiling (#332)

Surface: backend

## Current State

`skills/_shared/auto-mode-contract.md` still describes the auto-apply severity threshold with "floor" vocabulary, even though #332 renamed the underlying policy key `review-severity-floor` → `review-auto-apply-ceiling` precisely because the value is a **maximum** severity auto-applied, not a minimum (`_shared/policy-deprecations.md`'s `review-severity-floor` entry; `_shared/policy-key-naming.md`'s suffix convention: `-floor` = minimum, `-ceiling` = maximum). No key name is involved in `auto-mode-contract.md`'s prose, so #332's rename could not catch this by grep — the human-facing vocabulary is now split: the policy key says ceiling, the contract's own prose still says floor for the same concept.

Within `skills/_shared/auto-mode-contract.md`, "severity floor(s)" appears describing this exact reversibility/confidence/severity gating trio (the three conditions that must ALL hold before a skill may auto-resolve a decision) in at least these places — verify the current set with `grep -in "severity floor" skills/_shared/auto-mode-contract.md` rather than trusting this list, since exact line numbers may have shifted:

- The numbered outline item introducing the section ("Reversibility / confidence / severity floors — what `auto` is allowed to decide")
- The `## Reversibility / confidence / severity floors` section heading
- The floors table's `**Severity**` row, whose "Floor" column header and phrasing both imply a minimum
- The hooks-comparison sentence noting the worktree-reap hook has no "reversibility/confidence/severity floor"
- The Anti-Patterns table row "Auto-applying severity:medium or severity:high findings | Severity floor exists for a reason."

Other files repo-wide also contain the string "severity floor" (`grep -rln -i "severity floor" --include="*.md" .` turns up `CHANGELOG.md`, `CLAUDE.md`, `docs/skill-graph.md`, `skills/wrap-up/verification-brief.md`, `skills/review/step3-debate-and-refutation.md`, `skills/review/step3-routing.md`, `skills/review/SKILL.md`, `skills/review/step3-lens-dispatch.md`, `skills/_shared/criteria-review-quality.md`, `skills/_shared/auto-mode-card.md`, `skills/_shared/deferral-gate.md`, `skills/flow/manifesto-overrides.md`, `skills/flow/SKILL.md`). Most of these are a **genuinely different, correctly-named floor** — e.g. `criteria-review-quality.md`'s "Per-lens severity floors (calibration)" section and `step3-debate-and-refutation.md`'s refutation-pass floor are real minimums (the lowest severity a lens/pass still considers), unrelated to the auto-apply ceiling this record fixes, and must NOT be touched. A smaller subset are direct citations or close paraphrases of `auto-mode-contract.md`'s own "Reversibility / confidence / severity floors" heading, describing this same auto-vs-staged gating trio — those go stale the moment the heading changes and need to move in lockstep. No test pins this prose (`grep -rn -i "severity floor" tests/` only hits `policy-schema.test.js`'s unrelated key-rename fixtures and a differently-named test in `pull-issues-v2.test.js`), so this is a pure documentation/prose fix with no code or policy-key change.

## Deliverables

1. In `skills/_shared/auto-mode-contract.md`, reword every occurrence found by `grep -in "severity floor" skills/_shared/auto-mode-contract.md` so severity is described with ceiling/maximum vocabulary, while **Reversibility** and **Confidence** keep floor/minimum vocabulary unchanged (the issue's explicit instruction: "keeping reversibility/confidence as floors"). This includes the outline item, the section heading, the floors table's Severity row (and, if the table's single "Floor" column header no longer reads correctly once Severity is a ceiling, adjust the header or add a row-level qualifier so all three rows stay individually accurate — Reversibility and Confidence genuinely are floors), the hooks-comparison sentence, and the Anti-Patterns row.
2. Sweep the other files that quote or closely paraphrase `auto-mode-contract.md`'s "Reversibility / confidence / severity floors" heading when referring to this same auto-vs-staged/kept-prompt gating trio (candidates to check, not a blind rewrite list — confirm each is actually citing this concept before touching it): `CLAUDE.md`, `docs/skill-graph.md`, `skills/_shared/auto-mode-card.md`, `skills/_shared/criteria-review-quality.md` (only its line citing the contract's heading verbatim — its own "Per-lens severity floors" section a few lines above is a different, correctly-named floor and must stay untouched), `skills/flow/manifesto-overrides.md`, `skills/flow/SKILL.md`. Update each genuine citation to match the corrected wording; leave every unrelated "severity floor" occurrence (per-lens calibration floors, the refutation-pass floor, deferral-gate's own routing language) exactly as-is. `CHANGELOG.md` is a historical record — do not edit it.

## Acceptance Criteria

- `grep -in "severity floor" skills/_shared/auto-mode-contract.md` returns zero matches.
- The file's "Reversibility" and "Confidence" floor language is otherwise unchanged — re-diff to confirm no wording was touched beyond the severity-specific phrasing (e.g. `git diff skills/_shared/auto-mode-contract.md` shows only severity-vocabulary edits, no accidental rewrite of the reversibility/confidence rows or surrounding prose).
- Every genuine citation of the corrected heading identified during the sweep (Deliverable 2) now matches the new wording — re-run `grep -rn -i "severity floor" --include="*.md" .` afterward and confirm every remaining hit is a distinct, correctly-named floor concept (per-lens calibration, refutation-pass floor, deferral-gate routing language, or `CHANGELOG.md`'s historical entry), not a stale citation of the old heading.
- No policy key, label, or code path is renamed or touched — this is a prose-only fix (`review-auto-apply-ceiling` and every other key name are already correct from #332 and stay exactly as they are).
- `npm test` passes (standard verification gate for any committed change in this repo; no test is expected to fail, but this confirms nothing else was inadvertently touched).

## Technical Approach

Edit `skills/_shared/auto-mode-contract.md` first (the record's primary, explicitly-named file), then re-grep the repo for remaining "severity floor" hits and classify each against Deliverable 2's candidate list before editing further. Prefer the smallest wording change that reads correctly — e.g. "Reversibility / confidence floors; severity ceiling" for the heading/outline item, and a per-row qualifier or brief inline note in the table rather than restructuring it, matching this repo's existing `-floor`/`-ceiling` suffix convention (`_shared/policy-key-naming.md`) and the precedent already set by `_shared/policy-deprecations.md`'s `review-severity-floor` → `review-auto-apply-ceiling` entry. No new sections, no restructuring beyond what's needed to make the wording accurate.

## Gotchas

- Don't blanket-replace "floor" with "ceiling" repo-wide via a mechanical find/replace — most of the ~13 other files matched by the broad grep use "severity floor" correctly, for a genuinely different (minimum) concept. Touch only the confirmed citations of this specific contract heading.
- `CHANGELOG.md` is historical and must not be edited to match current vocabulary — it describes the state of the world when that entry shipped.
- The floors table's "Floor" column header is shared across all three rows (Reversibility, Confidence, Severity) — changing Severity's row without checking whether the shared header still reads correctly for all three is an easy way to leave the table internally inconsistent.

## Original request

auto-mode-contract: rename the auto-apply "severity floor" vocabulary to ceiling — matches review-auto-apply-ceiling (#332)

# Reflect — staged finding 2

**Category:** tangential
**Severity:** low
**Reversibility:** high
**Source:** hindsight mode, lens "Convention drift"
**Files:** skills/_shared/auto-mode-contract.md

## Finding

#332 renamed review-severity-floor to review-auto-apply-ceiling because the value is the MAX severity auto-applied. skills/_shared/auto-mode-contract.md still heads its floors section "Reversibility / confidence / severity floors" and its table row reads "Severity | low (for findings)" — the same floor-for-a-max misnomer at the contract level. No key name is involved, so #332 could not catch it by grep — the human-facing vocabulary is now split (key says ceiling, contract says floor).

## Suggested resolution

A small follow-up record: reword the contract severity row/heading to ceiling vocabulary (and any prose that says "severity floor" for the auto-apply cutoff), keeping reversibility/confidence as floors.

## Decision-log reference

STAGED 13:42:53 — Step 3: tangential idea "auto-mode-contract severity-floor wording" — backlog candidate. Surface at the Queue writes gate.

Filed from pipeline run 2026-08-16T122937-spec-332-602-334 (#332 review hindsight). Surface: backend.

