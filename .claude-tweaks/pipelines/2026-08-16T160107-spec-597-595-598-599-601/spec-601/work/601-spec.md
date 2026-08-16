---
record: 601
origin: human
risk: medium
size: high
ceremony: standard
grants: []
fingerprint: design-critique-dispatch:terminal-track-surface-enum-expand-terminal-routing-plugin-a
blocked-by: [598, 597]
surface: backend
---
# 601: terminal track — Surface enum expand, terminal routing, plugin-authored terminal-ux principles, terminal critic row

Surface: backend

## Overview

Give terminal UX a home in the design pipeline. "Design" in this plugin today is web with a native annex; a CLI's help text, output formatting, colour/TTY degradation, progress feedback, and error-message craft — this repository's own surface — has no `Surface:` value, no track, no principles source, and no critic. This record adds a `terminal` track end to end: the enum value, honest Impeccable skips, a plugin-authored principles reference, and the `terminal` row in `critics.md` so the review-mode critic dispatch (#598) covers it exactly as it covers web.

Deliberately its own record family in the design (not folded into the web-critic work): it is expand-contract on a shipped enum (`Surface:`) with prose consumers across several skills, and its principles reference is authored content, not wiring.

**Complexity:** Medium
**Estimated tasks:** 8

## Non-Goals

- No sniff heuristics for terminal code — `terminal` is **declared-only** (`Surface: terminal` on the record), like native-declared; no file-extension or path trigger is added to `frontend-detection.md`.
- No Impeccable dispatch on the terminal track — upstream has no terminal surface today; every Impeccable-backed mode skips honestly. **Revisit condition** (recorded per this repo's rule that a skip needs one): when `tools/upstream-drift`'s capability triage surfaces a terminal/CLI reference or track in Impeccable's `reference/` tree, re-open the skip table — file a record, do not silently flip a row.
- No `DESIGN.md` expectation on this track — `auto` under `design.critique` is signal-gated here, never presence-conditioned; no absence-nudge fires for terminal.
- No changes to web or native tracks' behavior — verified by AC 9 below.
- No `/specify` sniff change beyond accepting the new `--surface terminal` value.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #597 | `critics.md` track-keyed table | must land first — this record fills its `terminal` row in place |
| #598 | Review-mode Step 3.8 critic dispatch | must land first — the terminal critic is dispatched by that step; this record only supplies the row and the principles file it inlines |

Native Blocked-by links on both enforce this: **this record blocks until both are merged** — never build against their unmerged shape. At pickup, re-read `critics.md`'s actual table and `modes/review.md`'s actual Step 3.8 sub-steps before editing.

## Current State

- `skills/specify/spec-template.md` line ~14: `Surface: {web | mobile | desktop | backend | infra}` plus the paragraph defining `mobile`; `skills/specify/SKILL.md` `argument-hint` and `--surface` flag doc enumerate the same five; `skills/specify/design-pre-steps.md` treats non-frontend as `backend`/`infra` and skips Steps 2.5b/2.5c.
- `skills/flow/materialize.md` line ~49: `surface: {web|mobile|desktop|backend|infra}` in the materialized header.
- `skills/design-wrapper/SKILL.md`: Layer 2 table (`web`/`mobile`/`desktop` continue; `backend`/`infra` skip; missing continues); track-resolution table (`setup.platform` × `Surface:` → web/native) followed by the "Disagreement is recorded, never silent" paragraph, which today says `setup.platform` **wins**; the Output-contract table row for `surface_track_override` (string, only on disagreement, "names both values and which won"); web-only modes table (`test`, `live` skip on native); mode-specific notes stating `shape` and `explore` **never read `Surface:`** (structurally inapplicable — no spec input) and `doctor` is track-independent ("no `doctor` outcome depends on which one"). `frontend-detection.md` line ~97 flow diagram (`backend / infra → skip`). `SKILL.md` is ~39 KB — no numeric test pins a ceiling, but it is the largest SKILL.md and the always-loaded-context budget is the constraint; the established pattern for a track's downstream is a sibling reference file (`native-routing.md`), loaded only when that track resolves.
- `skills/design-wrapper/impeccable-plugin.md` line ~209: the `setup.platform` trust-rule row says "Authoritative when non-null, including against a record's own `Surface:` line" — needs a terminal carve-out.
- `skills/_shared/design-craft.md` — source classes (decisions / principles), gating (Emil web-only), degradation posture. The terminal principles file is a **principles** source, plugin-authored, always available (no install).
- `skills/design-wrapper/critics.md` (#597) — `terminal` row reads *pending*, trigger "Filled by #601 (edits this row in place)". Its `auto` trigger for web mirrors the motion-signal posture (consumer judgment reading the spec).
- `skills/design-wrapper/modes/pre-build.md` Step 3 always-load set + Emil step; `skills/flow/polish-execution.md` craft-context assembly — the writing-context consumers that gain the terminal reference on this track.

## Deliverables

- [ ] New `skills/_shared/terminal-ux.md` — plugin-authored terminal-UX principles, written to be safely inlinable whole into a dispatch prompt. **Size:** ≤ 6 KB is the authoring target; 8 KB is the hard test gate (AC 4) — the gap is headroom, not two rules. Sections (each a heading): help/usage design (synopsis, flags grouping, examples-first), output formatting (columns, alignment, machine-readable modes like `--json`, quiet/verbose), TTY vs no-TTY and colour degradation (`NO_COLOR`, `FORCE_COLOR`, isatty), progress and long-running feedback (spinners vs line logs, when to stream), error-message craft (what happened, why, what to do next), and exit-code discipline. Each principle one short paragraph plus a Before/After example where useful. Header states it is a *principles* source under `design-craft.md`'s source classes, used both as writing context and as the terminal critic; no "see X" pointers an agent cannot follow.
- [ ] `Surface:` enum expand — add `terminal` in: `skills/specify/spec-template.md` (the enum line + one sentence: "a CLI/TUI surface — help text, output, prompts; declared only, never sniffed"), `skills/specify/SKILL.md` (`argument-hint` and the `--surface` flag doc), `skills/specify/design-pre-steps.md` (`--surface terminal` skips Steps 2.5b/2.5c like `backend`/`infra`; still writes `Surface: terminal`), `skills/flow/materialize.md` (header enum).
- [ ] New `skills/design-wrapper/terminal-routing.md` (sibling of `native-routing.md`, loaded only when the track resolves `terminal` — the split is decided now, not left to a size check): the **Terminal-track outcomes** table — `test` → `{skipped: "terminal surface — CLI detector is web-only"}`; `live` → skipped, same reason shape; `review`'s Impeccable `critique`/`audit` → skipped `"terminal surface — upstream has no terminal track"` (Step 3.8 critics still run); `polish` refinement set + suggestion-driven + intent-driven → skipped, same reason; `survey` → skipped, same reason; `pre-build` → runs, terminal principles in place of Impeccable references (see below); `shape` / `explore` → **N/A — never read `Surface:`** (structurally inapplicable per SKILL.md's mode notes; unaffected by this track); `doctor` → **unchanged** (track-independent by SKILL.md's own note). Plus the reasoning for "`Surface:` wins on this track" and the revisit condition from Non-Goals.
- [ ] `skills/design-wrapper/SKILL.md`: Layer 2 table gains a `terminal` row → "Continue to track resolution"; track-resolution table gains `| any | terminal | **terminal** | — |`; the "Disagreement is recorded, never silent" paragraph gains one sentence: "On the `terminal` row `Surface:` wins — `setup.platform` describes Impeccable's rendered-product platform, whose value domain has no terminal value; a non-null `platform` against `Surface: terminal` is still recorded in `surface_track_override` (SKILL.md's Output-contract row) and in `decisions.md`, with `Surface:` named as the winner"; one pointer sentence: "When the track resolves `terminal`, read `terminal-routing.md`"; Reference sub-files list gains a `terminal-routing.md` bullet. Layer 3 is skipped on a declared `terminal` surface exactly as on declared native (one row added to the Layer 3 track table).
- [ ] `skills/design-wrapper/impeccable-plugin.md` `setup.platform` trust-rule row: one clause — "except on the `terminal` track, where `Surface:` wins (SKILL.md's track table); the disagreement is still named in `surface_track_override`."
- [ ] `skills/design-wrapper/frontend-detection.md` flow diagram: add `terminal → track terminal (declared only; no sniff)`.
- [ ] `skills/design-wrapper/critics.md`: fill the `terminal` row in place — critic = `_shared/terminal-ux.md` (plugin-authored, always resolvable at `${CLAUDE_PLUGIN_ROOT}/skills/_shared/terminal-ux.md`; no two-path lookup); trigger = lever `full` → every terminal-track diff; `auto` → the record's spec/description names CLI/TTY UX work — concretely any of: help/usage text, CLI output formatting or `--json`/quiet/verbose modes, progress/spinner output, error messages or exit codes, interactive prompts — or carries a `Design-intent:` line; consumer judgment, the same posture as `design-craft.md`'s motion signal (cited, not restated); `off` → never. Note: no decisions layer on this track — critics emit `code` rows only.
- [ ] `skills/design-wrapper/modes/review.md` Step 3.8: one clause — on `surface_track === "terminal"`, the critic file resolves at the plugin path above and no decisions layer is inlined (say so to the agent verbatim, as the web absent-decisions sentence does).
- [ ] `skills/design-wrapper/modes/pre-build.md`: on the terminal track, the always-load set is `_shared/terminal-ux.md` + `_shared/design-craft.md` (contract file) only — no Impeccable references, no Emil skills, no `DESIGN.md`/sidecar read; `missed` stays empty. `skills/flow/polish-execution.md`: same assembly on terminal (one sentence).
- [ ] `docs/skill-graph.md`: rows for `_shared/terminal-ux.md` under `## design-wrapper` (pre-build + review Step 3.8 consumers) and `## flow` (polish-execution); `docs/plugin-structure.md` `_shared` row gains `terminal-ux.md` and the design-wrapper row gains `terminal-routing.md`.
- [ ] Tests: extend whichever conformance test pins the `Surface:` enum sites (grep `tests/` for `web|mobile|desktop|backend|infra`) so every enumeration site lists `terminal`; add a pin that `skills/_shared/terminal-ux.md` exists and is under 8192 bytes; add a pin that `skills/design-wrapper/terminal-routing.md` exists.

## Acceptance Criteria

1. `grep -rn "web | mobile | desktop | backend | infra\|web|mobile|desktop|backend|infra" skills/ docs/` returns **nothing** — every enum site now includes `terminal` (negative sweep; run before and after).
2. `grep -rn "terminal" skills/specify/spec-template.md skills/specify/SKILL.md skills/specify/design-pre-steps.md skills/flow/materialize.md` returns ≥1 line in each.
3. `skills/design-wrapper/SKILL.md` contains a track-resolution row resolving `Surface: terminal` to track `terminal`, the "`Surface:` wins on the `terminal` row" sentence, and a pointer to `terminal-routing.md`; `skills/design-wrapper/terminal-routing.md` contains the outcomes table naming `test`, `live`, `review`'s Impeccable commands, `polish`, `survey` as skipped with the stated reason, `pre-build` as running, `shape`/`explore` as N/A (never read `Surface:`), and `doctor` as unchanged; and `grep -n "revisit\|re-open" skills/design-wrapper/terminal-routing.md` returns the revisit condition.
4. `test -f skills/_shared/terminal-ux.md && [ $(wc -c < skills/_shared/terminal-ux.md) -lt 8192 ]` succeeds, and the file contains headings for help/usage, output formatting, TTY/colour, progress, errors, exit codes.
5. `grep -n "terminal" skills/design-wrapper/critics.md` shows the filled row with the plugin-path resolution and the `auto` trigger listing the concrete CLI/TTY phrases.
6. `grep -n "terminal" skills/design-wrapper/modes/review.md skills/design-wrapper/modes/pre-build.md skills/flow/polish-execution.md skills/design-wrapper/impeccable-plugin.md` returns ≥1 line in each.
7. `grep -c "terminal-ux" docs/skill-graph.md` ≥ 2; `grep -n "terminal-ux\|terminal-routing" docs/plugin-structure.md` returns both.
8. `npm test` passes, including the extended enum pins and the two new file pins.
9. **Web/native regression:** `git diff -U0 skills/design-wrapper/SKILL.md skills/design-wrapper/native-routing.md skills/design-wrapper/critics.md | grep '^-[^-]'` shows no removed or altered line belonging to an existing web or native row (only additions and the one-sentence extension of the disagreement paragraph); `native-routing.md` is untouched.

## Technical Approach

Expand-contract on a prose enum: add the value at every enumeration site in one record (there is no old value to remove — pure expand), add the track's routing rows to the wrapper's tables with the outcomes table in its own sibling reference file, author the principles file, fill the critic row, and wire the two writing-context consumers. Structure the SKILL.md additions as one Layer 2 row + one track row + one disagreement sentence + one pointer, mirroring how the native track was added.

### Data / API Surface

- `Surface:` enum gains `terminal`; materialized header `surface:` gains `terminal`.
- `surface_track` return values gain `terminal`; `surface_track_override` (existing field, SKILL.md Output contract) may now name `Surface:` as the winner.
- New files `skills/_shared/terminal-ux.md`, `skills/design-wrapper/terminal-routing.md`.

### Key Files

- `skills/_shared/terminal-ux.md` — new
- `skills/design-wrapper/terminal-routing.md` — new
- `skills/specify/spec-template.md`, `skills/specify/SKILL.md`, `skills/specify/design-pre-steps.md`, `skills/flow/materialize.md` — enum expand
- `skills/design-wrapper/SKILL.md` — Layer 2 row, track row, disagreement sentence, pointer, sub-file bullet
- `skills/design-wrapper/impeccable-plugin.md` — trust-rule carve-out clause
- `skills/design-wrapper/frontend-detection.md` — diagram line
- `skills/design-wrapper/critics.md` — terminal row
- `skills/design-wrapper/modes/review.md`, `skills/design-wrapper/modes/pre-build.md`, `skills/flow/polish-execution.md` — terminal-track clauses
- `docs/skill-graph.md`, `docs/plugin-structure.md` — edges + roster
- `tests/` — enum pins + file pins

### Package Dependencies

None.

## Gotchas

- Sweep every enumeration site by grepping the *token list*, not the headline word — `grep -rn "backend|infra\|backend | infra"` catches shorthand sites a search for `web` misses. Leaf-only files get silently missed otherwise.
- The outcomes table lives in `terminal-routing.md` by decision, not by a size check — SKILL.md gets four one-line additions and nothing else.
- Layer 0's `setup.platform` can be `web` while `Surface: terminal` — the track row says `Surface:` wins on this track and both SKILL.md's paragraph and `impeccable-plugin.md`'s trust row are updated to say so; the disagreement is still recorded so a stale `PRODUCT.md` never silently redirects.
- `terminal-ux.md` is inlined whole into dispatch prompts — keep it under the size guard, no external references, no "see X" pointers an agent cannot follow.
- Do not add terminal extensions to Layer 3's sniff table "for convenience" — declared-only is a design decision (a repo full of `.js` files with a CLI entry point would otherwise be sniffed as terminal on every diff).
- This repo's own `bin/*.js` CLIs are terminal surfaces — a natural dogfood target once this lands: `/claude-tweaks:review` on a `bin/` change with `Surface: terminal` should dispatch the terminal critic.

<!-- work-fingerprint: design-critique-dispatch:terminal-track-surface-enum-expand-terminal-routing-plugin-a -->
