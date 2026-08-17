---
record: 858
origin: human
risk: low
size: low
ceremony: standard
grants: []
fingerprint: transcript-judge-extraction:evidence-and-cost-lines-on-the-reflect-finding-shape-across
blocked-by: [857]
surface: backend
---
# 858: Evidence and cost lines on the reflect finding shape across all three modes

Surface: backend

## Overview

Give the reflect finding shape the evidence-and-cost discipline `/feedback`'s findings contract already proved cheap and effective: every finding any reflect lens produces — in `full-mode.md`, `light-mode.md`, and `hindsight-mode.md`, dispatched or inline alike — carries an `Evidence:` line and a `Cost this session:` line (retries, hand-work, a reverted decision; `unclear` is valid), under the norm that "no finding" is the expected common answer and an unevidenceable lens says so explicitly rather than producing an unanchored insight. Downstream, reflect's Step 3 routing reads cost as a triage input and wrap-up's signal construction and Review Console rendering carry both lines through, so an approver sees what a proposal is anchored to.

**Complexity:** Low
**Estimated tasks:** 4-6

## Non-Goals

- No change to which lenses exist or when each mode runs them.
- No change to the dispatch structure (sibling #857 owns that) — this sub-issue changes what a finding must contain, not how it is produced.
- No `Measurement:` requirement — reflect's lenses are judgment lenses in `_shared/feedback-objectives.md`'s classification; the quantified-measurement half of feedback's contract stays feedback-only.
- No new fields on the ledger entry format or the staged-proposal file formats — the lines travel inside the existing finding/insight text.
- No truth-verification of evidence content — this is a **template-compliance contract, not a correctness guarantee**: nothing checks that a filled-in pointer corresponds to a real moment, and that limitation is accepted (parent #855's design). The no-manufacture norm is the behavioral counterweight, not a verifier.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #857 | Reflect's standalone singleton reads the transcript via the shared transcript-judge harness | blocked-by link on this record (#856 is Phase 1; the native links serialize #856 → #857 → this record) |

## Current State

- `skills/reflect/full-mode.md` (13,482 B), `light-mode.md` (3,711 B), `hindsight-mode.md` (5,109 B) define the per-lens finding shape; none requires an evidence pointer or a cost line.
- `skills/reflect/SKILL.md` (17,865 B) Step 2's dispatch output template is `{lens name, finding summary, category}`; Step 3 routes findings through `_shared/learning-routing.md`'s classifier (its `## Destinations` table defines D1–D5: D1 CLAUDE.md/rules, D2 project skill/doc/ADR/journey, D3 backlog record, D4 memory, D5 upstream issue).
- `skills/wrap-up/SKILL.md` (36,673 B — **~3.2 KB under the 40 KB ceiling**) consumes the surviving insight set in Phase 2's `--signals` construction and carries an anti-pattern row "Proposing generic skill updates with no concrete anchor" enforced by prose exhortation only.
- The model contract for these lines already exists in `_shared/feedback-objectives.md`'s Finding requirement (symptom / evidence / proposed fix / cost, `unclear` valid, cost is triage-never-gate).

## Deliverables

- [ ] All three mode files require, for every finding, an `Evidence:` line and a `Cost this session:` line (one line; `unclear` valid), and state the no-manufacture norm: "no finding" is a valid, complete lens outcome; a lens that cannot be evidenced renders that explicitly. The `Evidence:` format is path-specific and both shapes are defined here: **inline path** — a pointer into the session's own context (a named tool call, error, file/line, or user turn), never a transcript byte offset; **dispatched path** (the #857 judge, which does read the transcript) — a transcript-anchored pointer (a quoted excerpt or precise location reference) per `_shared/transcript-judge.md`'s finding norms.
- [ ] `skills/reflect/SKILL.md`: Step 2's dispatch output template gains the two fields per finding; Step 3's routing names `Cost this session:` as a triage input for the D1–D5 classification (per `_shared/learning-routing.md`'s classifier) and for drop-with-reason decisions. "Named as a triage input" is intentionally the full bar for this sub-issue — the classifier stays judgment-based; no numeric cost-to-destination mapping is defined, deliberately.
- [ ] `skills/wrap-up/SKILL.md`: the `--signals` construction and the Review Console's staged-proposal path carry the two lines through, and the "no concrete anchor" anti-pattern row cites the `Evidence:` line as its mechanical carrier — **total addition to this file ≤ 1 KB** (it sits ~3.2 KB under the 40 KB ceiling); if the wording cannot fit, slim adjacent prose in the same edit rather than exceeding the budget.
- [ ] Conformance tests: each of the three mode files **and SKILL.md's Step 2 template** pin the two required lines and the norm; a further assertion pins hindsight-mode.md's evidence wording to partial-session framing (it must not imply end-of-run knowledge). Every assertion demonstrated to go red against pre-change text.

## Acceptance Criteria

1. `node --test tests/` passes in full.
2. A conformance assertion per mode file **and for SKILL.md's Step 2 template** verifies both required lines and the norm are present, and each has been shown to fail when its clause is removed (prove-red per the `skill-prose-conformance-tests` discipline). The hindsight partial-session-framing assertion is part of this set.
3. `wc -c skills/wrap-up/SKILL.md` ≤ 40,960 after the change, and the diff to that file adds ≤ 1,024 bytes net.
4. `skills/reflect/SKILL.md` Step 3's routing text names `Cost this session:` as a triage input (grep-verifiable, case-insensitive, content-anchored).
5. No mode file's text requires `Measurement:` — grep discrimination rule: a `Measurement:` token appearing inside a finding-template block (a fenced template or a required-lines list) fails; a mention on a line that also contains the phrase "feedback-only" (the contrast clause) passes. Worked pair: `**Measurement:** {counts}` inside a template block → violation; "the quantified-measurement half of feedback's contract stays feedback-only" → permitted.
6. The no-format-change claim is discharged, not assumed: grep the wrap-up curation judge files (`skills/wrap-up/skill-curation.md`, `claude-md-curation.md`, `adr-curation.md`, `memory-curation.md`, `journey-curation.md`, `docs-health-integration.md`, `reference-sweep.md`, `upstream-feedback.md`) for insight-shape assumptions; record in the PR that none parses fields the two new lines would break.

## Technical Approach

The two lines are contract additions to prose templates, not code. Mirror `_shared/feedback-objectives.md`'s Finding requirement wording where it fits (evidence required to act, cost as triage signal, `unclear` valid) rather than inventing parallel vocabulary — same concept, same words. The inline path's evidence bar is deliberately "names the moment," not "quotes the transcript": the inline pass has no transcript read, and demanding byte-precise citations from it would either fail or induce fabricated precision. The dispatched path, which does read the transcript (#857), gets the transcript-anchored format defined in Deliverable 1.

### Data / API Surface

- No module API changes. Prose contracts only.

### Key Files

- `skills/reflect/full-mode.md` — finding shape + norm.
- `skills/reflect/light-mode.md` — finding shape + norm.
- `skills/reflect/hindsight-mode.md` — finding shape + norm + partial-session framing.
- `skills/reflect/SKILL.md` — Step 2 output template fields; Step 3 cost-as-triage.
- `skills/wrap-up/SKILL.md` — signal construction + console carry-through + anti-pattern citation (≤ 1 KB net).
- `tests/reflect-transcript-judge-prose.test.js` — extend #857's suite (that record creates it if absent; if this record is somehow picked up first despite the blocked-by link, create it here under the same name).

### Package Dependencies

- none.

## Gotchas

- `skills/wrap-up/SKILL.md` is 36,673 B against a 40,960 B ceiling — measure `wc -c` before and after; a byte-budget AC can be arithmetically unachievable if the addition is drafted without measuring first.
- Hindsight mode runs mid-pipeline during `/review`, before the run completes — its evidence pointers reference the partial session state it can actually see; AC 2's partial-session-framing assertion pins this.
- The `unclear` value for cost is load-bearing, not a loophole — omit it and lenses will fabricate costs to satisfy the template (the exact failure the no-manufacture norm exists to prevent on the evidence side).
- Reflect insights feed multiple consumers (ledger entries, staged skill/memory/upstream proposals) — the two lines travel inside existing text fields, so no consumer's parse format changes; AC 6 names the exact judge files to check before asserting that.

## Decision Rationale

See parent #855's Decision Rationale — this sub-issue implements the evidence-discipline half of the design; the shared-harness decisions live in sibling sub-issues #856 and #857.


<!-- work-fingerprint: transcript-judge-extraction:evidence-and-cost-lines-on-the-reflect-finding-shape-across -->

