# Multi-Spec Sequential Flow

When multiple spec numbers are provided (e.g., `42,45,48`), flow runs each spec's pipeline **sequentially** in one terminal.

## Validation

Before starting, validate the spec list:

1. **Parse** — split on commas, resolve each to a spec file
2. **Prerequisites** — check that each spec's `blocked-by` is satisfied. Reject any spec with unmet prerequisites.

## Run directory layout

Multi-spec runs use a parent run directory with per-spec subdirectories so the consolidated end-of-run Review Console can read every spec's outputs:

```
.claude-tweaks/pipelines/{ISO-timestamp}-{spec-1}-{spec-2}-{spec-N}/
├── config.yml          ← Manifesto answers (one for the whole run)
├── manifest.yml        ← Multi-spec metadata (spec IDs, order, statuses)
└── spec-{N}/           ← Per-spec subdirectory (one per spec)
    ├── decisions.md
    └── staged/
```

`manifest.yml` lists the specs in execution order plus their status as the run progresses:

```yaml
multispec:
  parent: .claude-tweaks/pipelines/2026-05-16T14:32:07-157-159-160/
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

Run each spec's full pipeline in order (spec 42 → spec 45 → spec 48). Each spec completes its pipeline (build → test → review → wrap-up) before the next begins. A gate failure in one spec stops the remaining specs — present what completed and what remains.

For each per-spec invocation, `/flow` exports three environment variables:

| Variable | Value | Purpose |
|---|---|---|
| `PIPELINE_RUN_DIR` | `{parent}/spec-{N}/` | Per-spec namespaced dir — skills write `decisions.md` and `staged/` items here |
| `MULTISPEC_REVIEW_DEFER` | `1` | Signals `/wrap-up` Step 9.6 to skip the per-spec console — the consolidated end-of-run console handles all approvals |
| `MULTISPEC_PARENT_DIR` | `{parent}/` | Pointer to the parent run dir — read by the consolidated console at end-of-run |

If `worktree` is specified, each spec gets its own worktree via `/superpowers:using-git-worktrees`. The worktree is finished via `/superpowers:finishing-a-development-branch` before the next spec begins.

## Consolidated Review Console (end of run)

After every spec's pipeline reaches `/wrap-up` Step 10 (or the run aborts at a HARD-GATE failure), `/flow` runs **one consolidated Review Console** in `auto` or `hybrid` mode. This replaces the N per-spec consoles that would otherwise interrupt the user between specs. For the full procedure, console template, run-directory layout details, approval/override/stop semantics, and the not-run footer for aborted runs, read `multispec-review-console.md` in this skill's directory.

In interactive mode, per-spec consoles run inline as today — no consolidation step.

## Multi-Spec Summary

After all specs complete (or one fails), present a consolidated summary:

```markdown
## Flow: Multi-Spec Pipeline Complete

| Spec | Build | Test | Review | Polish | Wrap-Up | Outcome |
|------|-------|------|--------|--------|---------|---------|
| {N} | passed | passed | PASS | applied + re-verified | done | Complete |
| {N} | passed | passed | PASS | skipped (no-polish) | done | Complete (no polish) |
| {N} | passed | passed | BLOCKED | — | — | Stopped at review |
| {N} | passed | passed | PASS | re-verify failed | — | Stopped at re-verify |
| {N} | — | — | — | — | — | Not started (previous spec failed) |

### Manual Steps Required (all specs)
| # | Spec | What | Where |
|---|------|------|-------|
| 1 | {N} | {description} | {source} |
(or: No manual steps required.)

### Per-Spec Details
(expand each spec's key outputs, failures, and review findings)
```
