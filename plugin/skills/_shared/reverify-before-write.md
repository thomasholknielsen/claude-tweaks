# Re-verify Before Write — Stale Confirmation Gate

## The pattern

Any flow that builds a write's premise (a row's facts, a gate's `due` status, a staged diff's
target) and then waits at an **unbounded human-confirmation gate** — `AskUserQuestion`, a batch
approval, a Review Console — before actually executing that write cannot trust the premise it
captured going into the wait. The gate's wait time has no ceiling; a concurrent session, a later
pipeline phase, or a human editing the same record can change the underlying state while the
confirmation sits unanswered. A confirmed row is a decision about the state as it was, not a
promise that the state stays that way.

**Recognition:** the shape is confirm-then-apply with a long-lived wait in between — never a
same-turn confirm-and-apply, which has no window for staleness to open.

**Policy:** immediately before the write — not at confirmation time, not at the start of the
batch — re-read the live state the write's premise depends on and compare it against the
snapshot the premise was built from. A mismatch means a concurrent write already changed the
world since that snapshot was taken:

- Skip the write rather than overwriting a fresher decision.
- Log the skip so it's visible, not silent.
- Treat a re-read failure (network error, missing file, non-zero exit) the same as a mismatch —
  fail closed. Never write on an unread premise.

## What the contract does not decide

This file owns recognition and the skip-vs-write policy — it does not own what a consumer *does*
once it recognizes staleness beyond "don't write on a stale premise." Each consumer keeps its own
mechanics for what "live state" means and how a mismatch is handled procedurally:

- `tidy/step-6-auto.md`'s `[parent-gate]` row re-reads the gate's own `due` status before opening
  it, rather than trusting the scan that staged it.
- `backlog/apply-step.md` (`refine-mode.md`'s Step 5, split out by #1442) re-fetches each row's
  live labels (or, for a body-rewriting write, the live body) and diffs them against the facets
  captured at Step 1, skipping any row whose premise no longer holds.
- `_shared/staged-patch.md`'s Review Console apply step treats a stale diff as the expected end
  state of a diff written mid-pipeline, not a failure — it re-derives the change from the staged
  `Invariant:` line against the current tree instead of trusting the cached patch bytes.

## Anti-pattern

| Pattern | Why it fails |
|---|---|
| Applying a confirmed row/patch/gate without re-reading live state first | The confirmation gate's wait is unbounded; treating the pre-wait snapshot as still true silently clobbers a concurrent write |
| Re-verifying at confirmation time instead of immediately before the write | The gap that matters is confirm-to-write, not fetch-to-confirm — a check run before the wait doesn't cover the wait itself |
