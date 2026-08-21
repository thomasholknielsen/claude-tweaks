---
record: 252
origin: human
risk: low
size: medium
ceremony: fast-lane
grants: [build, merge]
surface: backend
---
# 252: Pre-flight the vocabulary guard at record time and add an amend verb

Surface: backend

## Current State

The wrap-up curation engine's record path (`bin/lib/wrap-up/engine-record.js`) validates a judge
payload's shape in `validatePayload` (rowId present, `result`/`gapDetection`/`findings` well-formed)
but never checks the payload's free-text fields (`detail`, `findings[].summary`) against the
`FORBIDDEN_VOCABULARY` pattern list — that list exists only in the renderer
(`bin/lib/wrap-up/engine-render.js`, exported), which checks its own rendered markdown output and
throws (`assertCleanVocabulary`) as a defense-in-depth measure, well after the row has already been
written to `engine-state.json` and appended to `decisions.md`.

In the 6.71.0 wrap-up run (wrapping itself, the first production run of this engine), a judge
payload's `detail` field contained the string `domain-overlap` — one of `FORBIDDEN_VOCABULARY`'s
patterns. `recordResult` accepted it (no check exists at record time), the row was written and the
`SCANNED` line appended, and only later did `render` throw via `FORBIDDEN_VOCABULARY`/
`assertCleanVocabulary`. By that point the row was immutably recorded with no amend verb to correct
it — the run had to hand-edit `engine-state.json` directly and log the amendment manually in
`decisions.md`.

`bin/wrap-up-engine.js` currently wires three verbs (`plan`, `record`, `render`) onto
`initState`/`recordResult`/the render functions respectively; there is no verb for correcting an
already-recorded row.

## Deliverables

1. `recordResult` in `bin/lib/wrap-up/engine-record.js` validates `payload.detail` (when a string)
   and every `payload.findings[].summary` against `FORBIDDEN_VOCABULARY` — imported from
   `bin/lib/wrap-up/engine-render.js` (already exported there), not redefined — and rejects the
   payload (throws, same style as `validatePayload`'s existing checks) before the row is ever
   written to `engine-state.json` or appended to `decisions.md`.
2. A new `amend` verb on `bin/wrap-up-engine.js`, wired alongside `plan`/`record`/`render`, backed
   by a new `amendResult({ runDir, payload, now, telemetryPath })` export from `engine-record.js`.
   It lets an already-recorded row be corrected without hand-editing `engine-state.json`: re-runs
   full payload validation (including the new FORBIDDEN_VOCABULARY check from #1), overwrites
   `state.results[rowId]`, and appends an `AMENDED` line to `decisions.md` (distinct from
   `SCANNED`, naming the row and the correction) rather than mutating history in place.
3. Test coverage in `tests/bin-lib/wrap-up/engine-record.test.js`: `recordResult` rejecting a
   payload whose `detail` or a `findings[].summary` matches a `FORBIDDEN_VOCABULARY` pattern, and
   the new `amendResult` path correcting a previously-recorded row and appending an `AMENDED`
   `decisions.md` line.

## Acceptance Criteria

- A `recordResult` payload whose `detail` field (or any `findings[].summary`) matches a
  `FORBIDDEN_VOCABULARY` pattern throws before the row is written to `engine-state.json` or
  appended to `decisions.md` — the row must never reach the "immutably recorded" state the 6.71.0
  incident hit.
- The rejection follows the same contract as `validatePayload`'s other checks: a synchronous throw
  that `bin/wrap-up-engine.js`'s existing `record` verb turns into exit code 1 (retryable), never
  exit code 2 (per that file's own exit-code contract comment).
- `wrap-up-engine.js amend --run-dir ` (payload JSON on stdin, mirroring `record`'s CLI shape)
  overwrites a previously-recorded row's stored result and appends an `AMENDED ...` line to
  `decisions.md`, with no hand-edit of `engine-state.json` required.
- The amend path re-runs full payload validation, including the FORBIDDEN_VOCABULARY check — an
  amend cannot be used to write a forbidden-vocabulary row any more than the original record path
  can.
- `amendResult` does not double-append telemetry for a row already counted at original record time.
- `npm test` passes, including the new/updated cases in `tests/bin-lib/wrap-up/engine-record.test.js`.

## Technical Approach

- Import `FORBIDDEN_VOCABULARY` from `bin/lib/wrap-up/engine-render.js` into
  `bin/lib/wrap-up/engine-record.js`; add a check inside (or called from) `validatePayload` that
  runs the patterns over `payload.detail` and every `payload.findings[i].summary`, throwing the
  same `recordResult: ...`-style `Error` the file's other checks already use. Keep the pattern list
  defined once, in `engine-render.js` — `engine-record.js` imports rather than duplicates it, so the
  record-time pre-flight and the render-time defense-in-depth check can't drift apart.
- Add `amendResult({ runDir, payload, now, telemetryPath })` to `engine-record.js`, mirroring
  `recordResult` but: (a) requires the row to already exist in `state.results` instead of rejecting
  when it does; (b) skips the "already recorded" throw; (c) appends an `AMENDED` decisions.md line
  (reuse `buildScannedLine`'s shape with a distinct verb prefix, or a small sibling formatter)
  instead of a second `SCANNED` line; (d) does not re-append telemetry for the row.
- Wire a matching `amend` case into `bin/wrap-up-engine.js`'s verb dispatch (`plan`/`record`/
  `render`/now `amend`), reusing `record`'s `--run-dir` + stdin-JSON CLI shape. Update the file's
  `USAGE` string and its header comment (which currently documents only three verbs).

## Gotchas

- `engine-render.js`'s own `FORBIDDEN_VOCABULARY` check stays in place as defense-in-depth — per
  its existing comment, both render functions "post-check their own output and throw on a match
  anyway." This record adds an earlier, record-time check; it does not replace the render-time one.
- The amend verb means `decisions.md` is no longer strictly one line per row — a corrected row gets
  a trailing `AMENDED` line after its original `SCANNED` line. Any downstream reader of
  `decisions.md` that assumes exactly one line per `rowId` needs to tolerate this.
- `amendResult` must not double-count the amended row in `.claude-tweaks/wrap-up-outcomes.tsv` —
  the original `recordResult` call already appended one telemetry line for that `rowId`.

## Original request

Pre-flight the vocabulary guard at record time and add an amend verb

First production run of the wrap-up engine (6.71.0 wrapping itself): a judge payload's detail field contained 'domain-overlap'; record accepted it, and render then threw via FORBIDDEN_VOCABULARY — a validation asymmetry where the violation surfaces only after the row is immutably recorded, with no amend verb to fix it (the run had to hand-edit engine-state.json and log the amendment to decisions.md).

Fix: recordResult runs FORBIDDEN_VOCABULARY over detail and findings[].summary and rejects (exit 1, retryable — same contract as the other payload validations) at record time; optionally add an amend verb for recorded-row corrections so state never needs hand-editing.

Origin: 6.71.0 wrap-up run (live engine finding).
