---
record: 39
origin: capture
risk: medium
effort: low
ceremony: fast-lane
grants: []
surface: backend
---
# 39: Dispatch's queue selection doesn't check native (work-links: native) Blocked-by dependencies

Surface: backend

## Current State

Dispatch's eligibility filter (`skills/dispatch/SKILL.md` Step 2, "Pull the authorized queue and group by file overlap") excludes an open-`Blocked by #N` record from the dispatchable queue by calling `parseDependencies(body)` (`bin/lib/issues/record.js:213-225`) against each candidate's body and dropping any candidate whose dependency target is still an open issue number. `parseDependencies` only matches the line-anchored `Blocked by #N` body-text pattern (`DEP_RE`, `record.js:42`) — it has no knowledge of GitHub's native sub-issue/dependency relationship.

The `work-links: native` gap is already documented inline in `skills/dispatch/SKILL.md`, in the paragraph immediately following Step 2's code block: "`parseDependencies` reads only `Blocked by #N` body-text lines — a record whose blocker is expressed via GitHub's native sub-issue/dependency relationship (`work-links: native`) is not filtered by this check. Widening this to also query the native relationship is a follow-up, not covered here." This record is that follow-up.

`bin/lib/issues/capabilities-probe.js`'s `probeSchema` already detects whether a GitHub host exposes native dependency data (`blockedBy` and/or `issueDependenciesSummary` on the `Issue` type) — confirming the underlying data is queryable — but nothing in the codebase actually queries it for a real dependency check yet; `probeSchema` is introspection-only, used by `/init` to decide the `work-links` config value, not by any runtime dependency filter.

Live verification against this project's own GitHub host (`gh api graphql` introspection, run during this shaping pass) confirms `blockedBy` returns a real `IssueConnection` — `{ nodes { number state } }` — not just a count, and that aliased multi-issue batching in one query works (tested with `i39: issue(number:39){...} i37: issue(number:37){...}`, both returned correctly). `issueDependenciesSummary` is a separate, count-only type and is not suitable for this filter.

## Deliverables

