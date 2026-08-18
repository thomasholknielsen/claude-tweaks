---
record: 885
origin: capture
risk: medium
size: medium
ceremony: standard
grants: []
surface: backend
---
# 885: design-wrapper: extract detection Layers 1-3 + track resolution into a deterministic bin CLI
## Current State

design-wrapper's whole detection chain is model-executed prose in `plugin/skills/design-wrapper/SKILL.md` (~40 KB, loaded by 7 caller skills on every lifecycle run): Layer 1 (CLAUDE.md `design-integration` flag read), Layer 2 (`Surface:` body-metadata read), Layer 3 (extension sniff against `frontend-detection.md`'s trigger table), and the 5-row track-resolution table incl. terminal/native rows and `surface_track_override`. Nothing in `plugin/bin/` backs any of it (verified — no bin file references design-wrapper or frontend-detection), yet every step is deterministic: file reads and string matching. The prose needs an explicit authority rule ("mode-specific notes win over the general chain") and a 33-row anti-pattern table partly exists to fence in misexecution of these tables — the exact shape the feedback rubric's Instruction-efficacy lens targets. Related: #657 (58 KB loaded for zero decisions on backend-only runs) — this CLI is a candidate mechanism for it, since callers could pre-check cheaply before loading the skill at all. Layer 0 already shells to upstream's `context-signals.mjs` and stays where it is; the CLI consumes its output as an input.

## Deliverables

`plugin/bin/design-detect.js` + a `plugin/bin/lib/` module: input = mode, target list, spec `Surface:` value (or spec ref), Layer 0 signals JSON (optional — absent means degraded); output = JSON `{track, decision: proceed|skip, reason, surface_track_override?}` covering Layers 1-3, per-mode layer applicability (incl. doctor/explore structural-inapplicability rows), and the full track-resolution table (web/native/terminal, the two inferred rows)

Skip-reason strings byte-match the current vocabulary in SKILL.md (callers and `_shared/design-wrapper-handling.md` consume these shapes) — expand-contract if any must change

`tests/bin-lib/` suite covering every decision-table row, each skip reason, and the override-recording rule

SKILL.md prose collapses the executed tables into the CLI invocation + trust notes (measured `wc -c` reduction stated in the PR); mode-specific layer-applicability notes become CLI data, not prose authority rules

## Acceptance Criteria

Every row of the track-resolution table and every Layer 1/2/3 outcome is producible from the CLI with a unit test pinning it

A backend-only run resolves its skip via the CLI without the model executing any decision table

`surface_track_override` is emitted by the CLI, not judged in prose; decisions.md logging stays skill-side

No caller-visible return-shape change without a migration note (skip vocabulary unchanged or expand-contract)

`npm test` green; SKILL.md byte reduction reported

_Filed by `capture` via specShapedBody._
