---
tier: 1
status: not-started
progress: 0
blocked-by: [01]
surface: infra
design-intent: none
---

# 02: /review Reproduction Pairs + Cross-Lens Debate + Wrap-Up Console Categorisation

## Overview

Integrate two coordination modes from Spec 01 — **Reproduction** and **Debate** — into `/claude-tweaks:review`. Each existing reviewer-lens dispatch becomes a 2-agent reproduction pair instead of a single agent. After per-lens reproduction, the dispatcher scans for cross-lens contradictions on overlapping `Path:Line` regions and runs a 1-round debate where contradictions exist. Findings are then categorised three ways for assembly: `confirmed` (reproduced or debate converged positive), `unconfirmed` (single-source or debate converged negative), `contested` (debate inconclusive).

`confirmed` findings flow into the existing severity-grouped sections of the review summary unchanged. `unconfirmed` and `contested` findings are staged to two new Wrap-Up Review Console subsections — they are not silently dropped, and they do not surface as mid-flow prompts (binding operational rule from the design doc).

Touches `skills/review/SKILL.md`, `skills/review/review-summary-template.md`, and `skills/wrap-up/review-console.md`. Adds the `/review` integration test to `tests/multi-agent-coordination.test.js` (file created by Spec 01).

**Complexity:** Medium
**Estimated tasks:** 6

## Non-Goals

- Not changing `/review`'s lens definitions (3a Convention through 3i Documentation). Each lens keeps its current scope; only its dispatch shape and result-handling change.
- Not changing the severity-grouped sections of the review summary template. Existing categories (low/medium/high) keep their layout. Only the *category* (confirmed/unconfirmed/contested) is added as the upstream gate that decides which findings land where.
- Not introducing a "reproduction failed" or "debate failed" surface to the user. Reproduction misses become `unconfirmed`. Debate ambiguity becomes `contested`. Neither warrants a mid-flow prompt.
- Not modifying `/test`, `/build`, or other lifecycle steps. `/review`'s gate position and its Step 1/1.5 gates are unchanged.
- Not adding Wrap-Up integration for `/specify` or `/challenge` output — those don't stage to the Console. This spec only handles `/review`'s additions.
- Not changing the `auto-decision-log.md` schema — Spec 01 already establishes that existing STATUS values cover all coordination outcomes.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| 01 | Multi-Agent Coordination Primitive | not-started (must merge first) |

This spec depends on `skills/_shared/multi-agent-coordination.md` existing (for the inlined dispatch templates and comparison rules) and on `bin/lib/coordination.js` exporting `severityBucket`, `findingsMatch`, `categoriseReproduction`, `detectCrossLensOverlap`, `resolveDebate`.

## Current State

- `skills/review/SKILL.md` (402 lines) — the `/claude-tweaks:review` workflow. Step 3 (Code Review) dispatches parallel reviewer lenses 3a–3i via Subagent Contract Form B. Each lens uses Template-A output. Results are assembled into the structured summary at Step 7.
- `skills/review/review-summary-template.md` (113 lines) — the summary template. Currently has `### Code Review Findings` as a single table with columns `Category | Finding | Severity | Action`. No three-bucket categorisation yet.
- `skills/wrap-up/review-console.md` (~150 lines) — owns the canonical Review Console template. Currently has four sections: Auto-applied / Pending review / Skill updates / Configuration updates. The console reads `decisions.md` and `staged/` from the pipeline run directory.
- `skills/wrap-up/SKILL.md` Step 8.6 — delegates the Console template to `review-console.md`. Adjusting Step 8.6's prose for new section count may not be necessary (Step 8.6 says "one consolidated batch table with four sections" — that count needs updating to six).
- Pipeline run directory: `.claude-tweaks/pipelines/{ISO-timestamp}-{spec-slug}/` with `decisions.md` (append-only audit log) and `staged/` directory. Per `skills/_shared/pipeline-run-dir.md`.
- Existing parallel-execution conventions in `skills/review/SKILL.md` use Form B (`Dispatch {scope} as parallel Task agents...`) per CLAUDE.md.

