---
record: 800
origin: capture
risk: medium
size: medium
ceremony: standard
grants: [build]
surface: backend
---
# 800: bin/ composer CLI for record-body composition

Surface: backend

## Current State

A session hand-rolled six escaping-safe compose-payload-then-body-file Node scripts inside `/capture` and `/specify` flows during a single run — the same mechanic every time — even though the repo already forbids raw-shell JSON bodies (per its own established convention) and already has a precedent CLI shape for this exact pattern (#686's release-claim/log-decision CLI).

## Deliverables

- [ ] Create `plugin/bin/compose-record.js`, shaped per #686's release-claim/log-decision CLI precedent, that takes a JSON payload file and emits a validated record-body file.
- [ ] Update `capture/SKILL.md` and the `specify` skill's record-creation prose (`shaping-mode.md`, `record-creation.md`) to cite the new CLI instead of inlining a per-session Node compose script.
- [ ] Add a test suite for `compose-record.js` covering the escaping-safety cases the hand-rolled scripts were protecting against (quotes, newlines, backticks in payload fields).

## Acceptance Criteria

1. `plugin/bin/compose-record.js` exists, accepts a JSON payload file, and emits a validated body file with no shell-escaping hazards for any field content (quotes, newlines, backticks, `$()` sequences).
2. `capture/SKILL.md` and the `specify` skill's record-creation prose reference `compose-record.js` rather than an inline Node script template.
3. A `tests/bin-lib/compose-record` (or equivalent) suite exercises the escaping-safety cases and passes under `npm test`.

## Technical Approach

Follow #686's CLI precedent directly — a `plugin/bin/{name}.js` executable, injectable-runner seam if it shells out, validated JSON-in/file-out contract, cited by skill prose rather than restated per-session. The validation logic (what makes a body "valid") should reuse `_shared/work-record.md`'s spec-shaped-body check criteria (Current State/Deliverables/Acceptance Criteria present and non-empty, no unresolved placeholder markers) so the CLI enforces the same structural bar `/specify`'s Read-back verification already checks manually.

### Key Files

- `plugin/bin/compose-record.js` — new CLI, JSON payload in, validated body file out
- `plugin/skills/capture/SKILL.md` — cite the new CLI instead of an inline script
- `plugin/skills/specify/shaping-mode.md`, `plugin/skills/specify/record-creation.md` — same citation update
- `tests/bin-lib/compose-record/` — new escaping-safety test suite

## Gotchas

- Match #686's existing CLI conventions (arg shape, exit codes, error format) exactly rather than inventing a new pattern — the whole point of this record is consolidating six near-identical scripts into one, not adding a seventh variant.
- The validated-body-file contract should be strict enough to catch `shaping-mode.md`'s existing unresolved-placeholder-marker rule at compose time, so the CLI actively prevents that failure mode rather than merely avoiding shell-escaping bugs.

## Original request

bin/ composer CLI for record-body composition

**Related:** #686, #762

Context: /feedback session evaluation (2026-08-17) — one session hand-rolled six escaping-safe compose-payload-then-body-file Node scripts inside /capture and /specify flows; the mechanic is identical each time and the repo already forbids raw-shell JSON bodies.

Scope: a bin/compose-record.js (shape per #686's release-claim/log-decision CLI precedent) that takes a JSON payload file and emits a validated body file, cited by capture/specify record-creation prose instead of per-session scripts.

