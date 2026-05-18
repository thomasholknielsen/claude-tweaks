---
tier: 1
status: complete
progress: 100
blocked-by: [01]
surface: infra
design-intent: none
---

# 04: /challenge Layered MoA Integration

## Overview

Integrate Spec 01's Mode 4 (Layered MoA — Mixture of Agents) into `/claude-tweaks:challenge`. The existing 7 debiasing lenses become **proposer agents**: one parallel proposer per currently-defined lens, each focused on a single lens reading the same problem statement. A single **aggregator agent** (1 sequential round-trip after proposers complete) reads all proposer outputs plus the original problem statement and the original INBOX item context, then produces the Brainstorming Brief in the same output shape `/challenge` produces today.

Output shape from the user's perspective is **unchanged** — same Brainstorming Brief structure (Original Framing / Reframed Problem / Key Assumptions Surfaced / Blind Spots Identified / Constraints to Carry Forward / Open Questions for Brainstorming). Quality improves because synthesis is now explicit aggregation rather than emergent from sequential lens application.

**This spec changes /challenge's user-engagement model.** Currently, /challenge engages the user lens-by-lens — "one question per message, wait for user's response." Under MoA, proposers read the original problem statement and produce their lens-focused candidate framings without per-lens user interaction; the aggregator synthesises. See Decision Rationale and Gotchas for how this interacts with the existing `auto-mode-contract.md` "not silenced" rule and the original per-lens engagement intent.

Touches `skills/challenge/SKILL.md` only. Adds the `/challenge` integration test to `tests/multi-agent-coordination.test.js` (file created by Spec 01).

**Complexity:** Medium
**Estimated tasks:** 4

## Non-Goals

- Not changing the Brainstorming Brief output schema. Downstream consumers (`/superpowers:brainstorming`, `/specify`) read the same fields they read today.
- Not changing the file location of the saved brief (`docs/plans/{YYYY-MM-DD}-{topic}-brief.md`) or which skills delete it.
- Not adding new lenses or removing existing lenses. The 7 current lenses become the 7 proposers (in Full mode); the 2 lenses used in Quick mode become 2 proposers.
- Not adding cross-mode composition (no reproduction of MoA outputs, no debate between proposers — see Spec 01 hard limits).
- Not introducing a per-proposer user prompt. The user supplies the original problem statement once at the start; proposers run autonomously after that.
- Not modifying `/superpowers:brainstorming`, `/capture`, or `/specify` — output shape unchanged means these consumers don't break.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| 01 | Multi-Agent Coordination Primitive | not-started (must merge first) |

This spec depends on `skills/_shared/multi-agent-coordination.md` existing (for Mode 4's inlined dispatch templates — proposer prompt skeleton and the verbatim aggregator instruction template).

## Current State

- `skills/challenge/SKILL.md` (226 lines) — applies debiasing lenses to an INBOX item or topic. Currently 7 lenses (Surface Hidden Assumptions, Invert the Question, Zoom Out One Level, Outsider Lens, Pre-Mortem, Temporal Distance, Meta-Question). Implementation today is **single-pass sequential lens application with user engagement at each lens** ("one question per message, wait for the user's response before moving to the next lens").
- Quick mode runs Lens 1 + Lens 7 only (2 lenses).
- Full mode runs all 7 applicable lenses; lenses are skipped if irrelevant per author judgment.
- Output: the Brainstorming Brief saved to `docs/plans/{YYYY-MM-DD}-{topic}-brief.md` with a fixed schema (see Decision Rationale section below for the schema; it stays unchanged in this spec).
- The Brief Self-Review step (lines 189–197 of current SKILL.md) is preserved unchanged — it runs after the brief is written, regardless of whether the lenses ran sequentially (today) or as MoA proposers (post-spec).
- `auto-mode-contract.md` currently lists `/challenge` lenses as "not silenced" — meaning even in `auto` mode, lenses fire interactively. **This spec changes that contract** — see Decision Rationale.
- Existing parallel-execution conventions use Form B (Subagent Contract).

## Deliverables

- [ ] Rewrite `skills/challenge/SKILL.md` Step 3 ("Work through lenses") into a parallel proposer dispatch. Inline the Mode 4 proposer prompt skeleton from Spec 01. Run all applicable lenses in parallel (Full mode → 7 proposers; Quick mode → 2 proposers).
- [ ] Add Step 4 ("Aggregate") — a single sequential aggregator round-trip per Mode 4. Inline the verbatim aggregator instruction template from Spec 01: *"Read N candidate responses below. Identify what each captures that the others miss. Produce a single output that incorporates the strongest elements of each. Do not list which proposer contributed which idea. Do not produce an analysis of the proposers."*
- [ ] Update Step 5 ("Synthesize") to consume the aggregator's output as the brief draft (currently it's emergent from accumulated lens dialog).
- [ ] Preserve Step 1 (Listen) and Step 2 (Reflect back) — these are the only user-engagement points retained.
- [ ] Preserve the Brief Self-Review pass.
- [ ] Update `skills/_shared/auto-mode-contract.md`'s "not silenced" list to reflect the new interaction model (see Decision Rationale).
- [ ] Update `skills/challenge/SKILL.md`'s "Auto-mode" section (line 59–61) to reflect the new model — lenses are no longer per-lens user prompts; they're parallel proposers.
- [ ] Add the `/challenge` integration test to `tests/multi-agent-coordination.test.js`: fixture INBOX item → proposers + aggregator dispatched → output shape matches the existing Brainstorming Brief schema (no missing fields, no extra fields).
- [ ] Verify `node --test tests/` passes.

