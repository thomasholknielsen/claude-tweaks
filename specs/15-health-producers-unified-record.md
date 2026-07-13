---
tier: 1
status: not-started
progress: 0
blocked-by: [14]
surface: backend
---

# 15: Health producers on the unified record

## Overview

Move all three health skills (code-health, harness-health, journey-health) onto the unified work record: file via `record.js` payloads with `by:*` origin, colon-form `risk:*`/`effort:*` scoring, an Issue Type, the `work-fingerprint` marker, and **born-`ready`** stamping (their findings are agent-sized and spec-shaped by construction, so they skip maturation and appear directly in the gate's worklist). harness-health's additive/restructural classification folds into the scoring axis (additive → `risk:low`, restructural → `risk:medium` unless evidence says higher) instead of being a producer-specific label the gate must know. journey-health joins the same pipeline — its previous deliberately-outside-triage status ends (origin-agnostic gate).

**Complexity:** Medium
**Estimated tasks:** 7

## Non-Goals

- No changes to detection/validation logic (what counts as a finding, evidence grading, durable cursors, retry queues, health-state branch storage — all unchanged).
- No triage/dispatch changes (specs 18–19).
- No removal of legacy-label read support anywhere.
- `wontfix` re-filing suppression semantics unchanged (only verify vocabulary).

## Current State

- `bin/lib/code-health/issue-payload.js` — builds title/body/labels: `code-health`, `code-health:<criterion>`, `risk-<tier>`/`effort-<tier>` (hyphen forms), fingerprint marker `code-health-fingerprint`.
- `bin/lib/harness-health/issue-payload.js` — labels `harness-health`, `harness-health:additive|restructural`; body carries classification/confidence/reversibility fields.
- `bin/lib/journey-health/issue-payload.js` — labels `journey-health` + severity (`high|med|low`); never pulled by `/triage` today.
- `bin/lib/{code-health,harness-health,journey-health}/validate-finding.js` — label enums validated per producer.
- `skills/{code-health,harness-health,journey-health}/SKILL.md` — filing steps, label bootstrap snippets, `wontfix` checks; per-skill tests under `bin/lib/*/tests/` including `skill-md.test.js` files asserting SKILL.md content.

## Deliverables

- [ ] Repoint all three `issue-payload.js` builders onto `record.js`'s `recordPayload` (spec 14): emit `by:{skill}`, colon scoring, `ready`, Type (code-health → Task; harness-health → Task; journey-health → Bug when the finding is a defect, Task otherwise — builder decides from the finding shape), `work-fingerprint` marker. Producer detail labels (`code-health:<criterion>`) may remain as optional extras.
- [ ] harness-health: map additive → `risk:low`, restructural → `risk:medium` (evidence may raise, never lower); keep `harness-health:additive|restructural` as optional diagnostic labels; effort mapping unchanged.
- [ ] journey-health: map severity → risk (`high`→`risk:high`, `med`→`risk:medium`, `low`→`risk:low`); stamp effort from the finding's scope where derivable, else `effort:medium`.
- [ ] Update each `validate-finding.js` enum set for the new emitted label vocabulary.
- [ ] Update the three SKILL.md filing sections: bootstrap only the labels about to be applied (per `_shared/label-bootstrap.md`'s updated LABELS_JSON), reference `_shared/work-record.md` as the taxonomy home, state born-`ready`, and state journey-health's pipeline membership (delete the "not pulled by /triage" carve-outs).
- [ ] `wontfix` check: verify each producer's re-filing suppression reads `wontfix` and the dual fingerprint markers (via `extractFingerprint`).
- [ ] Update per-skill tests (payload label sets, enum validation, skill-md assertions) to the new vocabulary.

## Acceptance Criteria

1. `node --test bin/lib/code-health/tests/*.test.js bin/lib/harness-health/tests/*.test.js bin/lib/journey-health/tests/*.test.js` passes.
2. Each producer's payload for a representative finding includes exactly one `by:*` label, one `risk:*`, one `effort:*`, and `ready`; none includes `code-health` / `harness-health` / `journey-health` bare-name labels as the *mechanical* origin (bare names may persist only if a skill explicitly keeps them as optional diagnostics — then the SKILL.md must say so).
3. `grep -rn "risk-low\|risk-medium\|risk-high\|effort-low\|effort-medium\|effort-high" bin/lib/code-health/ bin/lib/harness-health/ bin/lib/journey-health/` returns hyphen-form matches only in legacy-read compat lines/tests, never in emit paths.
4. `grep -n "not pulled by /triage\|never pulled by" skills/journey-health/SKILL.md` returns 0 matches; the SKILL.md states its records enter the same gate worklist as the other producers.
5. Bodies emitted by all three builders contain `<!-- work-fingerprint:` and not the legacy marker.
6. Each SKILL.md filing section references `_shared/work-record.md` by path.

## Technical Approach

The three builders keep their per-skill body composition (Current State / Deliverables / Acceptance Criteria sections are already spec-shaped) and delegate label/marker assembly to `recordPayload`. Type assignment: pass through `recordPayload`'s `type` field (enum `bug|feature|task`); skills' `gh issue create` steps apply it natively when the project's `work-types` config key (written by `/init`, spec 22) reads `native`, else as a `type:*` label — skills read the key by its literal name per `_shared/work-record.md`'s config-key table; no per-skill alias/env rename.

## Gotchas

- The severity→risk and additive→risk folds change what the gate recommends — state the mapping tables literally in each SKILL.md so a reviewer can audit them without reading Node source.
- `skill-md.test.js` files assert literal SKILL.md strings — update them in the same task as the prose or the suite fails.
- Producer-specific labels that survive as diagnostics must be bootstrapped before application (label bootstrap creates lazily).

## Key Files

- `bin/lib/code-health/issue-payload.js`, `bin/lib/harness-health/issue-payload.js`, `bin/lib/journey-health/issue-payload.js`
- `bin/lib/{code-health,harness-health,journey-health}/validate-finding.js` + tests
- `skills/code-health/SKILL.md`, `skills/harness-health/SKILL.md`, `skills/journey-health/SKILL.md`
