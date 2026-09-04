---
record: 522
origin: human
risk: low
size: low
ceremony: standard
grants: [build]
surface: backend
---
# 522: design-wrapper explore (layout scope): default render set is too small and does not guarantee substantial variation between presented directions

Surface: backend

## Current State

`/claude-tweaks:design-wrapper explore` (layout scope) runs an established-world composition tournament: `skills/design-wrapper/modes/explore.md`'s "Dealing" step calls `concept-seed.mjs --scope surface`, and "Machinery reuse" (line 181) runs the result through the identity scope's own "Deal and derive" heading, reused verbatim per the file's stable-heading convention ("a later record reuses these headings verbatim ... never by step number", line 64).

"Deal and derive" states the render-set rule the affected component's own line 76 names: "The render set is the *presented* directions only — the assigned direction plus the one or two surviving fused challengers upstream's own presentation rule names — never the full candidate list." In practice this yields 1-3 presented directions (typically 1-2 in observed use), and the file states explicitly that sizing the deal (`--candidate-count`) is left at the upstream script's own default because "sizing the deal is upstream's call, not this mode's" (line 74) — this mode never requests more candidates on its own.

A real repro (project with a locked `DESIGN.md`, `/claude-tweaks:design-wrapper explore` run for a concrete surface topic) surfaced only two directions in the default round, and both were close variants of the same underlying flow shape (a staged preview-then-commit form) — not meaningfully different in structure. Getting real variety required a manual reroll with hand-written steer text explicitly asking for "4 variations" with "substantial variation between them." A reviewer comparing UI directions for the first time has no way to know that's necessary, or how to phrase it, before the first round already under-delivers.

`concept-seed.mjs` (`skills/impeccable/scripts/concept-seed.mjs`) is bundled by the external Impeccable plugin, not this repo (confirmed: no `skills/impeccable/` directory exists here — only contract tests `tests/impeccable-cli-contract.test.js` / `tests/impeccable-plugin-contract.test.js` exercise it). No test in this repo pins the current render-set prose (`grep -rln "surviving fused challengers|candidate-count" tests/` returns nothing relevant), so there is no pinned-test barrier to changing it.

## Deliverables

