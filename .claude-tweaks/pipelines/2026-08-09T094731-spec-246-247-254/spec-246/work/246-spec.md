---
record: 246
origin: human
risk: low
effort: low
ceremony: standard
grants: []
surface: backend
---
# 246: Wire a same-run reader for the per-run record cache (work/record-{n}.json)

Surface: backend

## Current State

`flow/materialize.md` ("Record cache write (no second fetch)") writes each record's raw fetched fields to `{run-dir}/work/record-{n}.json` at materialization time, per `_shared/pipeline-run-dir.md`'s "Per-run record cache" convention. That convention defines the invalidation rule: the cache serves reads; every mutation writes through; a step needing live label state for a decision reads live and never touches the cache.

No reader exists. #238's build verified (IL-71) that the originally-audited fetch sites (`/specify`, `/backlog refine`, `/demo`) all run outside any pipeline run dir's lifetime by construction, so they can never consume a run-scoped cache. The one known same-run re-fetch today is `/review`'s effort-derivation step (`skills/review/review-effort-derivation.md`), which re-fetches the record's labels via `gh issue view {n} --json labels` into `/tmp/review-record-{n}.json` mid-run — but it reads label state to pick review effort, which may fall under the invalidation rule's "needs live label state for a decision" carve-out. `/build` has no distinct "re-verify the record's premise" live re-fetch step (dispatch's Step 4 claim-time re-check is a different mechanism, explicitly instructed not to trust anything cached).

## Deliverables

1. An enumeration of every same-run record fetch that occurs after materialization (sweep skills/ for `gh issue view {n}` / `readRecord` call sites reachable inside a pipeline run), each classified against the cache's invalidation rule: cache-eligible vs. needs-live.
2. For each cache-eligible fetch (if any): wire it to read `{run-dir}/work/record-{n}.json` first, falling back to a live fetch when the file is absent, per the convention.
3. If no fetch is cache-eligible: close this record as won't-fix with the enumeration recorded, and resolve the writer's fate explicitly in the same disposition — either remove the cache write from `materialize.md` + `_shared/pipeline-run-dir.md`, or record the concrete condition under which it gains a reader (IL-85: no compatibility/infrastructure path without a recorded removal or activation condition).

## Acceptance Criteria

- The enumeration is recorded (on this issue or in the closing commit) and covers every post-materialization record fetch in skills/**, with a per-site eligibility verdict citing the invalidation rule.
- Any wired reader reads the cache first and falls back to a live fetch when absent; no site that needs live label state for a decision reads the cache.
- The `/review` effort-derivation site is explicitly adjudicated (it is the strongest known candidate and also the likeliest invalidation-rule exclusion) — its verdict and reasoning appear in the enumeration.
- If closed won't-fix: the writer's fate (removed, or kept with a recorded activation condition) is decided and executed in the same change — the cache does not remain silently inert.
- `npm test` passes; prose edits keep `_shared/pipeline-run-dir.md`'s convention text and its consumers consistent (both sides of every cross-reference updated).

## Technical Approach

Prose-level wiring: the reader is a skill-procedure instruction (read the JSON file, fall back to `gh issue view`), not new Node code. The judgment call to make during the build, not before: whether `/review`'s label read is a "decision needing live label state" (labels can change mid-run via human edits — the conservative reading) or a stable-at-materialization read (risk/size labels are stamped at specify time and effectively frozen for the run — the pragmatic reading).

### Key Files

- skills/_shared/pipeline-run-dir.md
- skills/flow/materialize.md
- skills/review/review-effort-derivation.md

## Gotchas

- IL-71 already applied once here: the original audit's premise ("5 separate fetches") was mostly wrong. Re-derive the enumeration from the live tree at build time rather than trusting this record's own candidate list.
- The invalidation rule is the contract — a reader that caches a decision-relevant label read reintroduces exactly the staleness hazard the rule exists to prevent. When in doubt, classify needs-live.
- Won't-fix is a legitimate outcome and was named by the original capture; do not manufacture a reader to avoid it.

## Original request

Wire a same-run reader for the per-run record cache (work/record-{n}.json)

Context: #238 built the per-run record cache convention (`_shared/pipeline-run-dir.md`'s
"Per-run record cache" section) and its one writer (`flow/materialize.md`, at materialization
time). No reader was wired, because checking the premise against live files (IL-71) during that
build showed most of the original "5 separate fetches" audit (`/specify`, `/backlog refine`,
`/demo`) run outside any pipeline run dir's lifetime by construction — before `/flow` creates
one, or after `/wrap-up` archives it — so a run-scoped cache cannot reach those hops.

Scope: find (or create) a genuine same-run second fetch of a record already cached by
`materialize.md`, and wire it to read `work/record-{n}.json` first, falling back to a live fetch
when absent — per the cache's own invalidation rule (cache serves reads; every mutation writes
through; a step needing live label state for a decision reads live and never touches the cache).
Candidate: `/claude-tweaks:build`'s own IL-71/IL-109 "re-verify the record's premise at build
start" step, if and when one exists as a distinct live re-fetch (not found as of #238 — dispatch's
Step 4 claim-time re-check is a different mechanism, explicitly instructed not to trust anything
cached). If no such reader is ever added, the cache remains inert infrastructure and this record
should be closed as won't-fix with that finding recorded.

Related: #238
