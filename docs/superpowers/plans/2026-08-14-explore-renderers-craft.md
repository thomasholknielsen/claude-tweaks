# Explore renderers consume the craft contract (#386) — execution plan

Fast-lane single-record run under `/claude-tweaks:flow` (run dir `2026-08-14T135602-spec-386`). Pickup gate verified: #377/#378/#383 all closed; adoption check negative (`grep design-craft modes/explore.md` empty → real edit, not verified-no-op); web-only claim holds (native tracks skip).

## Task 1 — identity scope
`modes/explore.md` "### Parallel skin builders": one paragraph — each dispatch prompt carries the principles layer, assembled at composition time per `_shared/design-craft.md` and inlined verbatim, naming the principles sources (Emil skills as the relevance map selects, Impeccable references) alongside the dealt world's card; explicitly no `DESIGN.md`/sidecar read (genesis — no decisions exist by definition); no assembly logic restated.

## Task 2 — layout scope
"### Variant builders": one paragraph — dispatch prompts carry craft context per the contract, inlined: decisions (`DESIGN.md` + `.impeccable/design.json` sidecar) plus principles. "### Machinery reuse"'s Builder-input bullet extended to include the assembled craft context, keeping the two statements consistent.

## Verification
AC1 grep (both scopes cite, no restated logic); AC2 identity names principles sources, reads no decisions; AC3 layout includes sidecar + DESIGN.md + principles; AC4 diff-stat = `skills/design-wrapper/modes/explore.md` only.
