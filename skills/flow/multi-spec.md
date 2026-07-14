# Multi-Spec Sequential Flow

When multiple records or spec numbers are provided (e.g., `#42,#45,#48` or the legacy `42,45,48`), flow runs each one's pipeline **sequentially** in one terminal — see `SKILL.md`'s Input resolution for how each form resolves. Everything below is keyed by `{N}`: a record id on the primary path, a spec number under the legacy spec-file alias.

## Validation

Before starting, validate the list:

1. **Parse** — split on commas, resolve each to a record (`materialize.md`) or, under the legacy spec-file alias, a spec file
2. **Prerequisites** — check that each spec's `blocked-by` is satisfied. Reject any spec with unmet prerequisites.

> Steps 3-5 below (frontmatter pre-flight, dependency-aware ordering, conflict detection) read spec-file header fields (`depends-on:`, `Files:`) that don't yet exist on the materialized record header (`materialize.md`'s pinned header format) — this pre-flight enrichment applies to the legacy spec-file alias today.

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

If `auto` mode is set and conflicts are detected, the Manifesto still renders (as a read-only FYI in default `auto`, or as the approval gate under `confirm` / `hybrid`) — the conflict footer just makes it visible before the pipeline proceeds. No mid-flow re-prompt.

### Anti-patterns

| Anti-pattern | Why it fails |
|---|---|
| Treating any file overlap as a hard fail | Many specs legitimately touch the same file (e.g., adding new tests to the same test file). False positives would block real work. |
| Suppressing the warning when conflicts are detected | Conflict footer is the user's only signal that spec interdependencies exist. Silent compounding is the bug to avoid. |
| Auto-reordering specs to avoid conflicts | Conflicts are not the same as dependencies — re-ordering only helps if a `depends-on:` edge actually exists. Don't conflate the two. |

## Run directory layout

Multi-record (or, under the legacy alias, multi-spec) runs use a parent run directory with per-spec subdirectories so the consolidated end-of-run Review Console can read every record's outputs. The subdirectory pattern `spec-{N}/` is unchanged from the legacy layout — only what fills `{N}` changes: a record id on the primary `#A,#B` path (`materialize.md`'s Multi-record layout), or a spec number under the legacy alias.

```
.claude-tweaks/pipelines/{ISO-timestamp}-spec-{N1}-{N2}-{N3}/
├── config.yml          ← Manifesto answers (one for the whole run)
├── manifest.yml        ← Multi-record metadata (record/spec IDs, order, statuses)
├── decisions.md        ← Run-level audit log (freeform-issue translations log here)
├── staged/             ← Run-level staged items (translation-{issue}.md) — read by the consolidated console
└── spec-{N}/           ← Per-record subdirectory (one per record; `work/{N}-spec.md` holds the materialized file — see `materialize.md`)
    ├── decisions.md
    └── staged/
```

The parent dir uses a single `spec-` prefix at the start of the slug segment so `find -name "*spec-${N}*"` reliably disambiguates record/spec IDs from timestamp digits.

`manifest.yml` lists the records (or, under the legacy alias, specs) in execution order plus their status as the run progresses:

```yaml
multispec:
  parent: .claude-tweaks/pipelines/2026-05-16T143207-spec-157-159-160/
  specs:
    - id: 157             # record id (primary path) or spec number (legacy alias)
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

### Pre-flight Verify Sweep (once, before spec 1)

Before spec 1's pipeline begins — after the shared worktree exists and is checked out (`worktree` mode), or in the current checkout otherwise — run `test/verification.md` Steps 1-2 (type check, lint, tests) **once** against the unmodified base, before any spec's build touches the code.

Why: without this, a batch of N specs independently re-diagnoses the same pre-existing failure from scratch up to N times — each spec's own `/test` step finds the same broken check and re-derives its root cause, with no shared record because the only trace lives in gitignored report files.

Record any failures as ledger items in the **parent** run directory (not a per-spec subdir): phase `test`, status `open`, description naming the failing check and its root cause if apparent. If the sweep finds zero failures, skip the ledger write and proceed silently — do not add a "sweep clean" entry.

This does not replace each spec's own `/test` gate — every spec still runs verification normally. It establishes the baseline so a spec whose `/test` run hits a failure already recorded here cites the existing ledger entry (`Pre-existing — see ledger #{N}, batch pre-flight sweep`) instead of re-diagnosing it, per `test/verification.md`'s "Pre-existing failures (multi-spec batches)" note.

