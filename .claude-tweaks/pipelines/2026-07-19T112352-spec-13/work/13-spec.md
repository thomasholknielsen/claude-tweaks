---
record: 13
origin: human
risk: low
effort: low
grants: []
surface: backend
---
# 13: Feature request: native spec close-out support (auto close-run + spec-backend toggle)

Surface: backend

## Current State

This issue reported two gaps, filed 2026-07-13 against an earlier version of this repo (before the unified work-record model — `local-store.js`, the `local-files` driver — existed at all; `local-store.js` landed in commit `2f911b2`, after this issue was filed). Re-verified against the current codebase (v6.8.0):

**Gap 1 — `close-run` reliability — already resolved, no action needed.** `skills/wrap-up/cleanup-procedures.md` Section B step 3 (item 8 of the canonical cleanup list) already runs `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" close-run --run "$RUN_DIR"` as a mandatory terminal step of every `/wrap-up`, before pipeline-run archival — not a manual habit that can be forgotten. This matches the issue's own requested fix verbatim ("have `/wrap-up`'s own terminal step call `close-run`'s equivalent automatically"). Confirmed first-hand this session: three separate `/wrap-up` runs (for #14, #32, #38) all auto-closed their run dirs without a manual step.

**Gap 2 — `spec-backend` toggle — partially resolved; a real, narrower gap remains.** The unified work-record model (`work-backend: github-issues | local-files`, `_shared/work-record.md`) supersedes the `spec-backend`/`backlog-backend` split the issue proposed — specs and backlog items are now the same "record" concept, not two conventions to keep in sync.