## Deliverables

- [ ] Update `skills/review/SKILL.md` Step 3 dispatch directives so each lens (3a–3i) dispatches a 2-agent reproduction pair instead of a single agent.
- [ ] Add a new sub-step under Step 3 (e.g., Step 3.5: Cross-Lens Debate) that runs after per-lens reproduction completes and detects contradicting `Path:Line` overlaps via `detectCrossLensOverlap`, then dispatches debate pairs via `bin/lib/coordination.js` rule.
- [ ] Update `skills/review/review-summary-template.md` to categorise findings into `confirmed` / `unconfirmed` / `contested` upstream of the existing severity table. `confirmed` flow into the existing table; `unconfirmed` and `contested` are staged.
- [ ] Update `skills/wrap-up/review-console.md` to add two new subsections — `### Low-confidence findings (not reproduced)` and `### Contested findings (debate inconclusive)` — rendered only when non-empty.
- [ ] Update `skills/wrap-up/SKILL.md` Step 8.6 prose so the section count ("four sections") matches the new section count ("up to six sections").
- [ ] Add the `/review` integration test to `tests/multi-agent-coordination.test.js`: fixture lens outputs with overlap+disagreement → debate triggers → expected three-bucket assembly.
- [ ] Verify `node --test tests/` passes.

## Acceptance Criteria

1. After Step 3 runs on a fixture spec, every reviewer-lens dispatch sent exactly 2 agents in one batch (not 1). The dispatch prompts are byte-identical between the two agents in a pair (no perturbation in v1 — see Decision Rationale).
2. Per-lens reproduction categorisation matches `bin/lib/coordination.js#categoriseReproduction`: findings present in both agents' outputs with matching `Path:Line` (path exact, line ±2) and matching severity bucket are emitted as `confirmed`. Findings present in only one agent's output are emitted as `unconfirmed`.
3. After per-lens reproduction, the cross-lens debate detector (`bin/lib/coordination.js#detectCrossLensOverlap`) scans for `Path:Line` regions within ±5 lines that have contradicting verdicts across two different lenses. For each overlap found, exactly 1 debate round runs with the two lens-agents that produced the contradiction (the original Template-A reviewer agents from the affected lenses, re-dispatched with the stripped opposing finding as input).
4. Debate verdicts are resolved per the primitive: both `agree` → finding upgraded to `confirmed` (AUTO entry in `decisions.md`); both `disagree` → finding downgraded to `unconfirmed` (AUTO entry); mixed/partial → `contested` (STAGED entry).
5. `review-summary-template.md` includes a `### Code Review Findings` section that lists only `confirmed` findings in the existing severity table. The template also notes (where the prior single-table sentence was): "Findings flagged `unconfirmed` (single-source or debate converged negative) and `contested` (debate inconclusive) are staged to the Wrap-Up Review Console — they are not silently dropped."
6. `wrap-up/review-console.md` renders the new subsection `### Low-confidence findings (not reproduced)` with columns `Path:Line | Finding | Severity | Lens`, populated from `decisions.md` STAGED entries tagged with the unconfirmed-finding rationale. Renders only when non-empty.
7. `wrap-up/review-console.md` renders the new subsection `### Contested findings (debate inconclusive)` with columns `Path:Line | Lens A verdict | Lens B verdict`, populated from `decisions.md` STAGED entries tagged with the contested-finding rationale. Renders only when non-empty.
8. The Console's existing "Approve all / Override / Stop" action prompt covers both new sections — items in the new sections are reachable by their numeric IDs from the same prompt (no separate batch decision per the "one decision per message" rule).
9. `skills/wrap-up/SKILL.md` Step 8.6 prose ("one consolidated batch table with four sections") updated to "one consolidated batch table with up to six sections — the two coordination-derived sections render only when non-empty."
10. `tests/multi-agent-coordination.test.js` includes integration tests:
    - `/review reproduction integration: per-lens reproduction → confirmed/unconfirmed categorisation on fixture lens outputs`
    - `/review debate integration: cross-lens overlap with contradicting verdicts → debate dispatched → confirmed/unconfirmed/contested resolution per verdict combination`
    - `/review summary assembly: confirmed flow to summary; unconfirmed + contested flow to Wrap-Up Console subsections`
