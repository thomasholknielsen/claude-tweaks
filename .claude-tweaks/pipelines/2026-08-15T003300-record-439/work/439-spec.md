---
record: 439
origin: capture
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
surface: backend
---
# 439: flow/materialize.md Sequence still scaffolds the whole run dir inside the worktree

Surface: backend

## Current State

`flow/materialize.md`'s "Sequence, in worktree mode" text (~line 144) instructs: "create `{run-dir}/work/` inside it [the worktree]" — literally scaffolding the run dir's location as if it were inside the worktree. This conflates two different things: `work/{n}-spec.md` is the documented tracked exception that correctly lives inside the worktree (it reaches the main checkout only via merge, per `_shared/pipeline-run-dir.md`'s Anchoring section), but the REST of `{run-dir}` — `decisions.md`, `config.yml`, `events.jsonl`, `staged/` — is gitignored and must be anchored to the main checkout's `.claude-tweaks/pipelines/` per that same Anchoring section, or it is permanently destroyed on worktree teardown with no git history to recover it.

This reproduces the exact hazard #421/#432 (merged 2026-08-14) shipped a fix for — but that fix's three touched sites (`_shared/pipeline-run-dir.md`'s resolution order + bash snippet, `flow/SKILL.md` Step 3, `flow/steps-and-gates.md`'s adoption cases) never reached `materialize.md`'s own scaffolding instructions. Live-reproduced during a #424 dispatch retry on 2026-08-14: a fresh `/flow #424 build,test` run (no `PIPELINE_RUN_DIR` handed in — a genuinely fresh run, not an adoption case) created its entire run dir, including `decisions.md`, inside `.claude/worktrees/dispatch-424-retry/.claude-tweaks/pipelines/{run-id}/` rather than the main checkout. The gitignored content was manually rescued before worktree teardown; without that rescue it would have been lost permanently, matching `[IL-46]`'s own prior incident shape.

Confirmed correct nearby: `materialize.md`'s own "Standalone fallback" branch (a few lines below the buggy Sequence text) already resolves `$RUN_ROOT` correctly per the Anchoring section and only materializes `work/{n}-spec.md` inside the worktree — proving the fix pattern already exists in the same file, just not applied to the primary (non-standalone, `/flow`-parented) path.

## Deliverables

- Correct `flow/materialize.md`'s "Sequence, in worktree mode" text (~line 144, the paragraph beginning "Sequence, in worktree mode (the default):") so it scaffolds `{run-dir}` at its properly anchored `$RUN_ROOT` path (per `_shared/pipeline-run-dir.md`'s Anchoring section) BEFORE creating `work/` — mirroring the wording already used correctly in the Standalone fallback paragraph a few lines below.
- Only `work/{n}-spec.md` (and its multi-spec `spec-{N}/work/` equivalent) is created inside the worktree, at the matching relative path under the worktree's own filesystem location — never the gitignored half of `{run-dir}` (`decisions.md`, `config.yml`, `events.jsonl`, `staged/`).
- Audit whether any other prose in `materialize.md` (or its three consumers: `build/SKILL.md` Common Step 1, `flow/SKILL.md` Step 4.2, `flow/multi-spec.md`'s shared-worktree pre-flight — all three cite this section rather than restating it) repeats the same "scaffold inside the worktree" framing and needs the same correction, since they cite this section's ordering rather than restate it.

## Acceptance Criteria

- `materialize.md`'s Sequence text no longer instructs scaffolding `{run-dir}` inside the worktree — grep for the corrected wording, output shown.
- A live or eval-transcript demonstration shows a fresh (non-adopted, no `PIPELINE_RUN_DIR` handed in) `/flow`/`/build` run creating its run dir's gitignored content (`decisions.md` at minimum) under the main checkout's `.claude-tweaks/pipelines/`, not under any worktree path — demonstrated, not asserted.
- `work/{n}-spec.md` still lands inside the worktree and is still git-tracked/committed on the feature branch, unchanged from today's correct behavior for that one file.
- No behavior change for the Standalone fallback branch (`/build #{n}` running standalone) — diff scoped to the Sequence text and, if the audit in Deliverables finds any, the affected consumer citations.

## Technical Approach

Docs-only edit to `flow/materialize.md`'s Sequence paragraph, reusing the wording pattern already correct in the same file's Standalone fallback paragraph. No hook, schema, or test-harness change expected — verify via `npm test` that existing prose-pinning tests (if any reference this section) still pass, and add/extend a live-repro test analogous to `tests/pipeline-run-dir-adoption-anchoring.test.js` (#421's own regression test) if none currently covers this specific non-adoption fresh-creation path.

## Gotchas

- Do not touch the Standalone fallback branch's own wording — it's already correct and is the reference pattern this fix reuses.
- `work/{n}-spec.md` staying inside the worktree is correct and must be preserved — the fix is about the REST of `{run-dir}`, not about moving the spec file too.
- This is a live-observed, reproduced defect (not a hypothetical) — the Acceptance Criteria's demonstration requirement should be straightforward to satisfy the same way #421's own fix was verified (`tests/pipeline-run-dir-adoption-anchoring.test.js`'s revert-and-rerun pattern), given the closely analogous prior fix.

## Original request

flow/materialize.md Sequence still scaffolds the whole run dir inside the worktree

**Related:** #421

Context: While retrying #424 in a live session (2026-08-14), a fresh /flow build,test run created its ENTIRE run dir (decisions.md, work/) inside the worktree path, not anchored to the main checkout -- reproducing the exact hazard #421/#432 fixed. #421 shipped fix only touched pipeline-run-dir.md, flow/SKILL.md Step 3, and flow/steps-and-gates.md adoption path -- it never touched materialize.md itself.

Scope: materialize.md Sequence text (line ~144) literally instructs to create {run-dir}/work/ inside the worktree -- conflating the tracked work/{n}-spec.md exception (correctly worktree-local) with the whole gitignored run-dir (decisions.md/config.yml/etc, which must anchor to the main checkout per pipeline-run-dir.md Anchoring section). Fix: scaffold {run-dir} at its properly anchored $RUN_ROOT path first, then create only work/ inside the worktree at the matching relative path, mirroring the standalone-fallback branch a few lines below which already gets this right.
