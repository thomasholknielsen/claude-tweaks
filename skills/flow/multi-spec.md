# Multi-Spec Sequential Flow

When multiple spec numbers are provided (e.g., `42,45,48`), flow runs each spec's pipeline **sequentially** in one terminal.

## Validation

Before starting, validate the spec list:

1. **Parse** — split on commas, resolve each to a spec file
2. **Prerequisites** — check that each spec's `blocked-by` is satisfied. Reject any spec with unmet prerequisites.

> **Parallel execution:** Use parallel tool calls aggressively — frontmatter reads across N specs (step 3 below) are independent and should run concurrently.

3. **Frontmatter pre-flight** — for each spec, read frontmatter in one parallel pass and collect `depends-on:`, `Files:`, `surface:`, `design-intent:`. These feed the ordering check, conflict detection, and Pipeline Preview.
4. **Dependency-aware ordering** — see "Dependency-aware ordering" below. Topologically sort and reconcile with the user's order.
5. **Conflict detection** — see "Cross-spec conflict detection" below. Warn on overlapping `Files:` declarations.

## Dependency-aware ordering

Each spec's frontmatter may declare `depends-on:` listing prerequisite specs. The user's order on `$ARGUMENTS` (`/flow 157,159,160`) may not match the dependency graph.

### Procedure

1. **Build the DAG** — for each spec in the list, add edges from each `depends-on:` entry to the spec itself
2. **Detect cycles** — if any cycle exists across the listed specs, **hard fail**:
   ```
   Cycle detected in dependency graph:
     159 → depends-on: 160
     160 → depends-on: 159
   
   Resolve the circular dependency (edit spec frontmatter) before running /flow.
   ```
3. **Topologically sort** the specs
4. **Compare against user order:**
   - **Match** → proceed silently with the user's order
   - **Mismatch** (user order violates a `depends-on:` edge) → surface and offer:
     ```
     Spec order doesn't match dependencies:
       You requested: 159 → 160 → 157
       Topological:   157 → 159 → 160   (157 is depended-on by 159; 159 by 160)
     
     1. Use topological order (Recommended)
     2. Keep my order — I know what I'm doing
     3. Cancel
     ```
     In `auto` mode, **default to option 1** silently and log: `AUTO {time} — Step 1: re-ordered specs to match dependency graph. User order: 159,160,157. Topological: 157,159,160. Reversibility: high.`

### Specs with `depends-on:` to specs NOT in the run

If spec 159 depends on spec 142 (not in the run list), check spec 142's status:
- Status `complete` → fine, dependency satisfied
- Status `pending` or `in-progress` → hard fail with "spec 159 depends on spec 142 which is not complete and not in this run"

This matches existing `blocked-by:` semantics — the dependency check is the same regardless of whether the prerequisite is in-run or out-of-run.

## Cross-spec conflict detection

When two specs in the run declare overlapping `Files:` entries, sequential execution can compound (spec 159 builds on top of spec 157's changes, possibly conflicting with what spec 159's spec assumed) and parallel execution (when added later) would conflict outright.

### Procedure

1. Read each spec's `Files:` declarations from frontmatter and from the plan if one exists
2. For each pair of specs in the run, compute the file intersection
3. For pairs with non-empty intersection, record a **conflict warning**

### Presentation

Surface conflicts in the Pipeline Preview block as a dedicated footer line:

```
Conflicts: spec 157 ↔ spec 159 both modify src/auth/session.ts; spec 159 ↔ spec 160 both modify src/api/users.ts
```

This is a **warning, not a hard fail**. Sequential execution is usually fine — but the user deserves to know that spec 159's plan was written assuming `src/auth/session.ts` had its pre-157 shape, and after 157 runs, that file will look different.

If `auto` mode is set and conflicts are detected, the Manifesto still presents normally — the conflict footer just makes it visible before approval. No mid-flow re-prompt.

### Anti-patterns

| Anti-pattern | Why it fails |
|---|---|
| Treating any file overlap as a hard fail | Many specs legitimately touch the same file (e.g., adding new tests to the same test file). False positives would block real work. |
| Suppressing the warning when conflicts are detected | Conflict footer is the user's only signal that spec interdependencies exist. Silent compounding is the bug to avoid. |
| Auto-reordering specs to avoid conflicts | Conflicts are not the same as dependencies — re-ordering only helps if a `depends-on:` edge actually exists. Don't conflate the two. |

## Run directory layout

Multi-spec runs use a parent run directory with per-spec subdirectories so the consolidated end-of-run Review Console can read every spec's outputs:

```
.claude-tweaks/pipelines/{ISO-timestamp}-spec-{N1}-{N2}-{N3}/
├── config.yml          ← Manifesto answers (one for the whole run)
├── manifest.yml        ← Multi-spec metadata (spec IDs, order, statuses)
└── spec-{N}/           ← Per-spec subdirectory (one per spec)
    ├── decisions.md
    └── staged/
```

The parent dir uses a single `spec-` prefix at the start of the spec-slug segment so `find -name "*spec-${N}*"` reliably disambiguates spec IDs from timestamp digits.

`manifest.yml` lists the specs in execution order plus their status as the run progresses:

```yaml
multispec:
  parent: .claude-tweaks/pipelines/2026-05-16T143207-spec-157-159-160/
  specs:
    - id: 157
      status: complete    # pending | running | complete | failed | not-run
      subdir: spec-157/
    - id: 159
      status: complete
      subdir: spec-159/
    - id: 160
      status: complete
      subdir: spec-160/
```