11. All existing `node --test tests/` tests continue to pass.
12. Decision-log entries match the schema from `auto-decision-log.md` with the example shapes from the design doc:
    - `AUTO {HH:MM:SS} — Reproduction: lens "{lens}" finding {path}:{line} reproduced. Confirmed. Reversibility: high.`
    - `STAGED {HH:MM:SS} — Reproduction: lens "{lens}" finding {path}:{line} not reproduced. Staged to Review Console as low-confidence. Reversibility: high.`
    - `AUTO {HH:MM:SS} — Debate: cross-lens disagreement on {path}:{line} converged {positive|negative} after 1 round. Reversibility: high.`
    - `STAGED {HH:MM:SS} — Debate: cross-lens disagreement on {path}:{line} inconclusive ({verdicts}). Both verdicts staged. Reversibility: high.`

## Technical Approach

### Reproduction dispatch (per lens)

In `skills/review/SKILL.md` Step 3, each lens currently dispatches one Task agent with a Template-A output contract. The change: each lens dispatches **two Task agents in one batch with byte-identical prompts**. After both return, apply `categoriseReproduction(agentA.findings, agentB.findings)` from `bin/lib/coordination.js`.

The dispatch directive form changes from:

```
> **Parallel execution:** Dispatch lenses 3a–3i as parallel Task agents — each returns Template-A findings. Assemble results after all agents complete.
```

to (illustrative — author per existing prose style):

```
> **Parallel execution:** Dispatch each lens as a reproduction pair (2 identical agents per lens) — 18 Task agents total for 9 lenses. Each returns Template-A findings. After all agents complete, apply per-lens reproduction comparison via `bin/lib/coordination.js#categoriseReproduction`, then assemble.
```

The reproduction dispatch template (from the Spec 01 primitive) is inlined verbatim per the Subagent Contract input-discipline rule. Do not reference `multi-agent-coordination.md` from the lens dispatch — inline the relevant Mode 1 section.

### Cross-lens debate (new Step 3.5)

After per-lens reproduction completes, run a new sub-step before Step 3 Routing:

1. Collect all `confirmed` and `unconfirmed` findings across all lenses (the union of per-lens reproduction outputs).
2. Call `detectCrossLensOverlap(findingsByLens)` — returns pairs of findings from *different* lenses with `Path:Line` overlap (line within ±5) where one is `confirmed` (or simply present) and the other lens had agents that reviewed the same region without flagging.
3. For each overlap pair, dispatch a debate round per Mode 2: 2 agents (the two lens-agents that produced the contradiction), 1 round, each receiving the stripped opposing finding as input (no model identity, no reasoning chain — just finding text + evidence). Inline the Mode 2 dispatch template.
4. Each debate agent returns one of `agree | disagree | partial` plus reasoning.
5. Resolve via `resolveDebate(verdictA, verdictB)`:
   - Both `agree` → finding upgraded to `confirmed`. Write AUTO entry.
   - Both `disagree` → finding downgraded to `unconfirmed`. Write AUTO entry.
   - Mixed/partial → finding becomes `contested`. Write STAGED entry. Stage the patch-or-evidence to `staged/review-contested-{N}.md` with both verdicts side-by-side.

Skip debate when only one lens covered a region (no contradiction is possible).

### Three-bucket assembly + Step 3 Routing integration

Existing Step 3 Routing (severity-based auto-fix logic) only operates on `confirmed` findings. `unconfirmed` and `contested` findings are routed directly to the Wrap-Up Console as STAGED entries; they do not enter the auto-fix path. This means a severity:low formatting nit that wasn't reproduced does NOT get auto-applied — it lands in the Low-confidence subsection of the Console.

This is the conservative default. The design doc is explicit: "Not silently dropped." It's also conservative against auto-fixing speculation.

### Review Console subsection rendering

Modify `wrap-up/review-console.md` to add two new section blocks between the existing "Configuration updates" section and the final action prompt. Use the same `| # | ... |` column form so numeric IDs continue across all sections (the existing Console renumbers across sections). Each new section renders only when its source decision-log entries are non-empty.

