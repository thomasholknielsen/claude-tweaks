# Wrap-Up Drift Prevention — Skill/Docs/Journey Curation Hardening — Design

## Goal

Harden `/claude-tweaks:wrap-up`'s three post-implementation curation mechanisms (skill, docs, journey) so each one generates candidates independently from the work itself, makes a "nothing needed" verdict auditable rather than silent, and treats new-artifact creation vs. folding into an existing artifact as a real decision rather than an afterthought — closing the same structural gap across all three surfaces instead of three bespoke fixes.

## Motivation

Real production evidence, not speculation:

- Across 23 `decisions.md` audit logs spanning ~30 actual wrap-up executions (accounting for bundled multi-spec runs), wrap-up's Step 7 skill curation produced exactly one real skill update (and it was seeded by a reflect finding, not Step 7's own independent scan) and one correctly-declined new-skill candidate. The other ~28 executions logged nothing about Step 7 at all.
- `_shared/harness-health-analysis.md` (the shared judgment engine behind Step 7, standalone `/harness-health`, and `/init` Phase 3/6) is not structurally lenient — it requires quantified grep evidence, a concrete anchor per finding, and an adversarial verify gate. The low hit rate isn't explained by a weak judge.
- The actual defect: a "no updates needed" outcome writes **nothing** to the audit log — only `AUTO`/`STAGED`/`KEPT-PROMPT` entries get logged. There is no record of what was scanned, how deep the domain-overlap ranking went, or whether gap detection even ran. The claim "nothing needed updating" is currently unfalsifiable.
- The same pattern shows up in journeys, more starkly: `docs/journeys/` does not exist anywhere in this repository's history. Every build run that logged a journey decision concluded "no interaction surface" (e.g. spec 13: "contract-doc change, no persona-facing interaction surface"; spec 14: "internal library, no persona surface") — and `/claude-tweaks:journeys`' own persona list explicitly includes "developers" and "internal tooling users," so a change to what a slash command does should have tripped that check. It's a single holistic judgment call with no evidence anchor, the same shape of problem as Step 7's opacity.
- Docs (`wrap-up` Step 6.1) already has a version of the "generate from the work" discipline, but it's narrower than skill curation: it only judges docs this work's diff directly touched, batched alongside CLAUDE.md/rules/ADRs rather than run as its own analysis.

## Architecture

### A. Skill curation hardening (`wrap-up` Step 7 + `_shared/harness-health-analysis.md`)

1. **Null-result logging.** Step 7 always emits one summary line, in every mode, regardless of outcome:
   ```
   AUTO {time} — Step 7 skill curation summary: {S} seeds, {R} skills read
   (top-{cap}: {names}), gap detection: {what was examined, found/not found}.
   Result: {N} applied, {M} staged, {K} new-skill candidates ({proposed}/{declined}).
   ```
   Interactive mode prints the equivalent inline, replacing today's bare "No skill updates needed" (Step 9's summary template). Makes a null result falsifiable instead of silent.
2. **Broadened gap-detection trigger.** `harness-health-analysis.md` Step 3 currently requires a *multi-file* cohesion signal (3+ files sharing a naming convention, a repeated import pair across 3+ files, a commit keyword across 3+ commits) before a new-skill candidate is even considered. Add a fourth signal: a single new file/module implementing a non-trivial technique, reused (imported/called) from 2+ sites, or clearly designed for reuse even with one call site so far. This only broadens what reaches Step 4's existing ≥2-of-3 qualification gate (reusability / complexity / project-specificity) — it doesn't weaken that gate, so a trivial single-file helper still won't qualify.
3. **Fold-into-existing-skill branch.** Step 4's gate currently has two outcomes: propose `kind: "new-skill"`, or drop. Insert a check before that: does an existing skill's domain (its frontmatter description / "When to Use") already reasonably cover this territory? If yes, propose a `kind: "patch"` to that skill (a new section/example/anti-pattern) instead of a new file. Only when no existing skill's domain fits, and ≥2-of-3 still holds, does `new-skill` get proposed.