## Execution

Run each spec's full pipeline in order (spec 42 → spec 45 → spec 48). Each spec completes its pipeline (build → test → review → wrap-up) before the next begins.

For each per-spec invocation, `/flow` exports four environment variables:

| Variable | Value | Purpose |
|---|---|---|
| `PIPELINE_RUN_DIR` | `{parent}/spec-{N}/` | Per-spec namespaced dir — skills write `decisions.md` and `staged/` items here |
| `MULTISPEC_REVIEW_DEFER` | `1` | Signals `/wrap-up` Step 8.6 to skip the per-spec console — the consolidated end-of-run console handles all approvals |
| `MULTISPEC_PARENT_DIR` | `{parent}/` | Pointer to the parent run dir — read by the consolidated console at end-of-run |
| `MULTISPEC_KEEP_GOING` | `1` (when `keep-going` arg set) | Signals per-spec pipelines to continue the multi-spec run after this spec's HARD-GATE failure |

If `worktree` is specified, each spec gets its own worktree via `/superpowers:using-git-worktrees`. The worktree is finished via `/superpowers:finishing-a-development-branch` before the next spec begins.

## Failure handling (default vs `keep-going`)

### Default — stop on first HARD-GATE

A gate failure in one spec stops the remaining specs. This is the compounding-risk default: spec N+1 may build on spec N's correctness, so continuing past a known failure is risky.

```
spec 157 — passed
spec 159 — FAILED at test (3 type errors)
spec 160 — not run (previous spec failed)
```

The consolidated Review Console still runs at the end with whatever was accumulated up to the failure. Specs 158-160 appear in the **Not run** footer with status `not-run` and reason `previous spec failed (159)`.

### `keep-going` — continue on failure

When the user passes `/flow 157,159,160 keep-going`, HARD-GATE failures in one spec **do not** stop subsequent specs. Each spec's pipeline runs to completion (or fails on its own gate); the consolidated console surfaces all outcomes together.

```
spec 157 — passed
spec 159 — FAILED at test (3 type errors) — continued anyway
spec 160 — passed
```

The consolidated Review Console's **Not run / Failed** footer distinguishes:

| Spec | Status | Reason |
|---|---|---|
| 159 | failed | test gate (3 type errors) — see `spec-159/decisions.md` for details |

This is **opt-in** for a reason: it inverts the compounding-risk safety. Use when:
- Specs are genuinely independent (no `depends-on:` edges between them)
- You want to see all failures together rather than fix-and-retry serially
- A batch of small refactors where one failing doesn't invalidate the others

Do NOT use `keep-going` when specs have `depends-on:` relationships — the failed spec's downstream may compound the bug. The frontmatter dependency check (above) does not auto-disable `keep-going`, but a warning surfaces in the Pipeline Preview footer:

```
keep-going + dependencies: spec 159 depends on 157 — if 157 fails, 159 may also fail or produce incorrect output. Consider running without keep-going.
```

### Interaction with worktree mode

`keep-going` and `worktree` compose cleanly. Each spec gets its own worktree; a failed spec's worktree is **kept** (not auto-discarded) so the user can inspect it post-run. The consolidated console's **Not run / Failed** footer notes the worktree path:

```
| 159 | failed | test gate — worktree at `.worktrees/spec-159` preserved for inspection |
```

User cleans up failed worktrees manually after triage (`/superpowers:finishing-a-development-branch` on the failed branch).

## Consolidated Review Console (end of run)

After every spec's pipeline reaches `/wrap-up` Step 10 (or the run aborts at a HARD-GATE failure), `/flow` runs **one consolidated Review Console** in `auto` or `hybrid` mode. This replaces the N per-spec consoles that would otherwise interrupt the user between specs. For the full procedure, console template, run-directory layout details, approval/override/stop semantics, and the not-run footer for aborted runs, read `multispec-review-console.md` in this skill's directory.

In interactive mode, per-spec consoles run inline as today — no consolidation step.

## Multi-Spec Summary

After all specs complete (or one fails), present a consolidated summary:

```markdown
## Flow: Multi-Spec Pipeline Complete  {— keep-going if applicable}

| Spec | Build | Test | Review | Polish | Wrap-Up | Outcome |
|------|-------|------|--------|--------|---------|---------|
| {N} | passed | passed | PASS | applied + re-verified | done | Complete |
| {N} | passed | passed | PASS | skipped (no-polish) | done | Complete (no polish) |
| {N} | passed | passed | BLOCKED | — | — | Stopped at review |
| {N} | passed | passed | PASS | re-verify failed | — | Stopped at re-verify |
| {N} | passed | FAILED | — | — | — | Failed (test gate) — continued (keep-going) |
| {N} | — | — | — | — | — | Not run (previous spec failed) |

### Manual Steps Required (all specs)
| # | Spec | What | Where |
|---|------|------|-------|
| 1 | {N} | {description} | {source} |
(or: No manual steps required.)

### Per-Spec Details
(expand each spec's key outputs, failures, and review findings)
```

The header includes `— keep-going` when the run was invoked with that flag. The outcome column distinguishes:
- `Complete` — all gates passed
- `Stopped at {step}` — HARD-GATE failure, remaining specs not run (default mode)
- `Failed ({gate}) — continued (keep-going)` — HARD-GATE failure but pipeline continued to the next spec
- `Not run (previous spec failed)` — only appears in default mode; never under `keep-going`
