# Record #1164 — Pipeline-Run Archival Residue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the git archival of records 355 and 951's pipeline-run work files on this branch, confirm record-345's spec is genuinely tracked upstream, and flatten the stray-run-dir sweep's double-nested archive residue in the main checkout.

**Architecture:** The spec's original diagnosis is stale — a stray-run-dir sweep (2026-08-22T12:06Z, `.claude-tweaks/sweep-stray-run-dirs.log`) already physically moved all three run dirs to `.claude-tweaks/pipelines/archive/`. What remains: (1) origin/main still tracks 355/951 at their **old, unarchived** paths, so the archival must land in git via this branch (mirroring commit `6250a11d`, PR #1196, which did exactly this for 345); (2) 345 needs only evidence, already gathered — `6250a11d` is reachable from origin/main and tracks `archive/2026-08-20T193632-record-345/work/345-spec.md`; (3) the sweep left 355/951's archive copies **double-nested** (`archive/{runId}/{runId}/…`), a git-ignored blind spot, plus a stray outer `decisions.md` fragment for 951 — flatten losslessly with plain filesystem ops (all affected files are git-ignored except `work/**`; no git commands against the main checkout).

**Tech Stack:** git (worktree only), node/fs (main-checkout filesystem ops — the worktree-isolation gate denies direct git/shell mutation of the shared checkout).

**Spec:** `.claude-tweaks/pipelines/2026-08-22T120144-record-1164/work/1164-spec.md` (worktree copy, commit `e8154396`)

## Global Constraints

- Never run `git` (any form: `-C`, `cd`, subprocess) against the main checkout `/Users/thomasholknielsen/Code Workspaces/claude-tweaks` — the isolation gate denies it and the state there is shared with sibling sessions. Read-only inspection via `node -e` + `child_process` is the sanctioned diagnostic path.
- Commit messages reference the record as `refs #1164` — never `closes`/`fixes`.
- Scope is records **355, 345, 951 only**. The main checkout's other residue (499/231/1011 deletions, `.claude-tweaks/.claude-tweaks/` shadow, 50-ahead/76-behind divergence of local main) belongs to other records (#1163/#1167 are Related) — record as ledger observations, do not touch.
- All worktree work happens in `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/dispatch-record-1164` — verify `pwd` and `git rev-parse --show-toplevel` resolve there before any commit.

---

### Task 1: Git-archive records 355 and 951 (worktree)

**Files:**
- Rename: `.claude-tweaks/pipelines/2026-08-20T193627-record-355/work/355-spec.md` → `.claude-tweaks/pipelines/archive/2026-08-20T193627-record-355/work/355-spec.md`
- Rename: `.claude-tweaks/pipelines/2026-08-20T204530-record-951/work/951-spec.md` → `.claude-tweaks/pipelines/archive/2026-08-20T204530-record-951/work/951-spec.md`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: two `R` (rename) index entries, one commit on `worktree-dispatch-record-1164`. Task 3 relies on these final archive paths matching the flattened physical layout in the main checkout.

- [ ] **Step 1: Verify the worktree and the tracked source paths**

Run (each as its own plain command; the isolation gate refuses compound forms):

```bash
pwd
git rev-parse --show-toplevel
git ls-files .claude-tweaks/pipelines/2026-08-20T193627-record-355/ .claude-tweaks/pipelines/2026-08-20T204530-record-951/
```

Expected: both `pwd` and toplevel = `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/dispatch-record-1164`; ls-files lists exactly the two old-path spec files. If either resolves to the main checkout, STOP.

- [ ] **Step 2: git mv both run dirs into the archive layout**

```bash
git mv ".claude-tweaks/pipelines/2026-08-20T193627-record-355" ".claude-tweaks/pipelines/archive/2026-08-20T193627-record-355"
git mv ".claude-tweaks/pipelines/2026-08-20T204530-record-951" ".claude-tweaks/pipelines/archive/2026-08-20T204530-record-951"
```

- [ ] **Step 3: Verify the staged set is exactly two renames**

```bash
git diff --cached --name-status
```

Expected: exactly two lines, each status `R100` with two path columns (old → new). Use `--name-status`, never `--name-only` (a rename collapses to one line there). Any other staged file: STOP and unstage it.

- [ ] **Step 4: Commit**

```bash
git commit -m "Archive record-355, record-951 pipeline run work files — refs #1164"
```

- [ ] **Step 5: Verify the commit landed and the paths moved**

```bash
git ls-files .claude-tweaks/pipelines/archive/2026-08-20T193627-record-355/ .claude-tweaks/pipelines/archive/2026-08-20T204530-record-951/
git ls-files .claude-tweaks/pipelines/2026-08-20T193627-record-355/ .claude-tweaks/pipelines/2026-08-20T204530-record-951/
```

