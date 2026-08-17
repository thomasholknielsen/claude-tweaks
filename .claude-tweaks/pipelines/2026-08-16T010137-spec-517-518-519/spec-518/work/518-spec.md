---
record: 518
origin: human
risk: low
size: low
ceremony: standard
grants: []
fingerprint: tidy-report-auto-routing:tidy-report-template-applied-approve-yours-clean-across-both
surface: backend
---
# 518: Tidy report template: Applied/Approve/Yours/Clean across both surfaces

<!-- work-fingerprint: tidy-report-auto-routing:tidy-report-template-applied-approve-yours-clean-across-both -->
Surface: backend

## Overview

Replace both of tidy's report surfaces with one literal verb-grouped template — **Applied / Approve / Yours / Clean** — so what tidy did, what it will do on a click, and what only the human can do are visually distinct, and every actionable line ends in a paste-ready command. The root cause being fixed: `step-6-auto.md`'s standalone bookend is a single unspecified clause ("Present staged items in a Pending Review section") while `step-6-interactive.md` carries a full literal template and a render-before-question hard gate. The improvised output observed on 2026-08-15 — box-drawing table with cells truncated at terminal width, staged items with no stated resolution path, attention-required findings presented as FYI, bare issue numbers forcing lookup round-trips — is the predictable result of the least-specified surface being the most visible one. The mislabeled-FYI symptom is fixed here by the bucket-mapping rule (Deliverables), not by prose styling: which section a finding lands in becomes a stated function of its routing outcome, no longer per-run judgment.

**Complexity:** Low
**Estimated tasks:** 5

## Non-Goals

- No routing-table or aggressiveness-tier changes — that is the sibling sub-issue "Tidy routing flips, moderate default, and the missing-routing-rule principle" (blocked on this one, so this lands first; the dependency edge enforces the order).
- Wrap-up's Review Console presentation is untouched (deliberate scope cut; candidate follow-up record).
- No `bin/` code changes — this is skill-prose only.

## Prerequisites

None.

## Current State

- `skills/tidy/step-6-auto.md` — "Standalone auto" paragraph ends with the one-clause Pending Review instruction; no template, no hard gate.
- `skills/tidy/step-6-interactive.md` — full `## Tidy Report` template (artifact-type-grouped table), the Apply-all/Override `AskUserQuestion`, and a "Hard gate" paragraph (its current text enumerates the old template's section names — "Actions, and Cross-Spec Patterns / Design Record Drift when non-empty" — and a footer note keeps Keep/no-mutation rows visible).
- `skills/tidy/SKILL.md` — `## Next Actions` block with a fixed four-option navigation menu.
- `docs/skill-authoring.md` — Interaction patterns (including the Multi-item decisions convention: `AskUserQuestion` cannot carry tables) — read before editing any skill prose.

## Deliverables

- [ ] A literal four-section template block added to `step-6-auto.md`'s Standalone-auto section, replacing the one-clause instruction. Canonical section headers, exactly these literal strings: `**Applied automatically**`, `**Approve ({N})**`, `**Yours ({N})**`, `**Clean:**` (the two counted headers carry their item count; greps target the prefixes `**Approve (` and `**Yours (`). Empty-state rule for every section: Applied, Approve, and Yours are each omitted entirely when empty; Clean always renders, as `**Clean:** {comma list}` or `**Clean:** nothing — every scan surfaced findings`.
- [ ] A bucket-mapping rule stated alongside the template: each finding's section is a function of its routing outcome — executed/converged → Applied; staged with an executable action → Approve; no-tier findings recommending a command (needs-scoring, acceptance gaps, parked triggers, patterns) → Yours; Keep/nothing-to-report scans → summarized in Clean (counted, never itemized). No finding may be presented information-only: anything actionable carries its command or lands in Approve.
- [ ] `step-6-interactive.md` rewritten to the same template: pending actions render in the Approve section, and the Apply-all/Override `AskUserQuestion`'s mechanic is retained — its options reference the Approve section by name and count (never enumerate rows; `AskUserQuestion` cannot carry tables). The hard gate's *mechanic* is retained but its section-name references are updated to the new template (the current text names sections this change removes — leaving it verbatim would gate on headers that no longer exist).
- [ ] The template's binding rules stated once, under a `### Report rules` heading in `step-6-auto.md`; `step-6-interactive.md` cross-references that heading by name, never restates. The rules: no box-drawing tables anywhere in the report; every actionable line carries a paste-ready command or lands in Approve; records render as `#{N} "{title}"` — titles come from the scan agents' Template-A findings, which already carry them (the dispatch prompts require item titles in the Finding column), never from a fresh per-row `gh issue view`; `{run-dir}/decisions.md` is referenced by path exactly once and never replayed into chat.
- [ ] A report-before-question hard gate added to the auto bookend, mirroring the interactive file's gate mechanic against the new template's section set.
- [ ] `SKILL.md`'s `## Next Actions` amended: up to three options drawn from the Yours items in report order, plus the help-dashboard option as the final entry; when Yours is empty, the current fixed menu renders unchanged.

## Acceptance Criteria

1. Grepping each step-6 file's template block for the four literal strings `**Applied automatically**`, `**Approve (`, `**Yours (`, `**Clean:**` matches all four in both files. The check targets the skill files' template text, not a rendered report sample (a live report may legitimately omit empty sections).
2. The `### Report rules` heading exists exactly once across the two files; the other file names it in a cross-reference and contains no second statement of any rule.
3. `step-6-auto.md` contains a hard-gate paragraph requiring the rendered report in the same response, above any `AskUserQuestion`, naming the new template's sections.
4. `SKILL.md`'s Next Actions states the Yours-derivation rule (cap of three + dashboard) and the empty-Yours fallback.
5. No box-drawing characters (`┌`, `│`, `└`) are mandated or exemplified anywhere in `skills/tidy/`.
6. The bucket-mapping rule names a destination section for every routing outcome the Step 6 tables produce (Auto-applied, Staged-executable, no-op-surfaced, Keep) — no outcome is left unmapped.

## Technical Approach

Prose-only change following `docs/skill-authoring.md`'s conventions. The interactive file keeps its decision mechanics (Apply-all/Override, override follow-up rule) — only its presentation template changes. The auto file gains the template, the `### Report rules` block, the bucket mapping, and the gate; its routing-table content is untouched here (the sibling sub-issue owns it, and lands after this via its dependency edge).

### Key Files

- `skills/tidy/step-6-auto.md` — template block, `### Report rules`, bucket mapping, hard gate
- `skills/tidy/step-6-interactive.md` — template swap, gate section-name update, rules cross-reference
- `skills/tidy/SKILL.md` — `## Next Actions` derivation rule

### Package Dependencies

None.

## Gotchas

- Open records #334 (backlog) and #113 (parked) both name `skills/tidy/step-6-auto.md` in their Key Files — dormant today, but check `git log` on the file before editing; if either has landed, merge from the integration branch and re-read the file before drafting (standard catch-up, then proceed — no re-scope needed, their edits are orthogonal to the template sections).
- `AskUserQuestion` cannot carry the report table — that is why the hard gate exists (Multi-item decisions convention, `docs/skill-authoring.md`); the gate's mechanic survives this change, its section names must not.
- Skill references inside actionable instruction text (the Yours commands, Next Actions bodies) MUST use the fully-qualified `/claude-tweaks:{skill}` form — bare `/{skill}` fails at Skill-tool invocation time.
- Cross-skill relationships are stated once in `docs/skill-graph.md` — do not add edge restatements to the step-6 files.
