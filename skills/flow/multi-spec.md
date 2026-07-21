# Multi-Spec Sequential Flow

When multiple records or spec numbers are provided (e.g., `#42,#45,#48` or the legacy `42,45,48`), flow runs each one's pipeline **sequentially** in one terminal — see `SKILL.md`'s Input resolution for how each form resolves. Everything below is keyed by `{N}`: a record id on the primary path, a spec number under the legacy spec-file alias.

## Validation

Before starting, validate the list:

1. **Parse** — split on commas, resolve each to a record (`materialize.md`) or, under the legacy spec-file alias, a spec file
2. **Prerequisites** — for a record-reference target, check that each `blocked-by:` dependency (`materialize.md`'s Populating the header — sourced from `record.js`'s `parseDependencies`, `facets.blockedBy`, or the native dependency API depending on driver/`work-links`) is satisfied; for the legacy spec-file alias, check that each spec's `depends-on:` frontmatter is satisfied. Reject any target with unmet prerequisites.

> A record-reference target's dependency data (`blocked-by:`) is read via `materialize.md`'s Resolution step — read-only, safe before any run dir or worktree exists — or the materialized header once composed; see Steps 3-4 below. Cross-spec conflict detection (Step 5) covers both target types: the legacy `Files:` frontmatter path for spec-file targets, and the record body's `### Key Files` subsection (via the same `groupByFileOverlap` primitive `/claude-tweaks:help`'s and `/claude-tweaks:specify`'s own conflict detection already use) for record-reference targets — see "Cross-spec conflict detection" below.

> **Parallel execution:** Use parallel tool calls aggressively — frontmatter/record reads across N targets (step 3 below) are independent and should run concurrently.

3. **Frontmatter pre-flight** — for the legacy spec-file alias, read frontmatter in one parallel pass and collect `depends-on:`, `Files:`, `surface:`, `design-intent:`. For a record-reference target, collect the equivalent set from `materialize.md`'s Resolution (facets + body, already fetched read-only): dependencies via `blocked-by:` (see Populating the header's `blocked-by` bullet), `surface:`/`design-intent:` via the lift rule — `Files:` has no record-mode equivalent yet (see the caveat above). Both collections feed the same ordering check and Pipeline Preview; only conflict detection (Step 5) stays legacy-only.
4. **Dependency-aware ordering** — see "Dependency-aware ordering" below. Topologically sort and reconcile with the user's order.
5. **Conflict detection** — see "Cross-spec conflict detection" below. Warn on overlapping `Files:` declarations.

## Dependency-aware ordering

A target may declare prerequisite records/specs — `blocked-by:` on a record-reference target (materialized header, or live via `materialize.md`'s Resolution), `depends-on:` frontmatter on a legacy spec-file target. The user's order on `$ARGUMENTS` (`/flow 157,159,160` or `/flow #157,#159,#160`) may not match the dependency graph.

### Procedure

1. **Build the DAG** — for each target in the list, add edges from each prerequisite to the target itself: `depends-on:` entries for a legacy spec-file target, `blocked-by:` entries for a record-reference target
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
   - **Mismatch** (user order violates a dependency edge) → surface:
     ```
     Spec order doesn't match dependencies:
       You requested: 159 → 160 → 157
       Topological:   157 → 159 → 160   (157 is depended-on by 159; 159 by 160)
     ```
     then call `AskUserQuestion`:
     - `question`: `"Spec order doesn't match dependencies — how do you want to proceed?"`, `header`: `"Dependency order"`, `multiSelect`: `false`
     - Option 1 — `label`: `"Use topological order (Recommended)"`, `description`: `"Re-order to 157 → 159 → 160"`
     - Option 2 — `label`: `"Keep my order"`, `description`: `"I know what I'm doing — run 159 → 160 → 157 as requested"`
     - Option 3 — `label`: `"Cancel"`, `description`: `"Stop; I'll fix the dependencies or the order myself"`

     In `auto` mode, **default to option 1** silently and log: `AUTO {time} — Step 1: re-ordered specs to match dependency graph. User order: 159,160,157. Topological: 157,159,160. Reversibility: high.`

### Targets with a dependency on a target NOT in the run

If record/spec 159 depends on record/spec 142 (not in the run list) — via `blocked-by:` (record-reference target) or `depends-on:` (legacy spec-file target) — check 142's status:
- Status `complete` → fine, dependency satisfied
- Status `pending` or `in-progress` → hard fail with "159 depends on 142 which is not complete and not in this run"

The dependency check is the same regardless of whether the prerequisite is in-run or out-of-run, or which of the two representations declared it.

## Cross-spec conflict detection

When two specs in the run declare overlapping files, sequential execution can compound (spec 159 builds on top of spec 157's changes, possibly conflicting with what spec 159's spec assumed) and parallel execution (when added later) would conflict outright.

### Procedure

1. Collect each target's key files into a single `[{id, keyFiles}]` list: for a legacy spec-file target, read `Files:` declarations from frontmatter and from the plan if one exists; for a record-reference target, extract the `### Key Files` subsection (under `## Technical Approach`, per `spec-template.md`'s record body template) from the record body already fetched during Validation step 3 above — the same extraction `/claude-tweaks:specify` Step 1 and `help/status-scan.md`'s Conflict detection section perform. A record with no `### Key Files` subsection (not yet spec-shaped — shouldn't happen for a target that reached this pipeline, but treat defensively) contributes an empty `keyFiles` array rather than erroring.
2. Call the shared grouping primitive — `groupByFileOverlap` (`bin/lib/issues/grouping.js`), the same one `/claude-tweaks:help`'s dashboard conflict detection and `/claude-tweaks:specify`'s creation-time check both use — over the combined list.
3. Any group of size > 1 returned by `groupByFileOverlap` shares files across targets — record a **conflict warning** for each pair in that group.

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