Run each spec's full pipeline in order (spec 42 → spec 45 → spec 48). Each spec completes its pipeline (build → test → review → wrap-up) before the next begins.

For each per-spec invocation, `/flow` exports these environment variables (the last is conditional on the caller, not always set):

| Variable | Value | Purpose |
|---|---|---|
| `PIPELINE_RUN_DIR` | `{parent}/spec-{N}/` | Per-spec namespaced dir — skills write `decisions.md` and `staged/` items here |
| `MULTISPEC_REVIEW_DEFER` | `1` | Signals `/wrap-up` Step 8.6 to skip the per-spec console — the consolidated end-of-run console handles all approvals |
| `MULTISPEC_PARENT_DIR` | `{parent}/` | Pointer to the parent run dir — read by the consolidated console at end-of-run |
| `MULTISPEC_KEEP_GOING` | `1` (when `keep-going` arg set) | Signals per-spec pipelines to continue the multi-spec run after this spec's HARD-GATE failure |
| `MULTISPEC_SHARED_WORKTREE` | `1` (when `worktree` strategy resolved) | Signals per-spec `/build` Common Step 1 to skip worktree creation — the run's single shared worktree already exists and the pipeline is running inside it |
| `CLAIM_RUN_ID` | passed through unchanged (when `/flow`'s own caller set it — e.g. `/claude-tweaks:dispatch` for a bundle group) | Signals each spec's `/wrap-up` Section E to use this value, not `PIPELINE_RUN_DIR`'s own id, for the issue-claim release ownership check — see `_shared/issue-claims.md`'s Identity section |

### Shared worktree (sequential multi-record/multi-spec)

When `worktree` is specified, a sequential run uses **one shared worktree for the whole run — NOT one per record.** All records build and commit into the same worktree on a single feature branch, and the branch is finished **once** at the end of the run.

1. **Create once, up front** — before the first record's pipeline, `/flow` creates a single worktree from the current local HEAD following `skills/build/worktree-setup.md` (including its Step 0/4 base-ref verification). The branch covers the whole run: `flow/spec-{N1}-{N2}-{N3}` (for runs longer than 3, use `flow/spec-{N1}-…-{Nlast}`; the manifest holds the full list) — `{N}` is the record id on the primary path, or the spec number under the legacy alias, the same keying as the run directory layout above. `/flow` then `cd`s into the worktree.
2. **Per-record builds skip creation** — `/flow` exports `MULTISPEC_SHARED_WORKTREE=1` and runs every record's pipeline inside the shared worktree. Each per-record `/build` Common Step 1 detects it is already inside an isolated worktree (superpowers Step 0: `GIT_DIR != GIT_COMMON`, reinforced by `MULTISPEC_SHARED_WORKTREE`) and **skips worktree creation**, committing into the shared branch. It does NOT call `/superpowers:finishing-a-development-branch` between records.
3. **Finish once at the end** — after the last record's pipeline and the consolidated Review Console, `/flow` finishes the single feature branch via `/superpowers:finishing-a-development-branch` (merge / PR / discard).

Why shared, not per-record: sequential records in one run are one logical unit of work on one base. Per-record worktrees would each branch from the same base and then need N separate merges that can't see each other's commits — exactly the divergence/stale-base problem worktrees are meant to avoid. One branch accumulates the records in dependency order and merges back as a single reconciled changeset.

> Separate-terminal parallel runs (`/flow #42 worktree` in each terminal) are different — those are N independent single-record runs and each correctly gets its own worktree. See `worktree-merge.md`.

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

The run shares **one worktree** (see "Shared worktree" above), so there is no per-spec worktree to discard or preserve. A failed spec leaves its commits in the shared branch:

- **Default mode** — the shared worktree contains commits up to and including the failed spec; subsequent specs don't run. The branch is **not** finished automatically; the consolidated console notes the path so the user can inspect before deciding to merge or discard.
- **`keep-going`** — subsequent specs keep committing into the same shared branch on top of the failed spec's commits. This compounds the failed spec's state into later specs (same risk as current-branch mode) — which is why `keep-going` is opt-in and meant for genuinely independent specs.

The consolidated console's **Not run / Failed** footer notes the shared worktree path once:

```
| 159 | failed | test gate (3 type errors) — shared worktree at `.worktrees/flow/spec-157-159-160` preserved; inspect before finishing |
```

The user finishes or discards the single shared branch after triage (`/superpowers:finishing-a-development-branch`).

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
