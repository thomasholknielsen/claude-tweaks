---
record: 318
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
fingerprint: multispec-wrapup-phase1-2-no-batch-defer
surface: backend
---
# 318: flow: multi-spec wrap-up doesn't batch reflect/registry phases

Surface: backend

## Current State

Multi-spec `/flow` runs already defer one per-spec ceremony step to a single batch-scoped pass: `MULTISPEC_REVIEW_DEFER=1` (exported by `/flow`'s multi-spec orchestration — `skills/flow/multi-spec.md`'s per-spec env-var table) signals `/wrap-up`'s Phase 4 ("Wrap-Up Review Console", `skills/wrap-up/SKILL.md` line 245) to skip the per-spec Review Console entirely. The actual consolidated pass runs once, after every spec's pipeline reaches Phase 4 execution (or the run aborts at a HARD-GATE), documented end-to-end in `skills/flow/multispec-review-console.md` — it reads every `spec-{N}/decisions.md` + `spec-{N}/staged/` (plus the parent run dir's own), invokes `bin/wrap-up-engine.js render --section console` once with one `--spec-state {id}={path}` flag per spec to aggregate the five engine-rendered curation sections, and presents one `AskUserQuestion` approval gate for the whole run.

Phase 1 (`ESTABLISH`, `skills/wrap-up/SKILL.md` lines 43-153) and Phase 2 (`ROUTE`, lines 156-196) have no equivalent gate. Phase 1's "Reflect" step (lines 127-137) invokes `/claude-tweaks:reflect` in full or light mode **unconditionally, once per spec** — narrative lenses (Surprises, Approach), the tradeoff review, and insight routing all re-run per spec even when every spec in the batch touches the same skill file and the same conventions. Phase 2's "Run the engine" step (lines 179-196, mechanics in `skills/wrap-up/curation-engine.md`) runs the full `plan` → per-open-row `record` → `render --section trace` sequence against each spec's own `$PIPELINE_RUN_DIR` (`spec-{N}/`) and its own `--base $BASE_SHA`, independently, once per spec — the 8-row registry (Skills, Docs, Journeys, CLAUDE.md & rules, Decision records, Broken references, Memory, Upstream feedback) is evaluated fresh for every spec in the batch.

A live 3-spec sequential batch on one shared worktree (three leaves of one design doc, mostly editing the same skill file) produced substantially redundant analysis under this gap: the same skill file and the same conventions were re-examined by both the reflect narrative lenses and the registry judges three separate times.

## Deliverables

- [ ] A new multi-spec env var (or pair) — `MULTISPEC_REFLECT_DEFER` and `MULTISPEC_REGISTRY_DEFER`, or a single flag covering both — added to `skills/flow/multi-spec.md`'s per-spec env-var table (the table currently listing `PIPELINE_RUN_DIR`, `MULTISPEC_REVIEW_DEFER`, `MULTISPEC_PARENT_DIR`, `MULTISPEC_KEEP_GOING`, `MULTISPEC_SHARED_WORKTREE`), exported by `/flow`'s multi-spec orchestration under the same condition `MULTISPEC_REVIEW_DEFER` is set (multi-spec run, `auto`/`hybrid` mode).
- [ ] A gate in `skills/wrap-up/SKILL.md`'s Phase 1 "Reflect" step: when the new flag is set, skip the per-spec `/claude-tweaks:reflect` invocation entirely (deferred, not skipped) and proceed to Phase 2 — mirroring how Phase 4's Review Console step already reads `MULTISPEC_REVIEW_DEFER`.
- [ ] A gate in `skills/wrap-up/SKILL.md`'s Phase 2 "Run the engine" step: when the new flag is set, skip the per-spec `plan`/`record`/`render` sequence entirely (deferred, not skipped).
- [ ] A batch-scope pass, triggered at the same point `multispec-review-console.md`'s "When to run the consolidated console" already triggers (after every spec's pipeline reaches Phase 4, or the run aborts), that runs `/claude-tweaks:reflect` once against the full multi-spec diff (every spec's changed files, seed context aggregated across every spec's review summary) and the registry engine's `plan`/`record`/`render` sequence once against the parent run dir, before the consolidated Review Console renders.
- [ ] The batch-scope reflect insights and registry findings feed the same single consolidated Review Console `multispec-review-console.md` already renders — no second approval gate. Documented either as a new section in `multispec-review-console.md` or a new sibling file it references, following that file's existing structure (run-directory layout, numbering rules, hard requirements).
- [ ] `skills/flow/multi-spec.md`'s "Run directory layout" section and `manifest.yml` schema updated if the batch pass needs its own state file at the parent run dir level (e.g. an `engine-state.json` and reflect output scoped to the parent, alongside the existing per-spec ones).

