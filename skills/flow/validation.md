# Pipeline Pre-flight Validation

Loaded by /flow Step 2 when performing pre-flight checks. Each substep returns OK / WARNING (continue with log entry) / BLOCKED (cannot proceed).

Run substeps 2.5, 2.6, and 2.7 in order. Any hard fail or rejection stops the pipeline before the Config Manifesto runs.

## 2.5 — Merge check

Read the `Pre-flight / merge-check` CLAUDE.md setting (default: `true`). When enabled and worktree strategy resolves to `worktree`:

```bash
git fetch origin main 2>/dev/null
ahead=$(git rev-list --count HEAD..origin/main 2>/dev/null)
```

If `ahead > 0`, surface the divergence (`git log --oneline HEAD..origin/main | head -5`) and offer: (1) Rebase first **(Recommended)**, (2) Continue and acknowledge in ledger. In `auto` mode, automatically choose option 2 and add an `ops` ledger entry; also log:

```
AUTO {time} — Step 2.5: pre-flight merge-check — main is {N} ahead. Continued and added ops ledger entry. Reversibility: low (divergence persists).
```

## 2.6 — Shape check (structural coupling)

Replaces the previous size-based scope check. Plan size (line count, file count, task count) is **not** a stop signal — a clean 50-task spec is mechanically simpler than a tangled 5-task spec. What matters is structural coupling between tasks. Apply these structural signals before starting:

**Hard fails** (block the pipeline; surface to user):

| Signal | Detection | Why it blocks |
|---|---|---|
| Cross-task dependency chains > 3 deep | Trace `depends-on:` / "after Task N" / "uses Task N output" references | Tasks aren't independently executable; subagent-driven execution requires loose coupling |
| Task references files outside its declared "Files:" block | For each task, compare in-task file mentions against its declared file list | Spec leaks scope — tasks will collide on files the plan didn't anticipate |
| A single task touches > 5 files | Count files in each task's "Files:" block | Task is itself too large; should be sub-decomposed before dispatch |
| Plan has no "Files:" or "Tasks:" structure at all | Look for canonical headings | Input is a design doc, not an executable spec — see Step 2.7 |

**Soft warnings** (proceed by default; note in ledger):

| Signal | Threshold | Note added to ledger |
|---|---|---|
| Task count > 30 | Count `^### Task \d` / `^## Task \d` headings | "Large dispatch count: {N} subagents — may benefit from `/specify` split if review fails" |
| Plan describes a major version bump | Scan for `v{N}.0.0` or `vMAJOR` in the design context | "Major version bump — review will scrutinize backward-compat implications" |

**Behavior:**

- **Hard fail** → present the specific signal, recommend `/claude-tweaks:specify {plan-path}` to tighten, offer (1) tighten via /specify **(Recommended)**, (2) proceed anyway and accept tangled-task risk, (3) cancel. Under `auto`, choose option 2 and add an `ops` ledger entry naming the specific signal hit.
- **Soft warning** → proceed by default. Add an `ops` ledger entry with the warning text. Do NOT prompt the user. Under `auto` or in default mode, behavior is identical (silent proceed with ledger note).

**Anti-pattern:** Stopping the pipeline because the plan is "big." Size is not a coupling signal. See `_shared/auto-mode-contract.md` — the model is forbidden under `auto` from inserting size-driven reality-checks beyond what this step prescribes.

## 2.7 — Design-doc rejection (granularity contract)

A design doc is strategic (multi-phase, scopes the program); a spec is executional (agent-sized, /flow-runnable). `/flow` accepts specs only.

Detection: if the input is a design doc (filename matches `*-design.md` OR file contains `## Phase` / `## Phases` section headings OR file lacks both "Files:" and "Tasks:" canonical structure):
```
Input is a design doc, not a spec. /flow executes specs.

Decompose first:
  /claude-tweaks:specify {input-path}                — produces all phase specs
  /claude-tweaks:specify {input-path} phase-{N}      — produces specs for one phase
Then /flow on the produced specs:
  /claude-tweaks:flow {N},{M},{P}                    — sequential execution
```
Stop the pipeline with this message. **Do not** silently proceed — the design-mode escape hatch was the source of the wrong-granularity bug. Under `auto`, this rejection still fires (it's a hard validation failure, not a UX preference — see `_shared/auto-mode-contract.md`).