- In `skills/dispatch/SKILL.md` Step 2, after computing `eligible` (the existing facets/body-text-dependency-filtered array) and before `groupByFileOverlap`, add a `work-links: native` branch: one batched `gh api graphql` call using one aliased `issue(number: N)` sub-query per eligible candidate (alias prefixed `i`, since GraphQL aliases can't start with a digit), requesting `blockedBy(first: 25){ nodes { number state } }`.
- Filter out any candidate whose `blockedBy` nodes include at least one node with `state == "OPEN"` — mirrors the existing body-text filter's semantics (`!parseDependencies(i.body).some((dep) => openNumbers.has(dep))`), just against native dependency data instead of body text.
- Read `work-links` from CLAUDE.md (`_shared/work-record.md`'s Config keys table) once at the top of Step 2, branch on it there — do not re-probe mid-flow (matches the project's existing "read once" discipline, `_shared/work-record.md`'s Config keys section).
- `work-links: body-text` (this project's actual current config) and `work-backend: local-files` are unaffected — no behavior change on either path.
- Update the "`work-links: native` gap" callout paragraph immediately after Step 2's code block to describe the new behavior instead of the gap — it currently reads as an open TODO and needs to become a description of what's implemented.
- Update `skills/dispatch/SKILL.md`'s own reference-table row for `bin/lib/issues/{claims,retry,grouping,record}.js` (near the end of the file) — it currently says "Step 2 also calls record.js's `parseDependencies` to drop records with an open `Blocked by #N` line from the queue" and needs a clause covering the new native-mode GraphQL check.

## Acceptance Criteria

- Under `work-links: native`, a candidate record with at least one native `blockedBy` node whose `state` is `OPEN` is excluded from Step 2's eligible/dispatchable pool — same outcome as an open `Blocked by #N` body-text line under `work-links: body-text` today.
- Under `work-links: native`, a candidate record whose native `blockedBy` nodes are all `CLOSED` (or has none) remains eligible — matches the existing body-text filter's "only open blockers exclude" semantics.
- The native-mode dependency check is exactly one additional `gh api graphql` call per Step 2 invocation, aliased across the whole eligible-candidate pool — not one call per candidate.
- `work-links: body-text` and `work-backend: local-files` behavior is byte-for-byte unchanged — this is additive only under `work-links: native`.
- The "`work-links: native` gap" paragraph and the `bin/lib/issues/{claims,retry,grouping,record}.js` reference-table row in `skills/dispatch/SKILL.md` no longer describe this as an open gap.

## Technical Approach

**File:** `skills/dispatch/SKILL.md`, Step 2 ("Pull the authorized queue and group by file overlap").

1. Read `work-links` (`native` | `body-text`) from CLAUDE.md once, before the existing `eligible` computation.
2. Keep the existing `eligible` computation (facets filter + body-text dependency filter) exactly as-is for `work-links: body-text`.
3. For `work-links: native`, after `eligible` is computed, issue one batched query:

   ```graphql
   query($owner:String!,$repo:String!){
     repository(owner:$owner,name:$repo){
       i39: issue(number:39){ number blockedBy(first:25){ nodes{ number state } } }
       i37: issue(number:37){ number blockedBy(first:25){ nodes{ number state } } }
       # ...one aliased field per eligible candidate's issue number
     }
   }
   ```

   Verified live against this repo (`gh api graphql`) — both a single-issue query and a two-issue aliased batch returned correctly-shaped `{ nodes: [{ number, state }] }` data.

4. Parse the response; drop any candidate whose `blockedBy.nodes` array contains an entry with `state === "OPEN"`.
5. Feed the resulting filtered set into the existing `groupByFileOverlap` call, unchanged.
6. Update the gap-callout paragraph and the reference-table row named in Deliverables.

## Gotchas

- **`blockedBy` vs `issueDependenciesSummary` — verified, not assumed.** `blockedBy` is a real `IssueConnection` (individual `{number, state}` nodes); `issueDependenciesSummary` is a separate, count-only type. This fix must query `blockedBy`, not `issueDependenciesSummary` — a summary count can tell you a record IS blocked but not by which node, and dispatch's filter only needs the open/closed state of whichever nodes exist, not a total count, so `blockedBy` is both sufficient and necessary here. `capabilities-probe.js`'s own header comment notes real-world field-name variance across GitHub Enterprise versions — if a target host's schema only exposes `issueDependenciesSummary` and not `blockedBy`, this exact query fails; that is a pre-existing `work-links: native` capability gap `/init`'s probe is responsible for, not something this record needs to solve.
- **GraphQL alias naming:** aliases can't start with a digit — every issue number must be prefixed (e.g. `i39`, not `39`). Verified live.
- **Batch size:** the aliased query matches Step 2's existing `--limit 100` candidate cap. No evidence this hits GitHub's query-complexity budget at that scale (only tested live at 1-2 aliases; the query shape is identical whether 2 or 100 aliases), but if it ever does, chunk into pages rather than reverting to per-issue calls — preserves Step 2's existing "bulk calls, not per-issue re-fetches" design principle.
- **Does NOT check both native and body-text simultaneously.** This spec branches per `work-links` config, mirroring `flow/materialize.md`'s existing convention (`blocked-by` is driver/work-links-dependent, not additive). A project mid-migration from `body-text` to `native` with stale `Blocked by #N` lines still in some bodies is out of scope — separate follow-up if it turns out to matter in practice.
- **This project's own `work-links` value is not `native`** (empirically: every open record's dependency-style field observed during this shaping pass used body-text `**Related:**` conventions, and CLAUDE.md has no explicit `work-links` setting) — this change has zero live blast radius on this repo today; it only matters for a project that has `work-links: native` configured.

## Original request

Dispatch's queue selection doesn't check native (work-links: native) Blocked-by dependencies

**Related:** #14

Context: dispatch/SKILL.md Step 2's open-dependency filter (added by commit 39b4e2c, closing #20) only reads `Blocked by #N` body-text lines via record.js's `parseDependencies` -- a record whose blocker is expressed via GitHub's native sub-issue/dependency relationship (`work-links: native`) isn't filtered by this check. The file already documents this gap inline: "work-links: native gap ... Widening this to also query the native relationship is a follow-up, not covered here."

Scope: Extend dispatch Step 2's eligibility filter to also query the native dependency relationship (the same `blockedBy`/`issueDependenciesSummary` GraphQL fields `capabilities-probe.js`'s `probeSchema` checks for) when `work-links: native` is configured, so a native-linked blocker is excluded from the queue the same way a body-text one already is.