## Acceptance Criteria

1. After the user supplies the problem statement (Step 1) and the assistant reflects it back (Step 2), Step 3 dispatches one proposer per applicable lens in parallel via Subagent Contract Form B. Full mode → 7 proposers; Quick mode → 2 proposers. Tier: **Standard** (Sonnet).
2. Each proposer's prompt inlines its lens question verbatim from the current `skills/challenge/SKILL.md` Lens N section (e.g., Lens 1's "Surface Hidden Assumptions" prompt becomes the Lens 1 proposer's prompt). The Mode 4 proposer prompt skeleton wraps each lens's content.
3. Proposers receive the original problem statement, the user's reflected-back summary, and (when applicable) the INBOX item context. They do NOT receive each other's outputs — proposers are independent.
4. After all proposers return, Step 4 dispatches exactly 1 aggregator agent sequentially with: all proposer outputs verbatim, the original problem statement, the user's reflected-back summary, and the INBOX context. Aggregator tier: **Capable** (Opus) — synthesis is judgment-heavy work per the Subagent Contract tier guidance.
5. The aggregator's prompt contains the verbatim instruction template from Spec 01 Mode 4 (no paraphrase). The aggregator does not list which proposer contributed which idea; it produces the brief as the final output.
6. Step 5 (Synthesize) consumes the aggregator's output and writes it to `docs/plans/{YYYY-MM-DD}-{topic}-brief.md` using the existing Brainstorming Brief schema (Original Framing / Reframed Problem / Key Assumptions Surfaced / Blind Spots Identified / Constraints to Carry Forward / Open Questions for Brainstorming). All sections present; no schema drift.
7. The Brief Self-Review step is unchanged — it runs after the brief is written and inspects the same four criteria (assumption check, constraint vs. preference, reframe coherence, open question quality).
8. `decisions.md` receives exactly ONE entry per MoA invocation, per Spec 01: `AUTO {HH:MM:SS} — MoA: applied {N} proposers + 1 aggregator on {topic|INBOX item N}. Aggregator tier: Capable.` Individual proposer dispatches are NOT logged separately — the MoA invocation is a single coordination event.
9. `skills/_shared/auto-mode-contract.md` "not silenced" list is updated: the line that currently reads "What `auto` never silences: … `/challenge` lenses …" is changed to: "`/challenge`'s initial Listen + Reflect-back steps (the user-engagement entry points)." Per-lens engagement is no longer the unit of "not silenced" behavior; the entry to the gate is.
10. `tests/multi-agent-coordination.test.js` includes a `/challenge` integration test: fixture INBOX item ("Voice shopping list") → proposers + aggregator dispatched on fixture lens outputs → resulting brief contains all 6 required sections (Original Framing, Reframed Problem, Key Assumptions Surfaced, Blind Spots Identified, Constraints to Carry Forward, Open Questions for Brainstorming).
11. All existing `node --test tests/` tests continue to pass.