Expected: first command lists the two archive-path spec files; second lists nothing.

### Task 2: Record 345 evidence + ledger observations (ops, inline)

**Files:**
- Modify: `docs/plans/2026-08-22-record-1164-ledger.md` (append rows)
- Append (via `log-decision.js`): `$PIPELINE_RUN_DIR/decisions.md`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: decisions.md AUTO entries and ledger observation rows read by the test gate and later pipeline phases.

- [ ] **Step 1: Re-verify the 345 evidence (read-only)**

```bash
git log --oneline -1 origin/main -- .claude-tweaks/pipelines/archive/2026-08-20T193632-record-345/work/345-spec.md
```

Expected: `6250a11d Archive spec-172, record-345, record-230 pipeline run work files (#1196)`. This satisfies the AC's "confirmed genuinely tracked somewhere reachable" branch — no fresh commit needed.

- [ ] **Step 2: Log the verdict to decisions.md**

`node "${CLAUDE_PLUGIN_ROOT}/bin/log-decision.js" --run "$PIPELINE_RUN_DIR" --status AUTO --section "/build" --step "Task 2 (345 evidence)" --text "record-345 resolved upstream: 6250a11d (PR #1196, reachable from origin/main) tracks archive/2026-08-20T193632-record-345/work/345-spec.md; no fresh commit needed" --reversibility "n/a"`

- [ ] **Step 3: Append ledger observations**

Append to `docs/plans/2026-08-22-record-1164-ledger.md`: one `observation` row for the 345 verdict, and one `observation` row noting the out-of-scope main-checkout residue left for related records (#1163/#1167): 499/231/1011 unstaged deletions, `.claude-tweaks/.claude-tweaks/` shadow dir, local-main 50-ahead/76-behind divergence.

### Task 3: Flatten the sweep's double-nested archive residue (ops, main checkout, filesystem only)

**Files (main checkout, all git-ignored except `work/**` which is untracked there until this branch merges):**
- Flatten: `.claude-tweaks/pipelines/archive/2026-08-20T193627-record-355/2026-08-20T193627-record-355/*` → up one level
- Flatten: `.claude-tweaks/pipelines/archive/2026-08-20T204530-record-951/2026-08-20T204530-record-951/*` → up one level, merging the outer 289-byte `decisions.md` fragment (a later `## /wrap-up` Section E entry) onto the inner 9,975-byte full log

**Interfaces:**
- Consumes: Task 1's final archive paths (physical layout must match what merges).
- Produces: canonical `archive/{runId}/…` physical layout in the main checkout, so post-merge git state and disk agree.

- [ ] **Step 1: Flatten via a node script (no git, `[ -e ]`-style explicit checks, no `mv -n`)**

Write and run a node script that, for each of the two runIds: verifies the nested dir exists; for each entry in the nested dir, refuses to overwrite an existing different file at the outer level (exception: `decisions.md` for 951 — read both, and if the outer content is not already a substring of the inner, concatenate inner + "\n" + outer as the flattened file); moves entries up with `fs.renameSync`; removes the empty nested dir with `fs.rmdirSync` (fails if non-empty — that failure is the guard). Print every action taken.

- [ ] **Step 2: Verify the flattened layout**

```bash
node -e "const fs=require('fs');for(const r of['2026-08-20T193627-record-355','2026-08-20T204530-record-951']){const d='/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude-tweaks/pipelines/archive/'+r;console.log(r, fs.readdirSync(d), 'nested-gone:', !fs.existsSync(d+'/'+r), 'spec:', fs.existsSync(d+'/work/'+r.split('-record-')[1]+'-spec.md'))}"
```

Expected: each dir lists `work`, `run-state.json`, `events.jsonl`, `config.yml`, `decisions.md` (+ `staged`, `engine-state.json` for 355), `nested-gone: true`, `spec: true`.

- [ ] **Step 3: Log to decisions.md**

`node "${CLAUDE_PLUGIN_ROOT}/bin/log-decision.js" --run "$PIPELINE_RUN_DIR" --status AUTO --section "/build" --step "Task 3 (flatten)" --text "flattened double-nested sweep archive copies for record-355 and record-951 in main checkout; merged 951's outer decisions.md fragment onto full inner log; filesystem ops only, no git against shared checkout" --reversibility "medium (physical moves within archive/, content preserved)"`

### Final verification (Common Step 5 input)

- `npm test` in the worktree (full suite — markdown/prose conformance suites pin repo-wide state).
- AC probe: `node plugin/bin/residue.js --base 67377db1 --integration-branch origin/main --scope blast-radius --no-suite` reports no pipeline-run findings for the three dirs (baseline already clean of them; must stay clean).
- `git ls-files` archive/old-path checks from Task 1 Step 5 hold.
