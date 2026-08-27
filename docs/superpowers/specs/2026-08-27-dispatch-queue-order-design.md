# Dispatch Queue Order — Persisted Ranking Cache

**Status:** Design — brainstormed from GitHub issue [#1546](https://github.com/thomasholknielsen/claude-tweaks/issues/1546), an explicit open question, not a prior settled decision.

## Problem

Every dispatch firing re-triages the entire authorized queue from scratch: fetch every `auto:build` issue, parse facets, verify dependencies (including a per-dependency live-state fallback when the bulk open-issues pull is truncated), query the native blocker graph, run the file-overlap union-find, and rank. `dispatch/queue-pull-script.md` — measured on Dispatch hub run #9 — takes ~65s and is almost entirely deterministic scripts, not model reasoning.

The maintainer's framing: "selecting an issue requires reviewing all — but building the DAG of which issues to work on next is really something that's done once; dispatch would just select the next one from that list."

Three wins motivate pursuing this (not just one — the design below has to serve all three):

1. **Near-free no-op firings.** At a 2-hourly Routine cadence, most firings likely hit an empty or unchanged queue — paying ~65s of deterministic work for a no-op every time is waste that compounds.
2. **One well-tested ranking place.** Today the ranking/grouping logic is re-executed (and re-interpreted) inside every session; centralizing it reduces the chance any one firing's re-derivation drifts from the canonical logic.
3. **A human-readable "what's next" artifact.** A durable, browsable queue order that exists *between* firings has standalone value, independent of dispatch's own performance.

The obvious naive design — persist the computed order and trust it — reintroduces the exact race the live pull exists to prevent: the queue mutates between firings (grants added/removed by `backlog refine`, dependencies closing, `bot:*` labels flipping, new records filed, `## Key Files` edited), and a stale persisted order is a second source of truth that must be kept honest against GitHub, the actual source of truth.

## Non-Goals

- Changing how eligibility, dependency resolution, native-blocker filtering, or file-overlap grouping are *computed*. This design adds a cache in front of `dispatch/queue-pull-script.md`'s existing logic; it does not touch that logic.
- Changing anything about `#N` / `#N,#M` direct-reference dispatch — those modes never run the queue-pull script and are unaffected.
- A general-purpose caching layer for other skills. This is scoped to dispatch's own queue pull.

## Design

### Architecture

A new git ref, `queue-order` (parallel to the existing `claims-registry` branch — see `plugin/skills/_shared/issue-claims.md`), holds one JSON blob: the last-computed, ranked, file-overlap-grouped eligible queue, plus a **freshness stamp**.

`dispatch/queue-pull-script.md`'s procedure changes from "always run the full pipeline" to:

1. Read the `queue-order` blob (one file read on a known ref — same shape as reading a claims-registry blob).
2. Compute the current **freshness signal**: `{number, updatedAt, state}` for every open `auto:build`-labeled issue, plus the same for every dependency issue number the persisted blob already recorded (its own dependency numbers were resolved the last time the full pull ran, so this list is known without re-deriving it).
3. **Match** (same issue-number set, same `updatedAt`/`state` values) → skip the full pull; use the persisted `groups`/`excluded` directly. Near-free.
4. **Mismatch, or blob absent/unreadable** → fall back to running today's full queue-pull script unchanged, then write the new result plus a new freshness stamp back to `queue-order`.

Nothing about *how* the full pull computes eligibility, dependencies, or file-overlap groups changes.

### Why the freshness signal covers dependencies, not just the auto:build set

A signal scoped to only the `auto:build`-labeled set has a blind spot: a **blocker issue closing** doesn't touch the blocked issue's own `updatedAt` at all, so a record can look "still blocked" past the point it's actually eligible. Extending the signal to include the dependency issue numbers the last full pull already resolved (no new query — those numbers are already known) closes this gap without paying for a whole-repo signal, which would invalidate on activity that has nothing to do with queue eligibility and erode the near-free-firing win.

### Blob format

`queue-order/order.json` on the `queue-order` branch:

```json
{
  "computedAt": "2026-08-27T12:00:00Z",
  "runId": "{run dir that computed this}",
  "freshnessSignal": {
    "issues": [{ "number": 1542, "updatedAt": "2026-08-27T10:00:00Z", "state": "OPEN" }]
  },
  "groups": [[{ "id": 1542, "keyFiles": ["plugin/skills/dispatch/task-prompt.md"] }]],
  "excluded": [{ "number": 1547, "blockedBy": [1546] }]
}
```

`groups`/`excluded` are exactly today's `dispatch-groups.json`/`dispatch-blocked-excluded.json` shapes — persisting what the script already produces, not a new ranking format.

### Write mechanics

Reuse `bin/lib/issues/claims.js`'s git-CAS-first / contents-API-fallback / bounded-retry write pattern (`_shared/issue-claims.md`'s "The lock" section) rather than a second implementation: a sibling module (or an extended `claims.js` covering a second keyspace) performs the same create-only / conditional-update write. Two firings racing to recompute both attempt the same write shape; the losing CAS attempt is simply discarded — no reconciliation needed, since this blob is a cache, not a lock, and the loser's own in-memory recomputed groups are still valid for that firing's own use even though the persist didn't win. No TTL is needed (unlike claims) — staleness is judged by the freshness signal, not by age.

