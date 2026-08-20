---
record: 380
origin: capture
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
surface: backend
---
# 380: Extract shared events.jsonl wrap-up-scan reader

Surface: backend

## Current State

Two independent implementations read `events.jsonl` looking for a `skill_invoked` event with
`skill === 'claude-tweaks:wrap-up'`, and they have already diverged:

- `bin/hooks.js`'s close-run path (lines ~213-223) inlines a read-and-loop over `events.jsonl`,
  tracking only a single boolean `wrapupSeen`.
- `bin/lib/hooks/run-integrity.js`'s `scanSkillEvents(runDir)` (lines 109-124) performs the same
  scan but returns `{ any, wrapup }` — it additionally tracks whether *any* `skill_invoked` event
  exists at all, which `checkRunIntegrity`'s pre-ledger precondition (line 143:
  `if (!events.any) return inProgress;`) depends on. This extra field is exactly the divergence
  between the two copies.

Both copies fail open the same way today (a missing/unreadable file, or a garbage JSON line, is
swallowed and treated as "not seen"), but that behavior lives in two places that have to be kept in
sync by hand. `bin/lib/hooks/context.js` already owns the paired writer for the same file,
`appendEvent(runDir, type, data, attribution)` (line 263) — it has no corresponding reader for this
scan today; the `readRunState`/`writeRunState` pair in the same file cover a different file
(`run-state.json`).

## Deliverables

- A single shared reader function added to `bin/lib/hooks/context.js`, alongside `appendEvent`,
  that performs the `events.jsonl` scan and returns the same `{ any, wrapup } | null` shape
  `run-integrity.js`'s `scanSkillEvents` returns today (missing/unreadable file -> `null`; malformed
  JSON lines skipped, not fatal).
- `bin/lib/hooks/run-integrity.js`'s `scanSkillEvents` function removed; its one call site
  (`checkRunIntegrity`, line 139) calls the new shared reader from `context.js` instead.
- `bin/hooks.js`'s close-run `wrapupSeen` inline loop (lines 213-223) replaced with a call to the
  same shared reader, reading `.wrapup` off the returned object — the surrounding
  `catch { /* no events.jsonl */ }` becomes unnecessary, since the shared reader already fails open
  to `null` on that case.

## Acceptance Criteria

- `context.js` exports the new reader function, and it is the only place in the plugin that scans
  `events.jsonl` for `skill_invoked`/`claude-tweaks:wrap-up` events.
- `run-integrity.js` no longer defines its own `scanSkillEvents` — `checkRunIntegrity`'s behavior
  (verdicts, `evidence.ledgerActive`/`evidence.wrapupInvoked` fields) is unchanged for every case
  `tests/run-integrity.test.js` exercises today.
- `bin/hooks.js`'s close-run command still appends `close-without-wrapup` under the same conditions
  (no wrap-up event found) and stays silent when one is found — `tests/teardown-gate.test.js`'s AC6
  cases (a non-wrapup event present, a wrapup event present, and no `events.jsonl` at all) pass
  unmodified.
- No circular `require` introduced (`run-integrity.js` gains a `require('./context')`; `context.js`
  gains no new dependency on `run-integrity.js` or `hooks.js`).
- Full `npm test` passes.

## Technical Approach

Add the new function to `bin/lib/hooks/context.js` next to `appendEvent`, porting
`scanSkillEvents`'s body (lines 110-124 of `run-integrity.js`) as-is — same fail-open semantics,
same return shape — and add it to that file's `module.exports`. Update `run-integrity.js` to
`require('./context')` and call the shared function in place of its own definition; delete the
now-dead local `scanSkillEvents`. Update `bin/hooks.js`'s close-run branch (it already holds
`ctxLib` as its handle on `context.js`) to call the new export and read `.wrapup` from the result,
deleting the inline `fs.readFileSync`/loop and its local `try`/`catch`.

## Gotchas

- `run-integrity.js`'s version returns `{ any, wrapup }`; `hooks.js`'s inline version only ever used
  the `wrapup` half. Confirm the extraction doesn't silently drop the `any` field —
  `checkRunIntegrity` depends on it for its pre-ledger precondition (line 143).
- Keep the fail-open contract identical: a missing file, an unreadable file, and per-line JSON
  parse failures must all still resolve to "not seen" — never throw, never flip a call site from
  warn-only to blocking.
- `tests/run-integrity.test.js` and `tests/teardown-gate.test.js` both exercise this behavior only
  through their public entry points (`checkRunIntegrity`, and the close-run CLI path), not by
  importing `scanSkillEvents` directly — so this refactor should not require editing either test
  file. If either test turns out to import the old function directly, this Gotcha is wrong: check
  before writing code.

## Original request

Extract shared events.jsonl wrap-up-scan reader

**Related:** #381

Context: whole-branch review before the 6.80.0 release found bin/hooks.js's wrap-up-invocation scan over events.jsonl (find a skill_invoked event with skill === 'claude-tweaks:wrap-up') hand-duplicated in run-integrity.js's scanSkillEvents(), with no shared reader in context.js. The two copies have already diverged — run-integrity.js also tracks whether ANY skill_invoked event exists, for its pre-ledger precondition.

Scope: extract one shared events.jsonl wrap-up-scan reader (context.js is the natural home, alongside its existing appendEvent writer) and point both call sites at it.

