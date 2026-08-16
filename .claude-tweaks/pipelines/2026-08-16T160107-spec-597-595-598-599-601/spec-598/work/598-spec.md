---
record: 598
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
fingerprint: design-critique-dispatch:design-wrapper-review-step-3-8-contract-subagent-critic-disp
blocked-by: [597, 595]
surface: backend
---
# 598: design-wrapper review Step 3.8 — contract-subagent critic dispatch, Target normalization, craft_critics return, absence-nudge

Surface: backend

## Overview

Add **Step 3.8 — critic dispatch** to `skills/design-wrapper/modes/review.md`: after the finish-reviewer step, resolve the triggered critics for the resolved `surface_track` from `critics.md`, dispatch one contract subagent per critic in parallel, normalize each reply into the findings union, and return a `craft_critics` field that tells unavailable / failed / unparseable / parsed apart. Also emits the wrapper's own **absence-nudge** finding under lever `auto` when no `DESIGN.md` exists and a web-track UI diff is under review.

This is the core of #592: the half of #573 that had not shipped. Critics receive the decisions layer (`DESIGN.md` + sidecar) and answer two questions — conformance and pushback — via a `Target` column (`code` | `decisions`); the *routing* of those two targets downstream is #599, not this one. This one produces the findings and the return shape.

**Complexity:** Medium
**Estimated tasks:** 7

## Non-Goals

- No downstream routing — the polish cache filter, `staged/` proposals for `decisions` findings, and the review-summary rendering are #599. This record leaves Step 5's cache filter as `source === "audit"` (unchanged) — critic findings are in `findings` and the return, and nowhere else yet.
- No change to `critics.md`'s roster or the lever's schema (both prerequisites).
- No changes to `survey`, `polish`, `flow/survey.md`, or any mode other than `review`. In particular the declined-recommendations cache (`docs/plans/…-declined.json`) is **not** touched or read — see the absence-nudge deliverable for why.
- Not a third-party dispatch — the Subagent Contract's exemption does not apply; do not model this on Step 3.7's finish-reviewer adaptation.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #595 | `design.critique` policy lever | must land first — Step 3.8 reads it via the resolver; #595's own tests verify the resolver returns the enum |
| #597 | `critics.md` track-keyed table + design-craft table move | must land first — Step 3.8 reads the roster from it; #597's own ACs verify the table shape and the signal definitions |

Native Blocked-by links on both enforce this; do not build against their unmerged shape.

## Current State