## Technical Approach

### New Process flow (replaces existing Process section in `skills/challenge/SKILL.md`)

The new 5-step process:

1. **Listen** — let the user explain their problem fully (unchanged from today).
2. **Reflect back** — summarise in 2-3 sentences, confirm with the user (unchanged from today). This is the LAST user-engagement before MoA.
3. **Dispatch proposers (parallel)** — one proposer per applicable lens. Full mode dispatches 7; Quick mode dispatches 2 (Lens 1 + Lens 7). Each proposer's prompt inlines its lens question verbatim per Mode 4. Form B dispatch. Standard tier. All proposers receive identical context (problem statement + reflected summary + INBOX context), differing only in their lens prompt.
4. **Dispatch aggregator (sequential)** — exactly 1 aggregator agent receives all proposer outputs verbatim + the original context. The aggregator instruction template is inlined verbatim per Mode 4. Capable tier. The aggregator returns the Brainstorming Brief content.
5. **Save the brief** — write to `docs/plans/{YYYY-MM-DD}-{topic}-brief.md` using the existing schema (unchanged). Run Brief Self-Review (unchanged). Append the AUTO entry to `decisions.md`.

Steps 3 and 4 replace the current step "Work through lenses — one at a time, ask one question per message, wait for the user's response." Step 5 replaces the implicit "Synthesize" step.

The "Stop when the frame shifts" behavior (current step 4 — "if a lens produces a genuine 'aha' moment, don't mechanically continue") **does not survive the MoA transition** — proposers run all in parallel, so there's no opportunity to stop mid-way. This is documented in the Gotchas section.

### Proposer prompt skeleton (per lens, inlined verbatim per Subagent Contract)

```
Task scope: Apply the {Lens N name} lens to the problem statement below.
Lens instruction: {full content of the Lens N section from skills/challenge/SKILL.md, verbatim — e.g., "What is the user assuming about the problem space that may not be true?"}
Output: A debiasing perspective focused on this lens only. Surface assumptions, blind spots, or framings that this lens uniquely reveals. Do not write a brief — that's the aggregator's job. Format: free-form 2-4 paragraphs.
Constraint: Read-only. Do not act on the problem; only debias the framing.
Original problem statement: {problem from Step 1}
Reflected summary: {summary from Step 2}
INBOX context (if applicable): {INBOX entry}
```

Seven such prompts go out in parallel (Full mode) or two (Quick mode).

### Aggregator prompt skeleton (inlined verbatim — the instruction template is non-negotiable)

```
Task scope: Read N candidate debiasing perspectives below. Identify what each captures that the others miss. Produce a single Brainstorming Brief that incorporates the strongest elements of each. Do not list which proposer contributed which idea. Do not produce an analysis of the proposers.
Original problem statement: {problem from Step 1}
Reflected summary: {summary from Step 2}
INBOX context (if applicable): {INBOX entry}

Proposer outputs (N total):
--- Proposer 1 ({Lens 1 name}) ---
{proposer 1 output verbatim}
--- Proposer 2 ({Lens 2 name}) ---
{proposer 2 output verbatim}
... (repeat for all proposers)

Output: The Brainstorming Brief with these exact sections (in this order):
## Brainstorming Brief: {topic}
### Original Framing
### Reframed Problem
### Key Assumptions Surfaced
### Blind Spots Identified
### Constraints to Carry Forward
### Open Questions for Brainstorming

Constraint: Read-only synthesis. Do not write to disk — return the brief content; the dispatcher saves it.
```

The aggregator's instruction sentence is the verbatim Mode 4 template; the surrounding scaffolding (output schema, constraints) is added by the dispatcher per the Subagent Contract input-discipline rule.

### Auto-mode-contract update

