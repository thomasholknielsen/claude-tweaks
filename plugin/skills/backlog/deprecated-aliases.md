# Backlog — Deprecated Alias Removal Conditions

Referenced by `backlog/SKILL.md`'s argument grammar and Input table for the deprecated `grant`
mode name. Kept out of `SKILL.md` to stay under its size ceiling, mirroring
`dispatch/deprecated-aliases.md`'s shape.

## `grant` (deprecated alias for `refine`'s headless posture)

Parses identically to the old `grant` mode: same arguments, same Preflight, same gate chain. The
one behavioral difference from a bare `refine` invocation is that `grant` **forces the headless
posture regardless of any `--source` value or its absence** — the one deliberate override of the
`--source` presence switch documented in `SKILL.md`'s Input table, cross-referenced from both this
alias and the switch text in `SKILL.md` by name so the two can't drift apart independently. A
`grant` invocation runs
no batch-confirm and no lanes beyond `refine-headless.md`'s grant chain — it does not run the
Priority, Related, Flag-back, or Dependency-repair lanes the headless posture otherwise runs
alongside the grant chain — preserving today's exact `grant`-mode behavior byte-for-byte for any
script or muscle-memory invocation still typing it. Emits one warn-tier deprecation notice per
invocation, naming `refine` (with `--source routine` or `--source sweep`, as appropriate to the
caller) as the replacement spelling.

Removal condition: once this repo's own `.claude-tweaks/policy.yml`, `skills/help/reference-card.md`'s
`/claude-tweaks:backlog` argument grammar, and `backlog/routine-template.yml` cite only `refine`,
checked at the next minor release — and no earlier than the second minor release after #1490 ships.
