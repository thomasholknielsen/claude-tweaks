---
record: 428
origin: human
risk: low
size: low
ceremony: fast-lane
grants: []
surface: backend
fingerprint: health-parity:component-skill-contract
---
# 428: Extend health-filing-parity.test.js to cover the Component-Skill Contract section

Surface: backend

**Related:** #401, #240

## Current State

Measured at f5db30d (2026-08-14, #401's delta re-measurement): the `## Component-Skill Contract` sections of the four health-sweep SKILL.md files (`code-health`, `harness-health`, `journey-health`, `docs-health`) are byte-identical after skill-name substitution (~570 chars each). This is exactly the canonical-inline paragraph class `tests/health-filing-parity.test.js` already guards for the Subject-check and D5-exception paragraphs (#240's resolution — chosen there over a `_shared` pointer to avoid the IL-114 runtime-binding hazard). The contract section is unguarded: one reword in one skill drifts it silently, which is the drift class #240's build caught live in the D5 paragraph.

## Deliverables

- Extend `tests/health-filing-parity.test.js` with a case that extracts the `## Component-Skill Contract` section from each of the four SKILL.md files and asserts byte-equality across all four modulo the skill-name substitution, reusing the test's existing normalization approach.

## Acceptance Criteria

- The new case passes on the current tree.
- Discrimination verified by reverting: temporarily reword one skill's section, show the test fail, restore (output shown) — reading the test is not evidence it fails.
- The suite runs green via its own `node --test tests/health-filing-parity.test.js` invocation (already inside `npm test`'s existing glob — no glob change).

## Technical Approach

Follow the existing test's paragraph-extraction pattern; anchor extraction on the literal `## Component-Skill Contract` heading through to the next `## ` heading.

## Gotchas

- Normalize every skill-name token form that appears in the section before comparing.
- If a legitimate per-skill divergence is ever wanted later, this test is the forcing function that turns it into a discussed decision instead of silent drift — that is the point, not an obstacle.

## Original request

Origin: #401 delta re-measurement (see that record's 2026-08-14 measurement comment). #401's broader consolidation premise was measured-and-mostly-refuted; this section-parity guard is the one surviving concrete action.


<!-- work-fingerprint: health-parity:component-skill-contract -->
