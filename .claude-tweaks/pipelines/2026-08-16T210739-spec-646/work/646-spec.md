---
record: 646
origin: capture
risk: medium
size: medium
ceremony: standard
grants: []
surface: backend
---
# 646: Interaction style directive: terminal ## Next Actions via AskUserQuestion — keep, or render as paste-ready markdown

Surface: backend

## Current State

The Interaction style directive (`docs/skill-authoring.md`, restated as the `> **Interaction style:**` blockquote at the top of every SKILL.md) ends with "End with `## Next Actions` via `AskUserQuestion`, not a navigation menu." In the 2026-08-16 evaluated session, both terminal `## Next Actions` menus that fired (`/backlog overview`, `/specify`) were rejected outright — the user typed a different intent each time — so the mandated stop cost two interruptions and produced zero decisions. Two further observations close the evidence loop: (1) pipeline-invoked skills already suppress the terminal menu entirely via each skill's Component-Skill Contract, so the directive's terminal clause only ever fires on standalone close-outs — exactly where the rejections happened; (2) a genuinely headless caller cannot answer an `AskUserQuestion` at all, so the "headless callers can resolve the Recommended option" argument for direction (a) does not hold — headless resolution happens via policy levers and `consoleAutoResolve`, never via a terminal menu. The project's own report-line convention (every actionable report line carries a paste-ready command; interactive launchers are reserved for human-owed decisions) already encodes the target shape.

**Decision (delegated by the maintainer, 2026-08-16): the middle path.** Terminal `## Next Actions` renders as plain markdown — paste-ready, fully-qualified `/claude-tweaks:{skill}` commands, recommended option first and bold, one command per line. `AskUserQuestion` is reserved for (1) decisions that block the skill from finishing (mid-flow gates, overlap resolution, findings routing — unchanged), and (2) the rare terminal decision a documented machine consumer must resolve (a policy lever or contract point that reads the answer), named inline where used.

## Deliverables

- [ ] `docs/skill-authoring.md`: replace the directive's terminal sentence with the markdown-default rule (paste-ready fully-qualified commands, recommended first and bold, one per line) plus the `AskUserQuestion` reservation clause, and add a short rationale paragraph recording the decision, its evidence basis (the 2026-08-16 session evaluation's Avoidable-interactions findings plus the report-line convention), and a revisit trigger (a later session evaluation showing the markdown close-outs going unused or users asking for menus back).
- [ ] Every `skills/**/SKILL.md`: the restated `> **Interaction style:**` line updated to the new directive text in one sweep; every `## Next Actions` section that instructs a terminal `AskUserQuestion` call rewritten to render the markdown command block instead (existing Situation tables keep their option content — labels/descriptions become command lines). First check whether the blockquote is injected by tooling or a template; if so, change the source once and regenerate.
- [ ] `skills/_shared/*.md` and skill sub-files restating the terminal rule (derive the file list by grepping the directive's distinctive phrases AND a whitespace-spanning control scan — reflowed prose wraps mid-sentence): same treatment in the same pass.
- [ ] A terminal `AskUserQuestion` that survives (reservation clause case 2) carries a one-line inline justification naming its machine consumer; audit for such cases rather than assuming zero exist.
- [ ] Conformance tests pinning the directive text updated in the same expand-contract pass; add or extend a pin asserting no SKILL.md instructs a terminal-menu `AskUserQuestion` outside the documented reservation.

## Acceptance Criteria

1. Grepping the retired sentence ("End with `## Next Actions` via `AskUserQuestion`") across `skills/` and `docs/` returns zero hits, confirmed by both a single-line grep and a whitespace-spanning control scan; the new directive text appears in `docs/skill-authoring.md` and in every SKILL.md's Interaction style line.
2. `npm test` passes with the updated conformance pins, including the new terminal-menu pin.
3. Reading three representative standalone close-outs (`/specify`, `/backlog`, `/help`) shows a plain markdown `## Next Actions` block with paste-ready fully-qualified commands, recommended first and bold; pipeline-suppression behavior (Component-Skill Contract sections) is byte-unchanged.

## Technical Approach

One expand-contract sweep, mechanical after the directive text is settled: update `docs/skill-authoring.md` (the single source), then the restated blockquote and `## Next Actions` blocks across `skills/**`, then the `_shared` restatements, then the conformance pins — all in one branch so the pins never disagree with the prose. The `(Recommended)` marker stays computable in markdown (first line, bold); nothing about mid-flow `AskUserQuestion` usage changes.

## Gotchas

- The directive blockquote appears verbatim at the top of every SKILL.md — confirm whether it is template-injected before hand-editing forty copies; if injected, one source edit plus regeneration replaces the sweep.
- The evidence base is one evaluated session plus the maintainer's standing conventions; the rationale paragraph must state this honestly and carry the revisit trigger rather than presenting the decision as settled by volume.
- Some skills' Next Actions options carry side effects in their descriptions (e.g. launching another skill with arguments); converting to markdown must keep commands fully-qualified (`/claude-tweaks:{skill}`) per the cross-reference rule — bare short forms fail at invocation time.
- Do not restate a count of affected files in prose (cardinality rule) — the sweep's grep derives the list.

## Original request

Interaction style directive: terminal ## Next Actions via AskUserQuestion — keep, or render as paste-ready markdown

**Related:** #565, #516

Origin: /claude-tweaks:feedback session evaluation (Avoidable interactions lens), 2026-08-16 session

## Current State

The Interaction style directive (`docs/skill-authoring.md`, restated at the top of every SKILL.md) ends with "End with `## Next Actions` via `AskUserQuestion`, not a navigation menu." In the evaluated session, 3 `AskUserQuestion` calls fired: 1 substantive (specify's overlap batch — resolved to the Recommended option) and 2 terminal `## Next Actions` menus (`/backlog overview` close-out with 4 options; `/specify` close-out with 3 options). Both terminal menus were rejected outright and the user typed a different intent — the mandated stop cost two interruptions and produced zero decisions. A terminal menu whose options the skill will not itself execute is a navigation menu in a question's clothes; the directive's own wording forbids the thing it mandates.

## Open Question

Two viable directions, no tradeoff made yet: (a) keep the directive as is — the `AskUserQuestion` terminal is what makes `(Recommended)` computable and lets a headless/routine caller resolve it, and this session's two rejections may be one user's habit rather than the norm; (b) render `## Next Actions` as plain markdown with paste-ready fully-qualified commands (the report-line rule already used inside overview's paste blocks) and reserve `AskUserQuestion` for decisions that block the skill from finishing. A middle path — render markdown by default, `AskUserQuestion` only when a policy lever or a headless caller needs a machine-resolvable answer — is a third option. Deciding this changes every SKILL.md's closing block, `docs/skill-authoring.md`, and the conformance tests that pin the directive; it should be decided once, on more than one session's evidence (the `/feedback` session evaluation's Avoidable-interactions Measurement line is the instrument — collect a few runs first).

## Deliverables

- [ ] Decision recorded (ADR or `docs/skill-authoring.md` rationale) on which of the three directions applies.
- [ ] If (b) or the middle path: `docs/skill-authoring.md` directive text, every SKILL.md's Interaction style line and `## Next Actions` block, `_shared/*.md` files that restate the rule, and the conformance tests updated together in one expand-contract pass.
- [ ] If (a): the directive gains one sentence naming why the terminal stop is deliberate, so the next evaluation does not re-raise it.

