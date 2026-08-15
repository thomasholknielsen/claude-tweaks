# Plan: Batch reflect + registry curation across a multi-spec run (#318)

## For agentic workers

Executed via `/claude-tweaks:build` (subagent strategy). Documentation/skill-file changes only — no runtime code. Single task, four files.

## Context

`MULTISPEC_REVIEW_DEFER=1` already defers `/wrap-up`'s Phase 4 (Review Console) to one consolidated pass at end-of-run (`skills/flow/multispec-review-console.md`). Phases 1 (Reflect) and 2 (Run the engine / registry curation) have no equivalent — each spec in a multi-spec batch runs its own full reflect pass and its own 8-row registry curation pass, even when specs share a worktree and touch the same files/conventions repeatedly.

## Design decisions (per the spec's own "judgment call for the build step" notes)

- **Single flag, not a pair**: `MULTISPEC_CURATION_DEFER=1`, gating both Phase 1 and Phase 2. Both phases defer to the identical trigger point (end-of-run) and the identical batch scope — no demonstrated need to split them (spec's Technical Approach recommends this default).
- **New sibling file**: `skills/flow/multispec-batch-curation.md` holds the batch-scope procedure — `multispec-review-console.md` is already ~330 lines (spec's own size-discipline note).
- **Batch registry state lives at the parent run dir root** (`{parent}/engine-state.json`, `{parent}/decisions.md`, `{parent}/staged/` — the parent dir already exists and already holds Manifesto-created `decisions.md`/`staged/`), not inside any `spec-{N}/` — avoids the `record` command's one-payload-per-rowId collision the spec's Gotchas warns about.
- **Batch registry `--base`**: the pre-batch baseline (the shared worktree's starting commit, before spec 1's materialize commit) — resolved the same way `multi-spec.md`'s shared-worktree creation captures `EXPECTED_BASE`.

## Task 1: Wire the new flag and both defer gates, document the batch procedure

**Files:**
- `skills/flow/multi-spec.md` (modify) — add `MULTISPEC_CURATION_DEFER` to the per-spec env-var table (~line 150)
- `skills/wrap-up/SKILL.md` (modify) — add a "Multi-spec defer" clause to Phase 1's Reflect subsection (~line 137) and Phase 2's Run the engine subsection (~line 196), mirroring Phase 4's existing wording (~line 245)
- `skills/flow/multispec-batch-curation.md` (create) — full batch-scope reflect + registry procedure: trigger point (mirrors `multispec-review-console.md`'s "When to run the consolidated console"), reflect invocation (scope = union of every completed spec's changed files, seed context = aggregated Key Learnings from every spec's review summary), registry invocation (`plan`/`record`/`render` against the parent run dir, `--base` = pre-batch baseline, six signals classified once over the batch reflect's insight set, Memory/Upstream judged last), and how its findings feed the existing consolidated console's single global numbering sequence
- `skills/flow/multispec-review-console.md` (modify) — step 3's engine call gains one additional `--spec-state` flag for the parent's own batch-scope `engine-state.json` (id `batch`) when `multispec-batch-curation.md`'s pass ran, so its findings render inside the same five engine-fed sections instead of a separate block; cross-reference the new file at the trigger point

**Acceptance criteria (from the spec, mapped to this design):**
1. AC1 (no per-spec reflect when flag set) — satisfied by `wrap-up/SKILL.md`'s Phase 1 gate.
2. AC2 (no per-spec `spec-{N}/engine-state.json` when flag set) — satisfied by Phase 2's gate.
3. AC3 (exactly one batch-scope reflect + registry pass after the final spec) — satisfied by `multispec-batch-curation.md`'s trigger point matching `multispec-review-console.md`'s existing trigger.
4. AC4 (batch findings in the single consolidated console, no second approval gate) — satisfied by the `--spec-state batch=...` addition to the existing engine call; no new `AskUserQuestion`.
5. AC5 (single-spec run unaffected) — satisfied structurally: the flag is only ever set by multi-spec orchestration (mirrors `MULTISPEC_REVIEW_DEFER`'s own condition), so a single-spec run never sets it and both gates read as unset → run per-run as today.
6. AC6 (interactive mode unaffected) — satisfied structurally: the flag is set under the same "auto/hybrid mode" condition as `MULTISPEC_REVIEW_DEFER`, per the env-var table's stated export condition.
7. AC7 (partial/aborted run still gets the batch pass) — satisfied: `multispec-batch-curation.md`'s trigger explicitly fires "after every spec's pipeline reaches Phase 4 execution (or the run aborts at a HARD-GATE)", matching `multispec-review-console.md`'s own existing partial-completion behavior.

**Verification:** No executable code changed — this is process/skill documentation. `npm test` (regression check only — `tests/wrap-up-registry-pin.test.js` and any skill-structure/bloat checks must stay green). Manual check: re-read all four edited/created files for internal consistency (flag name matches across all four files; the new file's trigger condition matches `multispec-review-console.md`'s wording; the numbering-rules section in `multispec-review-console.md` is not contradicted).
