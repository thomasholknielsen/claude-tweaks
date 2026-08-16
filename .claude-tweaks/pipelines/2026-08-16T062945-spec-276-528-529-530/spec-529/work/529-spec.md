---
record: 529
origin: human
risk: medium
size: high
ceremony: standard
grants: []
fingerprint: 2026-08-16-routine-prompt-indirection-design:routine-template-kernel-migration-kickoff-field-kernel-versi
blocked-by: [276, 528]
surface: backend
---
# 529: Routine template kernel migration — kickoff field, kernel_version, dual-drift tracking

Surface: backend

## Overview

Replace the frozen ~95-line preamble with the two-part shape: a canonical **kernel** in `_shared/routine-template-schema.md` (assembled into each live prompt at instantiation) and the `routine-kickoff` wrapper (shipped inert by #528). Templates stop carrying prompt text: `prompt` is removed, a required `kickoff` field (bare target skill name + optional args) replaces it, and a single `kernel_version` integer beside the canonical kernel text tracks kernel edits separately from per-template `template_version`. This is the coupled expand-contract atom — `tests/routine-template-schema.test.js` pins templates to the schema byte-for-byte, so schema, seven templates, `/routine` assembly consumers, and the tests must land together or the suite goes red between commits.

Kernel size: the retained parts (branch sync, four-rung ladder + resolved-build line, self-heal, fallback pointer) span roughly 60–70 of the current preamble's 95 lines. "Unchanged semantics" **permits aggressive prose compression** — the four parts must survive with their meaning and their load-bearing phrases (rung names, the report format line, `--ff-only`, the diverged-stop rule), not their exact wording. Target: kernel ≤ 45 lines, assembled prompt ≤ 55 lines — roughly half of today's, which still substantially defuses #488.

**Complexity:** High
**Estimated tasks:** 7

## Non-Goals

- No edits to `skills/routine-kickoff/SKILL.md` (#528's file) — if moving text reveals a wrapper gap, file a record, don't patch cross-unit. (#528 already carries the standalone-followability constraint the kernel's fallback depends on.)
- No docs/graph surfaces (`docs/skill-graph.md`, /help, `docs/plugin-structure.md`, `skills/routine/SKILL.md` anti-patterns) — #530.
- No updates to any *live* routine — migration is lazy per project via `status`/`update`; this unit only changes what future create/update calls assemble. (Consequence, not a contradiction: the first `status`/RECONCILE run after this lands will report every existing live routine as drifted — expected; see Gotchas.)
- No standing automated enforcement of version bumps — see Gotchas for what is and isn't enforced.
- No pin/canary mechanism (declined at design time — see parent #524).

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #528 | routine-kickoff wrapper skill | must be merged first — the kernel's closing line and fallback pointer reference its file (native blocked-by link exists; restated here because body text doesn't show native links) |
| #276 | routine fleet status and off | file conflict on `skills/routine/fleet.md` + `skills/routine/SKILL.md` (native blocked-by link) |

## Current State

- `skills/_shared/routine-template-schema.md` — field table (`prompt` row line ~17), "Standard prompt preamble" block (~29–125), `{{TARGET_BRANCH}}` substitution table (~129–142), Resolved-build line section, Re-provisioning section, Anti-Patterns table.
- Seven templates: `skills/{backlog,code-health,dispatch,docs-health,harness-health,journey-health,tidy}/routine-template.yml` — each ~110–135 lines, mostly the identical preamble; `template_version` currently 2–9. **Kickoff-line audit (2026-08-16):** `backlog` → `backlog grant`; `code-health` → `code-health`; `dispatch` → `dispatch next`; `docs-health` → `docs-health`; `harness-health` → `harness-health`; `journey-health` → `journey-health --min-confidence high`; `tidy` → `tidy`. Three carry args; all fit the whitespace-token grammar. Re-verify per file at migration time.
- `skills/routine/create-and-update.md` — Step 5.5 (branch resolution), Step 6 (`RESOLVED_PROMPT` assembly + substitution table + "verify no `{{` remains"), Step 8 (guided creation passes `instructions = RESOLVED_PROMPT`), Step 9 (instantiated record write).
- `skills/routine/fleet.md` — Step 3 CREATE path appends `focus=<value>` to the kickoff line for rows 1–4; RECONCILE re-renders `RESOLVED_PROMPT` fresh and diffs it against the live prompt from `RemoteTrigger get`.
- `skills/routine/status.md` + `skills/routine/record-freshness.md` — drift = recorded `template_version` vs template's current; freshness compares significant fields (`created_at` excluded by design).
- `bin/lib/routine-template-parser.js` — generic YAML-subset parser (`parseRoutineTemplate`, `listRoutineRecords`); field-agnostic, so it likely needs no code change, but its tests assert field expectations.
- Tests: `tests/routine-template-schema.test.js` (byte-for-byte preamble pin), `tests/routine-template-parser.test.js`, `tests/routine-record-freshness.test.js`.

## Deliverables

- [ ] `_shared/routine-template-schema.md`: replace the "Standard prompt preamble" with the **kernel** canonical text — (1) branch pin + ff-only sync (diverged→stop; `{{TARGET_BRANCH}}` substitution table unchanged, its unresolved-fallback wording verbatim), (2) four-rung plugin resolution ladder + resolved-build line + empty-cache self-heal (compressed per Overview; rung names and the `claude-tweaks v{version} @ {path} (resolved via: …)` format line survive verbatim), (3) frozen-catalog fallback, exact sentence: "If, after a successful self-heal, invoking /claude-tweaks:routine-kickoff via the Skill tool still fails with an unknown- or unrecognized-skill error, read `<plugin-root>/skills/routine-kickoff/SKILL.md` — the plugin root resolved above — and follow its instructions directly as written.", (4) closing line `Then: /claude-tweaks:routine-kickoff {kickoff}`. The per-target dispatch/tidy exclusion text and the plugin-list dump leave this file (they live in the wrapper, #528).
- [ ] Same file: declare the kernel version as a machine-greppable literal line `kernel_version: 1` adjacent to the kernel block, and document the read mechanism consumers use: `grep -m1 '^kernel_version:' skills/_shared/routine-template-schema.md` (the schema file is markdown; `bin/lib/routine-template-parser.js` stays uninvolved). Document the bump rule beside it: **any edit to the kernel block text requires `kernel_version` += 1** — enforcement is review discipline (the test asserts the field is a positive integer, not that it incremented); the structural mitigation is that the kernel is one file, so a bump is one edit, not seven.
- [ ] Schema field table: `prompt` row removed; `kickoff` row added — required; grammar: whitespace-delimited tokens, first token must equal the owning skill's directory name, remaining tokens pass through verbatim (`key=value` or flag tokens; values containing spaces unsupported — same constraint as the existing `focus` grammar). `fleet.md`'s focus append joins with a single space. Instantiated-record table: add `kernel_version` (required on new writes; a record without it reads as kernel-stale). `template_version` meaning narrowed to "this template's own fields changed".
- [ ] Same file, Re-provisioning + Anti-Patterns rewritten. Rows expected to change: "Writing a new `prompt` that skips the standard preamble" → hand-provisioning a routine without the kernel; "Skipping `template_version` bumps" → extended to cover `kernel_version`; "Sending `{{TARGET_BRANCH}}` literally" stays as-is (still representable). Further rows at implementer judgment — revise, never silently delete.
- [ ] All seven `routine-template.yml`: delete `prompt`, add `kickoff` carrying each template's audited skill+args (table in Current State — re-verify per file), bump each `template_version` by exactly 1.
- [ ] `create-and-update.md`: Step 6 assembles kernel (schema canonical text, `{{TARGET_BRANCH}}` substituted, `{kickoff}` spliced into the closing line) instead of `template.prompt`; "verify no `{{` remains" check kept; Step 8 passes the same assembled body; Step 9 record write adds `kernel_version` (the schema's current value at assembly time, read via the documented grep).
- [ ] `fleet.md`: rows 1–4 append `focus=<value>` to the `kickoff` args (single-space join); RECONCILE re-renders via the new assembly. Note in RECONCILE's text: immediately after this change ships, every pre-migration live routine diffs as drifted (old full preamble vs new kernel) — that is the intended lazy-migration signal, resolved by the standard `update` path, not an error.
- [ ] `status.md` + `record-freshness.md`: dual-drift — report "kernel stale (recorded `kernel_version` N < current M — run `/claude-tweaks:routine update <skill>`)" distinctly from template-field drift; a record with no `kernel_version` reports kernel-stale. `kernel_version` IS a significant field for freshness comparison (unlike `created_at`).
- [ ] Tests: `routine-template-schema.test.js` rewritten — assert no template contains kernel/preamble text (no template body matches "Before anything else" or `{{TARGET_BRANCH}}`), every template has well-formed `kickoff` (first token == owning directory name) and integer `template_version`, the schema file declares integer `kernel_version`, and the kernel block contains its four parts **in order** (relative-position assertions: branch-sync text before ladder text before fallback sentence before the `routine-kickoff` closing line, plus `{{TARGET_BRANCH}}` present). `routine-template-parser.test.js` / `routine-record-freshness.test.js` updated for `kickoff` + `kernel_version`.

## Acceptance Criteria

1. `npm test` green at the unit's single commit point (the atom lands whole; no intermediate red states pushed).
2. `grep -l "Before anything else" skills/*/routine-template.yml` returns nothing; `grep -c "{{TARGET_BRANCH}}" skills/*/routine-template.yml` is 0 for every template; `{{TARGET_BRANCH}}` appears in `_shared/routine-template-schema.md` and `skills/routine/create-and-update.md` only (grep over `skills/`, with a positive control hit on the schema file).
3. Each template's `kickoff` first token equals its directory name (asserted by the rewritten schema test), and `wc -l` on every template is under 50 lines (was 110–135).
4. Assembling a prompt per the new Step 6 for `code-health` (dry-run walkthrough at review) yields ≤ 55 lines ending in `Then: /claude-tweaks:routine-kickoff code-health`; for `journey-health` the closing line reads `Then: /claude-tweaks:routine-kickoff journey-health --min-confidence high`.
5. The rewritten `routine-record-freshness.test.js` covers: a record lacking `kernel_version` → kernel-stale verdict; a record with `kernel_version` behind the schema's literal → kernel-stale; equal → fresh (template fields permitting).
6. Every `template_version` strictly incremented by exactly 1 vs. `git show origin/main:` for all seven files (landing-time check).

## Technical Approach

### Data / API Surface

Template fields after this change: `template_version` (int, required), `routine_name` (str, required), `kickoff` (str, required — grammar above), `branch` (str, optional), `focus` (str, optional, unset in shipped templates), `model` (str, required), `allowed_tools` (array, required), `mcp_connections` (array, optional), `default_schedule.cron_expression` / `.description` (required), `notes` (optional). Schema-file-level: `kernel_version` (int, starts at 1; greppable literal line). Instantiated record adds: `kernel_version` (int).

### Key Files

- `skills/_shared/routine-template-schema.md` — kernel canonical text, `kernel_version`, field tables, anti-patterns
- `skills/backlog/routine-template.yml`, `skills/code-health/routine-template.yml`, `skills/dispatch/routine-template.yml`, `skills/docs-health/routine-template.yml`, `skills/harness-health/routine-template.yml`, `skills/journey-health/routine-template.yml`, `skills/tidy/routine-template.yml` — `prompt`→`kickoff`, version bumps
- `skills/routine/create-and-update.md` — Steps 6/8/9 assembly + record write
- `skills/routine/fleet.md` — focus append + RECONCILE re-render + mass-drift note
- `skills/routine/status.md`, `skills/routine/record-freshness.md` — dual-drift
- `tests/routine-template-schema.test.js`, `tests/routine-template-parser.test.js`, `tests/routine-record-freshness.test.js`
- `bin/lib/routine-template-parser.js` — expected unchanged (generic parser); touch only if a field helper actually lives there

## Gotchas

- **The byte-for-byte test is the coupling**: any plan that lands schema and templates in separate commits has a red suite between them. Sequence tasks so the suite is only run green at the atom's completion commit (fix-dispatch rule: targeted suites between edits, full suite at the commit).
- **Version-bump enforcement is honest, not automated**: AC 6 is a one-time landing check; ongoing discipline for both `template_version` and `kernel_version` remains review-level. The design's structural fix is eliminating the seven-copy fan-out (a kernel edit is one file, one bump), not automating bumps. Do not claim otherwise in the schema prose.
- Dirty-tree hazard when grepping: run the negative greps (AC 2) with `git grep` or plain grep over `skills/` only — recursive grep honors `.gitignore` and can lie about run-dir content; pair every zero-match grep with a positive control.
- The unresolved-branch fallback wording in the substitution table must survive verbatim — it is the pre-`branch`-field compatibility behavior (#132), not decoration.
- `record-freshness.md`'s `created_at` exclusion (UPDATE rewrites it every run) must not accidentally extend to `kernel_version` — `kernel_version` IS significant.
- The kernel's fallback path reads #528's SKILL.md as raw prose (no Skill-tool mechanics) — that standalone-followability constraint is declared in #528's file; the kernel text only points at it, never restates it.

## Decision Rationale

See parent #524. Key local consequence: `kernel_version` exists so a kernel edit is one bump in one file, not seven — the fan-out failure one layer up is the thing this field prevents.


<!-- work-fingerprint: 2026-08-16-routine-prompt-indirection-design:routine-template-kernel-migration-kickoff-field-kernel-versi -->