- `skills/design-wrapper/modes/review.md` — Steps 1–5 + Output to caller. **Step 2 resolves the changed UI file list** (spec-scoped ∩ `git diff --name-only`, Layer 3-filtered) — the file list every later step, including this new one, means by "Step 2's resolved file list". Step 3.7 dispatches `impeccable-finish-reviewer` (third-party, exempt); Step 4 normalizes into `{source, file, category, severity, message, suggestion}` with `source ∈ critique | audit | finish-review` and **assigns** severity for finish-review (`persistence` → `error`, `ceiling` → `info`, `material_fixes` → `warning`) — severities are assigned at this boundary, not parsed; Step 5 writes the audit cache filtered by `source === "audit"`. The return already carries omitted-when-not-run fields (`finish_review`, `design_contract`, `prior_critique`) — the convention `craft_critics` follows.
- `skills/_shared/subagent-output-contract.md` — Input Discipline, Working Directory Discipline, Implementer Status Protocol (`DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED` first line), Model Selection (`Standard` for review-style fan-out, resolved via `node bin/resolve-profile.js standard`), Template A (findings table; 15-row cap; "No findings." literal), "How to integrate at a dispatch site" checklist.
- `skills/_shared/design-craft.md` — Emil skill resolution: a **per-skill-name** two-path lookup (`{project}/.claude/skills/{name}/SKILL.md`, then `~/.claude/skills/{name}/SKILL.md`, symlink note) — generic over any name `critics.md` lists; decisions layer resolution (`DESIGN.md` via `_shared/visual-html-output.md`'s three-path lookup + root sidecar `.impeccable/design.json`); web-track gating; and the **motion signal** definition in its relevance map ("does it name motion work (animation, transition, gesture, micro-interaction)? — or `Design-intent: delightful`").
- `skills/design-wrapper/critics.md` (#597) — the roster and its three trigger inputs (motion signal, decisions present, lever), plus `Design-intent:` (a body-metadata line per `skills/specify/spec-template.md`).
- `skills/design-wrapper/SKILL.md` — Layer 0 runs in the universal preconditions for every mode and yields an in-memory signals object (`hasDesign`, `hasProduct`, `setup.platform`, …) that the mode procedure reads; when Layer 0 degraded the object is empty. Track resolution produces `surface_track`. The Anti-Patterns table (new rows go here). Layer 1 kill-switch.
- `_shared/auto-decision-log.md` — `SCANNED` / `AUTO` entry schema for `decisions.md`.

## Deliverables

- [ ] `modes/review.md` new **Step 3.8: Dispatch project-local craft critics**, with lettered sub-steps (a)–(f) so they never collide with the mode's own Step numbers:
  - **(a) Lever.** `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --run "$PIPELINE_RUN_DIR" design.critique` (omit `--run` when unset). `off` → skip the whole step, log one `AUTO` line, omit `craft_critics` from the return.
  - **(b) Roster selection.** Read `../critics.md`; select rows whose track equals `surface_track` and whose trigger holds given: the lever value; the motion signal (consumer judgment per `design-craft.md`'s relevance map, applied to the record's spec/description); decisions present (`hasDesign` from the preconditions' Layer 0 signals object, else a direct `DESIGN.md` existence check via `_shared/visual-html-output.md`'s three-path lookup); and the record's `Design-intent:` line. Include a worked example table in the prose: four rows — (`auto`, decisions present, no motion) → `emil-design-eng`; (`auto`, absent, no motion, no intent) → none + nudge; (`auto`, absent, motion) → both; (`full`, absent, no motion) → `emil-design-eng`.
  - **(c) Availability.** For each selected critic, resolve its `SKILL.md` per `design-craft.md`'s per-name lookup; unresolvable → `craft_critics` entry `{provider, ran: false, missed: "not installed at either path"}`, no dispatch, one `SCANNED` log line.
  - **(d) Decisions layer.** Resolve `DESIGN.md` + `.impeccable/design.json` per `design-craft.md`, when present.
  - **(e) Dispatch.** One `Task()` per resolved critic, **parallel tool calls**, `subagent_type: general-purpose`, Standard profile (`node bin/resolve-profile.js standard`), no `isolation: "worktree"` (same reason Step 3.7 gives). Prompt contains ONLY: the critic `SKILL.md` content inlined verbatim; the mode's Step 2 resolved file list as absolute paths; the decisions layer inlined verbatim when present, or the literal sentence "No DESIGN.md or sidecar exists for this project — emit no `decisions` rows" when absent; the two questions **verbatim** — "1. Conformance: for each file, where does the diff fall short of what DESIGN.md decided, or of your craft principles where DESIGN.md is silent? Report as `Target: code`. 2. Pushback: where is DESIGN.md silent on a sub-topic this diff exercised, or where does a decision it records fall below your principles? Report as `Target: decisions`, with `Path:Line` = `DESIGN.md` or `.impeccable/design.json`."; the status-line protocol; and the findings template below, verbatim. Never conversation history, never other steps' findings. Working-directory discipline: substitute the resolved absolute repository path.
  - **(f) Parse and encode — four outcomes.** `Task()` errored or returned nothing → `{provider, ran: true, parsed: false, reason: "dispatch failed: <error text or 'empty reply'>"}` + `SCANNED` line. First line `BLOCKED` / `NEEDS_CONTEXT` → `{ran: true, parsed: false, reason: "<status>: <agent's own text>"}` + `SCANNED` line. `DONE`/`DONE_WITH_CONCERNS` but no parseable table and no literal "No findings." → `{ran: true, parsed: false, reason: "unparseable"}` + `SCANNED` line; do **not** mine prose for something finding-shaped. Otherwise `{ran: true, parsed: true}`; a literal "No findings." is a real clean result. A row whose `Target` cell is not exactly `code` or `decisions` is **dropped** and counted in `dropped_rows: n` on that critic's entry (never coerced — a mis-targeted row could otherwise reach polish); if every row was dropped, encode as `parsed: false, reason: "unparseable"`.
- [ ] Findings template inlined in the dispatch prompt (Template A + `Target`): a markdown table `| Severity | Target | Path:Line | Finding | Evidence |`; `Target` ∈ `code` | `decisions`; severity scale critical/high/medium/low/info; "No findings." literal when empty; at most 15 rows highest severity first, then a final `+N more` row when exceeded; no narration before or after the table.
- [ ] Step 4 normalization addition: each row → `{ source: "craft-critic", provider: "<critic name>", target: "code" | "decisions", file, category: "craft", severity, message, suggestion: null }`; severity **assigned** at the boundary exactly as for finish-review: critical/high → `error`, medium → `warning`, low/info → `info` — the same three values `/review` already maps (`info` → low, `warning` → medium, `error` → high), so no `/review`-side change; a `decisions` row keeps `DESIGN.md` or the sidecar path as `file`; `suggestion` is `null` (not omitted) per Step 5's existing rule. Findings join the same `findings` array as critique/audit/finish-review.
- [ ] Absence-nudge: when lever is `auto`, `surface_track === "web"`, Step 2 resolved ≥ 1 file, and decisions are absent, append one wrapper-emitted finding `{ source: "craft-critic", provider: "wrapper", target: "decisions", file: "DESIGN.md", category: "craft", severity: "info", message: "UI shipping without a locked direction — run /claude-tweaks:design-wrapper explore to lock one", suggestion: null }`. `provider: "wrapper"` is introduced here as a reserved provider value (no skill of that name is ever dispatched). **De-duplication is by construction, not by cache:** the finding is emitted once per review invocation; #599 stages it under a fixed filename (`design-decision-nudge.md`, overwritten on re-review in the same run) so it can never accumulate; a project that does not want it says so once with `design.critique: off`. The design doc's earlier idea of suppressing it via the declined-recommendations cache is **withdrawn** — that cache is keyed `(command, page)`, written only by `/flow`'s survey decline-detection, and has no slot for a page-less review-time finding.
- [ ] Return: `craft_critics: [{provider, ran, parsed, reason?, missed?, dropped_rows?}]`, one entry per critic the roster selected (including unresolvable ones); the wrapper nudge never gets an entry (it is not a critic). Present whenever Step 3.8 ran past the lever check and selected ≥ 1 critic; **omitted entirely** when lever was `off` or the roster selected zero critics. Document it in the Output-to-caller block with the same "absence of evidence vs clean bill" sentence `finish_review` uses.
- [ ] `SKILL.md`: update the `review` row of the Input table (one clause: "+ project-local craft critics per `critics.md`, governed by `design.critique`") and add three Anti-Patterns rows: treating a critic as a third-party agent (it isn't — full contract applies); dispatching a critic on the native track (Emil is web-only; the roster has no native row); inferring the motion signal from file content rather than the spec/`Design-intent:` (removes user agency, same rule as intent-driven dispatch).
- [ ] Log lines per `_shared/auto-decision-log.md`: `AUTO` for the lever resolution (value + source); `SCANNED` for every non-`parsed` outcome in (c) and (f), naming the provider and the reason.

## Acceptance Criteria

1. `grep -n "Step 3.8" skills/design-wrapper/modes/review.md` shows the new step between Step 3.7 and Step 4, with sub-steps labelled (a)–(f), and `grep -n "critics.md" skills/design-wrapper/modes/review.md` shows it read there.
2. The dispatch prompt block in Step 3.8 contains the literal table header `| Severity | Target | Path:Line | Finding | Evidence |`, the literal text `No findings.` and `+N more`, and both numbered questions verbatim (`grep -n "1. Conformance:" skills/design-wrapper/modes/review.md`).
3. Sub-step (b) contains a worked-example table with four lever × decisions × motion rows (`grep -c "emil-design-eng" skills/design-wrapper/modes/review.md` ≥ 4).
4. `grep -n "craft_critics" skills/design-wrapper/modes/review.md` shows the field in sub-step (f) and in the Output-to-caller JSON block, and sub-step (f) names all four outcomes with distinct encodings (`grep -n "dispatch failed\|unparseable\|dropped_rows" skills/design-wrapper/modes/review.md` returns all three).
5. `grep -n 'source: "craft-critic"\|"source": "craft-critic"' skills/design-wrapper/modes/review.md` shows the normalized shape with `provider` and `target` fields and `suggestion: null`.
6. Step 5's cache filter line still reads `source === "audit"` — `grep -n 'source === "audit"' skills/design-wrapper/modes/review.md` returns the existing line unchanged.
7. `grep -n "UI shipping without a locked direction" skills/design-wrapper/modes/review.md` shows the absence-nudge with its lever/track/absence conditions, and `grep -n "declined" skills/design-wrapper/modes/review.md` returns **nothing** (no declined-cache dependency).
8. `grep -c "craft critic\|craft-critic" skills/design-wrapper/SKILL.md` ≥ 3 (Input-table clause + Anti-Patterns rows).
9. `npm test` passes.
10. `git diff --stat` touches only `skills/design-wrapper/modes/review.md` and `skills/design-wrapper/SKILL.md`.

## Technical Approach

Prose-procedure edits following Step 3.7's structure (gate → availability → dispatch → outcomes table) but under the *full* Subagent Contract rather than the exemption. Follow `_shared/subagent-output-contract.md`'s "How to integrate at a dispatch site" checklist item by item.

### Data / API Surface

- Findings union: `source` gains `craft-critic`; new optional fields `provider` (string; reserved value `wrapper`) and `target` (`code` | `decisions`) — present only on `craft-critic` findings.
- Return: new optional `craft_critics` array (shape above).

### Key Files

- `skills/design-wrapper/modes/review.md` — Step 3.8, Step 4 addition, Output to caller
- `skills/design-wrapper/SKILL.md` — Input table `review` row, Anti-Patterns

### Package Dependencies

None.

## Gotchas

- Agents only see what's in their prompt — inline the critic `SKILL.md` and the decisions layer verbatim; a path string reaches nothing (`design-craft.md` "Subagent Contract compliance").
- Do **not** pass `isolation: "worktree"` — review mode routinely runs inside a task worktree already; a second one orphans everything (Step 3.7's stated reason).
- Working-directory discipline: substitute the resolved absolute repository path into the prompt; never an unexpanded placeholder.
- The nudge must not fire on the native track (no `DESIGN.md` expectation there in this design) nor when Step 2 resolved zero files (there is no UI shipping).
- `craft_critics` is where the four outcomes live — never encode "critic didn't run" as an empty findings list. Absence of output is not absence of findings.
- `SKILL.md` is ~39 KB; keep additions to single clauses/rows and check `wc -c` before/after — no numeric test pins it, the constraint is context budget.
- Do not add a `decisions`-target routing rule to Step 5 here even though it's tempting — #599 owns the cache filter change and the `staged/` write, and splitting it keeps this record's diff to two files.
- Runtime correctness of the lever read and the roster shape is verified by #595's and #597's own acceptance criteria; this record's ACs are prose pins by design.

<!-- work-fingerprint: design-critique-dispatch:design-wrapper-review-step-3-8-contract-subagent-critic-disp -->