Section render order (top to bottom):

1. Auto-applied
2. Pending review
3. **Low-confidence findings (not reproduced)** ← NEW
4. **Contested findings (debate inconclusive)** ← NEW
5. Skill updates
6. Configuration updates

The action prompt at the bottom (Approve all / Override / Stop) is unchanged — override-by-ID continues to work across all six sections.

### Data / API Surface

No new files in `bin/lib/` (Spec 01 already adds `coordination.js`). This spec uses its exports.

### Key Files

- `skills/review/SKILL.md` — modify Step 3 dispatch directives; add new Step 3.5 for cross-lens debate; add three-bucket categorisation logic before Step 3 Routing; inline the Mode 1 and Mode 2 dispatch templates from Spec 01. **~50 line growth expected.**
- `skills/review/review-summary-template.md` — adjust `### Code Review Findings` section header and add the explanation paragraph about unconfirmed/contested findings being staged. **~10 line growth expected.**
- `skills/wrap-up/review-console.md` — add the two new subsections with column definitions and render-only-when-non-empty rules. **~30 line growth expected.**
- `skills/wrap-up/SKILL.md` — Step 8.6 prose update to reflect new section count. **~3 line growth expected.**
- `tests/multi-agent-coordination.test.js` — add `/review` integration tests (file created by Spec 01). **~3 test blocks added.**

### Package Dependencies

- `bin/lib/coordination.js` (added by Spec 01) — uses `severityBucket`, `findingsMatch`, `categoriseReproduction`, `detectCrossLensOverlap`, `resolveDebate`.
- No new external packages.

## Gotchas