### Read mechanics

Same dual-transport story `_shared/issue-claims.md`'s "Reading claim state" already establishes (gh-CLI contents API, MCP fallback when `gh` is absent) — this design adds no new transport story, only a new branch/path.

### Ownership: reactive-only, dispatch-owned

Dispatch is the only writer. It checks freshness on read and recomputes+repersists only when stale. `reconcile` does **not** get a new sweep to proactively refresh this artifact — a human browsing the `queue-order` branch between firings may see it slightly behind live state until the next dispatch firing touches it, which is an acceptable tradeoff for keeping exactly one code path responsible for the artifact's correctness. (Rejected alternative, and why: see Alternatives Considered.)

### Failure handling

| Failure | Behavior |
|---|---|
| `queue-order` branch/blob doesn't exist yet | Treat as a stale-blob miss — run the full pull, then bootstrap the branch (same tolerant-of-concurrent-create pattern as `claims-registry`) and write the first blob. |
| Blob read fails (network, auth, malformed JSON) | Fail open — run the full pull as if no cache existed. Never a hard gate; this is a performance optimization, not a correctness dependency. |
| Freshness-signal fetch fails (the `gh issue list` call itself errors) | Same fail-open — treat as a mismatch, run the full pull. |
| Write-back (recompute → persist) fails or loses the CAS race | Log and move on — the recomputed groups are still used for *this* firing from memory; only the persisted cache misses the update, corrected whenever a firing next recomputes. |
| `gh` absent | MCP path, same dual-transport story `_shared/issue-claims.md` already documents for claims — no new branching logic to invent. |

This preserves the property the originating issue's own "Definition" section asks for: "recompute every firing" stays the correct, always-safe fallback. This design only adds a faster path that's provably safe to skip when the freshness signal matches — never a new way to serve wrong data.

### Testing

The freshness-signal comparison (match/mismatch classification) and the blob's compose/parse functions are pure and unit-testable in isolation, mirroring `claims.js`'s `classifyClaimBlob` test coverage. The git-CAS write path should mirror `claim-store.js`'s existing test suite structure rather than invent a parallel one. No new integration/live-API test surface beyond what `_shared/issue-claims.md`'s existing consumers already exercise.

### Rollout

Additive only: `dispatch/queue-pull-script.md` gains a cache-check prefix and a fallback-write suffix. `#N`/`#N,#M` direct-reference dispatch is unaffected, since it never runs the queue-pull script.

## Alternatives Considered

**ETag/`updatedAt`-only short-circuit, no persisted groups/blob — just skip re-fetching if nothing changed.** Rejected as insufficient on its own: it would address win (1) alone, but leaves wins (2) and (3) unaddressed — there'd be no single artifact holding the canonical ranking, and nothing for a human to read between firings. The design above subsumes this: the freshness check *is* this short-circuit, just paired with a persisted artifact that also serves the other two wins.

**Reconcile proactively maintains the order as one of its sweeps** (in addition to dispatch's own lazy recompute). Considered and rejected for the initial design: it would keep the human-readable artifact fresher between firings, but at the cost of a second code path that can write the same artifact, which is exactly the kind of split-ownership complexity `_shared/issue-claims.md`'s single-keyspace-single-classifier design deliberately avoids for claims. Revisit if, after shipping the reactive-only version, staleness-between-firings turns out to matter more in practice than this design assumes.

**Whole-repo freshness signal** (any open issue's `updatedAt`, not scoped to `auto:build` + dependencies). Rejected: catches everything, including activity with no bearing on queue eligibility, which erodes the near-free-firing win the design exists to protect.

## Open Questions for Implementation

- Exact module boundary for the write path — a new sibling to `claims.js`, or an extended `claims.js` covering a second keyspace (`queue-order/` vs `claims/`) on possibly the same branch or a distinct one. The design above assumes a distinct `queue-order` branch for isolation from claim-lock semantics, but this is worth a final call during `/specify`, not baked in here.
- Whether the freshness-signal fetch (`gh issue list ... --json number,updatedAt`) can be combined with the queue-pull script's own existing first bulk call (`DISPATCH_QUEUE_RAW`) rather than being a fully separate request, to avoid doubling API calls on the mismatch path.
