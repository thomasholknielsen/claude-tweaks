---
record: 22
origin: capture
risk: low
effort: medium
grants: []
surface: backend
---
# 22: No feedback-loop metrics for the work-record pipeline

Surface: backend

## Current State

Verified against the current codebase (v6.8.0). `bin/lib/issues/metrics.js` does not exist — confirmed by directory listing (`bin/lib/issues/` has `blast-radius.js`, `capabilities-probe.js`, `claims.js`, `grouping.js`, `labels.js`, `local-store.js`, `record.js`, `retry.js`, `review-backlog.js`, `tier.js`, `unattended-tier.js`, no `metrics.js`). `dispatch-retry-ceiling` (default `3`) and `automerge-max-lines`/`automerge-max-files` (defaults `40`/`2`, `skills/dispatch/SKILL.md` lines 348-350) are real tuning knobs with no evidence trail behind their defaults.

Confirmed the proposed data source is feasible: GitHub's issue timeline API returns real, per-label, timestamped `labeled`/`unlabeled` events — e.g. `gh api repos/{owner}/{repo}/issues/{n}/timeline --jq '.[] | select(.event=="labeled" or .event=="unlabeled")'` against this repo's own #21 returned a clean sequence (`by:capture`/`type:feature` at creation, `priority:medium` days later, `ready`/`risk:low`/`effort:medium` at shaping, `demo:pending` at wrap-up), each with an ISO timestamp. This is sufficient to compute time-in-stage durations directly, without needing a separate stored history.

`bin/lib/issues/retry.js` already exposes `countFailedAttempts(comments)` — the retry-rate data source the issue asks for already exists and should be reused, not reimplemented.

`/tidy`'s `--scope=github` rolling digest (`skills/tidy/SKILL.md`, "Rolling digest" subsection) already exists with exactly three sections in a fixed order: `## Auto-applied`, `## Auto-mutated with evidence`, `## Still needs your review` (plus its three bucket summaries). There is no fourth "funnel" section today — this is genuinely new, not a rename of something existing.

## Deliverables

1. `bin/lib/issues/metrics.js` — a small, pure module (no network calls, matching every sibling module in `bin/lib/issues/`) exposing:
   - `computeStageDurations(timelineEvents)` — given one issue's timeline events (`[{event: 'labeled'|'unlabeled', label, created_at}]`, the shape `gh api .../timeline` returns filtered to label events), returns the durations (in ms) between recognized stage-transition pairs it can find in the sequence: issue-creation → first `ready` label (shaping latency), `ready` label → first `auto:build`/`auto:merge` label (grant latency), `auto:build` label → issue close (build latency). Any transition whose start or end event isn't present in the sequence is omitted from the result, not reported as zero or null — an issue still in an earlier stage has fewer computed durations, not fabricated ones.
   - `summarizeFunnel(perIssueDurations)` — given an array of `computeStageDurations` outputs (one per sampled issue) plus a parallel `wontfixByOrigin` map, returns aggregate stats: median (not mean — skewed by outliers) duration per transition, count of issues contributing to each median, and wontfix rate per `by:*` origin label.
   - `computeWontfixRate(closedIssues)` — given closed issues (`[{number, labels, stateReason}]`), groups by `by:*` origin label (or `human` when absent, matching `_shared/work-record.md`'s origin axis convention) and returns `{origin: {total, wontfix, rate}}`.
2. Wire retry rate into the same summary using `retry.js`'s existing `countFailedAttempts` — call it per record from its comment history (already fetched during `/dispatch`'s own Settle step per `failure-check` mode; for `/tidy`'s digest, a fresh `gh api .../comments` fetch per sampled record), never reimplement the parsing.
3. Add a fourth digest section, `## Pipeline Funnel`, after `## Still needs your review` in `/tidy`'s `--scope=github` rolling digest (`skills/tidy/SKILL.md`'s "Rolling digest" subsection) — rendered from `summarizeFunnel`'s output:
   ```markdown
   ## Pipeline Funnel

   | Transition | Median | Sample size |
   |---|---|---|
   | Shaping latency (filed → ready) | {duration} | {N} |
   | Grant latency (ready → authorized) | {duration} | {N} |
   | Build latency (authorized → closed) | {duration} | {N} |

   Retry rate: {rate}% ({failedAttempts}/{totalAttempts} across sampled records)

   Wontfix rate by origin:
   | Origin | Rate |
   |---|---|
   | {by:code-health, etc.} | {rate}% ({wontfix}/{total}) |
   ```
   Sample scope: closed records from the last 90 days (bound the API cost — this is a rolling digest updated every firing, not a one-time historical report). Omit the whole section when the sample is empty (a new/low-volume project) rather than rendering a table of zeroes.

