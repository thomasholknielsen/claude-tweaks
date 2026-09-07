# Worktree-policy markers (#1993) — implementation plan

**Record:** #1993 — fence `_shared/worktree-setup.md` and `build/worktree-setup.md` by `worktree-policy`; `build/SKILL.md` composes a `worktree-setup` bundle once.
**Run:** multi-spec `/flow` run `2026-09-06T110420-spec-1988-…-1997`, shared worktree, PR #1998. Spec start HEAD: `9d1883347` (materialize).

## Survey result (before planning — ledger row 13's guidance)

A read-only survey classified every span of both files against `worktree-policy=always` / `optional`:

| File | always-only | optional-only | unconditional |
|---|---|---|---|
| `plugin/skills/_shared/worktree-setup.md` (16,671 B) | 0 B | 0 B | all |
| `plugin/skills/build/worktree-setup.md` (20,032 B) | 0 B | 0 B | all |

Every scenario difference in these files is by **mode** (`worktree` vs `current-branch`), by **mechanism** (`EnterWorktree` vs `git worktree add`, which is a cwd/tool question), or by **auto vs interactive** (the consent section — the `mode` axis, and its two sentences do not cover `hybrid`, so fencing them would leave a hybrid reader with no consent instruction). The policy key appears in two mid-sentence clauses (`_shared` line 41, `build` line 148) inside otherwise unconditional paragraphs — not extractable as marker lines. Every `## ` heading in the shared file is cited by name from 27 skill files and `docs/skill-graph.md:96`.

## Rulings

1. **No fences.** Deliverables 1–4 and 6–7 have nothing to attach to; staged as an Update-the-spec deviation (`build-deviation-1`). Cost if wrong: fences on a later record once real branch prose exists.
2. **The call-site switch ships as specified** (Deliverable 5): `build/SKILL.md` Common Step 1 composes `worktree-setup` from `_shared/worktree-setup.md` then `build/worktree-setup.md` and reads `{run}/context/worktree-setup.md`, with the verbatim fallback sentence. The record states its rationale independently of fencing ("one bundle read instead of two file reads"). Hazard, recorded in the flow ledger: with zero fences the bundle is a 36.7 KB concatenation with ~4 KB of headroom under the composed gate, so it couples the two files' growth budgets — the first ~4 KB added to either file fails the gate at this call site. Cost if wrong: one sentence reverted.
3. **Tests are not retargeted** (Deliverable 8): every citing suite reads the raw file and no line changes.
4. **AC4** (re-read count over the next ten sessions) is a measurement commitment in the PR description, per the record's own Gotcha.

## Tasks

### Task 1 — call site (implementer)
- `plugin/skills/build/SKILL.md:166`: replace the "read `worktree-setup.md` in this skill's directory" sentence with a compose sentence, one physical line: `node "${CLAUDE_PLUGIN_ROOT}/bin/compose-context.js" --run "$PIPELINE_RUN_DIR" --step worktree-setup "${CLAUDE_PLUGIN_ROOT}/skills/_shared/worktree-setup.md" "${CLAUDE_PLUGIN_ROOT}/skills/build/worktree-setup.md"`, then read `$PIPELINE_RUN_DIR/context/worktree-setup.md`; keep the parenthetical listing what the procedure covers; end with the verbatim fallback sentence `if the compose command is unavailable or exits non-zero, read the named source files directly.`. Note the run directory: Common Step 1 runs before Spec Step 1's materialize, but `$PIPELINE_RUN_DIR` is set by then on every path (a parent `/flow` exports it; a standalone `/build` mints it per `_shared/pipeline-run-dir.md` before Common Step 1 — verify by reading `build/SKILL.md`'s earlier steps and quote the line; if a standalone `/build` has no run dir at Common Step 1, say so and keep the fallback as the path).
- Proofs: `wc -c plugin/skills/build/SKILL.md` (< 40,960); `composedBytesReport('plugin')` rows for `worktree-setup` (expect one combination — marker-free sources — at ~36.8 KB) and `overComposedCeiling` `[]`; `node --test tests/bin-lib/skill-audit/context-cost.test.js tests/skill-prose-plugin-root-invocations.test.js tests/compose-markers-conformance.test.js` plus every suite `grep -rl 'worktree-setup\|build/SKILL' tests` names; a real CLI composition into a scratch run dir with the header line and byte count quoted.
- Commit: `refs #1993`, session trailer.

### Task 2 — docs and bookkeeping (controller)
- `docs/skill-graph.md:96` (`_shared/worktree-setup.md` row): composed-read clause naming `build/SKILL.md` Common Step 1 and that every other citer reads the file as-is.
- `docs/plugin-structure.md`: build row / worktree-setup sub-file line clause.
- `docs/journeys/compose-a-per-run-context-bundle-1988.md`: step 9 (a bundle with zero fences — what it buys, what it costs).
- Flow ledger row 20 (premise false, hazard, trigger #1997).
- Staged `build-deviation-1`; PR body section; verdict comment section at review.

### Task 3 — whole-branch review (opus), then review phase.
