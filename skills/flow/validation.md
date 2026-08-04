# Pipeline Pre-flight Validation

Loaded by /flow Step 2 when performing pre-flight checks. Each substep returns OK / WARNING (continue with log entry) / BLOCKED (cannot proceed).

Run substeps 2.4, 2.5, 2.6, and 2.7 in order. Any hard fail or rejection stops the pipeline before the Config Manifesto runs.

> **Parallel execution (conditional):** 2.4's git tracked/clean check, 2.5's fetch + ahead-count, and 2.6/2.7's content scans of the plan file have no cross-dependency in the common all-pass path — none of 2.5-2.7 reads 2.4's outcome. When git strategy resolves to `worktree` (so 2.4 and 2.5 both apply), dispatch the four substeps' underlying reads as parallel tool calls, then evaluate pass/fail in the documented 2.4→2.7 priority order once all reads return. When git strategy resolves to `current-branch` (2.4 and 2.5 are skipped), run 2.6 and 2.7 sequentially — two reads are not worth parallelizing.

**Bookend note (hybrid mode):** Pre-flight stops at 2.4, 2.5 and 2.6 may surface in hybrid mode because their decisions have `reversibility: low` (worktree divergence persists, tangled-task risk persists) which fails the hybrid floor. These pre-flight stops are exempt from the "two stops" bookend count — they fire before the Manifesto and protect against starting a pipeline that would otherwise corrupt downstream state. See `_shared/auto-mode-contract.md` for the HARD-GATE exemption list.

## 2.4 — Spec-committed check

Gated to worktree strategy (same as 2.5). A worktree branches from the base commit and does **not** contain files uncommitted in the main working tree. If a target spec is untracked or has uncommitted changes, the worktree will not contain it — the build then has nothing to build (or builds a stale version). This is the most common cause of an "empty worktree." Skip this check when the git strategy resolves to `current-branch` (in-place runs see the working tree directly, so uncommitted specs are visible).

For each target spec, check tracked + clean:

```bash
git ls-files --error-unmatch specs/{N}-*.md  >/dev/null 2>&1 || echo "UNTRACKED: {N}"
git status --porcelain specs/ docs/specs/ 2>/dev/null   # any output = uncommitted spec/index/audit changes
```

If any target spec is untracked, **or** `specs/` (or the project's spec/INDEX path) has uncommitted changes → **hard fail (HARD-GATE)**:

- Surface the specific spec(s) and the dirty paths.
- Call `AskUserQuestion`:
  - `question`: `"Uncommitted spec changes were found before creating the worktree — how do you want to proceed?"`, `header`: `"Spec-committed check"`, `multiSelect`: `false`
  - Option 1 — `label`: `"Commit and proceed (Recommended)"`, `description`: `"Commit the specs to the base branch now, then continue"`
  - Option 2 — `label`: `"Cancel"`, `description`: `"Stop the pipeline; I'll commit manually"`
- The commit message names the specs (e.g. `Commit specs {N},{M} for pipeline run`). After committing, verify with `git log --oneline -1` per `_shared/git-discipline.md`, then continue.
- Under `auto`, automatically choose option 1 — specs are low-risk planning artifacts and committing them is the natural durable state (reversibility: high). Commit, then log:

```
AUTO {time} — Step 2.4: spec-committed check — committed {N} uncommitted spec/index file(s) to base before worktree creation. Reversibility: high.
```

This gate protects against *any* path to an uncommitted spec (a spec added by hand, a partial `/specify` run, a manual edit), not just specs produced by `/specify`. `/specify` Step 9 already commits its output; this is the defense-in-depth net for everything else.

## 2.5 — Merge check

Read the `merge-check` setting from `.claude-tweaks/policy.yml` (default: `true`). When enabled and worktree strategy resolves to `worktree`, compare against the **upstream of the current branch** (or the detected remote default), never a hardcoded `main`:

```bash
UPSTREAM=$(git rev-parse --abbrev-ref --symbolic-full-name @{upstream} 2>/dev/null) \
  || UPSTREAM="origin/$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's@^origin/@@')"
git fetch "${UPSTREAM%%/*}" "${UPSTREAM#*/}" 2>/dev/null
ahead=$(git rev-list --count "HEAD..$UPSTREAM" 2>/dev/null)
```

If `ahead > 0`, surface the divergence (`git log --oneline HEAD..$UPSTREAM | head -5`) and call `AskUserQuestion`:
- `question`: `"{UPSTREAM} is {N} commits ahead — how do you want to proceed?"`, `header`: `"Merge check"`, `multiSelect`: `false`
- Option 1 — `label`: `"Rebase first (Recommended)"`, `description`: `"Rebase onto {UPSTREAM} before continuing"`
- Option 2 — `label`: `"Continue anyway"`, `description`: `"Proceed as-is; add an ops ledger entry noting the divergence"`

In `auto` mode, automatically choose option 2 and add an `ops` ledger entry; also log:

```
AUTO {time} — Step 2.5: pre-flight merge-check — {UPSTREAM} is {N} ahead. Continued and added ops ledger entry. Reversibility: low (divergence persists).
```

> **Base ref:** `/flow` worktrees branch from the current local HEAD via `worktree.baseRef: "head"` (settings.json), and `/build` Common Step 1 verifies the resulting base after creation. See `skills/build/worktree-setup.md` ("Base ref" + Step 0/4) — the harness default `fresh` branches from a possibly-stale `origin/<default-branch>` and the plugin cannot override it through `EnterWorktree`.

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

- **Hard fail** → present the specific signal, then call `AskUserQuestion`:
  - `question`: `"{signal} was detected — how do you want to proceed?"`, `header`: `"Shape check"`, `multiSelect`: `false`
  - Option 1 — `label`: `"Tighten via /specify (Recommended)"`, `description`: `"Run /claude-tweaks:specify {plan-path} to decompose before continuing"`
  - Option 2 — `label`: `"Proceed anyway"`, `description`: `"Accept tangled-task risk and continue"`
  - Option 3 — `label`: `"Cancel"`, `description`: `"Stop the pipeline"`
  Under `auto`, choose option 2 and add an `ops` ledger entry naming the specific signal hit.
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
