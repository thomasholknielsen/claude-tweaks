---
tier: 1
status: complete
progress: 100
blocked-by: []
surface: infra
design-intent: none
---

# 01: Multi-Agent Coordination Primitive

## Overview

Author `skills/_shared/multi-agent-coordination.md` — a new shared primitive (sibling to `subagent-output-contract.md`) that defines four intra-family agent coordination modes (Reproduction, Debate, Multi-persona red-team, Layered MoA) consumed by `/review`, `/specify`, and `/challenge`. Author the unit-test side of `tests/multi-agent-coordination.test.js` covering all four modes' dispatch shapes, comparison rules, and auto-resolution behavior.

This is the foundation spec — Specs 02, 03, 04 each integrate one mode into a gate and cannot start until this is merged. The primitive describes how agents **interact**; the existing Subagent Contract (`subagent-output-contract.md`) describes how agents **format output**. The two compose: a coordination dispatch sends N Template-A agents in one batch, then the primitive's comparison/aggregation logic decides what survives.

All work is intra-family (Claude Fast / Standard / Capable tiers). No cross-family transport, no new external dependencies, no feature flag. Coordination is baked-in gate behavior, not a user toggle — no `--coordination` flag, no Manifesto question, no `policy.yml` lever.

**Complexity:** Medium
**Estimated tasks:** 6

## Non-Goals

