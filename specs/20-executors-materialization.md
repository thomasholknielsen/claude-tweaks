---
tier: 1
status: complete
progress: 100
blocked-by: [17]
surface: backend
---

# 20: Executors — /flow, /build, /wrap-up on materialized records

## Overview

The executors consume records instead of spec files, with **one new step and zero changes below it**: at build start, materialize the record into `{run-dir}/work/{n}-spec.md` (issue body + generated header: id, origin, grants held at dispatch time — or a copy of the local-files record). `/superpowers:writing-plans`, task execution, verification, and review all consume the materialized file exactly as they consumed a spec. `/flow` and `/build` accept `#N` (and `#A,#B` multi-record) as their primary input; close-via-merge (`Fixes #N`) is unchanged; `/wrap-up` swaps its `recon-*`-frontmatter bookkeeping for the materialized header, renames its label ops to `bot:*`, and routes leftovers to new records.

**Complexity:** High
**Estimated tasks:** 8

## Non-Goals

- No dispatch logic (spec 19) — manual `/flow #N`/`/build #N` still never claims (interactive single-human path, unchanged non-consumer stance in `_shared/issue-claims.md`).
- No changes to worktree setup, plan audit, verification, QA, review routing — everything below the materialization line.
- INDEX.md updates stop, but file deletion is migration's job.
- The Review Console mechanism itself is unchanged (only dispatch's consolidated variant died — spec 19).

## Current State

- `skills/flow/SKILL.md` — accepts spec numbers or `#{issue}` (issue mode calls `/specify #{issue}` to derive a spec first); Step 2.4 hard-gates on committed spec files; Step 2.6 shape gate; Step 2.7 design-doc rejection; multi-spec mode (`flow 42,45` → `multi-spec.md`, shared worktree).
- `skills/build/SKILL.md` + sub-files — takes a spec number; reads spec frontmatter for effort-based model tier (`code-health-effort`), design wrapper reads `surface:`/`design-intent:`.
- `skills/wrap-up/SKILL.md` + `cleanup-procedures.md` — Section E claim release reads `recon-issue`/`CLAIM_RUN_ID`; close-via-merge carrier commit reads `recon-issue` frontmatter; removes `status:in-progress`; leftover routing writes `specs/backlog/` entries; Review Console consolidation.
- `skills/flow/steps-and-gates.md`, `worktree-merge.md`, `multi-spec.md`, `failure-cards.md` — spec-number vocabulary throughout.

## Deliverables

- [ ] **Materialization step** (new, shared): resolve the record (`gh issue view {n} --json title,body,labels,url` or `local-store.js` read), verify spec shape (hard gate — an unshaped body stops with "run `/specify #{n}` first"; this replaces Step 2.4's committed-file gate and Step 2.7's design-doc rejection at the record level), write `{run-dir}/work/{n}-spec.md` with a generated header block (record id, origin, risk/effort, grants at materialization time, fingerprint) + the body verbatim. Everything downstream reads this file.
- [ ] `/flow`: input = `#N` / `#A,#B` (multi-record = shared worktree via existing `multi-spec.md` mechanics keyed by record ids); the issue-mode `/specify` derivation call is deleted (records arrive pre-shaped); numeric spec-file inputs accepted as a legacy alias only while `specs/*.md` files exist (one-line compat note).
- [ ] `/build`: same materialization; effort-based model tier reads `effort:*` from the materialized header (replacing `code-health-effort` frontmatter); design wrapper reads `surface`/`design-intent` from the header (spec 17 records them as body-metadata lines that materialization lifts into the header).
- [ ] `/wrap-up`: close-via-merge carrier reads the record id from the materialized header (replacing `recon-issue` frontmatter); Section E claim release unchanged in mechanics (ownership check via `CLAIM_RUN_ID`), label ops renamed `bot:*`; the `recon-was-parked` restore-on-release rule re-expressed: release-with-abandon restores `parked` if the header says the record was parked at shaping time.
- [ ] `/wrap-up` leftover routing: residue sections become new records via `recordPayload` (`by:capture` origin? No — origin = the skill that files: use `by:capture` only for /capture; leftovers carry no `by:*` and a body line `Origin: wrap-up leftover from #{n}`), parked when a trigger exists; staged-not-written in auto mode exactly as today.
- [ ] Sweep `flow/steps-and-gates.md`, `worktree-merge.md`, `multi-spec.md`, `failure-cards.md`, `build/*.md` sub-files for spec-number vocabulary → record references; `close-via-merge` cross-references intact.
- [ ] Completion semantics: on merge, the record closes via `Fixes #N` (reason completed); the materialized file stays in the archived run dir (audit snapshot — "the spec as built").

## Acceptance Criteria

1. `grep -rn "recon-issue\|recon-fingerprint\|recon-was-parked\|code-health-effort" skills/flow/ skills/build/ skills/wrap-up/` returns 0 matches (single migration notes excepted).
2. `/flow`'s input section documents `#N` and `#A,#B`; the internal `/specify` derivation call is gone (`grep -n "specify #{issue}\|specify \"#" skills/flow/SKILL.md` → 0 workflow matches).
3. The materialization step exists once as shared prose (not duplicated per skill), writes `{run-dir}/work/{n}-spec.md`, and its unshaped-body hard gate names `/specify #{n}` as the remedy.
4. `grep -rn "status:in-progress\|status:blocked" skills/flow/ skills/build/ skills/wrap-up/` → 0 matches (migration notes excepted); `bot:in-progress` removal appears in wrap-up's release step.
5. Leftover routing files records (github driver) or `local-store.js` entries — `grep -n "specs/backlog" skills/wrap-up/leftover-routing.md` → 0 matches outside a legacy note.
6. `npm test` passes.

## Technical Approach

Materialization is one shared sub-file (home it at `skills/flow/materialize.md`, referenced by `/flow` and `/build`) so the gate/header format has a single definition. Header format — pinned, not "YAML-ish": a literal `---`-delimited frontmatter block reusing the retired spec-template's key spellings (`record: {n}`, `origin:`, `risk:`, `effort:`, `grants: [build, merge]`, `fingerprint:`, `surface:`, `design-intent:`, `parked-at-shaping: true|absent`), followed by the record body verbatim. `surface`/`design-intent` values are lifted from the body's `Surface:`/`Design-intent:` metadata lines (the wire format spec 17 commits to). Downstream consumers read the block exactly as they read spec frontmatter today, minimizing their diffs; `materialize.md` is the single place the key list may ever change. Multi-record `/flow #A,#B` maps each record to its own materialized file in the same run dir; `multi-spec.md`'s per-spec subdirectory layout keys by record id.

## Gotchas

- **Grants snapshot at materialization** — the header records grants *as held at dispatch time*; a mid-run revocation doesn't retro-stop a run (TTL/claim semantics govern that), but wrap-up's auto-merge check re-reads live labels (truth, not projection) before any merge.
- The wrap-up carrier-commit path for runs that never had a record (pure-local work) must survive — guard the close-via-merge steps on "materialized header present."
- `/build`'s interactive no-claim stance stays; don't add claiming to manual paths.
- Materialized files live under the run dir, which is committed as audit trail — never gitignore them.
- Cross-file promise check: every field the header carries must have a named reader (effort → model tier; surface/design-intent → design wrapper; id → close-via-merge; parked-at-shaping → release restore). No write-only fields.

## Key Files

- `skills/flow/SKILL.md`, `skills/flow/materialize.md` (new), `skills/flow/{multi-spec,steps-and-gates,worktree-merge,failure-cards}.md`
- `skills/build/SKILL.md` + sub-files reading frontmatter
- `skills/wrap-up/SKILL.md`, `skills/wrap-up/{cleanup-procedures,leftover-routing,review-console}.md`
