# Multi-Spec — Failure Handling (default vs `keep-going`)

Loaded from `multi-spec.md`'s "Failure handling" pointer whenever a multi-spec run needs to reason about a HARD-GATE failure mid-run.

## Default — stop on first HARD-GATE

A gate failure in one spec stops the remaining specs. This is the compounding-risk default: spec N+1 may build on spec N's correctness, so continuing past a known failure is risky.

```
spec 157 — passed
spec 159 — FAILED at test (3 type errors)
spec 160 — not run (previous spec failed)
```

The consolidated Review Console still runs with whatever was accumulated up to the failure; specs 158-160 appear in the **Not run** footer with status `not-run`, reason `previous spec failed (159)`.

## `keep-going` — continue on failure

When the user passes `/flow 157,159,160 keep-going`, HARD-GATE failures in one spec **do not** stop subsequent specs — each runs to completion (or fails on its own gate) and the consolidated console surfaces all outcomes together.

```
spec 157 — passed
spec 159 — FAILED at test (3 type errors) — continued anyway
spec 160 — passed
```

The consolidated Review Console's **Not run / Failed** footer distinguishes:

| Spec | Status | Reason |
|---|---|---|
| 159 | failed | test gate (3 type errors) — see `spec-159/decisions.md` for details |

This is **opt-in** — it inverts the compounding-risk safety. Use when:
- Specs are genuinely independent (no `blocked-by:` edges)
- You want to see all failures together rather than fix-and-retry serially
- A batch of small refactors where one failing doesn't invalidate the others

Do NOT use `keep-going` when specs have `blocked-by:` relationships — the failed spec's downstream may compound the bug. The dependency check above doesn't auto-disable it, but a warning surfaces in the Pipeline Preview footer:

```
keep-going + dependencies: spec 159 depends on 157 — if 157 fails, 159 may also fail or produce incorrect output. Consider running without keep-going.
```

## Interaction with worktree mode

The run shares **one worktree** (see "Shared worktree" in `multi-spec.md`) — no per-spec worktree to discard or preserve. A failed spec leaves its commits in the shared branch:

- **Default mode** — the shared worktree contains commits up to and including the failed spec; subsequent specs don't run. The branch is **not** finished automatically; the consolidated console notes the path for the user to inspect before merging or discarding.
- **`keep-going`** — subsequent specs keep committing into the same shared branch atop the failed spec's commits, compounding its state into later specs (same risk as current-branch mode) — why it's opt-in, meant for independent specs.

The consolidated console's **Not run / Failed** footer notes the shared worktree path:

```
| 159 | failed | test gate (3 type errors) — shared worktree at `.worktrees/flow/spec-157-159-160` preserved; inspect before finishing |
```

The user finishes or discards the single shared branch after triage (`/superpowers:finishing-a-development-branch`).
