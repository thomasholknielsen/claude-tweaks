# Multi-Spec Sequential Flow

When multiple records are provided (e.g., `#42,#45,#48`), flow runs each one's pipeline **sequentially** in one terminal — see `SKILL.md`'s Input resolution for how each form resolves. Everything below is keyed by `{N}`, a record id.

## Validation

Before starting, validate the list:

1. **Parse** — split on commas, resolve each to a record (`materialize.md`)
2. **Prerequisites** — check that each target's `blocked-by:` dependency (`materialize.md`'s Populating the header — sourced from `record.js`'s `parseDependencies`, `facets.blockedBy`, or the native dependency API depending on driver/`work-links`) is satisfied. Reject any target with unmet prerequisites.

> A record-reference target's dependency data (`blocked-by:`) is read via `materialize.md`'s Resolution step — read-only, safe before any run dir or worktree exists — or the materialized header once composed; see Steps 3-4 below. Cross-spec conflict detection (Step 5) reads the record body's `### Key Files` subsection, via the same `groupByFileOverlap` primitive `/claude-tweaks:help`'s and `/claude-tweaks:specify`'s own conflict detection already use — see "Cross-spec conflict detection" below.

> **Parallel execution:** frontmatter/record reads across N targets (step 3) are independent — run concurrently.

3. **Pre-flight** — collect each target's set from `materialize.md`'s Resolution (facets + body, read-only): `blocked-by:` dependencies, `surface:`/`design-intent:` via the lift rule, and key files from the body's `### Key Files` subsection. These feed the ordering check, Pipeline Preview, and conflict detection (Step 5). `bin/preflight-records.js <n> [<n> ...] [--work-links native|body-text] [--repo owner/name]` mechanizes this step — and Step 5's conflict detection — in one command, printing `{records, overlapGroups, workLinks}` (exit 0 success, 1 any fetch failed with every failing record named, 2 malformed); see its `--help` for details.
4. **Dependency-aware ordering** — see "Dependency-aware ordering" below. Topologically sort and reconcile with the user's order.
5. **Conflict detection** — see "Cross-spec conflict detection" below. Warn on overlapping key files (`### Key Files` in each record body).

## Dependency-aware ordering

A target may declare prerequisite records — `blocked-by:` on the record (materialized header, or live via `materialize.md`'s Resolution). The user's order on `$ARGUMENTS` (`/flow #157,#159,#160`) may not match the dependency graph.

### Procedure

1. **Build the DAG** — for each target in the list, add edges from each prerequisite to the target itself, from its `blocked-by:` entries
2. **Detect cycles** — if any cycle exists across the listed specs, **hard fail**:
   ```
   Cycle detected in dependency graph:
     159 → blocked-by: 160
     160 → blocked-by: 159
   
   Resolve the circular dependency (edit the records' blocked-by) before running /flow.
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

If record 159 depends on record 142 (not in the run list) — via `blocked-by:` — check 142's status:
- Status `complete` → fine, dependency satisfied
- Status `pending` or `in-progress` → hard fail with "159 depends on 142 which is not complete and not in this run"

The dependency check is the same regardless of whether the prerequisite is in-run or out-of-run, or which of the two representations declared it.

## Cross-spec conflict detection

When two specs in the run declare overlapping files, sequential execution can compound (spec 159 builds on spec 157's changes, possibly conflicting with what its spec assumed) and future parallel execution would conflict outright.

### Procedure

1. Collect each target's key files into a single `[{id, keyFiles}]` list: extract the `### Key Files` subsection (under `## Technical Approach`, per `spec-template.md`'s record body template) from the record body already fetched during Validation step 3 above — the same extraction `/claude-tweaks:specify` Step 1 and `help/status-scan.md`'s Conflict detection section perform. A record with no `### Key Files` subsection (not yet spec-shaped; shouldn't happen here, but handled defensively) contributes an empty `keyFiles` array rather than erroring.
2. Call the shared grouping primitive — `groupByFileOverlap` (`bin/lib/issues/grouping.js`), the same one `/claude-tweaks:help`'s dashboard conflict detection and `/claude-tweaks:specify`'s creation-time check both use — over the combined list.
3. Any group of size > 1 returned by `groupByFileOverlap` shares files across targets — record a **conflict warning** for each pair in that group.

### Presentation

Surface conflicts in the Pipeline Preview block as a dedicated footer line:

```
Conflicts: spec 157 ↔ spec 159 both modify src/auth/session.ts; spec 159 ↔ spec 160 both modify src/api/users.ts
```

This is a **warning, not a hard fail** — sequential execution is usually fine, but the user should know spec 159's plan assumed `src/auth/session.ts`'s pre-157 shape, which changes once 157 runs.

If `auto` mode is set and conflicts are detected, the Manifesto still renders (as a read-only FYI in default `auto`, or as the approval gate under `confirm` / `hybrid`) — the conflict footer just makes it visible before the pipeline proceeds. No mid-flow re-prompt.

### Anti-patterns

Never hard-fail on file overlap (specs legitimately share files — false positives block real work), never suppress the conflict footer (it is the user's only interdependency signal), and never auto-reorder to dodge a conflict — re-ordering only helps when a real `blocked-by:` edge exists; conflicts and dependencies are different things.

## Run directory layout

Multi-record runs use a parent run directory with per-spec subdirectories so the consolidated end-of-run Review Console can read every record's outputs. `{N}` in the subdirectory pattern `spec-{N}/` is the record id (`materialize.md`'s Multi-record layout).

The parent directory is created under `$RUN_ROOT`, not the current directory — same anchoring
requirement as the single-spec case (`manifesto.md`'s Path conventions, `_shared/pipeline-run-dir.md`'s
Anchoring section). A bundle dispatched by `/claude-tweaks:dispatch` runs this creation step from
inside that group's worktree, so skipping anchoring here would trap the whole run (parent dir, every
`spec-{N}/` subdirectory, and their `decisions.md`/`staged/`) inside a worktree a later cleanup could
destroy.

