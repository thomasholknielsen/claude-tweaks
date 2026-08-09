# 246 — Retire the per-run record cache (won't-fix disposition, writer removed)

**Spec:** `.claude-tweaks/pipelines/2026-08-09T094731-spec-246-247-254/spec-246/work/246-spec.md`

**Build-time finding (the enumeration the spec's Deliverable 1 requires):** every same-run post-materialization record fetch in `skills/**` was enumerated and classified against the cache's invalidation rule (`_shared/pipeline-run-dir.md`, "Per-run record cache"):

| Site | What it fetches | Verdict |
|---|---|---|
| `review/review-effort-derivation.md` step 2 | `risk:*`/`size:*` labels → review-effort tier | **needs-live (excluded by rule)** — the invalidation rule's own text: "a step that only needs to confirm current label state for a decision … reads live and does not consult or refresh this cache" |
| `wrap-up/review-console.md` auto-merge gate; `wrap-up/SKILL.md:240` | live `auto:merge` labels | **needs-live (explicitly)** — the prose itself mandates re-reading live state, never the header projection |
| `wrap-up/verification-brief.md` family gate | the **parent** record's comments/labels/leaf states | **not cacheable** — different record than the materialized one; staleness is the documented hazard it re-fetches to avoid |
| `wrap-up/execution-and-verification.md` closure checks | post-mutation state (labels, comments) | **needs-live** — verifies that mutations just made actually landed; a cache defeats the check |
| `demo`, `dispatch`, `backlog`, `tidy`, `specify`, `challenge`, `assess-agent-autonomy`, `_shared/github-write-transport.md` | various | **outside run-dir lifetime** (before `/flow` creates it or after `/wrap-up` archives it) or explicitly instructed not to trust caches (dispatch Step 4) |

**Conclusion:** no cache-eligible reader exists, and none can: label readers are excluded by the rule's own carve-out, and every in-run need for the record's descriptive fields (title/body) is already served by the frozen `work/{n}-spec.md` artifact that materialization composes from the same fetch. Both consumer classes are closed off by construction, not by accident — so recording an "activation condition" (spec Deliverable 3's alternative) would be a condition that can never fire without first rewriting the invalidation rule itself. Per IL-85's no-inert-infrastructure discipline, the writer is removed.

## Task 1: Remove the "Per-run record cache" section from `_shared/pipeline-run-dir.md`

Files: `skills/_shared/pipeline-run-dir.md`

Delete the entire `## Per-run record cache` section — from the `## Per-run record cache` heading up to (not including) the `## See also` heading. Nothing else in the file references it (verified by sweep at plan time).

## Task 2: Remove the "Record cache write" paragraph from `flow/materialize.md`

Files: `skills/flow/materialize.md`

Delete the single paragraph beginning `**Record cache write (no second fetch).**` (line ~122). The surrounding "When this runs" content stays untouched.

## Task 3: Record the enumeration in the committed spec file

Files: `.claude-tweaks/pipelines/2026-08-09T094731-spec-246-247-254/spec-246/work/246-spec.md`

Append a `## Build Finding — Enumeration and Disposition` section carrying the table and conclusion above verbatim (this is the audit-trail copy the spec's Acceptance Criteria require in the closing commit).

## Verification

- `grep -rn "Per-run record cache" skills/` → zero hits.
- `grep -rn "record-{n}.json" skills/` → only `review-effort-derivation.md`'s unrelated `/tmp/review-record-{n}.json` scratch name (a name collision, not a cache reference) and this run's own committed spec/plan artifacts.
- Control grep (the sweep must be able to find things): `grep -rn "review-record" skills/review/review-effort-derivation.md` → non-zero.
- `npm test` passes (prose-only change; suite must stay at baseline 2924 pass).