- In `skills/design-wrapper/modes/explore.md`, change the layout scope's default render-set behavior so a first round reliably presents structurally distinct directions without the reviewer needing to know to ask for it via reroll+steer. Two levers are available within this mode's own scope (no upstream/Impeccable code changes):
  1. Request more candidates from the deal explicitly (override `--candidate-count` rather than leaving it at the script's default), and/or
  2. Add an explicit diversity check to the fuse/weigh step this mode already performs ("Follow the returned instruction block exactly as upstream directs: derive grounded directions, fuse each dealt challenger, weigh them", line 76) — reject or replace a fused challenger whose result is only superficially different from a direction already selected for presentation.
- Because "Deal and derive" is the shared, verbatim-reused heading both identity scope and layout scope's "Machinery reuse" point to, explicitly decide and document in the same file whether the fix lives in that shared heading (affecting both scopes) or is added as a layout-scope-specific addendum in "Machinery reuse" / "Dealing" — and verify identity-scope behavior is not silently changed by whichever choice is made.
- Update every place in `explore.md` that states the current render-set size in prose (e.g. line 76's "the assigned direction plus the one or two surviving fused challengers ... never the full candidate list", and the `--candidate-count` boundary statement at line 74) so the file's own prose stays internally consistent with the new behavior — never leave a stale sentence contradicting the new rule.

## Acceptance Criteria

- A fresh `/claude-tweaks:design-wrapper explore --scope layout` round against a locked `DESIGN.md` presents, by default, a render set the record's implementer has sized to reliably contain structurally distinct directions (per the suggested direction's example, at least 4) — with no manual reroll or hand-written steer text required to reach that variety.
- `explore.md`'s procedure text explicitly names a diversity check (or an equivalent named mechanism) applied when fusing staging challengers — a challenger whose fused result is only superficially different from an already-presented direction is rejected or replaced, not merely counted toward the render set.
- `explore.md` carries no self-contradiction: every sentence describing render-set size or the `--candidate-count` boundary reflects the same, updated rule.
- The file explicitly states whether the change applies to "Deal and derive" (shared — both scopes) or is layout-scope-only, and identity-scope behavior is either verified unaffected or the extension to identity scope is a stated, intentional choice — not a silent side effect.
- `npm test` passes, including `tests/impeccable-cli-contract.test.js` and `tests/impeccable-plugin-contract.test.js`.

## Technical Approach

The sole affected file is `skills/design-wrapper/modes/explore.md`. Relevant sections as of this shaping (line numbers may drift by build time — re-grep for the heading names, not the numbers): "Deal and derive" (~line 66-76, identity scope, the canonical/reused heading), "Dealing" (~line 154-169, layout scope's own candidate-request step), and "Machinery reuse" (~line 181-191, layout scope's substitution table that reuses "Deal and derive" by name). This is prose-only skill authoring — no runtime/application code changes, no new files. Read `docs/skill-authoring.md` before editing. `concept-seed.mjs` itself is out of scope — it ships with the external Impeccable plugin and is not part of this repo; work only within the parameters/judgment this mode already controls (`--candidate-count` argument, and the fuse/weigh step's own pass/reject judgment).

## Gotchas

- `explore.md` is interactive-only — it has no auto-mode branch (line 5: "no caller may invoke this mode from `auto` or a `$PIPELINE_RUN_DIR`-set context"). Verifying the fix requires a human in a browser for the actual repro; there is no way to script an assertion against the LLM's own fuse/weigh diversity judgment, so acceptance here is a documented-procedure check plus a manual verification pass, not a `node --test` assertion beyond the two contract tests named above.
- The render-set rule lives in a heading explicitly marked as reused **verbatim, never by step number**, by both scopes (line 64). A layout-scope-only edit that changes the shared "Deal and derive" heading's own text changes identity-scope behavior too, by construction — this is the single biggest way this record could accidentally regress the identity-scope tournament while fixing layout scope. Read the reuse convention before editing either heading.
- `--candidate-count` is explicitly framed today as upstream's sizing lever, not this mode's ("Leave `--candidate-count` at the script's own default; sizing the deal is upstream's call, not this mode's", line 74). Overriding it to guarantee a larger render set is a deliberate policy change to that stated boundary, not a bug fix to code that was behaving incorrectly — state this explicitly in the commit/PR description so a future reader doesn't mistake it for reverting a defect.

## Original request

design-wrapper explore (layout scope): default render set is too small and does not guarantee substantial variation between presented directions

**Summary:** In `design-wrapper explore` (layout scope), the default render set (1 grounded direction plus up to 2 fused staging challengers) is small and gives no guarantee that the presented directions differ from each other in a meaningful, structural way — reaching a genuinely diverse comparison currently requires an explicit reroll with hand-written steer text asking for more options and more variation.

**Kind:** Defect

**Affected component:** `design-wrapper` skill, `explore` mode's layout scope — specifically `modes/explore.md`'s "Deal and derive" / "Machinery reuse" render-set rule ("the assigned direction plus the one or two surviving fused challengers ... never the full candidate list").

**Repro steps:**
1. In a project with a locked `DESIGN.md`, run `/claude-tweaks:design-wrapper explore` with a concrete surface topic.
2. Let the mode run its default first round: one assigned grounded direction plus any staging challengers judged to survive fusion (in practice, 1-2 total presented directions).
3. Compare the presented directions in the switcher.

**Expected vs. actual:**
Expected: the default round gives the reviewer enough genuinely distinct options that a first pass is useful without already knowing to ask for more.
Actual: the default round surfaced only two directions that were close variants of the same underlying flow shape (a staged preview-then-commit form), not meaningfully different from each other in structure. Getting real variety required manually rerolling and writing explicit steer text asking for "4 variations" with "substantial variation between them" — a user comparing UI directions for the first time has no way to know that's necessary, or how to phrase it, before the first round already under-delivers.

**Suggested direction:** Consider raising the default render-set size for the layout scope (e.g. to 4 presented directions) and/or adding an explicit diversity check when fusing staging challengers against the grounded direction — rejecting or replacing a challenger whose fused result is only superficially different from what's already presented — so a first round reliably demonstrates real structural variety without the reviewer needing to know to ask for it via reroll+steer.

**Plugin version:** 6.84.0

---
Filed via /claude-tweaks:feedback.
<!-- fingerprint: feedback-8b0620ce -->

