---
record: 826
origin: capture
risk: low
size: low
ceremony: fast-lane
grants: [build]
---
# 826: docs/donts.md: no Don't covers capping grep output when sweeping the installed plugin cache

Origin: session evaluation of this /claude-tweaks:feedback bare-invocation run (self-reference routed the finding to local records)

Defer-reason: tangential

## Current State

`docs/donts.md` carries roughly two dozen grep-pitfall Don'ts (case sensitivity, anchoring, NUL bytes, placeholder tokens, etc.) but none address output size when a grep sweeps a tree that can be very large — notably the installed plugin cache under `~/.claude/plugins/cache/claude-tweaks-marketplace/claude-tweaks/{version}/`, which mirrors the whole `skills/` tree. Observed live in this session: a `grep -rn "needs:definition"` across the project's `.claude-tweaks/` directory and the installed plugin cache's `skills/` directory returned a 91.4KB result that the harness had to persist to disk rather than inline, immediately requiring a narrower re-run (`grep -rln`) to get the file list actually needed.

## Deliverables

- [ ] Add a `docs/donts.md` entry: don't run an unscoped content grep (`-rn`) across a tree that may be large (the repo plus the installed plugin cache, in particular) without first considering a filename-only pass (`-l`/`-rl`) or a byte-capped read (`| head -c`) — an uncapped sweep can return a result large enough that the harness persists it to disk instead of showing it inline, and the immediate next step is usually a narrower re-run anyway.

## Acceptance Criteria

1. `docs/donts.md` carries the new entry, matching the file's existing "rule + one clause of why" format.
2. `npm test` passes (this file is prose-conformance-tested; a new bullet must not break existing pins).

## Technical Approach

A single bullet addition near the file's other grep-pitfall entries, no `[IL-nn]` tag needed unless the maintainer wants to retroactively assign one.

## Gotchas

None beyond fitting the existing file's terse style.

_Filed by `capture` via specShapedBody._
