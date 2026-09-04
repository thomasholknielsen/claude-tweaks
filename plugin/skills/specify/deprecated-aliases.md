# Specify — Deprecated Alias Removal Conditions

Referenced by `skills/specify/SKILL.md`'s Input section (the bare-invocation paragraph) and
Resolve-the-input case 0. `next` was renamed to `--budget 1` (bare drain mode, refs #1491) — this
file holds the removal condition that alias's stub points to, kept out of `SKILL.md` to stay under
its size ceiling. Mirrors `skills/dispatch/deprecated-aliases.md`'s shape for its own `next` row.

## `next` (deprecated alias for `--budget 1`)

Identical observable behavior to `--budget 1` — exactly one eligible record claimed and
shaped/routed by `next-mode.md`'s existing claim → framing-guard → shape-or-route → release
procedure, same zero-eligible-set no-op posture — with one warn-tier deprecation notice per
invocation. Removal condition: once this repo's own `.claude-tweaks/policy.yml`,
`skills/help/reference-card.md`'s `/claude-tweaks:specify` argument grammar, and
`skills/specify/routine-template.yml` cite only bare-with-`--budget`, checked at the next minor
release — and no earlier than the second minor release after #1491 ships (the migration-window
floor #1490's review established for this alias class).
