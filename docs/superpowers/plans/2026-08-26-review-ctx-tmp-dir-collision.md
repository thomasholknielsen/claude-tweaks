# Plan: review-context scratch dir collides with a common tmp/ deny rule (#1213)

## For agentic workers

Executed directly via `/claude-tweaks:build` (subagent strategy). Do not invoke
`/superpowers:subagent-driven-development` or `/superpowers:executing-plans` separately —
this plan is small enough (one file changed, one test file updated) to implement inline.

## Context

`plugin/bin/lib/review-context/build.js`'s `resolveDir()` nests the run-scoped scratch
directory at `{run-dir}/tmp/review-ctx/`. A user with `Read(**/tmp/**)` in their
`~/.claude/settings.json` permissions.deny (a broad, defensible glob meant to block system
`/tmp` reads) also blocks reads of this nested project-relative path, since the glob matches
any `tmp/` path segment, not only a leading one. This was observed live during #316's review:
two lens agents hit Read/Bash denial on the context bundle path.

Spec: `.claude-tweaks/pipelines/2026-08-26T052010-record-1213/work/1213-spec.md`

## Scope keywords: review-ctx, tmp, resolveDir, scratch dir

## Deliverables

1. Rename the scratch subdirectory from `{run-dir}/tmp/review-ctx/` to
   `{run-dir}/review-ctx/` — drops the literal `tmp` path segment entirely, no fallback
   documentation needed since the direct fix removes the collision at the source.
2. Sweep other `bin/*.js` scratch-dir conventions for the same `tmp/` segment pattern under
   a project-relative run directory. (Pre-checked: `context.js`'s `run-state.json.tmp-{pid}`
   and `manifest.js`'s `manifest.yml.tmp-{pid}` are atomic-write staging **filename suffixes**,
   not a nested `tmp/` directory segment that a lens agent is ever handed to read — not the
   same hazard class. No other offender found.)

## Task 1: Rename the scratch subdirectory

### Files

- Modify: `plugin/bin/lib/review-context/build.js`
- Modify: `tests/bin-lib/review-context/build.test.js`

### Step 1: Write the failing assertion

Update the existing test `resolveDir: run-dir scoping lands under {run}/tmp/review-ctx` (line
53) to assert the new path `{run}/review-ctx` instead. Rename the test's own description to
match.

Run: `node --test tests/bin-lib/review-context/build.test.js`
Expected: FAIL (assertion on the new path fails against the current `tmp/review-ctx` code)

### Step 2: Implement

In `build.js`'s `resolveDir()`, change:

```js
const scoped = path.join(run, 'tmp', 'review-ctx');
```

to:

```js
const scoped = path.join(run, 'review-ctx');
```

### Step 3: Verify

Run: `node --test tests/bin-lib/review-context/build.test.js`
Expected: PASS

## Task 2: Confirm no other bin/*.js scratch dir nests a literal tmp/ segment

### Step 1: Sweep

Run: `grep -rn "path.join([^)]*'tmp'" plugin/bin --include="*.js"`
Expected: only `build.js`'s own `tmpdir` fallback branch (`mkdtemp(path.join(tmpdir, ...))`,
the OS temp dir itself, not a nested project-relative segment) — no other run-dir-scoped
`tmp/` segment.

This satisfies Acceptance Criterion 2 without any further code change.

## Acceptance Criteria (from spec)

1. A lens agent dispatched under an environment with `Read(**/tmp/**)` denied can complete its
   review without hitting a permission BLOCKED state on the context bundle path — satisfied:
   the bundle now lives at `{run-dir}/review-ctx/context.md`, no `tmp` segment.
2. No other `bin/*.js` scratch directory nests a literal `tmp/` path segment under a
   project-relative run directory — satisfied by Task 2's sweep.
