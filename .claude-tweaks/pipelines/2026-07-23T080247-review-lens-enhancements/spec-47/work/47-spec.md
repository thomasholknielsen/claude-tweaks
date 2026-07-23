---
record: 47
origin: capture
risk: low
effort: medium
ceremony: fast-lane
grants: []
surface: backend
---
# 47: Review Step 3.5: per-candidate refutation verifier, not just reproduction-pair agreement

## Current State

`/claude-tweaks:review`'s Step 3 verifies each lens's findings via 2-agent reproduction pairs (`skills/review/SKILL.md` lines 284-297): two identical agents review the same scope independently, and a finding becomes `confirmed` only when both agents flag the same `path`/line-range/severity bucket (`categoriseReproduction`, `bin/lib/coordination.js`). This catches disagreement between the two agents, but not correlated error — if both agents share the same blind spot or the same miscalibration (e.g., both hallucinate the same plausible-sounding but wrong claim, or both apply outdated context), agreement alone confirms a false positive. Step 3.5 ("Cross-Lens Debate," lines 415-457) only resolves contradictions *between different lenses* flagging the same region with mismatched severity — it has no mechanism to challenge a `confirmed` finding that both reproduction agents agreed on. This gap was caught concretely during the #45 native-review prototype: a dedicated verifier subagent, dispatched per surviving candidate finding with the explicit job of trying to falsify it using fresh evidence-gathering (not just re-stating agreement), caught false positives that reproduction-pair agreement alone had let through.

## Deliverables

- A new subsection within Step 3.5 ("Per-Candidate Refutation Pass"), added to `skills/review/SKILL.md` alongside the existing Cross-Lens Debate subsection (after line 457's bucket-finalization note, or as a new numbered step before it — final placement decided during implementation to read cleanly within Step 3.5's existing structure).
- Gated to the resolved `review-effort` tier (Step 2.5): dispatches only at `xhigh` and `max` — deliberately one tier above Step 3.5's existing cross-lens-debate gate (`high`+), so `high`-tier reviews aren't paying for both mechanisms at once.
- Runs once per `confirmed` finding surviving Step 3's reproduction-pair step (i.e., every finding that would otherwise proceed toward Step 3 Routing) — dispatches one Capable-model (Opus) agent per candidate, in parallel, given: the finding's path/line/severity/evidence, and fresh read access to the actual current file content (not the finding's cached evidence text) — instructed to actively try to falsify the finding: re-trace whether the claimed failure is actually reachable, verify the cited evidence still matches the current code, and challenge the reasoning rather than restate it.
- Each refutation agent returns `refuted: true | false` plus one paragraph of reasoning (mirrors the existing cross-lens debate agent's `agree/disagree/partial` + reasoning format, lines 431-444).
- A finding refuted (`refuted: true`) is downgraded from `confirmed` to `unconfirmed` — written to `decisions.md` with the refutation's reasoning as rationale. A finding not refuted (`refuted: false`) proceeds unchanged to Step 3 Routing.
- Runs independently of (does not replace) the existing cross-lens debate mechanism — at `xhigh`/`max`, both may fire in the same review: debate resolves cross-lens contradictions, refutation independently re-examines every surviving confirmed candidate.

## Acceptance Criteria

- At `review-effort: low/medium/high`, no refutation agents dispatch and no `confirmed` finding is downgraded by this mechanism — verified by running a review at `high` with at least one `confirmed` finding and confirming it reaches Step 3 Routing unchanged.
- At `review-effort: xhigh` or `max`, every `confirmed` finding (after Step 3's reproduction pairs, independent of whether it also went through cross-lens debate) gets exactly one refutation-agent dispatch.
- A finding whose cited evidence no longer matches the current file content (e.g., the flagged line was already fixed by a later commit in the same diff) is refuted and downgraded to `unconfirmed` — verified with a synthetic finding referencing stale evidence.
- A finding refuted (`refuted: true`) produces a `decisions.md` entry recording the downgrade and the refutation reasoning.
- Both the cross-lens debate mechanism and the per-candidate refutation pass can fire within the same `xhigh`/`max` review run without interfering with each other (they operate on different inputs — debate on cross-lens contradiction pairs, refutation on every individually-confirmed finding).

## Technical Approach

Add the refutation pass to `skills/review/SKILL.md`'s Step 3.5 section. Reuse the existing dispatch-template pattern (lines 431-444) for a byte-identical *shape* (status line + verdict + reasoning), with new prompt content:

```
You are trying to FALSIFY this finding, not confirm it. Re-read the actual current file
content at {path}:{line} (do not trust the cached evidence text below) and determine
whether the claimed issue is real and reachable.

First line: one of DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED. Then:
1. Verdict: refuted / not-refuted
2. One paragraph of reasoning, citing what you actually found in the current file.

Candidate finding: {path}:{line}
Severity: {severity}  Category: {category}
Finding: {finding text}
Cached evidence: {evidence text}

[Use: Capable model — refutation agent. Independent run; fresh file read, not the
lens's original context.]
```

Wire the resolution logic alongside `resolveDebate` in `bin/lib/coordination.js` — likely a small sibling helper (e.g. `resolveRefutation(verdict)`) rather than overloading `resolveDebate`, since the input/output shape differs (single verdict, not two judges to reconcile) — final naming/shape is an implementation decision, not fixed by this record. Update `step3-routing.md`'s Inputs section to note that a `confirmed` finding downgraded by refutation moves to the `unconfirmed` bucket with the same visibility rules as any other `unconfirmed` finding.

## Gotchas

- This is explicitly NOT a second reproduction pair — reproduction pairs check *agreement between two initial readers*; refutation is a *distinct, later agent* whose only job is to try to break a finding that already survived agreement. Conflating the two defeats the purpose (see Current State: correlated error is exactly what reproduction-pair agreement can't catch, which is the whole reason this exists).
- `xhigh`/`max` gating (one tier above Step 3.5's existing `high`+ debate gate) is an editorial judgment call made during shaping (this record) — the issue itself only says "likely gated to higher review-effort tiers." Revisit if `/build`'s actual measurement suggests a different tier split between debate and refutation.
- This record and #48 (gap-sweep pass, also touching the Step 3.5/tier-gating area of the same file) are independent, standalone leaf records with no `Blocked by` dependency between them — both are being built in the same `/claude-tweaks:flow #47,#48,#49` batch, in the same worktree, so sequencing is handled by the pipeline rather than an explicit link. Watch for the two new subsections landing in a sensible reading order within/around Step 3.5 once both are applied.
- `ceremony:fast-lane` verdict reflects a single, self-contained addition to one file with a concrete, testable gate condition — not a multi-package or public-surface change.

## Original request

Review Step 3.5: per-candidate refutation verifier, not just reproduction-pair agreement

**Related:** #45

Context: Prototyping native /code-review (see #45) showed a dedicated verifier subagent per surviving candidate finding — one that actively tries to falsify it with fresh evidence-gathering — catches false positives that reproduction-pair agreement alone might miss.

Scope: Add an optional per-candidate refutation pass to Step 3.5, alongside or instead of reproduction-pair agreement, likely gated to higher review-effort tiers.