## Acceptance Criteria

- `computeStageDurations` against a real timeline fixture (model it on this repo's own #21 timeline, captured above) returns the three expected durations, each a positive number.
- `computeStageDurations` against a timeline missing a `ready` label (still in backlog) returns a result with the later two durations absent — not zero, not null, just not present as keys.
- `summarizeFunnel` computes the median correctly across an odd- and an even-length sample (standard median edge case), and reports the correct sample-size count per transition even when different transitions have different sample sizes (some issues never reached "authorized," for example).
- `computeWontfixRate` correctly buckets by origin label and computes rate as a percentage, with a project that has zero closed issues for one origin producing `{total: 0, wontfix: 0, rate: 0}` (or an omitted key — implementer's choice, document whichever), not a division-by-zero error.
- `/tidy`'s `--scope=github` digest renders the new `## Pipeline Funnel` section in the documented position (after "Still needs your review"), and omits it entirely when the 90-day sample is empty.
- Full unit test coverage for `metrics.js` in `bin/lib/issues/tests/metrics.test.js`, matching this repo's existing per-module test-file convention (every other `bin/lib/issues/*.js` module has a `tests/*.test.js` sibling).
- `npm test` passes in full.

## Technical Approach

### Key Files

- `bin/lib/issues/metrics.js` — new module (the deliverable)
- `bin/lib/issues/tests/metrics.test.js` — new test file
- `bin/lib/issues/retry.js` — `countFailedAttempts`, reused as-is for retry rate; no changes needed
- `skills/tidy/SKILL.md` — "Rolling digest" subsection, add the `## Pipeline Funnel` section to the documented structure and dedup/render logic

### Approach

Pure computation module, no network calls — matches this codebase's established pattern where every `bin/lib/issues/*.js` module is a pure function library and the calling skill's own bash/`gh api` snippets do the fetching. `/tidy`'s digest step fetches the raw timeline/comment/closed-issue JSON (via `gh api`) the same way it already fetches issue lists for the existing digest sections, then passes it to `metrics.js`'s functions.

### Sample fixture for tests

Use this repo's own #21 timeline (captured verbatim above during shaping) as the canonical test fixture — a real, known-good sequence rather than a synthetic one invented for the test.

## Gotchas

- Median, not mean — duration distributions in a small backlog are easily skewed by one outlier record that sat parked for months; a mean would misrepresent "typical" latency.
- Bound the digest's sample window (90 days) — this is a recurring rolling digest, not a one-time report; an unbounded query grows the `gh api` cost every single firing as the repo's closed-issue history accumulates.
- `computeStageDurations` must NOT fabricate a duration for a transition whose events aren't both present — a record still in `backlog` has no "grant latency" yet, and reporting it as 0 (rather than absent) would silently corrupt the median once that record eventually does get shaped.
- Reuse `retry.js`'s `countFailedAttempts` rather than re-parsing comment bodies — this codebase's CLAUDE.md explicitly warns against duplicating logic across near-identical consumers; the retry-comment-parsing logic already exists and is already tested.
- This is read-only/additive — it must never mutate any issue's labels or state. `metrics.js` computes from data the caller fetches; it writes nothing.

## Original request

No feedback-loop metrics for the work-record pipeline

**Related:** none

Context: Time-in-stage, grant latency, retry rate, and per-producer wontfix rate are untracked, so tuning knobs (dispatch-retry-ceiling, automerge-max-lines/files) have no evidence behind them.

Scope: A small bin/lib/issues/metrics.js reading GitHub label-timeline events, surfaced as a funnel section in /tidy's --scope=github digest.

