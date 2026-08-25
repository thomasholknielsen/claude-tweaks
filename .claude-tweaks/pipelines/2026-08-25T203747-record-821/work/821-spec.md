---
record: 821
origin: capture
risk: medium
size: low
ceremony: fast-lane
grants: [build]
surface: backend
---
# 821: claim-write bug: claims-registry blobs written as literal "undefined" instead of JSON

Surface: backend

**Related:** #781, #783, #784 (already closed, orphaned claims released safely — no data lost)

## Current State

`/claude-tweaks:tidy`'s Step 4.7 claims sweep on 2026-08-17 found 3 claims-registry blobs (`issue-781.json`, `issue-783.json`, `issue-784.json`) holding the literal string `"undefined"` instead of valid JSON. The three issue numbers are consecutive and shipped together, pointing at a single call site rather than three independent failures.

## Deliverables

- Find which call site wrote these blobs — likely a batch/multi-record claim-acquisition path, given the three consecutive issue numbers.
- Fix the serialization bug: either a value evaluating to `undefined` before `JSON.stringify` (which produces the string `"undefined"` when concatenated/templated rather than throwing), or a shell template producing the literal token `undefined`.

## Acceptance Criteria

- The call site that wrote the three malformed blobs is identified and named.
- The fix prevents a claims-registry blob from ever being written as the literal string `"undefined"` — either the write is rejected before it lands, or the value that would produce it is caught upstream.
- A regression test reproduces the exact condition (an `undefined` value reaching the write path) and asserts the fix catches it.

## Technical Approach

Trace the batch/multi-record claim-acquisition path's write call for the claims-registry blob, looking specifically for a value (likely an id, timestamp, or run reference) that can be `undefined` at that point — e.g. an array index or lookup that fails silently for one record in a batch while the loop continues writing for the others. Fix at the source of the `undefined` value, not by adding a downstream guard that merely refuses to write it.

## Gotchas

- No data was lost — the three affected issues (#781, #783, #784) are already closed and their orphaned claims were released safely by the tidy sweep that found this. This is a latent-bug fix, not a data-recovery task.
- Since the three issue numbers are consecutive, check whether the bug reproduces reliably on any batch write or was specific to that one run's conditions — a single reproduction that doesn't recur on retry is a weaker signal than one that does.

## Original request

claim-write bug: claims-registry blobs written as literal "undefined" instead of JSON

**Related:** #781, #783, #784 (already closed, orphaned claims released safely — no data lost)

Context: /claude-tweaks:tidy's Step 4.7 claims sweep on 2026-08-17 found 3 claims-registry blobs (issue-781.json, issue-783.json, issue-784.json) holding the literal string "undefined" instead of valid JSON.

Scope: find which call site wrote these blobs (likely a batch/multi-record claim-acquisition path — the three issue numbers are consecutive and shipped together) and fix the serialization bug (a value evaluating to undefined before JSON.stringify, or a shell template producing the literal token "undefined").