- Not adding a 5th mode or any extensibility surface. Exactly 4 modes; hard limits in the primitive (debate is 2 agents, MoA is 2 layers, red-team is 3 personas), not parameters.
- Not adding cross-mode composition (you can't reproduce a debate result — modes are leaf operations).
- Not adding model-selection logic — existing Subagent Contract tiers apply unchanged.
- Not adding retry/loop logic beyond what each mode specifies (always 1 turn except MoA's 2).
- Not integrating any mode into a gate — those are Specs 02, 03, 04.
- Not changing `skills/_shared/auto-decision-log.md` — its existing `AUTO` / `STAGED` / `KEPT-PROMPT` schema covers all coordination outcomes.

## Prerequisites

None — this is the foundation spec.

## Current State

- Shared primitives directory: `skills/_shared/` — contains `subagent-output-contract.md`, `auto-mode-contract.md`, `auto-decision-log.md`, `pipeline-run-dir.md`, others.
- Existing input/output contract: `skills/_shared/subagent-output-contract.md` (165 lines) — defines Templates A/B/C, the `DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED` status protocol, model tier selection (Fast/Standard/Capable), and Working Directory Discipline. **The new primitive composes with this file; it does not duplicate or replace it.**
- Existing audit-log schema: `skills/_shared/auto-decision-log.md` (124 lines) — defines per-entry shape `- {STATUS} {HH:MM:SS} — {step or location}: {short action}. {detail}. Reversibility: {high|med|low}{; commit ref or stage path}.` with `STATUS ∈ {AUTO, STAGED, KEPT-PROMPT}`. The primitive's documented entry formats MUST use this schema verbatim.
- Existing test harness: `tests/lib.test.js`, `tests/filter-bash-output.test.js`, `tests/statusline.test.js` — all use Node built-in `node:test` runner. No external test deps. Pattern: `const { test } = require('node:test'); const assert = require('node:assert');` at the top, individual `test('...', () => { ... })` blocks.
- Pipeline run directory contract: `skills/_shared/pipeline-run-dir.md` — defines `.claude-tweaks/pipelines/{ISO-timestamp}-{spec-slug}/decisions.md` location.

## Deliverables

- [ ] Create `skills/_shared/multi-agent-coordination.md` documenting the four modes with the structure below.
- [ ] Create `tests/multi-agent-coordination.test.js` with unit tests covering all four modes (no real `Task()` invocation — assert on dispatch call shapes via a recording stub).
- [ ] Verify `node --test tests/` passes including the new test file.
- [ ] Cross-reference the new primitive from `skills/_shared/subagent-output-contract.md` ("Related primitives" footer pointing to `multi-agent-coordination.md`) so future authors discover both.

## Acceptance Criteria

1. `skills/_shared/multi-agent-coordination.md` exists and contains four documented modes (`## Mode 1 — Reproduction`, `## Mode 2 — Debate`, `## Mode 3 — Multi-persona red-team`, `## Mode 4 — Layered MoA`), each with: literal dispatch template (inlined, not referenced), comparison/aggregation rule, decision-log entry format using existing `AUTO`/`STAGED`/`KEPT-PROMPT` STATUS values, Review Console staging format.
2. The Reproduction section documents `N=2` agents in one batch (always 2, never N>2), and a comparison rule requiring matching `Path:Line` (exact path match, line within ±2) and matching severity bucket (`critical`+`high` collapse to one bucket; `medium`+`low`+`info` collapse to another). Unmatched findings are `unconfirmed` and STAGED, not silently dropped.
3. The Debate section documents exactly 1 critique round with 2 agents, triggered only when two reviewer agents produce contradictory verdicts on the same `Path:Line` region within ±5 lines, with three auto-resolution outcomes: both `agree` → `confirmed` (AUTO), both `disagree` → `unconfirmed` (AUTO), mixed/partial → `contested` (STAGED).
4. The Multi-persona red-team section documents exactly 3 personas in one batch — Implementer, Maintainer, Skeptical Reviewer — each with its lens question inlined verbatim. Findings are written into the artefact itself (either an appended `## Open Questions` section or inline `<!-- ambiguity: ... -->` HTML comments). Each finding produces a STAGED decision-log entry.
5. The Layered MoA section documents exactly 2 layers, no more — N proposers in parallel (caller picks N, no upper limit in this primitive doc since `/challenge` reads its current lens list at runtime), 1 aggregator sequential. The aggregator instruction template is inlined verbatim: *"Read N candidate responses below. Identify what each captures that the others miss. Produce a single output that incorporates the strongest elements of each. Do not list which proposer contributed which idea. Do not produce an analysis of the proposers."* Aggregator output is the answer; one AUTO entry per MoA invocation noting proposer count and aggregator tier.
6. `tests/multi-agent-coordination.test.js` contains, at minimum, these unit tests (all passing):
   - `reproduction: dispatches exactly 2 agents in one batch with identical prompts`
   - `reproduction: matching Path:Line + matching severity bucket → confirmed`
   - `reproduction: one-side-only finding → unconfirmed with STAGED entry text in correct schema`
   - `reproduction: line numbers within ±2 are treated as matching`
   - `reproduction: line numbers ±3 or more are NOT matching`
   - `reproduction: severity buckets collapse correctly (critical+high vs medium+low+info)`
   - `debate: triggers only on cross-lens Path:Line overlap within ±5 lines with contradicting verdicts`
   - `debate: runs exactly 1 round with 2 agents`
   - `debate: both agree → confirmed with AUTO entry`
   - `debate: both disagree → unconfirmed with AUTO entry`
   - `debate: mixed/partial verdicts → contested with STAGED entry`
   - `red-team: dispatches exactly 3 personas in one batch`
   - `red-team: each persona prompt inlines its lens question verbatim`
   - `red-team: findings emitted in the documented Open Questions / HTML comment shape`
   - `MoA: dispatches N proposers in parallel + 1 aggregator sequential`
   - `MoA: aggregator's prompt contains all proposer outputs verbatim`
   - `MoA: aggregator instruction template is inlined verbatim`
7. All existing `node --test tests/` tests continue to pass (no regression in `lib.test.js`, `filter-bash-output.test.js`, `statusline.test.js`).
8. `skills/_shared/subagent-output-contract.md` includes a single-line footer pointer to `multi-agent-coordination.md` (no duplication of content — just discoverability).

## Technical Approach

### Authoring strategy for the primitive file

Follow the prose-and-table style of `subagent-output-contract.md`. Each mode is a top-level `## Mode N — {Name}` section with the sub-structure:

- **Purpose** — one paragraph: what problem the mode solves.
- **Shape** — agent count, parallelism, turn count. Hard limits stated as hard limits, not defaults.
- **Trigger** (if conditional, like Debate) — what condition causes the dispatcher to enter this mode.
- **Comparison / aggregation rule** — the deterministic logic the dispatcher applies after agents return.
- **Auto-resolution** — exhaustive enumeration of every possible outcome and which STATUS value (`AUTO` / `STAGED` / `KEPT-PROMPT`) it logs. **No outcome may be left "ask the user"** — that violates the binding operational rule from the design doc.
- **Dispatch template** — the literal `Task()` prompt skeleton callers inline (per Subagent Contract input-discipline rule: agents only see what's in their prompt; references won't reach them).
- **Decision-log entry format** — example one-liners using the existing `auto-decision-log.md` schema.
- **Review Console staging format** (when the mode can stage) — the table columns and grouping the Console will render.

Open the file with a "Why this exists" section paralleling `subagent-output-contract.md`, an explicit **Composition rule** ("the primitive describes how agents *interact*; the Subagent Contract describes how agents *format output*"), and a **Hard limits** table summarising the bounds across all four modes.

Close the file with an **Anti-patterns** table (matching the convention in other `_shared/` docs) covering:
- Inventing a 5th mode
- Composing modes (e.g., reproducing a debate)
- Exceeding the hard limits (N>2 reproduction, N>2 debate agents, >2 MoA layers, >3 red-team personas)
- Leaving an outcome "ask the user" — every outcome must auto-resolve to `AUTO` or `STAGED`
- Referencing the dispatch template from callers instead of inlining it (callers can't `read` sibling files; agents only see prompt content)
- Skipping the decision-log entry to save tokens (silent automation is forbidden per `auto-decision-log.md`)

### Authoring strategy for the test file

Unit tests must NOT make real `Task()` invocations — that's slow, non-deterministic, and unavailable in `node --test` anyway. Instead, write a small pure-Node "dispatch recorder" helper at the top of the test file that the modes' deterministic logic can be tested against. The recorder is a stub of the `Task()` interface: it captures `{ tier, prompt, agent_count }` per call and returns canned agent outputs (provided per-test as fixtures).

The primitive itself is a markdown document, not executable code. So the *tested logic* is the comparison/aggregation rule that a future caller (Specs 02–04) will implement when consuming the primitive. **For Spec 01, the test file exists to lock in the expected dispatch shapes and comparison-rule semantics so that Spec 02–04 implementations can be test-driven against fixtures**, not to test the markdown document itself.

Concretely, the test file should:

1. Define a fixture format for agent outputs (per-finding objects with `path`, `line`, `severity`, `text`).
2. Implement the comparison-rule logic (reproduction match, debate verdict resolution, severity bucketing, ±N line tolerance) as standalone exported functions in a new helper file `bin/lib/coordination.js` so they can be unit-tested and later imported by gate-integration code.
3. Test each acceptance criterion above against the helper functions.

### Data / API Surface

New helper module `bin/lib/coordination.js` (the *only* JS code added by this spec — everything else is markdown):

```js
// bin/lib/coordination.js
//
// Pure-function helpers for the multi-agent coordination primitive.
// Used by tests and (in later specs) by gate-integration code that needs
// to apply the primitive's comparison/aggregation rules to real agent output.

/** Collapse a severity string into one of two buckets. */
function severityBucket(severity) { /* returns 'high' | 'low' */ }

/**
 * Test whether two findings reproduce each other per the primitive's rule.
 * Match requires exact path, line within ±2, matching severity bucket.
 */
function findingsMatch(a, b) { /* returns boolean */ }

/**
 * Categorise an array of findings from 2 reproduction agents.
 * Returns { confirmed: Finding[], unconfirmed: Finding[] }.
 */
function categoriseReproduction(agentAFindings, agentBFindings) { /* ... */ }

/**
 * Detect cross-lens Path:Line overlap within ±5 lines.
 * Returns array of overlap pairs eligible for debate dispatch.
 */
function detectCrossLensOverlap(findingsByLens) { /* ... */ }

/**
 * Resolve a debate outcome from two verdicts ('agree'|'disagree'|'partial').
 * Returns 'confirmed' | 'unconfirmed' | 'contested'.
 */
function resolveDebate(verdictA, verdictB) { /* ... */ }

module.exports = {
  severityBucket,
  findingsMatch,
  categoriseReproduction,
  detectCrossLensOverlap,
  resolveDebate,
};
```

These are the only functions Spec 01 ships. Gate integration specs may add more callers later but should not extend the helper module without justification (modes are leaf operations; the helper is intentionally minimal).

### Key Files

- `skills/_shared/multi-agent-coordination.md` — **new file.** The primitive document. ~150–200 lines expected.
- `tests/multi-agent-coordination.test.js` — **new file.** Unit tests for the four modes' rules. All assertions hit `bin/lib/coordination.js`.
- `bin/lib/coordination.js` — **new file.** Pure-function helpers for severity bucketing, finding-matching, debate-verdict resolution, cross-lens overlap detection. ~80–120 lines expected.
- `skills/_shared/subagent-output-contract.md` — **modify.** Add a one-line footer pointer to the new primitive ("See also: `skills/_shared/multi-agent-coordination.md` for inter-agent coordination patterns that compose with these templates").

### Package Dependencies

- `node:test` (built-in, already in use) — test runner.
- `node:assert` (built-in, already in use) — assertions.
- No external dependencies. The `bin/lib/` modules already follow this convention (`bin/lib/jsonl.js`, `bin/lib/color.js`).

## Gotchas

- **Severity-bucket collapse is one of two design choices the writing-plans step explicitly flags as needing fixture validation.** The design doc collapses `critical`+`high` vs `medium`+`low`+`info`; an alternative scheme is `critical` alone vs `high`+`medium` vs `low`+`info`. Implement the documented scheme as the default but write `severityBucket()` in a way that makes swapping schemes a one-line change (e.g., a lookup map at the top of the helper file). Document the alternative in a comment so it's discoverable when fixture data arrives.
- **`Path:Line` line-tolerance is asymmetric across modes.** Reproduction uses ±2 (tight — same finding). Debate uses ±5 (looser — "same region"). The helper functions must take the tolerance as a parameter, not hard-code it, because the same matching logic with two different tolerances produces both behaviors.
- **The Subagent Contract's input-discipline rule binds the primitive too.** When documenting dispatch templates, write them as literal prompt skeletons that callers will inline — do NOT write "see the primitive for the dispatch shape." Agents only see what's in their prompt. The same anti-pattern that haunts Templates A/B/C will haunt the primitive's dispatch templates if not authored carefully.
- **No outcome may be left "ask the user."** This is the binding operational rule from the design doc. If a Reproduction outcome would naturally produce a "ask the user which agent was right" prompt, the primitive must document the deterministic auto-resolution instead (in this case: STAGED to Review Console, never inline prompt). Audit the auto-resolution sections of all four modes for any "ask" language and replace.
- **Existing `auto-decision-log.md` schema is fixed.** Do not introduce new STATUS values (`CONTESTED`, `REPRODUCED`, etc.). Coordination-specific information goes into the `action` and `detail` fields per the design doc's "no new STATUS values" rule.
- **The MoA aggregator instruction template is verbatim across all callers.** Copy it exactly: *"Read N candidate responses below. Identify what each captures that the others miss. Produce a single output that incorporates the strongest elements of each. Do not list which proposer contributed which idea. Do not produce an analysis of the proposers."* — not a paraphrase. Variations across callers will produce inconsistent synthesis quality.
- **`bin/lib/coordination.js` must not import any other `bin/lib/` module.** Pure functions only. This keeps the test file fast and the helper's responsibilities single.
- **Tests should not rely on system time, file system state, or process env.** Pure-function tests — pass fixtures in, assert outputs. The recording-stub pattern from `tests/lib.test.js`'s use of `tmpFile()` is not needed here; this helper has no I/O.

## Decision Rationale

Absorbed from the design doc — the rationale for the design choices preserved here so subsequent specs (which reference but do not repeat this) have a single canonical source.

- **Why intra-family only, not cross-family LLM Council.** Cross-family council patterns (anonymised peer-review across GPT/Gemini/Claude/Grok) require external API transport (OpenRouter, Bedrock, Poe, etc.) that claude-tweaks does not adopt. Users who want classic LLM Council install `llm-council-skill` from PyPI as a companion. This primitive is deliberately scoped to Claude Fast/Standard/Capable tiers via the existing Subagent Contract.
- **Why exactly four modes, not a generic orchestration framework.** Each mode is selected for a specific gate problem: reproduction cuts false positives in `/review`, debate resolves cross-lens disagreement in `/review`, multi-persona red-team surfaces ambiguity in `/specify`, MoA improves synthesis in `/challenge`. A generic framework would invite contributors to add Mode 5 / 6 / 7 indefinitely — fixing exactly four is the constraint that prevents this.
- **Why hard limits (not parameters).** Debate is 2 agents because >2 produces vote-counting, not deliberation. MoA is 2 layers because Layer 3 produces aggregator-of-aggregators, which research shows degrades. Red-team is 3 personas because the lens questions are fixed-purpose, not extensible. Reproduction is 2 because the MAR literature shows diminishing returns past the second agent. Encoding these as configuration would invite drift.
- **Why no `--coordination` flag.** Coordination is *how* these gates work, not a user choice. A user-facing toggle implies "you might want to turn this off," which inverts the intent. If a default ever needs to change, it is a code edit to the primitive's mode definition, not a runtime configuration.
- **Why reuse the existing `auto-decision-log.md` schema instead of introducing coordination-specific STATUS values.** The `AUTO` / `STAGED` / `KEPT-PROMPT` semantics already cover every outcome. New STATUS values would fragment the Review Console reader logic and break the single-source-of-truth audit trail.

## Manual Steps

None — this spec ships only markdown documentation, pure JS helpers, and unit tests. No infrastructure provisioning, no environment variables, no third-party setup. After merge, run `node --test tests/` once to confirm the suite passes; that is the only post-merge verification.