- **The shared test file `tests/multi-agent-coordination.test.js` is also touched by Specs 03 and 04.** Each adds its gate's integration tests via separate `test('...')` blocks. Concurrent builds on Specs 02/03/04 will cause merge conflicts at this file. When `/flow` runs them sequentially (default), this is fine. If parallelising, build one at a time or split per-gate tests into separate files in a follow-up spec. **The conservative recommendation: build Specs 02 → 03 → 04 sequentially via `/claude-tweaks:flow 02,03,04`.**
- **`skills/review/SKILL.md` is at 402 lines pre-change** and CLAUDE.md flags large SKILL.md files (commits 6734ce0 and 56e60c6 extracted sub-files). The ~50-line growth here keeps it under typical thresholds, but if the new Step 3.5 + the inlined dispatch templates push it past ~500 lines, extract the cross-lens debate procedure to a new sub-file `skills/review/cross-lens-debate.md` lazy-loaded only when contradictions are detected. Decide during implementation by line count after the edit, not in advance.
- **Inlining the dispatch templates is mandatory, not optional.** Per the Subagent Contract (`subagent-output-contract.md`) and the Spec 01 primitive's anti-pattern table: agents only see what's in their prompt. Writing "see `multi-agent-coordination.md` Mode 1 for the reproduction template" in the Step 3 dispatch directive will leave the dispatched agents without the template content. **Inline the literal template text** in `skills/review/SKILL.md`. This duplicates the primitive doc in the consumer skill — that duplication is by design.
- **Cross-lens debate dispatch reuses the original lens agents' identity, not a fresh "judge" agent.** The two lenses that produced the contradiction each re-review the region with the opposing finding as input. This is intentional — the lens specialisation is what makes the verdict meaningful. Do not introduce a third "arbiter" agent.
- **Strip the opposing finding before passing it as input** — no model identity, no reasoning chain, just the finding text + evidence. Per the Mode 2 spec, this prevents anchoring on the other agent's authority and forces independent re-evaluation.
- **Debate is opt-in per region.** It only triggers when overlap is detected AND verdicts contradict. Lenses that didn't cover the same `Path:Line` produce no debate. Lenses that agreed on a region (both flagged or both clear) produce no debate. **Avoid running debate on every `Path:Line` where any two lenses touched — that explodes the token budget for no value.**
- **The Wrap-Up Console section render order matters for usability.** Place the new sections (Low-confidence + Contested) after Pending Review and before Skill Updates so that all *finding-oriented* sections are grouped together at the top of the Console. Skill/Config Updates are separate concerns — they stay at the bottom.
- **`decisions.md` STATUS values are AUTO and STAGED only** — never invent `CONTESTED` or `UNCONFIRMED` STATUSes. The fact that a finding is contested goes in the `action` field of the STAGED entry, not as a new STATUS. Per Spec 01 acceptance criterion 1.
- **Reversibility for all coordination decisions is `high`.** Reproduction and Debate outcomes are pure assemble-and-categorise operations; no commits are made by the coordination logic itself. (`/review`'s Step 3 Routing still commits auto-fixes from `confirmed` findings — those commits' reversibility is governed by Step 3 Routing's existing rules, not the new coordination logic.)
- **Fixture-driven integration tests must not invoke real `Task()`.** Use the dispatch recorder from Spec 01's test file. Provide canned per-lens outputs as fixtures; assert on the three-bucket categorisation, debate trigger conditions, and decision-log entry text. Same constraint as Spec 01 unit tests.

## Decision Rationale

(See Spec 01's Decision Rationale for the broader design context — this spec only adds the rationale specific to `/review` integration.)

- **Why reproduction pairs use identical prompts (not perturbed).** The design doc's open question 1 flags this: MAR literature suggests perturbed prompts encourage independent reasoning; identical prompts are simpler. The default is **identical**. If post-merge fixture-data exercise shows the false-positive rate doesn't drop meaningfully versus single-agent dispatch, escalate to perturbed prompts as a follow-up spec. Do not pre-optimise.
- **Why severity buckets collapse `critical`+`high` and `medium`+`low`+`info`.** This is the design doc's open question 2 — an alternative is three buckets (`critical` alone, `high`+`medium`, `low`+`info`). The two-bucket scheme is the Spec 01 default. If fixture data during this spec's implementation shows the two-bucket scheme produces noticeable mis-categorisations (e.g., a `critical` finding paired with a `high` finding both passing through with the same weight), update Spec 01's `severityBucket()` to the three-bucket scheme and re-run all tests. This is the rare case where a downstream spec discovers data that should update the foundation.
- **Why route unconfirmed findings to the Console instead of dropping or auto-applying.** The binding operational rule from the design doc: "Not silently dropped." A single-source finding is signal, just noisy signal — the user gets to see it at the back-loaded review without being interrupted mid-flow. This satisfies both the no-mid-flow-stops bookend rule and the no-silent-dropping discipline.
- **Why not surface contested findings as a mid-flow prompt.** The bookend architecture (`auto-mode-contract.md`) reserves mid-flow stops for HARD-GATEs and the explicit "not silenced" list. Cross-lens disagreement on a `Path:Line` is neither — it's information that benefits from being collected and presented in batch at the Console, where it can be triaged alongside other staged items rather than as an isolated decision.

## Manual Steps

None — this spec ships markdown updates, test additions, and references to `bin/lib/coordination.js` (already added by Spec 01). After merge, run `node --test tests/` and (optionally) manually exercise `/claude-tweaks:review` on a commit with known cross-lens-overlapping findings to confirm the three-bucket summary renders as expected.