```
$RUN_ROOT/.claude-tweaks/pipelines/{ISO-timestamp}-spec-{N1}-{N2}-{N3}/
├── config.yml          ← Manifesto answers (one for the whole run)
├── manifest.yml        ← Multi-record metadata (record/spec IDs, order, statuses)
├── decisions.md        ← Run-level audit log (freeform-issue translations log here)
├── staged/             ← Run-level staged items (translation-{issue}.md) — read by the consolidated console
└── spec-{N}/           ← Per-record subdirectory (one per record; `work/{N}-spec.md` holds the materialized file — see `materialize.md`)
    ├── config.yml      ← Copy of the parent's, written when the parent scaffolds this subdirectory (see below)
    ├── decisions.md
    └── staged/
```

The parent dir uses a single `spec-` prefix at the start of the slug segment so `find -name "*spec-${N}*"` reliably disambiguates record/spec IDs from timestamp digits.

**Each `spec-{N}/` carries its own `config.yml`** — a byte-for-byte copy of the parent's, written by `/flow` in the same step that creates the subdirectory (Step 3). Per-spec skills resolve levers via `resolve-policy.js --run "$PIPELINE_RUN_DIR"` where `PIPELINE_RUN_DIR` is the subdirectory — without its own `config.yml` that call resolves `source: default` and silently drops the Manifesto's answers for the whole spec (observed on the #678 run: `review-auto-apply-ceiling` read `default` from `spec-678/` while the parent held `run-config: medium`). A mid-run in-place lever edit (the ceremony escape hatch) lands in the spec's own copy and scopes to that spec — intended.

`manifest.yml` lists the records in execution order plus their status as the run progresses — written exclusively through `node bin/hooks.js spec-status` (see "Phase-progress banner and per-spec completion summary" below); nothing else writes this file. When `MULTISPEC_CURATION_DEFER=1` is set, it also carries `baseSha` — the shared worktree's starting commit (the value `worktree-setup.md`'s Step 0 captures as `EXPECTED_BASE` when the worktree is created, i.e. the commit before spec 1's materialize commit) — so `multispec-batch-curation.md`'s registry pass has a stable pre-batch baseline to read back rather than re-deriving it after N specs' worth of commits have landed:

```yaml
multispec:
  parent: .claude-tweaks/pipelines/2026-05-16T143207-spec-157-159-160/
  baseSha: f9b5ec84d6c462050ed6a40d640ae50b67f6ee36   # omitted when MULTISPEC_CURATION_DEFER is unset
  specs:
    - id: 157             # record id
      status: complete    # pending | running | complete | failed | not-run
      subdir: spec-157/
      startedAt: 2026-05-16T14:32:07.000Z   # set once, on this spec's FIRST running transition
    - id: 159
      status: complete
      subdir: spec-159/
      startedAt: 2026-05-16T14:48:11.000Z
    - id: 160
      status: complete
      subdir: spec-160/
      startedAt: 2026-05-16T15:05:44.000Z
```

## Execution

### Pre-flight Verify Sweep (once, before spec 1)

Before spec 1's pipeline begins — after the shared worktree exists and is checked out (`worktree` mode), or in the current checkout otherwise — run `test/verification.md` Steps 1-2 (type check, lint, tests) **once** against the unmodified base, before any spec's build touches the code.

Why: without this, each of N specs independently re-diagnoses the same pre-existing failure from scratch — every spec's own `/test` step re-derives the same root cause, with no shared record since the only trace lives in gitignored report files.

Record any failures as ledger items in the **parent** run directory (not a per-spec subdir): phase `test`, status `open`, description naming the failing check and its root cause if apparent. If the sweep finds zero failures, skip the ledger write and proceed silently — do not add a "sweep clean" entry.

This does not replace each spec's own `/test` gate — every spec still runs verification normally. It establishes the baseline so a spec whose `/test` run hits a failure already recorded here cites the existing ledger entry (`Pre-existing — see ledger #{N}, batch pre-flight sweep`) instead of re-diagnosing it, per `test/verification.md`'s "Pre-existing failures (multi-spec batches)" note.

Run each spec's full pipeline in order (spec 42 → spec 45 → spec 48). Each spec completes its pipeline (build → test → review → wrap-up) before the next begins.

For each per-spec invocation, `/flow` exports these environment variables (the last is conditional on the caller, not always set):

| Variable | Value | Purpose |
|---|---|---|
| `PIPELINE_RUN_DIR` | `{parent}/spec-{N}/` | Per-spec namespaced dir — skills write `decisions.md` and `staged/` items here |
| `MULTISPEC_REVIEW_DEFER` | `1` | Signals `/wrap-up`'s Phase 4 to skip the per-spec Review Console — the consolidated end-of-run console handles all approvals |
| `MULTISPEC_PARENT_DIR` | `{parent}/` | Pointer to the parent run dir — read by the consolidated console at end-of-run |
| `MULTISPEC_KEEP_GOING` | `1` (when `keep-going` arg set) | Signals per-spec pipelines to continue the multi-spec run after this spec's HARD-GATE failure |
| `MULTISPEC_SHARED_WORKTREE` | `1` (when `worktree` strategy resolved) | Signals per-spec `/build` Common Step 1 to skip worktree creation — the run's single shared worktree already exists and the pipeline is running inside it |
| `MULTISPEC_CURATION_DEFER` | `1` (same condition as `MULTISPEC_REVIEW_DEFER` — multi-spec run, `auto`/`hybrid` mode) | Signals `/wrap-up`'s Phase 1 Reflect and Phase 2 Run the engine to skip their per-spec passes — the consolidated end-of-run batch pass (`multispec-batch-curation.md`) covers the full multi-spec diff once instead of once per spec |

Note on claim ownership for a dispatched bundle: each spec's own `PIPELINE_RUN_DIR` above is the per-spec `{parent}/spec-{N}/` subdirectory, but the claim `/claude-tweaks:dispatch` wrote (Step 4) is keyed to the **parent** directory's basename — the identity dispatch minted for the whole group. Per-spec `/wrap-up` Section E claim release is deferred under `MULTISPEC_REVIEW_DEFER=1` for exactly this reason (see `wrap-up/cleanup-procedures.md`'s Multi-spec defer behavior); the actual release happens once, at end-of-run, in `multispec-review-console.md`'s "Shared teardown," which resolves the ownership check against `basename($MULTISPEC_PARENT_DIR)`, not any per-spec `$PIPELINE_RUN_DIR`.

### Phase-progress banner and per-spec completion summary (#690)

For every phase of every spec, `/flow`'s Step 4 "Announce" bullet writes `manifest.yml`'s status transition and prints the progress banner as a side effect — read `multispec-progress-banner.md` in this skill's directory for the full mechanism (the `spec-status` call shape, the per-spec completion summary, and why the deferred outcome is always the literal word `deferred`).

### Shared worktree (sequential multi-record/multi-spec)

When `worktree` is specified, a sequential run uses **one shared worktree for the whole run — NOT one per record.** All records build and commit into the same worktree on a single feature branch, and the branch is finished **once** at the end of the run.

1. **Create once, up front** — `/flow` creates a single worktree from the current local HEAD following `skills/build/worktree-setup.md` (including its Step 4 unconditional catch-up with the integration branch). The branch covers the whole run: `flow/spec-{N1}-{N2}-{N3}` (for runs longer than 3, use `flow/spec-{N1}-…-{Nlast}`; the manifest holds the full list) — `{N}` is the record id, the same keying as the run directory layout above. This branch slug is exactly the kind `build/worktree-setup.md`'s "Worktree name derivation" section requires sanitizing before it reaches `EnterWorktree` — pass it through that section's `sanitizeWorktreeName()` (`bin/lib/worktree/name.js`), not the raw `flow/spec-{N1}-…` string, since the `/` alone is already outside `EnterWorktree`'s accepted charset. `/flow` then `cd`s into the worktree.
2. **Per-record builds skip creation** — `/flow` exports `MULTISPEC_SHARED_WORKTREE=1` and runs every record's pipeline inside the shared worktree. Each per-record `/build` Common Step 1 detects it is already inside an isolated worktree (superpowers Step 0: `GIT_DIR != GIT_COMMON`, reinforced by `MULTISPEC_SHARED_WORKTREE`) and **skips worktree creation**, committing into the shared branch. Every record — the first included — materializes as part of its own build step, writing `{parent}/spec-{N}/work/{N}-spec.md` directly into the already-existing shared worktree. This is just `materialize.md`'s worktree-first ordering applied once at the run level instead of once per record: the worktree exists before any materialization, so no record is a special case. It does NOT call `/superpowers:finishing-a-development-branch` between records.
3. **Finish once at the end** — after the last record's pipeline and the consolidated Review Console, `/flow` finishes the single feature branch via `/superpowers:finishing-a-development-branch` (merge / PR / discard). Re-check `main` divergence immediately before this step, not just at the Step 2.5 pre-flight (a point-in-time check at pipeline *start*) — a long-running multi-record run has a real window for `main` to move again while records 2..N build. If it has, rebase onto the new tip inside the worktree first (checking for real file overlap, not just presence in the diff — see the git-diff-merge-base gotcha in CLAUDE.md's Don'ts) so the branch stays fast-forward-mergeable, then proceed with the finish.

   **Sequence merge-then-suite, never the reverse.** Never start a background full-suite run while a catch-up merge is pending — a merge landing mid-run invalidates the suite (one observed run discarded two ~5-minute runs this way). Merge/rebase first; verify once quiescent.

Why shared, not per-record: sequential records in one run are one logical unit of work on one base. Per-record worktrees would each branch from that base and need N separate merges unable to see each other's commits — the divergence/stale-base problem worktrees exist to avoid. One branch accumulates the records in dependency order and merges back as a single reconciled changeset.

> Separate-terminal parallel runs (`/flow #42 worktree` in each terminal) are different — those are N independent single-record runs and each correctly gets its own worktree. See `worktree-merge.md`.

## Failure handling (default vs `keep-going`)

Default mode stops the remaining specs on a HARD-GATE failure (compounding-risk default). `keep-going` inverts that — opt-in, for genuinely independent specs, so the consolidated console can surface every outcome together instead of stopping at the first failure. Read `multispec-failure-handling.md` in this skill's directory for the full behavior: the default-vs-`keep-going` console output shapes, the dependency-conflict warning, and the shared-worktree interaction (a failed spec's commits stay in the shared branch either way; only whether later specs keep building atop them differs).

## Consolidated Review Console (end of run)

After every spec's pipeline reaches `/wrap-up`'s Phase 4 execution step (or the run aborts at a HARD-GATE failure), `/flow` runs **one consolidated Review Console** in `auto` or `hybrid` mode, replacing the N per-spec consoles that would otherwise interrupt the user between specs. For the full procedure, template, run-directory layout, approval/override/stop semantics, and the not-run footer for aborted runs, read `multispec-review-console.md` in this skill's directory.

In interactive mode, per-spec consoles run inline as today — no consolidation step.

## Multi-Spec Summary

Read `multispec-summary.md` in this skill's directory when rendering — the template and outcome-column vocabulary live there.