- Under `work-backend: github-issues` (this repo's own configured driver, and the modern default) the reported failure mode is now structurally impossible: there is no spec file, no `specs/INDEX.md`, and no manual close-out sweep — a record closes when its carrier commit (`Fixes #{n}`) merges, per `cleanup-procedures.md` item 5's "Record mode: no-op — closure is close-via-merge." GitHub's own issue-closed state is the ledger.
- Under `work-backend: local-files`, the exact failure class the issue describes is still live today. `bin/lib/issues/local-store.js` exports only `{ readRecord, writeRecord, allocateId, queryRecords }` — there is no delete, archive, or close function at all. `cleanup-procedures.md` item 5 is a documented no-op for record mode regardless of driver, so a completed `local-files` record's file just stays in `specs/` forever with whatever `facets.stage` it last had. Every one of `local-store.js`'s 18 call sites (`skills/tidy`, `skills/help/status-scan.md`, `skills/review-backlog`, `skills/demo`, `skills/specify`) calls `queryRecords` assuming every file under `specs/` is still-open, current work — there is no way today to mark a `local-files` record closed and have it stop surfacing everywhere records are listed. This reproduces the original bug report's "154 spec files, permanent ever-growing log" problem one level down, scoped specifically to the `local-files` driver.

## Deliverables

Close the `local-files` driver gap only — the `github-issues` driver needs no change (GitHub's issue-closed state already does this job).

1. Add closure semantics to `local-store.js`, mirroring how GitHub issues work (closed, not deleted — the record stays as history, just excluded from default "open work" queries): a `closed: true` facet (set via the existing `writeRecord`, no new function needed) plus a `closedAt` timestamp facet.
2. Change `queryRecords`'s default behavior to exclude `closed: true` records unless the caller explicitly asks for them (e.g. `queryRecords('specs', { closed: true })` to see closed records, `queryRecords('specs', {})` continuing to mean "open, as today" — every existing call site keeps working unchanged, since no record is `closed: true` until this feature marks one).
3. Wire `/claude-tweaks:wrap-up`'s item 5 cleanup (`skills/wrap-up/cleanup-procedures.md`) so that, under `work-backend: local-files` record mode, on 100% completion (confirmed by `/claude-tweaks:review`, mirroring the existing 100%-complete gate `SKILL.md:59` already uses for the legacy spec-file-alias deletion) the record is marked `closed: true` / `closedAt` via `writeRecord` and committed — replacing today's documented no-op for this specific combination (record mode + `local-files`). Leave the `github-issues` and legacy-spec-file-alias rows of item 5 exactly as they are.

## Acceptance Criteria

- `local-store.js` exports a way to mark a record closed (either a new `closeRecord(path)` helper, or documented direct use of `writeRecord` with `facets.closed = true` / `facets.closedAt` — implementer's choice) with a unit test covering: a closed record is excluded from `queryRecords(dir, {})`'s default results, and included when `{ closed: true }` is passed explicitly.
- All 18 existing `queryRecords` call sites continue to pass their current test suites unmodified — confirms the default-exclude-closed behavior is backward compatible.
- A `/claude-tweaks:wrap-up` run under `work-backend: local-files`, record mode, 100%-complete: after wrap-up, the record's file still exists under `specs/` (never deleted) but carries `closed: true`, and a subsequent `queryRecords('specs', {})` call (the shape every existing skill call site uses) no longer returns it.
- `npm test` passes in full (currently 1230/1230).

## Technical Approach

### Key Files

- `bin/lib/issues/local-store.js` — add closure facet handling + `queryRecords` default filter
- `bin/lib/issues/tests/local-store.test.js` — new tests for closure + default-exclude behavior
- `skills/wrap-up/cleanup-procedures.md` — item 5's local-files branch, currently documented as a no-op
- `_shared/work-record.md` — if the closure facet becomes part of the canonical taxonomy, add a row (scope call: implementer's judgment on whether this rises to canonical-taxonomy documentation or stays a `local-files`-internal implementation detail)

### Approach

Model `closed`/`closedAt` on `local-files` records the same way GitHub already treats `state: CLOSED` on issues: closure is a state change, not a deletion. This keeps the two drivers' mental models aligned (a `local-files` project can `queryRecords(dir, { closed: true })` the same way a `github-issues` project runs `gh issue list --state closed`), rather than inventing a separate archive-directory convention that the `github-issues` driver has no equivalent of.

## Gotchas

- Do not delete the record file on closure — GitHub doesn't delete closed issues either, and a project's `local-files` history (what shipped, when) has the same audit-trail value the closed-issues list provides under `github-issues`. This is the same "archive, don't delete" principle `cleanup-procedures.md`'s pipeline-run-directory step (item 8) already applies.
- `queryRecords`'s default-exclude-closed change must not affect any of the 18 existing call sites' behavior today, since no record is currently `closed: true` — verify by running the full suite before and after, not by reasoning about the diff alone (per this project's own recurring lesson: a data-shape change that "looks right" can pass review and still be silently wrong).
- The legacy spec-file alias (`specs/{n}-*.md`, no materialized header, pre-dating the record model) is untouched by this work — its own deletion + `specs/INDEX.md` update behavior in `cleanup-procedures.md` item 5 stays exactly as documented.

## Original request

Feature request: native spec close-out support (auto close-run + spec-backend toggle)

## Context

While auditing memenu's pipeline artifact lifecycle (`specs/`, `specs/INDEX.md`, pipeline-run ledgers) we found two related gaps that a per-project workaround can only partially close.

## 1. `close-run` isn't reliably exercised

`close-run` is a single trivial CLI command for retiring `.claude-tweaks/pipelines/{run-id}/` ledgers, but nothing calls it automatically. In practice, runs accumulate as "interrupted" for days (observed 3 runs sitting unclosed 5+ days in one project, visible in that project's own session-start banner). A good, cheap, manual tool that isn't used reliably is a sign the fix needs to be architectural: have `/wrap-up`'s own terminal step call `close-run`'s equivalent automatically, rather than relying on it being remembered every time.

## 2. No `spec-backend` toggle analogous to `backlog-backend`

Projects can already opt into `backlog-backend: github-issues` (CLAUDE.md config) to route `/capture`'s backlog items to GitHub Issues instead of `INBOX.md`/`DEFERRED.md`. There's no equivalent for specs: a project that wants disciplined spec close-out (repoint by-number citations → judge reference-worthy content → delete the spec file) has to hand-maintain that convention. We just did this manually as a one-time retroactive sweep across 154 spec files plus a `specs/INDEX.md` that had drifted into a permanent, ever-growing historical log with citations to it scattered across the repo. A `spec-backend`-style config toggle would let `/specify`/`/build`/`/wrap-up` support disciplined close-out as a first-class, supported behavior instead of a project-local convention that has to be remembered and re-taught every session.

## Why this matters

Both gaps share the same shape: a good manual process that quietly stops being followed once nobody's actively enforcing it — exactly the failure mode `backlog-backend` already solves for backlog items. Specs and pipeline-run ledgers deserve the same treatment.

Happy to share more detail on what we found and how we fixed it locally (memenu-io/memenu-app, private repo) if useful.

