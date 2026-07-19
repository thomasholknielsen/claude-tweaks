---
record: 21
origin: capture
risk: low
effort: medium
grants: []
surface: backend
---
# 21: No unblock-cascade signal when a blocking record closes

Surface: backend

## Current State

Verified against the current codebase (v6.8.0). `skills/wrap-up/SKILL.md` Step 8 ("Analyze Next Steps") is the closest existing hook, but it has no real procedure — it's three aspirational bullets ("1. Newly unblocked specs — what can now be worked on?") followed by "Suggest running `/claude-tweaks:help` to see the full workflow status." No bash/node snippet, no query, no computation of any kind. `/claude-tweaks:help` itself (`skills/help/SKILL.md:79`) only has generic dependency-graph awareness for *prioritizing* what to build next ("Prefer records that unblock other records") — it doesn't compute or surface a delta ("this specific closure just unblocked these specific records"), and the user has to separately run it and manually notice.

`bin/lib/issues/record.js` already has `parseDependencies(body)` (parses `Blocked by #N` lines) but no reverse lookup (dependents of a given record) and no "are all blockers now resolved" helper — both need to be composed fresh, there's nothing to reuse directly.

The record that just closed is always known to wrap-up at this point — `materialize.md`'s header `record:` field (already read for the close-via-merge carrier commit, per its reader table: "`/wrap-up` close-via-merge carrier (`Fixes #{n}`) + Section E claim release").

## Deliverables

Give Step 8 a real procedure instead of the current punt-to-`/help` prose.

1. After the close-via-merge carrier commit (the record's own `record: {n}` is already known), query every open record for a `Blocked by #{n}` dependency on it:
   - `work-backend: github-issues`: `gh issue list --state open --json number,title,body --limit 200`, filter via `parseDependencies(body).includes(n)` (`bin/lib/issues/record.js`).
   - `work-backend: local-files`: `queryRecords('specs', {})` (`bin/lib/issues/local-store.js`; excludes closed records by default per #13's fix — correct here, since only open dependents matter), filter via `facets.blockedBy.includes(n)`.
2. For each dependent found, determine whether **every other** blocker (excluding `n`, which just closed) is also already resolved — i.e., this closure was the *last* one needed:
   - `github-issues`: one `gh issue list --state all --json number,state --limit 200` call, cross-reference each dependent's remaining `blockedBy` ids against that state map (`CLOSED` = resolved). One batch call, not one query per blocker.
   - `local-files`: for each remaining blocker id, attempt to read `specs/{blockerId}-*.md` directly; treat `facets.closed === true` or a missing file (already fully gone) as resolved.
3. Surface every dependent whose remaining blockers are now all resolved as "newly unblocked by this closure" — log one line to `decisions.md` (`AUTO {time} — Step 8: closing #{n} unblocked #{m} ("{title}"). Reversibility: n/a (informational).`), and feed into the Pipeline Summary / Next Actions the same way `wrap-up/SKILL.md`'s existing "Newly unblocked specs" Next Actions row (line ~404, `/claude-tweaks:build {N}` option) already does — that row currently has no computed source; this becomes its source.
4. Keep the fallback: still recommend `/claude-tweaks:help` for the full workflow status (unrelated dependents, broader picture) — this fix narrows what Step 8 knows *right now*, it doesn't replace `/help`'s broader dashboard role.

## Acceptance Criteria

- A record with a real `Blocked by #{n}` dependent, where that's the dependent's only blocker: after `/wrap-up` closes record `n`, the dependent is surfaced by Step 8 as newly unblocked, with a `decisions.md` log entry.
- A dependent with two blockers, only one of which is `n`: after closing `n`, the dependent is NOT surfaced (the other blocker is still open) — confirms the "every other blocker resolved" check, not just "any blocker is this one."
- A record with no dependents at all: Step 8 reports nothing new, no false positive, and does not error.
- Both drivers (`work-backend: github-issues` and `work-backend: local-files`) produce the same qualitative result for an equivalent dependency graph — verified by hand-tracing both branches against the acceptance scenarios above, not just one driver.
- `npm test` passes in full — this is new logic embedded in a skill-file procedure (bash/node one-liners), not a new `bin/lib/` module, so there's no new unit-test surface; confirm the existing suite is unaffected.

## Technical Approach

### Key Files

- `skills/wrap-up/SKILL.md` — Step 8's procedure (currently 3 vague bullets + a punt to `/help`)
- `bin/lib/issues/record.js` — `parseDependencies` (already exists, reused as-is; no changes needed here)
- `bin/lib/issues/local-store.js` — `queryRecords` (already exists, reused as-is)

### Approach

Compose Step 8's new procedure entirely from existing primitives (`parseDependencies`, `queryRecords`) via bash + node one-liners inline in the skill file — matching this codebase's established pattern (e.g. `specify/SKILL.md` Step 3's idempotency-fingerprint check uses the identical "one batch `gh issue list --state all`, cross-reference in JS" shape). No new `bin/lib/` module needed; this is pure orchestration of what already exists.

Batch the "are the other blockers resolved" check as ONE `gh issue list --state all` call (github-issues) rather than one `gh issue view` per blocker id — avoids an N+1 query pattern when multiple dependents share overlapping blocker sets.

## Gotchas

- "Newly unblocked" must mean *this closure was the last blocker*, not merely *this closure was A blocker* — a dependent with 2 open blockers, one of which just closed, is not actually buildable yet. Getting this wrong would produce a false "ready to build" signal.
- Don't re-implement a reverse-dependency index — `parseDependencies`/`facets.blockedBy` already encode the graph in the forward direction (dependent → blockers); querying "all open records, filter by blockedBy contains n" is the reverse lookup, computed fresh each time rather than maintained as stored state. At this repo's current record-count scale, an unindexed scan is fine; don't add caching or an index structure for this.
- This is purely informational/additive — it must not gate, block, or delay the close-via-merge step itself. If the dependent-check errors or times out, log it and continue; never fail the wrap-up over a next-steps annotation.
- Local-files' `queryRecords('specs', {})` excludes closed records by default (per #13) — correct for finding open dependents, but the *blocker-resolved* check needs the opposite (does the blocker's record show closed?), so don't reuse the same default-filtered query for both halves of this check.

## Original request

No unblock-cascade signal when a blocking record closes

**Related:** none

Context: Surfaced during a model-optimization review of the unified work-record system. Closing a blocker via merge doesn't check or surface its now-unblocked dependents.

Scope: wrap-up's close-via-merge step could check parseDependencies-derived dependents of the just-closed record and log/notify when one is now unblocked.