## Acceptance Criteria

1. In a multi-spec `auto`/`hybrid` run with the new flag set, no per-spec `/claude-tweaks:reflect` invocation occurs during any spec's Phase 1 — verified by the absence of a per-spec reflect insight set or ledger write scoped to `spec-{N}/` for the reflect step specifically.
2. In the same run, no per-spec registry `plan`/`record`/`render` sequence occurs during any spec's Phase 2 — verified by the absence of a per-spec `engine-state.json` at `spec-{N}/engine-state.json`.
3. After the final spec's pipeline reaches Phase 4 (or the run aborts at a HARD-GATE), exactly one reflect pass runs, scoped to the union of every spec's changed files in the batch, and exactly one registry `plan`/`record`/`render` sequence runs against the parent run dir.
4. The batch-scope reflect insights and registry findings appear in the single consolidated Review Console `multispec-review-console.md` renders — no second `AskUserQuestion` approval gate is introduced for this run.
5. A single-spec `/flow` run (no multi-spec orchestration) is unaffected: the new flag is never set, and Phase 1's reflect step and Phase 2's registry engine both run per-run exactly as they do today.
6. A multi-spec run in `interactive` mode (auto opted out) is unaffected: per-spec reflect and registry curation run inline as today, matching how `interactive` mode already opts out of `MULTISPEC_REVIEW_DEFER`'s per-spec console skip.
7. If the run aborts early (one spec hits a HARD-GATE, default failure handling — no `keep-going`), the batch-scope pass still runs against whatever specs completed, mirroring how the consolidated Review Console already renders on partial completion with a Not-run footer.

## Technical Approach

Mirror `MULTISPEC_REVIEW_DEFER`'s existing shape exactly, rather than designing a new mechanism:

- **Export site:** `skills/flow/multi-spec.md`'s "Execution" section, the per-spec env-var table (lines 145-155) — add the new flag(s) as additional rows alongside `MULTISPEC_REVIEW_DEFER`, same condition (multi-spec run, `auto`/`hybrid` mode).
- **Gate sites:** `skills/wrap-up/SKILL.md`'s Phase 1 "Reflect" subsection (lines 127-137) and Phase 2 "Run the engine" subsection (lines 179-196) each need a short "when `MULTISPEC_REFLECT_DEFER=1`/`MULTISPEC_REGISTRY_DEFER=1` is set, skip this step — the batch-scope pass at end-of-run handles it" clause, worded the same way Phase 4's existing "Multi-spec defer" note is worded (line 245: "when `MULTISPEC_REVIEW_DEFER=1` is set by `/flow` multi-spec orchestration, skip the per-spec console").
- **Batch-scope pass site:** `skills/flow/multispec-review-console.md`'s "When to run the consolidated console" procedure (currently 6 numbered steps) is the natural home for triggering the batch reflect/registry pass, since it already fires at the correct point (after every spec reaches Phase 4 or aborts) and already resolves the parent run directory (`MULTISPEC_PARENT_DIR`). Whether the batch pass's own steps live inline in that file or in a new sibling file it references is an implementation decision for the build step — follow whichever keeps `multispec-review-console.md` under its own size discipline (the file is already ~330 lines).
- **Reflect's scope input:** the per-spec reflect call already takes a "Scope — files changed during this work" parameter (SKILL.md line 130). The batch call passes the union of every spec's changed files instead of one spec's — the same generalization `multispec-review-console.md`'s own engine call already applies to `--base $BASE_SHA` scoping when it aggregates per-spec `engine-state.json` files.
- **Registry's `--base`:** the per-spec engine `plan` call takes `--base "$BASE_SHA"` (`curation-engine.md` line 26), scoped to that spec's own diff. A batch-scope registry pass needs `--base` set to the pre-batch baseline (before spec 1 started) rather than any single spec's base, so the diff scope covers the whole batch — analogous to how the shared worktree in `multi-spec.md` accumulates every spec's commits on one branch before the branch is finished once at the end.
- **Single flag vs. pair:** the issue names both as acceptable. Given Phase 1 always precedes Phase 2 within the same wrap-up run, and both defer to the identical trigger point (end-of-run, same batch scope), a single flag covering both is the simpler default absent a demonstrated need to defer one without the other — but this is a judgment call for the build step, not fixed here.

