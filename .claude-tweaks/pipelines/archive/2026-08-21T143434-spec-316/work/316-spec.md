---
record: 316
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build]
surface: backend
---
# 316: specify: decomposition prerequisite check can assert unbuilt sibling scope

Surface: backend

## Current State

- `skills/specify/record-creation.md`'s Linking pass (`work-backend: github-issues`, `work-links: body-text`, ~line 270) writes a `Blocked by #N: {one-line assumption}` line onto a dependent sub-issue's body when: (a) the dependency is between two sub-issues of the same decomposition, and (b) the decomposition produced 4 or more sub-issues (the Cross-Spec Promises threshold, `_shared/policy-deprecations.md`'s `promise-register-min-leaves` retirement in #331). The assumption text states "what the dependent sub-issue actually needs from #N."
- That text is authored by `/specify` at decomposition time, before the depended-on sibling sub-issue has been built — `/specify` has no way to know what that sibling's own eventual `## Non-Goals` section will later scope out of its deliverable.
- Observed failure (3-leaf sequential decomposition, leaf C depends on leaf A and leaf B): leaf C's assumption text (materialized into its Prerequisites-style dependency check) grepped for a specific prose string it expected leaf B to have written. Leaf B's own `## Non-Goals`, finalized after C's assumption text was already written, legitimately scoped that string out — the capability landed as code only, never documented in prose. Nothing flagged the mismatch until leaf C's build actually ran the grep and got zero matches; the implementer correctly stopped rather than guessing past it, but the check was wrong from the moment B's scope was finalized.
- `skills/specify/red-team.md`'s Step 5 Skeptical Reviewer persona lens question ("What unstated assumption is doing the load-bearing work here?", ~line 52) is the one existing mechanism positioned to catch a fragile assumption before decomposition completes, but nothing in its prompt or in the Linking pass's own authoring guidance currently distinguishes a mechanical assumption (a file, symbol, or exported API existing) from a prose/documentation-shape assumption (a specific string or wording existing) — the distinction that determines whether a sibling's Non-Goals can legitimately invalidate it later.

## Deliverables

- [ ] Add authoring guidance to `record-creation.md`'s Linking pass, at the `Blocked by #N: {one-line assumption}` bullet, stating the mechanical-vs-prose distinction: the assumption text should assert a structural fact about the depended-on sub-issue's deliverable (a function/symbol/API/file/exported artifact existing) — never a specific prose string, documentation wording, or a claim about what the sibling's `## Non-Goals` will or won't scope out. Include one short example of each (a mechanical assumption that's safe vs. a prose-shape assumption that isn't).
- [ ] Extend `red-team.md`'s Skeptical Reviewer persona instantiation (Step 5) so its lens question, when applied to a `Blocked by #N: {assumption}` line, explicitly checks whether the assumption text asserts prose/documentation shape rather than a structural fact — surfacing a match as an unstated-assumption finding (the ambiguity-marker comment or `## Open Questions` row, per the existing write-back procedure) rather than letting it pass silently.
- [ ] Add a `node --test` conformance test (per the `skill-prose-conformance-tests` convention) pinning the new authoring-guidance prose in `record-creation.md`, so the rule can't silently regress out of the file.

## Acceptance Criteria

1. `record-creation.md`'s Linking pass section documents the mechanical-vs-prose distinction for `Blocked by #N: {assumption}` text, including one example of each category.
2. Re-running `/specify` decomposition (4+ sub-issues, a forward dependency between two sub-issues) on a scenario where the dependent sub-issue's drafted assumption asserts a specific prose/documentation string produces a Step 5 red-team finding flagging it — verified by constructing that scenario and confirming the finding appears in the affected sub-issue's `## Open Questions` (or ambiguity marker).
3. The same scenario with a mechanical assumption (e.g., "exposes `getStatus()`") produces no red-team finding on this specific check — the new guidance narrows to prose-shape assumptions only, not every `Blocked by` line.
4. A `node --test` conformance test exists asserting the new guidance text is present in `record-creation.md`, and passes.

## Technical Approach

This is a prose-only fix to `/specify`'s own skill files — the assumption text is LLM-authored during the Linking pass and read by the red-team personas during the same `/specify` run, so there is no runtime code path to change. Two touch points:

- `skills/specify/record-creation.md` — the Linking pass bullet that introduces the `Blocked by #N: {assumption}` extended form (~line 270).
- `skills/specify/red-team.md` — the Skeptical Reviewer persona's lens-question application during Step 5 (persona table ~line 52; write-back procedure below it).

### Key Files

- `skills/specify/record-creation.md` — add the mechanical-vs-prose authoring rule to the Linking pass.
- `skills/specify/red-team.md` — extend the Skeptical Reviewer persona's instantiated prompt (or the Step 5 dispatch instructions) to apply the same distinction when reviewing a sub-issue that carries a `Blocked by #N: {assumption}` line.
- `tests/` — new or extended conformance test pinning the added prose (follow the `skill-prose-conformance-tests` skill's guidance on live-corpus vs. fixture pinning).

## Gotchas

- The failure in the field report surfaced downstream, during leaf C's build (a grep against leaf B's actual output found zero matches) — not at decomposition time. The fix belongs in how `/specify` authors and red-teams the assumption text, not as a new runtime validation added to `/build` or `/flow`; there is nothing to grep against yet at decomposition time either, since the sibling hasn't been built.
- The dividing line is deliberately narrow: a mechanical existence check (file X exists, symbol Y exported, API Z callable) is robust to a sibling's `## Non-Goals` narrowing prose/documentation scope, because Non-Goals narrows *how something is described*, not *whether it structurally exists*. The fix should encode exactly this line, not "avoid all `Blocked by` assumptions" — most assumptions are fine as written today.
- This failure mode is specific to `work-backend: github-issues` + `work-links: body-text`'s extended `Blocked by #N: {assumption}` form, gated on 4+ sub-issue decompositions (the Cross-Spec Promises threshold). `work-links: native` sub-issues carry no assumption body text at decomposition time at all (native's Linking pass writes no body text — `record-creation.md`'s native branch), so this specific drift can't occur there; `work-backend: local-files` decompositions never get a `## Cross-Spec Promises` section either, per the same file's item 3.
- Do not conflate this with `_shared/work-record.md`'s general "Labels are projection, not truth" principle — this is about `/specify`-authored prose drifting from a sibling's later scope decision, a decomposition-time authoring problem, not a label/state staleness problem.

## Original request

specify: decomposition prerequisite check can assert unbuilt sibling scope

**Summary:** A leaf's decomposition-time prerequisite check can assert something about a sibling leaf's not-yet-built documentation shape, and nothing catches the drift when the sibling later scopes that out.

**Kind:** Gap

**Affected component:** `/claude-tweaks:specify` decomposition (prerequisite-check generation for a decomposed leaf's issue body)

**Use case:** In a 3-leaf sequential decomposition (leaf A, B, C; C depends on A and B), leaf C's issue Prerequisites section grepped for a specific prose string it expected leaf B to have written by the time C's build ran. Leaf B's own eventual Non-Goals scoped that exact thing out (the capability landed as code only, not documented in prose) — a legitimate scoping decision made after C's prerequisite text was already written at decomposition time. Nothing flagged the mismatch until C's build actually ran the grep and got zero matches. The implementer correctly stopped rather than guessing past it, but the check itself was wrong from the moment B's scope was finalized.

Decomposition-time prerequisite checks currently have no way to know what a sibling leaf will decide to scope out later. A mechanical existence check (does file X exist, does symbol Y exist) is robust to a sibling narrowing its own scope; a check asserting a specific prose/documentation shape is not, since prose shape is exactly what Non-Goals can legitimately narrow.

**Plugin version:** 6.74.0

---
Filed via /claude-tweaks:feedback.
<!-- fingerprint: specify-prereq-check-sibling-scope-drift -->


