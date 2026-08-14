---
record: 397
origin: capture
risk: medium
size: medium
ceremony: standard
grants: [build, merge]
surface: backend
---
# 397: Merge deepen into simplify as --depth module

Surface: backend

## Current State

`/simplify` (170 lines / 9.1KB) and `/deepen` (197 / 17.7KB) are the same skill at two zoom levels: identical Step-1 scope resolution (args → `#N` → `git diff --name-only` → parent), identical BLOCKED-gate template, identical `verification.md` consumption from `/test`, identical run-dir staging and Component-Skill Contract; each recommends the other in Next Actions, and `deepen/SKILL.md:11` states the line/module split itself. deepen has zero eval scenarios; simplify has two. ADR-0001 (`docs/decisions/0001-deepen-standalone-and-flow-survey.md`) records the original decision to ship deepen standalone. ~18 files reference `/deepen`.

## Deliverables

- `/simplify` gains `--depth line|module` (default `line`); the module branch inherits deepen's interface-design and one-commit-per-module apply stages plus the `--kind deepen|collapse` filter.
- Retire `skills/deepen/`; the criteria fragments (`criteria-simplification.md`, `criteria-architecture-depth.md`) stay untouched.
- Amend ADR-0001 with a superseded-by note — the reversal must be recorded, per the repo's ADR discipline.
- Sweep the ~18 referencing files: `test/verification.md`, `wrap-up/adr-curation.md`, `help/reference-card.md` + `context-flow.md`, `flow/survey.md` + `flow/SKILL.md`, `build/SKILL.md`, `reflect/hindsight-mode.md`, `harness-health/library-shape-analysis.md`, `review/step3-lens-dispatch.md`, `_shared/criteria-architecture-depth.md` + `decision-records.md`, `docs/skill-graph.md`, `docs/getting-started.md`, `docs/plugin-structure.md`, `tests/code-health-misc/criteria-fragments.test.js`.

## Acceptance Criteria

- `/simplify --depth module` performs deepen's full sequence (scope, shallow-module scan, leverage ranking, interface design, per-module apply) — hand-traced against deepen's current SKILL.md before deletion.
- No `/deepen` or `claude-tweaks:deepen` reference survives outside CHANGELOG / incident-log / ADR history (case-insensitive grep shown).
- `criteria-fragments.test.js` updated and green; simplify's two eval scenarios pass unchanged.
- One fewer frontmatter description; `/help` workflow diagrams list the updated skill set (CLAUDE.md rule).

## Technical Approach

Read ADR-0001 FIRST. If its standalone rationale still holds (e.g. `/flow`'s survey step depends on deepen as a distinct stage), STOP and return the finding to the user instead of building — that outcome closes this record as not-planned with the ADR citation. Otherwise: extend simplify, port deepen's module-stage content, delete, sweep, amend the ADR.

## Gotchas

- This record is flagged `framing:baked`: it assumes ADR-0001's standalone rationale no longer holds (unvalidated — the ADR was not re-read at capture time), and it assumes the merge shape (`--depth` flag) over alternatives (shared sub-file; leaving both skills) without an explicit tradeoff. The ADR gate in Technical Approach is the resolution step for both assumptions.
- `flow/survey.md` may treat deepen as a pipeline stage, not just a cross-reference — verify flow's survey semantics survive the rename.
- `bin/lib/skill-audit/tests/fixtures/review-SKILL-pre-2b.md` mentions deepen-adjacent files but is a frozen fixture — do not update it.

## Original request

Merge deepen into simplify as --depth module

**Related:** none

Context: Bloat audit: the two skills are structurally identical (same scope resolution, BLOCKED gate, staging, component contract) at two zoom levels and each recommends the other in Next Actions; deepen has zero eval scenarios. ADR-0001 (deepen-standalone-and-flow-survey) must be revisited before building — this reopens it.

Scope: /simplify --depth line|module; both criteria fragments untouched; ~18 referencing files; carry the --kind filter along.