`skills/_shared/auto-mode-contract.md` currently includes `/challenge` lenses in its "not silenced" list — the rationale was that per-lens user engagement IS the debiasing value. Under MoA, lens engagement is no longer per-lens — it's batch-synthesised. The contract update:

| Today (pre-spec) | After this spec |
|------------------|-----------------|
| `/challenge` lenses are individually not-silenced; auto-mode runs each lens as a user-prompt cycle. | `/challenge`'s **Listen** + **Reflect-back** steps are not-silenced (the user-engagement entry points). Lens proposers + aggregator run autonomously after Step 2; they are not user-prompt cycles. |

The reframed contract: the gate's user-engagement happens once at the *entry* (Listen + Reflect-back), then MoA runs autonomously, then the user sees the resulting brief and the Brief Self-Review pass acts on it.

This is a real semantic change. The "Decision Rationale" section below documents the tradeoff.

### Data / API Surface

No new files in `bin/lib/`. The MoA logic is described in skill prose; the test uses Spec 01's dispatch recorder with fixture proposer outputs.

### Key Files

- `skills/challenge/SKILL.md` — rewrite Process section (lines 141–149); rewrite Auto-mode section (lines 59–63); inline Mode 4 proposer skeleton + verbatim aggregator instruction template; preserve Brief Self-Review unchanged. **~40 line growth expected.**
- `skills/_shared/auto-mode-contract.md` — update the "not silenced" list to reflect Listen + Reflect-back as the engagement entry points (not lens-by-lens). **~3 line change.**
- `tests/multi-agent-coordination.test.js` — add the `/challenge` integration test (file created by Spec 01). **~1–2 test blocks added.**

### Package Dependencies

- No new external packages. No new `bin/lib/` modules. Integration test uses Spec 01's dispatch recorder.

## Gotchas

- **The shared test file `tests/multi-agent-coordination.test.js` is also touched by Specs 02 and 03.** See the same Gotcha in Spec 02 — build sequentially via `/claude-tweaks:flow 02,03,04` (or with this spec last if specs 02 and 03 are already merged).
- **"Stop when the frame shifts" doesn't survive MoA.** The current process has an "if a lens produces a genuine 'aha' moment, don't mechanically continue" step. Parallel proposer dispatch removes the sequential midpoint. **If this behavior is valued, the right answer is for the aggregator's instruction to be tuned to recognise "aha" framings and structure the brief around them** — not to reintroduce a sequential midpoint. The instruction template is verbatim per Mode 4, so this tuning would happen in the brief-schema content the dispatcher requests, not in the Mode 4 sentence itself.
- **Per-lens user engagement is gone.** Today the user has 7 chances (Full mode) to course-correct mid-debiasing. Under MoA, the user has 1 chance (Reflect-back) before the parallel dispatch, then sees only the final brief and the Brief Self-Review pass. This is a deliberate tradeoff documented in Decision Rationale. **If the user pushes back on this during build implementation, the alternative is a hybrid:** keep lens-by-lens engagement BUT add an aggregator pass at the end that synthesises the dialog into the brief. This is more conservative and preserves the "engagement IS the debiasing value" intuition from today's `auto-mode-contract.md`. Flag this option at the start of the implementation conversation.
- **The aggregator tier is Capable (Opus), not Standard.** Synthesis is judgment-heavy; the Subagent Contract recommends Capable for "design synthesis, UX analysis, ambiguous calibration, plan-quality review." The brief synthesis from 7 debiasing perspectives qualifies. Do not downgrade to Standard to save cost; the brief quality is the entire reason `/challenge` exists.
- **Proposer outputs must reach the aggregator verbatim.** Do not summarise, truncate, or paraphrase. Per the Mode 4 dispatch template, aggregator's prompt contains all proposer outputs verbatim. If proposer outputs are individually large (3-4 paragraphs each × 7 proposers = 21-28 paragraphs in the aggregator's prompt), that's acceptable — the aggregator is Capable tier and the synthesis quality benefits from the full content.
- **Quick mode still uses MoA, just with 2 proposers.** Don't special-case Quick mode to skip aggregation. Mode 4 with N=2 proposers + 1 aggregator is valid (Spec 01 doesn't lower-bound N>2 for MoA). The aggregator's value for 2-proposer inputs is reconciling 2 perspectives, same logic as with 7.
- **The Lens-skip behavior also doesn't survive cleanly.** Current Full mode says "Skip irrelevant ones — if a lens clearly doesn't apply, acknowledge it briefly and move on. Not every problem needs all 7 lenses." Parallel dispatch makes the "is this lens relevant?" determination harder. **Default: dispatch all 7 lens proposers in Full mode regardless of apparent relevance** — the aggregator can deweight irrelevant proposer outputs naturally. If integration testing shows the aggregator over-weights weak proposers, add a pre-dispatch relevance filter as a follow-up spec, not in this one.
- **The `decisions.md` entry is one-line per MoA invocation**, not per proposer. Per Spec 01 acceptance criterion: "One AUTO entry per MoA invocation noting proposer count and aggregator tier." Don't log proposer-by-proposer dispatch — that's noise.
- **Reflect-back (Step 2) must remain user-engaging.** It's the only user-engagement before MoA. If the user disagrees with the reflected summary, fix it via dialog before dispatching proposers. Do not pre-dispatch and then dialog — that wastes a full MoA cycle on a misunderstood problem.
- **Brief Self-Review writes back into the brief file**, not into the spec body. Same as today. No change to how Self-Review interacts with the brief content.
- **`/challenge` runs standalone or as part of `/specify`'s polymorphic input.** When `/specify <topic>` invokes `/superpowers:brainstorming`, brainstorming may have been preceded by `/challenge`. The brief file location and schema stay the same, so downstream behavior is unaffected.

