---
record: 458
origin: capture
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
surface: backend
---
# 458: Pin the Friction reflect lens's documented event vocabulary to appendEvent call sites

Surface: backend

## Current State

`skills/reflect/full-mode.md`'s Friction Lens "Input" paragraph documents which hook file logs
each of the four friction event types the lens reads from `events.jsonl`:

- `wd-deny` and `gate-denial` — logged by `bin/lib/hooks/pre-tool-use.js`
- `contract-violation` — logged by `bin/lib/hooks/subagent-stop.js`
- `ask-user-question` — logged by `bin/lib/hooks/post-tool-use.js`

This doc-to-code claim has already drifted once (`#452`'s final review found `contract-violation`
misattributed to the wrong file). Nothing currently catches a future drift automatically.
`tests/hooks-gate-coverage.test.js` already establishes the pattern for this class of check
elsewhere in the repo: it reads a declared-contract prose block from
`skills/_shared/policy-schema.md` and asserts it against a live JS-exported constant
(`GATE_COVERAGE`) from `bin/lib/hooks/pre-tool-use.js`. No equivalent test exists for the Friction
Lens vocabulary.

Verified against the current tree — the four `appendEvent(...)` call sites for these event types
are exactly where `full-mode.md` currently says they are:

```
bin/lib/hooks/post-tool-use.js:454   appendEvent(..., 'ask-user-question', ...)
bin/lib/hooks/pre-tool-use.js:606    appendEvent(..., 'gate-denial', ...)
bin/lib/hooks/pre-tool-use.js:695    appendEvent(..., 'wd-deny', ...)
bin/lib/hooks/subagent-stop.js:50    appendEvent(..., 'contract-violation', ...)
```

## Deliverables

- A new `node --test` suite (e.g. `tests/reflect-friction-lens-vocab.test.js`) that mechanically
  pins `full-mode.md`'s Friction Lens event-type-to-file vocabulary against the real
  `appendEvent(...)` call sites in `bin/lib/hooks/*.js`.
- If the check needs a stable machine-readable anchor rather than parsing free prose (the
  `hooks-gate-coverage.test.js` precedent uses a declared `<!-- ...:begin/end -->` marker block for
  exactly this reason), add that marker block to `skills/reflect/full-mode.md`'s Friction Lens
  Input paragraph, following the same declared-contract convention `policy-schema.md` already uses
  for gate coverage.
- The test fails if: an event type is added to or removed from the four covered by the Friction
  Lens, an event type's logged file changes, or the marker block (if added) and the live call
  sites diverge.

## Acceptance Criteria

- [ ] A new or extended `node --test` suite asserts, for each of `wd-deny`, `gate-denial`,
      `contract-violation`, `ask-user-question`, that `full-mode.md`'s documented logging file
      matches the file containing the real `appendEvent(runDir/ctx.runDir, '{eventType}', ...)`
      call site in `bin/lib/hooks/*.js`.
- [ ] The test fails (proven by a local revert-and-rerun, per the repo's own verification
      discipline) when either side is deliberately mismatched — e.g. temporarily editing the doc's
      claimed file for one event type, or temporarily moving one `appendEvent` call to a different
      file — confirming the test actually discriminates rather than passing vacuously.
- [ ] `npm test` passes with the new suite included.
- [ ] If the chosen approach reads `full-mode.md` prose directly, the comment header at the top of
      the new test file states why reading live production prose here is a deliberate, narrow
      exception to `[IL-80]` (same justification `tests/hooks-gate-coverage.test.js`'s header
      already gives).

## Technical Approach

Follow `tests/hooks-gate-coverage.test.js`'s existing pattern rather than inventing a new one:

1. Decide whether to parse `full-mode.md`'s existing free-text Input paragraph directly (regex
   against the known sentence shape), or add a `<!-- friction-lens-vocab:begin -->` /
   `<!-- friction-lens-vocab:end -->` declared-contract block (mirroring `policy-schema.md`'s
   `gate-coverage` markers) that's easier to parse reliably and less prone to breaking on unrelated
   prose edits. The marker-block approach is the closer match to precedent and is recommended,
   since `hooks-gate-coverage.test.js`'s own header notes prose-reading tests are acceptable only
   for a *declared* contract, not incidental prose.
2. For the code side, grep or regex-scan `bin/lib/hooks/*.js` for each of the four event-type
   strings inside an `appendEvent(...)` call, recording which file each was found in — there's no
   existing JS-exported constant analogous to `GATE_COVERAGE` for this vocabulary; introducing one
   is optional, not required, since the four sites are simple literal-argument calls rather than a
   structured list like `GATE_COVERAGE.tools`.
3. Assert the two sides match, one assertion per event type (mirrors
   `hooks-gate-coverage.test.js`'s one-test-per-axis style) so a failure names exactly which event
   type or file drifted.
4. No test-runner wiring needed — `npm test` globs `tests/` recursively already.

## Gotchas

- `contract-violation`'s `subagent-stop.js` reliance already has a known false-negative gap noted
  in `full-mode.md` (the SubagentStop hook fires unreliably for Task dispatches,
  `_shared/subagent-output-contract.md`, claude-code#27755) — that's a *runtime* reliability issue
  distinct from this record's *doc-accuracy* concern, and is out of scope here; don't conflate the
  two.
- Keep the new test narrowly scoped to the four event types the Friction Lens actually reads
  (`wd-deny`, `gate-denial`, `contract-violation`, `ask-user-question`) — not every `appendEvent`
  call site in the hooks directory, most of which log unrelated event types this lens never
  touches.

## Original request

Pin the Friction reflect lens's documented event vocabulary to appendEvent call sites

**Related:** #452

Context: #452's final review found skills/reflect/full-mode.md's Friction Lens Input paragraph
(wd-deny, gate-denial, contract-violation, ask-user-question) had already drifted once from the
code (contract-violation misattributed to the wrong file). tests/hooks-gate-coverage.test.js
already pins a similar doc-to-code claim (GATE_COVERAGE vs policy-schema.md).

Scope: add a mechanical test pinning full-mode.md's Friction Lens event-type list against the
actual `appendEvent(..., 'wd-deny'|'gate-denial'|'contract-violation'|'ask-user-question', ...)`
call sites in bin/lib/hooks/*.js, so a future event-type rename can't silently strand the lens's
own documentation.

