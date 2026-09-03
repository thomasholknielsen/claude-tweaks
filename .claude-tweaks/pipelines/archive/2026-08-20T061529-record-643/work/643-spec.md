---
record: 643
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
surface: backend
---
# 643: init claude-md-template: CLAUDE.md says "skip /superpowers:writing-plans" while /build Spec Step 3 mandates invoking it — every initialized project ships a self-contradicting instruction

Surface: backend

## Current State

`skills/init/claude-md-template.md` (the "claude-tweaks Pipeline" section of the CLAUDE.md the plugin generates) contains this sentence:

> Artifacts: design doc (one file, phases = `## Phase N` sections) → spec (one per work unit, via `/claude-tweaks:specify`) → `/claude-tweaks:flow`. No phase-plan files; skip `/superpowers:writing-plans`.

Read literally, this forbids invoking `/superpowers:writing-plans` at all. But `skills/build/SKILL.md`'s Spec Step 3 (lines 108 and 148 in the current build) explicitly invokes it — `Invoke the /superpowers:writing-plans skill. After it saves the plan file, stop the skill and return here...` — as part of the normal, expected build flow for every record. `skills/build/SKILL.md` line 74 also documents `docs/superpowers/plans/` as "where `/superpowers:writing-plans` actually writes execution plans."

`skills/specify/SKILL.md`'s Background section (line 141) states the actual intended rule: the plugin bypasses `/superpowers:writing-plans` for *multi-phase* plan files specifically (`*-P1.md`, `*-P2.md`, …, which exceed `/flow`'s envelope) — a single plan per already-agent-sized spec, stopped before its execution-choice offer, is fine and is exactly what `/build` does.

Confirmed reproducible in this repo's own generated `CLAUDE.md` (root of this checkout), which carries the exact same self-contradicting sentence — every project `/claude-tweaks:init` initializes ships this same instruction conflict, misleading any agent that reads CLAUDE.md literally before running `/build`.

## Deliverables

- Reword the sentence in `skills/init/claude-md-template.md`'s "claude-tweaks Pipeline" section to state the narrower, accurate rule: no *multi-phase* plan files (`*-P1.md`, `*-P2.md`, …); a single plan per spec via `/superpowers:writing-plans`, stopped before its execution-choice offer, is expected and normal.
- Regenerate/patch this repo's own root `CLAUDE.md` to match the corrected template sentence, so the self-contradiction is also fixed at the point where it's currently reproducible.
- Add a conformance test (in `tests/bin-lib/init/claude-md-conformance.test.js`, alongside the existing template-conformance suite for this file) that pins the template's Superpowers-override sentence against the skill names `skills/build/SKILL.md`'s Spec Step 3 actually invokes — the test must fail if the template sentence again claims to forbid a skill that `/build` invokes.

## Acceptance Criteria

- `skills/init/claude-md-template.md`'s "claude-tweaks Pipeline" section no longer states or implies that `/superpowers:writing-plans` is skipped/forbidden outright; it states the multi-phase-file restriction instead.
- This repo's root `CLAUDE.md` reflects the corrected sentence (no residual self-contradiction in the dogfooded copy).
- A new or extended test in `tests/bin-lib/init/claude-md-conformance.test.js` fails on the original (pre-fix) template wording and passes on the corrected wording — i.e., reverting the template edit makes this test go red.
- `npm test` passes in full.

## Technical Approach

Edit the single sentence at `skills/init/claude-md-template.md` line 81 (current line number; re-verify before editing, since the file may have moved). Cross-check the corrected wording against `skills/specify/SKILL.md`'s Background section (line 141), which already states the accurate rule — reuse its phrasing rather than inventing new language, to keep the two files consistent. Apply the same corrected sentence to this repo's own root `CLAUDE.md` (the "claude-tweaks Pipeline" section), since it's a direct, currently-out-of-date product of this template.

For the conformance test, follow the existing pattern in `tests/bin-lib/init/claude-md-conformance.test.js` (fixture-based, using `extractTemplateBody`/`splitSections`/`classifySections` from `bin/lib/init/claude-md-conformance.js`) — add an assertion that greps the live template text for the Superpowers-override sentence and checks it does not contain a bare "skip `/superpowers:writing-plans`" claim, or equivalently, that it names the multi-phase-file restriction explicitly. Read `docs/skill-authoring.md`'s conformance-test conventions and `_shared/*.md` prose-pinning norms before writing the assertion, consistent with how the existing suite in that file pins other template sentences.

## Gotchas

- Don't over-correct into a wall of caveats — the fix is a narrow wording change, not a rewrite of the Pipeline section. Keep the sentence concise and consistent with the surrounding paragraph's style.
- The root `CLAUDE.md` edit is a second, separate file from the template — both need the same corrected sentence; a fix to only one leaves the dogfooded copy stale.
- Double-check the exact line numbers in `skills/init/claude-md-template.md` and `skills/build/SKILL.md` before editing — this record cites them as observed at the time of filing (2026-08-17), and either file may have shifted since.

## Original request

init claude-md-template: CLAUDE.md says "skip /superpowers:writing-plans" while /build Spec Step 3 mandates invoking it — every initialized project ships a self-contradicting instruction

**Summary:** The always-loaded CLAUDE.md the plugin generates prohibits `/superpowers:writing-plans` outright ("No phase-plan files; skip `/superpowers:writing-plans`"), while `skills/build/SKILL.md` Spec Step 3 invokes it for every record; the intended rule (no *multi-phase* plan files) is stated only in `skills/specify/SKILL.md`'s Background.

**Kind:** Defect

**Affected component:** `skills/init/claude-md-template.md` (claude-tweaks Pipeline section); `skills/build/SKILL.md` Spec Step 3

**Objective:** Instruction efficacy

**Repro steps:**
1. `/claude-tweaks:init` a project; read the generated CLAUDE.md's "claude-tweaks Pipeline" section.
2. Run `/claude-tweaks:build #N` on any record; observe `/superpowers:writing-plans` invoked and a plan written to `docs/superpowers/plans/`.

**Expected vs. actual:**
Expected: CLAUDE.md states the real rule — one plan per record via `/superpowers:writing-plans`, stopped before its execution offer; no `*-P1.md`/`*-P2.md` phase files.
Actual: CLAUDE.md forbids the skill the pipeline calls on the first record.

**Proposed fix:** Reword `claude-md-template.md`'s sentence to the narrower rule, and add a conformance test pinning the template's Superpowers-override sentences against the skill names `skills/build/SKILL.md` actually invokes.

**Definition:** Clear

**Plugin version:** 6.87.0

---
Filed via /claude-tweaks:feedback (session evaluation, self-referenced repo — routed to this project's own backlog).
<!-- fingerprint: feedback-8a7e4924 -->