## Decision Rationale

(See Spec 01's Decision Rationale for the broader design context.)

- **Why this spec changes the user-engagement model of `/challenge`.** Today's per-lens engagement is a friction tax that the user pays for debiasing depth. The MoA reframing is: depth comes from parallel multi-perspective synthesis, not from interactive depth. Quality may improve OR degrade depending on the topic; that's an open empirical question the design author flagged as worth shipping to evaluate. Per the design doc: "Output shape from the user's perspective is unchanged — same debiased problem framing they get today; quality improves because synthesis is now explicit rather than emergent from sequential lens application." If quality degrades post-merge, the rollback is reverting this spec — the brief schema didn't change, so downstream specs and consumers are unaffected.
- **Why update `auto-mode-contract.md`'s "not silenced" list.** The list previously protected per-lens engagement as "the debiasing value." Under MoA, the debiasing value is parallel synthesis, not per-lens dialog. Listen + Reflect-back remain the protected user-engagement entry points (they're the only places the user supplies context). Lens proposers run autonomously after that, which makes them eligible for `auto` mode — same as any other Subagent Contract dispatch.
- **Why Capable tier for the aggregator, not Standard.** The aggregator synthesises 7 perspectives into a 6-section brief. Each section requires choosing what survives, what gets dropped, what's actually a constraint vs. preference. This is judgment-heavy synthesis, the canonical Capable-tier use case per the Subagent Contract.
- **Why one AUTO log entry per MoA invocation, not one per proposer.** Per Spec 01's Mode 4 acceptance: aggregator output is the answer; there's no per-proposer survival decision to log. Logging 7 individual proposer dispatches just adds noise to the audit trail.
- **Why proposers don't see each other's outputs.** Mode 4's Layer 1 is parallel-independent. Proposers seeing each other's outputs introduces sequential dependency and anchoring, which negates the parallelism. Aggregator-only synthesis preserves the "independent then combined" structure that gives MoA its quality lift.

## Manual Steps

None — this spec ships markdown updates and one integration test. After merge, run `node --test tests/`. Manually exercise `/claude-tweaks:challenge` with a known-biased input (e.g., "we should ship a mobile app") to confirm the brief renders with all 6 sections via the MoA path. Compare quality to the pre-merge behavior on the same input; if quality regression is observed, file a follow-up to either tune the aggregator's brief-schema instruction or revert to the hybrid model (per-lens engagement + aggregator pass).