Shared-file consequence: `harness-health-analysis.md` is read by three consumers (wrap-up Step 7, standalone `/harness-health`, `/init` Phase 3/6). Fixes 2-3 improve gap detection for all three; testing must cover all three call sites, not just wrap-up's.

### B. Skill-library shape analysis (standalone `/claude-tweaks:harness-health`, new periodic check)

A different scale of judgment than A — comparing skills *against each other*, not against the codebase. New periodic pass (part of harness-health's own rotation, not every wrap-up, since it requires reading and comparing multiple full skill files):

- **Too shallow** — a skill whose actual guidance is thin enough that it should collapse into a sibling (mirrors `/deepen`'s shallow-module detection, applied to skills as modules).
- **Overlapping** — two skills whose domains have drifted into covering the same territory (merge candidate).
- **Bloated** — a skill whose prose has grown redundant/verbose relative to what it needs to say (mirrors `/simplify`'s mission, applied to skill prose).

Findings from this pass file the same way other harness-health findings do (`by:harness-health`, report-only, human decides).

### C. Docs curation elevation (new `wrap-up` Step 7.7, replacing Step 6.1)

**Numbering note:** not 7.5 — `skill-curation.md` already uses the shorthand "(7.1)" through "(7.6)" for its own internal sub-procedure (seed gathering, independent scan, judge, stage-or-present), cross-referenced from Step 7's own body text. 7.7/7.8 are unused and avoid colliding with that existing numbering while still slotting in right after Step 7, before Step 8, with no renumbering of anything downstream (8, 8.5, 8.6, 9, 10 stay exactly as they are — those are heavily cross-referenced elsewhere: `ledger/resolve-gate.md`, `dispatch/SKILL.md`, `flow/SKILL.md`).

Same shape as Step 7, pulled out of Step 6's lighter batch entirely:

- **Seeds** — ledger entries/reflection insights tagged for a doc destination (mirrors 7.1).
- **Broadened independent scan** — today's D1 only judges docs this work's diff touched or created. Add a domain-overlap ranking on top (reusing the doc registry's Auto-detect patterns as the overlap signal, same idea as skill curation's directory/pattern scoring): read the top-N domain-overlapping docs even when untouched, capped by a dedicated `--doc-budget <n>` flag (separate from `--skill-budget`, default lower than skill curation's top-5 since docs tend to be longer to fully read — suggest top-3).
- **Judge** — unchanged: full `_shared/criteria-docs-diataxis.md` procedure (genre-drift, depth-mismatch, findability, staleness), now applied to the broadened read set.
- **Missing-doc gap detection (D2)** — unchanged; already scans the whole diff independent of touched files.
- **Stage or present** — unchanged mechanics (additive auto-applies; restructural files as `by:docs-health`), plus the same null-result logging as A.1.
- **New dedicated "Documentation updates" section** in the Wrap-Up Review Console (Step 8.6), separate from "Configuration Updates" (which narrows to CLAUDE.md/rules/ADRs only), mirroring the existing "Skill updates" section.

Two parallel concerns from A/B already have equivalents and need no new machinery:

- Fold-into-existing (A.3's parallel): already built into D2's gate ("zero existing doc coverage *anywhere*" — refuses a new doc when an adjacent one could absorb the content).
- Whole-library shape (B's parallel): already `/claude-tweaks:docs-health`'s job (its rotation already does genre-drift/depth-mismatch across all of `docs/`).

### D. Journeys — build-time recalibration (`skills/journeys/SKILL.md` Step 1)

Today's "No interaction surface" conclusion is a single holistic judgment call with no evidence anchor. Add a checklist that must be checked before that conclusion is allowed — any hit disqualifies "no interaction surface":

1. Does the diff touch a route/page/API endpoint/CLI command/exported function directly invoked by an end user, admin, or developer-user?
2. Does the diff change any user-observable output (new field, error message, flag, response shape)?
3. Does the diff add/remove/rename a capability reachable without reading source (a slash command, a CLI subcommand, a UI element)?

Concrete regression test this fix should satisfy: re-running this checklist against this project's own spec 13/14 diffs (which changed skill-file/CLI behavior) should trip signal 3 and require at least a journey-update evaluation, not an outright skip — the exact case the current unanchored check waved through.

### E. Journeys — wrap-up drift step (new `wrap-up` Step 7.8)

Builds on `/review`'s existing 3g-cov lens rather than recomputing from scratch:

- Check whether any commit has landed since `/review`'s 3g-cov lens ran. If not, reuse its output directly.
- If the diff has moved since, re-run the coverage-overlap check (journeys whose `files:` frontmatter overlaps the *current* full diff) plus the same four-check self-review `/journeys` and `/journey-health` already share (`_shared/journey-self-review.md`, applied inline — never a nested skill call, matching the established convention).
- Missing-journey gap detection across the whole diff, independent of what build's own (now-recalibrated per D) Step 1 already concluded — a wrap-up-time safety net for drift introduced by review/simplify fixes after build's own journey check ran.
- Same null-result logging as A.1/C.
- New dedicated "Journey updates" section in the Review Console.

No `--journey-budget` flag: unlike skill/doc curation's fuzzy domain-overlap ranking over the whole library, journey scope-selection is a direct computation (files: frontmatter overlap against the current diff) with no "how many to rank before stopping" dial to tune.

Parallel concerns already covered, no new machinery: fold-into-existing (already how `/journeys` Step 3 handles "extend an existing journey" vs. Step 2 "create new"); whole-library shape (already `/journey-health`'s rotation).

## Code Changes

| File | Change |
|---|---|
| `skills/wrap-up/SKILL.md` | Step 7: add null-result logging (A.1). Step 6: remove 6.1 (Documentation) entirely, renumber 6.2→6.1 (CLAUDE.md/Rules), 6.3→6.2 (Decision Records). New Step 7.7 (Documentation Curation, C). New Step 7.8 (Journey Curation, E). Flags section: add `--doc-budget <n>`. Anti-Patterns + Relationship table rows for both new steps. |
| `skills/wrap-up/skill-curation.md` | 7.6 Stage-or-Present: add the null-result summary line (A.1). |
| `skills/wrap-up/docs-health-integration.md` | Update internal step-reference from "Loaded by ... Step 6.1" to "Step 7.7"; add the broadened domain-overlap scan (C) and `--doc-budget` handling. No filename change — sub-files are named for what they do, not their step number. |
| `skills/wrap-up/journey-curation.md` (new) | New sub-file for Step 7.8's full procedure (E), mirroring `docs-health-integration.md`'s shape. |
| `skills/wrap-up/review-console.md` | Add "Documentation updates" and "Journey updates" sections to the 7-section console template (→ 9 sections); narrow "Configuration Updates" to CLAUDE.md/rules/ADRs only. |
| `skills/_shared/harness-health-analysis.md` | Step 3: add the single-file gap-detection trigger (A.2). Step 4: add the fold-into-existing-skill branch (A.3). |
| `skills/harness-health/SKILL.md` | New periodic skill-library-shape pass (B): too-shallow / overlapping / bloated checks, own rotation slot, files `by:harness-health`. |
| `skills/journeys/SKILL.md` | Step 1: replace the unanchored "no interaction surface" call with the 3-signal checklist (D). |
| `CLAUDE.md` | Structure table's wrap-up sub-files list: update `docs-health-integration.md`'s step reference from "Step 6.1 item 4" to "Step 7.7"; add `journey-curation.md` as a new sub-file entry describing Step 7.8's procedure. |

## Testing

Markdown-prose skill files — no unit-testable logic for the judgment content itself (matches this project's existing convention). Verification is a manual read-through plus targeted checks:

- Grep every `decisions.md`-writing step (7, 7.7, 7.8) for the new mandatory summary-line format, confirm it's unconditional (not just inside the "found something" branch).
- Confirm the Review Console template (`review-console.md`) renders exactly 9 sections, and that "Configuration Updates" no longer describes doc rows.
- Confirm no stale cross-reference to "Step 6.1" (documentation) survives anywhere in the repo after the renumber — this project's own CLAUDE.md explicitly warns that a stale relationship/reference can recur in a second, non-adjacent location even after the first is fixed; re-run the repo-wide grep for "Step 6.1" after each touched file's edit, not just once at the end.
- For D (journeys Step 1), hand-trace the 3-signal checklist against this project's own spec 13/14 historical diffs (available in `.claude-tweaks/pipelines/archive/`) and confirm it would now flag them, as the concrete regression case motivating the fix.
- Full `node --test` suite must still pass unmodified — no `bin/lib/*` code paths are touched by this design; everything here is skill-markdown.

## Non-Goals (explicitly parked / out of scope)

- **Porting the skill-library shape analysis (B) to docs/journeys.** Docs and journeys already have an equivalent (`/docs-health`'s genre-drift/depth-mismatch rotation; `/journey-health`'s file-existence/self-review/coverage rotation) — no new machinery needed there.
- **A shared `--curation-budget` flag across skill/doc curation.** Decided against in favor of separate `--skill-budget`/`--doc-budget` so each can be tuned independently; revisit only if real usage shows they always move together.
- **Any `--journey-budget` flag.** Journey scope-selection has no ranked-scan dial to tune (see Architecture E) — nothing to add.
- **Hit-rate tracking as an ongoing metric** (e.g. "/tidy reports Step 7's hit rate over the last N runs"). Considered and explicitly declined in favor of the concrete mechanical fixes (A.1-3) during brainstorming — a metric answers "is this still a problem" after the fact; the anchor/logging fixes prevent the opacity that made the original problem undetectable in the first place.
- **Reconciling `flow/materialize.md`/`build/worktree-setup.md`'s pre-worktree-write ordering** — a real but unrelated follow-up already surfaced by a past Step 7 run (`archive/2026-07-15T090502-spec-18/decisions.md`) and explicitly not auto-created as a work record there; still open, not part of this design.

## Known Touch Points

- `_shared/auto-mode-contract.md` — the null-result logging (A.1, C, E) must still respect "auto never invents new mid-flow stops"; a summary line is informational logging, not a decision, so it doesn't need a new "not silenced" carve-out.
- `_shared/auto-decision-log.md` — the canonical entry schema; the new null-result line should use a schema-conformant prefix even though it's not an `AUTO`/`STAGED`/`KEPT-PROMPT` decision in the traditional sense (it records that a scan ran and concluded nothing, which the current schema has no explicit slot for — worth confirming during implementation whether a new tag, e.g. `SCANNED`, is warranted, or whether folding it under `AUTO` with a distinct verb is sufficient).
- `_shared/work-record.md` — unchanged; docs/journey findings still file against the same unified taxonomy.
- `skills/review/step3-routing.md` (3g-cov lens) — E reads this lens's output; no changes to the lens itself, only a new consumer of its already-computed result.

## Decomposition for Implementation

Five separately-shippable pieces, in recommended order (each is independently valuable, none blocks the others except where noted):

1. **A (skill curation hardening)** — smallest, most contained, validates the "null-result logging" pattern once before reusing it in C/E.
2. **C (docs curation elevation)** — reuses A.1's logging pattern; touches `review-console.md` (shared with E, so land before or together with E to avoid two competing console edits).
3. **E (journeys wrap-up drift step)** — reuses A.1's logging pattern; touches `review-console.md` (coordinate with C).
4. **D (journeys build-time recalibration)** — independent of A/C/E; can ship any time, but doing it before E means Step 7.8's "safety net" framing is accurate from the start rather than temporarily redundant with an unfixed Step 1.
5. **B (skill-library shape analysis)** — independent of everything else; lowest urgency since it's a new capability, not a fix to a broken one.

Recommend running each of 1-5 through `/claude-tweaks:specify` as its own work record (this project's standard decomposition path for a design doc), rather than one large plan — they touch mostly-disjoint files (only C/E share `review-console.md`) and have independent acceptance criteria.