## Gotchas

- `MULTISPEC_REVIEW_DEFER`'s existing gate lives in exactly one place (`wrap-up/SKILL.md` line 245) with the actual consolidation procedure fully documented in a separate file (`multispec-review-console.md`). Follow the same split for the new flag(s): a one-line gate check in `wrap-up/SKILL.md`, full batch-pass mechanics in the flow-side file — do not inline the batch procedure into `wrap-up/SKILL.md` itself.
- The registry engine's `record` call rejects a second payload for the same `rowId` (`curation-engine.md` line 51, "a row may be recorded once"). A batch-scope registry pass must use a fresh `$PIPELINE_RUN_DIR` (the parent run dir, not any `spec-{N}/`) so its own `engine-state.json` and row records don't collide with — or get silently skipped by — any per-spec engine state left over from before this feature (e.g. a partially-run multi-spec batch that predates the new flag).
- Ordering inside Phase 2 is load-bearing: Memory and Upstream feedback rows are judged last, after every earlier row is recorded, because their input is "learnings no earlier row claimed" (`curation-engine.md` line 53, `SKILL.md` line 194). A batch-scope registry pass must preserve this ordering across the aggregated signal set, not just replay per-spec ordering independently.
- `multispec-review-console.md`'s "Numbering rules" section (line 48-52) defines a strict canonical render order and separate `Q#`/`M#`/`U#` sequences that must never restart per spec or per section. If the batch reflect/registry pass's own findings need to appear in the same consolidated console (Deliverable 5 above), they must be numbered into the existing single global sequence, not given a parallel one.
- The empty-console fast path (`multispec-review-console.md` "Empty-console fast path") currently checks per-spec `decisions.md`/`staged/` plus the parent's own. If the batch pass writes its findings to the parent run dir's `decisions.md`/`staged/` (the natural home, since it's not scoped to any one spec), that check already covers it without modification — but this should be verified during implementation, not assumed.

## Original request

flow: multi-spec wrap-up doesn't batch reflect/registry phases

**Summary:** Multi-spec `/flow` runs batch the Review Console (Phase 4, via `MULTISPEC_REVIEW_DEFER`) across specs on a shared branch, but Phases 1 (reflect) and 2 (registry curation) have no equivalent — each spec still runs its own full-mode reflect and its own registry pass.

**Kind:** Gap

**Affected component:** `/claude-tweaks:flow` multi-spec wrap-up orchestration (`multispec-review-console.md`, `wrap-up/SKILL.md` Phases 1-2)

**Use case:** In a 3-spec sequential batch (three leaves of one design doc, on a shared worktree/branch, mostly editing the same skill file), running full-mode reflect and the 8-row registry curation pass independently for each spec produced substantially redundant analysis — the same skill file, the same conventions, re-examined three times. `MULTISPEC_REVIEW_DEFER` already establishes the pattern of deferring a per-spec ceremony step to one batch-scoped pass at the end; Phases 1-2 have no matching flag.

Suggestion: a `MULTISPEC_REFLECT_DEFER` / `MULTISPEC_REGISTRY_DEFER` pair (or a single flag covering both) that runs reflect and registry curation once at batch scope — covering the full multi-spec diff — instead of once per spec, for shared-worktree multi-spec runs.

**Plugin version:** 6.74.0

---
Filed via /claude-tweaks:feedback.
<!-- fingerprint: multispec-wrapup-phase1-2-no-batch-defer -->

