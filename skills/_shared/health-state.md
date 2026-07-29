# Health-State — Durable Cross-Firing Storage Contract

`code-health`, `harness-health`, `journey-health`, and `docs-health` each need rotation cursors, a
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
  exhaustion, it returns `{ ok: false, error }` rather than throwing — for cursor/run-history
  bookkeeping, a lost write just means the next firing might redo some rotation work, which is
  safe (GitHub-issue fingerprint dedup during `validate-findings` means a redundant scan
  resolves to `skip`, never a duplicate issue). The retry queue is the one exception:
  `retry-cli.js`'s `drain()` returns the queued payloads as-is, with no existence/fingerprint
  check against GitHub before the calling skill re-attempts `gh issue create` — so if a
  payload's `gh issue create` succeeds but the same firing's end-of-run `writeState` (which
  bundles that dequeue with the cursor/run-history update) then exhausts its retries, the
  un-dequeued entry survives in `retry-queue.json` and the next firing's drain re-files it,
  creating a real duplicate issue rather than a safely-redone no-op.
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
  skill's own `readDurableState`/`writeDurableState` — `code-health`, `harness-health`,
  `journey-health`, and `docs-health`'s CLIs each call this instead of restating the same logic
  four times.

This is impure (real `git`/`gh` calls via an injectable runner), unlike `bin/lib/issues/claims.js`'s
deliberately emit-only design — issue claim/release is a decision-laden, audit-visible action
meant to be legible in the skill's own bash trail; reading/writing this branch is mechanical
plumbing nobody inspects mid-flight, closer to `bin/lib/code-health/scope.js`'s existing
impure-but-isolated git calls.

## MCP write path (no `gh` CLI available)

When `writeState`'s internal `hasGh()` probe finds no `gh` on PATH (a Claude Code cloud Routine
sandbox — see the companion `_shared/github-write-transport.md`), it does not attempt any
network call itself — MCP tools can only be invoked from the calling agent's own turn, never
from the spawned Node subprocess `writeState` runs in. Instead it returns
`{ ok: false, needsMcpWrite: true, branch: 'health-state', files: [{ path, content }] }`, and
each CLI command that calls it (`validate-findings`, `retry-queue update`) prints that shape
as JSON to stdout instead of its normal output.

The calling skill drives the retry loop itself, up to `MAX_CAS_ATTEMPTS` attempts
(`node -e "console.log(require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/health-core/durable-state.js').MAX_CAS_ATTEMPTS)"`):

1. Run the CLI command that produced the `needsMcpWrite` output (this attempt's fresh read
   already happened inside it).
2. Parse the JSON. If it doesn't have `needsMcpWrite: true`, the write either already
   succeeded via the gh path or failed for an unrelated reason — stop, nothing more to do
   here.
3. For each entry in `files`, resolve its current blob sha (empty/error means the file
   doesn't exist yet — omit `sha` on the write below):

   ```bash
   git -C "$ROOT" rev-parse "origin/health-state:${FILE_PATH}" 2>/dev/null
   ```

4. Ensure the `health-state` branch itself exists, before the first `create_or_update_file`
   call. Branch creation on this transport is a distinct MCP tool (`create_branch`), never an
   implicit side effect of a content write, so this path needs its own explicit bootstrap step
   exactly as the gh path needs `ensureBranch`:

   - Check whether the branch already exists — a cheap read attempt against a known path on
     that branch (the read counterpart to `create_or_update_file`), or whatever
     branch-existence check the calling agent's available MCP tools support.
   - If it does not exist, call `create_branch` with name = `health-state` and source = the
     repository's default branch. Tolerate an "already exists" rejection — a concurrent
     firing, or the gh path, may have created it first; this mirrors the gh path's own
     `createRef` 422-tolerance.
   - This means an MCP-bootstrapped `health-state` branch carries the default branch's
     history and tree underneath it, unlike the gh path's genuinely orphan, empty-tree
     branch. There is no MCP-exposed way to create a truly orphan branch, and the divergence
     is harmless — the branch is scratch, never merged into anything (see this file's opening
     paragraph) — but it is a real difference between the two paths, not an equivalence.
5. Call `create_or_update_file` for each file (owner/repo from the current GitHub remote,
   `branch` = the `branch` field from the JSON, `path`/`content` from that file's entry,
   `sha` = the value resolved in step 3 if the file already existed, omitted otherwise).
6. If every file's write succeeds, done — report success, same as a normal `{ ok: true }`.
7. If any file's write is rejected for a sha-mismatch/already-exists reason, sleep
   `casBackoffMs(attempt)` (`node -e "console.log(require(...).casBackoffMs(${ATTEMPT}))"`,
   then actually wait that many milliseconds) and go back to step 1 — state may have changed,
   so the CLI command must be re-run from scratch, not retried with stale data.
8. If any file's write fails for a reason that is clearly not a conflict (a hard tool error —
   malformed request, an outage), stop immediately and report the failure. Do not spend
   retry attempts on a broken transport.
9. If `MAX_CAS_ATTEMPTS` is exhausted without success, report the same non-fatal outcome the
   gh path's own exhaustion already produces (see each CLI's existing "non-fatal" stderr
   message) — a lost write here just means the next firing might redo some rotation work,
   safe per the same reasoning documented in "Mechanism" above.

The exact `create_or_update_file` and `create_branch` parameter names should be confirmed
against the live tool schema at the point this procedure is actually exercised — see
`_shared/github-write-transport.md` for the shared detection check and CRUD mapping this
procedure builds on.

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
