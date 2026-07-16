# Health-State — Durable Cross-Firing Storage Contract

`code-health`, `harness-health`, and `journey-health` each need rotation cursors, a
filing retry queue, and (code-health only) a sub-threshold "remembered" cache to survive
between scheduled Routine firings. A scheduled cloud-routine (CCR) firing starts from a
fresh, stateless container every time, so local gitignored disk (`.claude-tweaks/{skill}/*.json`)
does not survive between firings — only `cache.json` (the open/closed/wontfix/regressed dedup
cache, rebuilt fresh from `gh issue list` every run) stays there, since GitHub issue state is
already its own source of truth.

Everything else durable lives on a dedicated branch, **`health-state`**, created once and never
merged into `main` or any other branch — a scratch area for machine bookkeeping only:

```
code-health/cursors.json
code-health/remembered.json      # sub-threshold findings — code-health only
code-health/retry-queue.json
code-health/runs.json            # capped to the last 90 records

harness-health/cursors.json
harness-health/retry-queue.json
harness-health/runs.json

journey-health/cursors.json
journey-health/retry-queue.json
journey-health/runs.json

docs-health/cursors.json
docs-health/retry-queue.json
docs-health/runs.json
```

## Mechanism

`bin/lib/health-core/durable-state.js`'s `createDurableState(skillName, { includeRemembered } = {})`
returns `{ readState(root), writeState(root, mutatorFn) }`:

- **`readState`** — `git fetch origin health-state`, then `git show origin/health-state:<path>`
  per file. Degrades to `{}`/`[]` defaults if the branch or a file doesn't exist yet — never
  throws.
- **`writeState`** — builds a new commit (blob → tree → commit via the Git Data API,
  `gh api repos/{owner}/{repo}/git/blobs|trees|commits`) on top of the branch's current tip,
  then updates the ref with `force: false`. GitHub's fast-forward-only ref update is the
  compare-and-swap: if another firing moved the branch first, the update is rejected and
  `writeState` retries the whole read-modify-write cycle (bounded at 3 attempts). On
  exhaustion, it returns `{ ok: false, error }` rather than throwing — a lost bookkeeping write
  just means the next firing might redo some rotation/retry work, which is safe (GitHub-issue
  fingerprint dedup means a redundant re-file attempt resolves to `skip`, never a duplicate
  issue).
- `includeRemembered` (default `false`) gates whether `remembered.json` is ever read or written
  at all for this skill — a property decided once, at `createDurableState` call time, not
  inferred per-write from whether the in-memory state object happens to carry a `remembered`
  key. Only `code-health` passes `{ includeRemembered: true }`; `harness-health` and
  `journey-health` never opt in, so they can never accidentally pick up a stray
  `remembered.json`.
- Each skill's own `bin/lib/{skill}/cache.js` calls these instead of the old local
  `readCursors`/`writeCursors` — same call shape, new storage underneath.
- **`bin/lib/health-core/retry-cli.js`**'s `makeRetryQueueCommands({ readDurableState, writeDurableState })`
  gives the retry-queue drain/update commands (below) one shared implementation, bound to each
  skill's own `readDurableState`/`writeDurableState` — `code-health`, `harness-health`, and
  `journey-health`'s CLIs each call this instead of restating the same logic three times.

This is impure (real `git`/`gh` calls via an injectable runner), unlike `bin/lib/issues/claims.js`'s
deliberately emit-only design — issue claim/release is a decision-laden, audit-visible action
meant to be legible in the skill's own bash trail; reading/writing this branch is mechanical
plumbing nobody inspects mid-flight, closer to `bin/lib/code-health/scope.js`'s existing
impure-but-isolated git calls.

## Retry / dead-letter queue

Each skill's `retry-queue.json` is an array of
`{ fingerprint, payload, firstFailedAt, attempts, lastError }` — one entry per finding that was
fingerprinted but whose `gh issue create` call failed. Filing itself stays skill-executed
(`gh issue create`, run by the skill's own bash steps, same as always) — only the durable
bookkeeping of *which* findings still need retrying lives in `durable-state.js`.

**Drain-before-rotate.** Every firing's filing step first attempts to re-file everything
already in the skill's retry queue, *before* normal slice/target rotation begins:

1. Read the current queue (`readState(root).retryQueue`).
2. Attempt `gh issue create` for each queued payload, same as any freshly-discovered finding.
3. On success, remove the entry (`dequeueRetry`).
4. On a fresh failure (queue drain, or a brand-new finding that fails to file), add/update the
   entry (`enqueueRetry`) — increments `attempts` for a repeat fingerprint, starts a new one at
   `attempts: 1`.
5. Persist the updated queue in the same `writeState` call that also persists this firing's
   cursor/run-history update — one commit per firing, not one write per queue mutation.
6. For any entry where `shouldEscalate(entry)` is now true (3rd consecutive failure), file (or
   update) a dedicated issue labeled `{skill}:filing-failed` naming the stuck fingerprint and
   its failure history, bootstrapped via `_shared/label-bootstrap.md`'s standard snippet. This
   surfaces the problem through the normal GitHub issue list a human already watches, rather
   than growing the queue silently forever.

## What this contract does not cover

`cache.json`'s open/closed/wontfix/regressed dedup entries — those stay local, gitignored,
rebuilt fresh from `gh issue list` every run, unaffected by this contract.