1. **Materialize the first record before the worktree exists** — for a record-reference run, `/flow` runs the first record's `materialize.md` compose/write/commit sub-step (normally folded into its own build step, per `SKILL.md` Step 4.2) early, committing `{parent}/spec-{N1}/work/{N1}-spec.md` on the current (pre-worktree) branch. This satisfies `materialize.md`'s "When this runs" rule that worktree creation must branch from a HEAD that already contains the file — the same requirement `/build`'s Common Step 1 satisfies for a single-record run, applied here to `/flow`'s own up-front worktree creation instead. The legacy spec-file alias needs no equivalent: its spec file is already a tracked, committed file (checked by pre-flight Step 2.4), so there is nothing to write before the worktree branches.
2. **Create once, up front** — `/flow` creates a single worktree from the current local HEAD (now including the first record's committed materialized file, when applicable) following `skills/build/worktree-setup.md` (including its Step 0/4 base-ref verification). The branch covers the whole run: `flow/spec-{N1}-{N2}-{N3}` (for runs longer than 3, use `flow/spec-{N1}-…-{Nlast}`; the manifest holds the full list) — `{N}` is the record id on the primary path, or the spec number under the legacy alias, the same keying as the run directory layout above. `/flow` then `cd`s into the worktree.
3. **Per-record builds skip creation** — `/flow` exports `MULTISPEC_SHARED_WORKTREE=1` and runs every record's pipeline inside the shared worktree. Each per-record `/build` Common Step 1 detects it is already inside an isolated worktree (superpowers Step 0: `GIT_DIR != GIT_COMMON`, reinforced by `MULTISPEC_SHARED_WORKTREE`) and **skips worktree creation**, committing into the shared branch. The first record's own build step skips the materialize sub-step (already done in step 1 above); records 2 through N materialize normally as part of their own build step, writing directly into the already-existing shared worktree — `materialize.md`'s "checkout the write can land in before the run's worktree exists" rule constrains only the one worktree-creation event (step 2 above), not a later record's write into a checkout that already exists. It does NOT call `/superpowers:finishing-a-development-branch` between records.
4. **Finish once at the end** — after the last record's pipeline and the consolidated Review Console, `/flow` finishes the single feature branch via `/superpowers:finishing-a-development-branch` (merge / PR / discard). Re-check `main` divergence immediately before this step, not just at the Step 2.5 pre-flight (a point-in-time check at pipeline *start*) — a long-running multi-record run has a real window for `main` to move again while records 2..N build. If it has, rebase onto the new tip inside the worktree first (checking for real file overlap, not just presence in the diff — see the git-diff-merge-base gotcha in CLAUDE.md's Don'ts) so the branch stays fast-forward-mergeable, then proceed with the finish.

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
