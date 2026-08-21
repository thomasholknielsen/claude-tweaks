# #744 — CLAUDE.md drift: CLAUDE — Subagent Contract (v4.2+)

Source: GitHub issue #744

## Current State

CLAUDE.md's Subagent Contract (v4.2+) section cites the impeccable-finish-reviewer
dispatch site as `design-wrapper/modes/review.md` — this path does not resolve
from the repo root. The actual file lives at `plugin/skills/design-wrapper/modes/review.md`.

Note: the filed issue's proposed replacement (`skills/design-wrapper/modes/review.md`)
is itself incorrect — verified via `ls` that this path also does not exist from the
repo root. The correct resolvable path, matching this same CLAUDE.md's own directory
convention (`plugin/skills/{name}/...`) and the sibling reference in the same
paragraph (`plugin/skills/_shared/subagent-output-contract.md`), is
`plugin/skills/design-wrapper/modes/review.md`.

## Deliverables

In `CLAUDE.md`, Subagent Contract (v4.2+) section:

**Current:**
```
`impeccable-finish-reviewer` is the one such dispatch today (`design-wrapper/modes/review.md` Step 3.7).
```

**Proposed:**
```
`impeccable-finish-reviewer` is the one such dispatch today (`plugin/skills/design-wrapper/modes/review.md` Step 3.7).
```

## Acceptance Criteria

- The path cited for impeccable-finish-reviewer's dispatch site resolves from the repo root
- Path matches the `plugin/skills/{name}/...` convention used elsewhere in the same paragraph and documented in CLAUDE.md's Structure section
