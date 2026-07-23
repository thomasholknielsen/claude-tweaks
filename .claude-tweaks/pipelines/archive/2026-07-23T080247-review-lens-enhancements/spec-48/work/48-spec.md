---
record: 48
origin: capture
risk: low
effort: medium
ceremony: fast-lane
grants: []
surface: backend
---
# 48: Review Step 3: add a final gap-sweep / completeness-critic pass

## Current State

`/claude-tweaks:review`'s Step 3 (`skills/review/SKILL.md` lines 244-457) dispatches per-lens reviewers (3a-3i, each targeting a specific angle: convention, security, error handling, performance, architecture, test quality, coverage, UX, doc freshness), verifies each lens's findings via 2-agent reproduction pairs, then runs Step 3.5's cross-lens debate to resolve contradictions between lenses. After Step 3.5, findings are bucketed `confirmed`/`unconfirmed`/`contested` and routed (Step 3 Routing, `step3-routing.md`). There is no step that asks "what did every lens, collectively, miss?" — each lens is angle-scoped by construction (3b only looks for security issues, 3e only looks for architecture issues, etc.), so a real defect that doesn't cleanly fit any single lens's angle can pass through unflagged. This gap was caught concretely during the #45 native-review prototype: its own final "what did we miss" fresh-eyes pass caught 2 of 4 real findings that none of the angle-based finders surfaced.

## Deliverables

- A new subsection, "Step 3.6: Gap-Sweep / Completeness Critic," added to `skills/review/SKILL.md` after Step 3.5 (line 457, "After Step 3.5, every finding has a final bucket...") and before "### Step 3 Routing — Code Review Findings" (line 459).
- Gated to the resolved `review-effort` tier (Step 2.5): dispatches only at `xhigh` and `max`. At `low`/`medium`/`high`, this step is a no-op (skipped, no dispatch, nothing added to the summary) — one tier higher than Step 3.5's own `high`+ gate, since this is additional cost on top of an already-thorough pass.
- Dispatches exactly ONE Capable-model (Opus) agent — not a reproduction pair — with: the full diff (or the branch-own-work scope from the companion Step 2 record #49, once that lands) and a compact list of what lenses 3a-3i already flagged (path:line + one-line summary for every `confirmed` and `unconfirmed` finding so far), instructed to find genuine gaps — defects the existing findings list doesn't already cover — not to restate known findings.
- New findings from this pass are tagged with source `gap-sweep` and enter the `unconfirmed` bucket (the same confidence tier a single-source, non-reproduction-paired lens finding would get) — they are NOT auto-promoted to `confirmed`, since there's no second agent to reproduce them against. This reuses `step3-routing.md`'s existing xhigh/max inline-visibility rules (unconfirmed findings surface inline at `xhigh`+) with no new routing table needed.
- If the gap-sweep agent returns "No findings," the pass logs that and adds nothing to the summary — matches the existing per-lens "No findings" convention.

## Acceptance Criteria

- At `review-effort: low/medium/high`, Step 3.6 does not dispatch any agent and produces no output — verified by running a review at `high` and confirming no gap-sweep-tagged findings or agent dispatch occurs.
- At `review-effort: xhigh` or `max`, Step 3.6 dispatches exactly one agent (not two) with the diff scope and the already-flagged findings list as input.
- A gap-sweep finding appears in the summary tagged `(gap-sweep, low-confidence)` (or equivalent), staged to the Wrap-Up Console's Low-confidence subsection like any other `unconfirmed` finding, and — at `xhigh`+ — also shown inline in the Step 3 Routing table per the existing rule.
- The gap-sweep agent's prompt explicitly includes the already-flagged findings list (not just the raw diff) — verified by inspecting the dispatch prompt template added to `step3-routing.md` or inlined in `SKILL.md`.
- Zero gap-sweep findings produces no new summary section (matches existing "No findings" behavior for other lenses).

## Technical Approach

Add "Step 3.6: Gap-Sweep / Completeness Critic" to `skills/review/SKILL.md` between line 457 and line 459. Structure mirrors Step 3.5's existing gate-and-dispatch pattern (lines 415-419's skip condition, 431-444's dispatch template):

```
Skip this entire step when the resolved review-effort tier (Step 2.5) is not xhigh or max.
```

Dispatch template (Capable/Opus model), inlined per the Subagent Contract (`_shared/subagent-output-contract.md`) — Template A output (findings table), with an added instruction block distinguishing it from a per-lens dispatch:

```
You are a fresh-eyes reviewer. The following lenses have already reviewed this diff and
produced these findings: {already-flagged findings list, path:line + one-line summary}.
Do NOT restate any of these. Find genuine gaps — real defects the above list does not
already cover. If you find nothing beyond what's already flagged, return "No findings."

[... CALIBRATION + OUTPUT FORMAT block, byte-identical to the per-lens dispatch contract ...]
```

Findings returned are tagged with an internal `source: gap-sweep` marker (parallel to how lenses already tag findings with their lens name for Step 3 Routing's Category column) and inserted into the `unconfirmed` bucket directly — no reproduction-pair dispatch for this source, by design (a fresh-eyes pass loses its value if paired/averaged with a second identical fresh-eyes agent; single-source is the point). Update `step3-routing.md`'s Inputs section (line 42-51) to note that `unconfirmed` findings can originate from either "no reproduction agreement" (existing) or "gap-sweep, single-source by design" (new) — both render identically in the table with `(low-confidence)`.

## Gotchas

- Do not dispatch this as a reproduction pair — that's explicitly against the design intent (a fresh-eyes pass loses its value if averaged against a second identical fresh-eyes agent). Confirm this is unambiguous in the SKILL.md text — a future editor skimming Step 3.5's reproduction-pair pattern immediately above might reflexively "fix" this into a pair; add an explicit one-line note against that.
- `xhigh`/`max` gating is an editorial judgment call made during shaping (this record), not dictated by the original issue — the issue only says "likely gated to higher review-effort tiers" without specifying which. Revisit if `/build`'s actual token-cost measurement suggests `high` is more appropriate.
- This record and #47 (per-candidate refutation verifier, also touching the Step 3.5/tier-gating area of the same file) are independent, standalone leaf records with no `Blocked by` dependency between them — both are being built in the same `/claude-tweaks:flow #47,#48,#49` batch, in the same worktree, so sequencing is handled by the pipeline rather than an explicit link.
- `ceremony:fast-lane` verdict reflects a single, self-contained addition to one file with a concrete, testable gate condition — not a multi-package or public-surface change.

## Original request

Review Step 3: add a final gap-sweep / completeness-critic pass

**Related:** #45

Context: The #45 prototype's own final "what did we miss" pass caught 2 of 4 real findings that the angle-based finders missed — /review's Step 3 has no equivalent final pass today.

Scope: Add a final fresh-eyes gap-sweep agent pass after lenses + reproduction + debate complete, likely gated to higher review-effort tiers, to catch what per-lens finders miss.
