---
record: 118
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
surface: backend
---
# 118: declined.json is durable state that no documentation mentions

Surface: backend

## Current State

`bin/lib/health-core/durable-state.js` reads and writes a per-skill `{skill}/declined.json` file on the shared `health-state` branch, gated by an `includeDeclined` construction flag. Three of the four health skills opt in:

```
bin/lib/docs-health/cache.js:24     createDurableState('docs-health',    { includeRemembered: true, includeDeclined: true })
bin/lib/harness-health/cache.js:20  createDurableState('harness-health', { includeRemembered: true, includeDeclined: true })
```

(`journey-health` opts into neither; `code-health` opts into `includeRemembered` only.)

`skills/_shared/health-state.md` is the canonical description of what lives on the `health-state` branch, and its branch tree does **not** list `declined.json` at all. `grep -rn declined skills/` returns no mention anywhere in the plugin — the only hits are `design-wrapper`'s unrelated declined-recommendations cache.

So there is durable, cross-run, shared-branch state that the documentation describing that branch does not know exists — invisible to anyone debugging why a health sweep stopped surfacing a finding it previously surfaced, which is precisely what a declined-findings store causes.

The same file's `includeRemembered` prose was also wrong until #96 — it claimed only `code-health` opted in, when `harness-health` and `docs-health` do too (confirmed by the module excerpt above).

## Deliverables

- [ ] Add `declined.json` to `health-state.md`'s branch tree, listing which of the four health skills carries it (`docs-health`, `harness-health` — per `includeDeclined: true` above; not `journey-health` or `code-health`).
- [ ] State the consequence of deleting `declined.json`: previously-declined findings resurface on the next sweep.
- [ ] Re-check every other claim in `health-state.md`'s durable-state section (not just `includeRemembered`) against what `durable-state.js`'s construction calls actually pass, by executing the modules rather than reading them — the same method that caught the `includeRemembered` error. Fix any other claim found stale.

## Acceptance Criteria

1. `health-state.md`'s branch tree lists every file `durable-state.js` can read or write (`remembered.json`, `declined.json`, and any other file `createDurableState` gates by construction flag), not just the ones already documented.
2. Each listed file names which of the four health skills (`code-health`, `docs-health`, `harness-health`, `journey-health`) actually carries it, derived by executing each skill's `cache.js` construction call (e.g. `node -e "..."` importing `createDurableState`'s call site or inspecting the flags passed), not by reading source and inferring.
3. The consequence of deleting `declined.json` (declined findings resurface) is stated explicitly next to its branch-tree entry.
4. No claim in `health-state.md`'s durable-state section contradicts what the four skills' `cache.js` files actually pass to `createDurableState` — verified by executing/inspecting all four, not just the ones already flagged.

## Technical Approach

Read `bin/lib/health-core/durable-state.js` to enumerate every file `createDurableState`'s flags can produce (`remembered.json` under `includeRemembered`, `declined.json` under `includeDeclined`, plus any base file the constructor always writes regardless of flags). Then read each of the four skills' `cache.js` (`bin/lib/code-health/cache.js`, `bin/lib/docs-health/cache.js`, `bin/lib/harness-health/cache.js`, `bin/lib/journey-health/cache.js`) to confirm which flags each one actually passes — this is the execution/inspection step the Acceptance Criteria require, not a re-read of the grep already done in Current State. Cross-check the resulting skill-to-file matrix against `health-state.md`'s current branch tree and update it to match.

### Key Files

- `skills/_shared/health-state.md` — the branch tree to correct; add `declined.json` and its skill ownership, verify `includeRemembered` and any other flag-derived claims
- `bin/lib/health-core/durable-state.js` — source of truth for what `createDurableState` can produce
- `bin/lib/code-health/cache.js`, `bin/lib/docs-health/cache.js`, `bin/lib/harness-health/cache.js`, `bin/lib/journey-health/cache.js` — source of truth for which flags each skill actually passes

## Gotchas

- Verify by executing/inspecting the four `cache.js` files' actual construction calls, not by trusting a prior reading of them — that is exactly how the `includeRemembered` error was introduced and how it was later caught during #96.
- Don't stop at `declined.json` and `includeRemembered` — the Deliverables explicitly call for checking whether any *other* claim in the same section was derived from the same stale reading.

## Original request

declined.json is durable state that no documentation mentions

## Current State

`bin/lib/health-core/durable-state.js` reads and writes a per-skill `{skill}/declined.json` on the shared `health-state` branch, gated by an `includeDeclined` construction flag. Three of the four health skills opt in:

```
bin/lib/docs-health/cache.js:24     createDurableState('docs-health',    { includeRemembered: true, includeDeclined: true })
bin/lib/harness-health/cache.js:20  createDurableState('harness-health', { includeRemembered: true, includeDeclined: true })
```

(`journey-health` opts into neither; `code-health` opts into `includeRemembered` only.)

`skills/_shared/health-state.md` is the canonical description of what lives on that branch, and its branch tree does **not** list `declined.json` at all. `grep -rn declined skills/` returns no mention anywhere in the plugin — the only hits are `design-wrapper`'s unrelated declined-recommendations cache.

So there is durable, cross-run, shared-branch state that the documentation describing that branch does not know exists.

## Why it matters

`health-state.md`'s branch tree is what a reader consults to answer "what state does a health sweep carry between runs, and what happens if I delete it." An undocumented file in that tree is invisible to exactly the person trying to reason about it — including anyone debugging why a sweep stopped surfacing a finding it previously surfaced, which is precisely what a declined-findings store causes.

## Deliverable

- Add `declined.json` to `health-state.md`'s branch tree, with which skills carry it and what it gates.
- State the consequence of deleting it (previously-declined findings resurface).
- While there: the same file's `includeRemembered` prose was wrong until #96 — it claimed only `code-health` opted in, when `harness-health` and `docs-health` do too. Check whether any other claim in that section was derived from the same stale reading.

## Acceptance Criteria

- The branch tree lists every file `durable-state.js` can read or write.
- Each entry names which of the four skills actually carries it.
- Verified by executing the modules, not by reading them — that is how the `includeRemembered` error was found.

## Original request

Found during #96 while editing `health-state.md`'s branch tree; out of scope there (not a cardinality desync).
