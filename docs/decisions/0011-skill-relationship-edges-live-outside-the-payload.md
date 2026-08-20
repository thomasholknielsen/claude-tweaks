# 0011. Skill relationship edges live outside the shipped payload

- **Status:** accepted
- **Date:** 2026-08-04
- **Context:** SKILL.md context-budget measurement (relationship tables were 13.8% of every SKILL.md byte)

## Context

Every `skills/*/SKILL.md` carried a `## Relationship to Other Skills` table — one row per
related skill, `_shared/` fragment, or `bin/` module, written as a paragraph of prose. The
convention required each edge to be stated on **both** sides ("if A references B, B must
reference A"), and `/help`'s diagrams had to list every skill.

A `SKILL.md` loads in full on invocation. The tables totalled 510 rows and 127.6 KB —
13.8% of every `SKILL.md` byte in the plugin — re-emitted as context on each invocation,
plus once per dispatched subagent.

The design assumed these rows carried live contract that would need relocating. Reading
all 510 against the files they described overturned that: **20 rows (3.9%) bind what the
model does while executing their own skill, and 24 of 32 skills have none.** The rest
describe how skills relate to each other — true, useful to a maintainer, and never acted
on by a running model.

Collapsing the navigational rows exposed drift the two-copy convention had been hiding:
`/tidy` queried `--label by:code-health` while its own table claimed the bare form;
`/backlog` credited `overview` mode to a function it never calls; `DESIGN.json` was
promised by three files and read by none.

## Decision

Delete the `## Relationship to Other Skills` section from all 32 skills. Record every
edge **once** in `docs/skill-graph.md`. Retire the bidirectionality convention.

`docs/` is outside the plugin payload — the `plugin/` subtree (ADR-0015) — so the graph
ships to nobody. That is the whole mechanism: the content
is maintainer documentation, and moving it to a maintainer-only location removes it from
every invocation's context without losing it.

The 20 operative rows moved into the step bodies that use them, rewritten as instructions
rather than third-person description. `bin/lib/skill-audit`'s parser, written to perform
the migration, stays on as the regression guard.

## Consequences

**The trade-off.** 68 identifiers leave the runtime payload and survive only as graph edge
labels. A skill that could previously name a sibling's internals from its own context now
cannot. This is accepted deliberately: those identifiers were reachable only by reading a
table describing other skills' business, and measurement put the genuinely unreachable set
at 34 at depth 1 and **1** at depth 2 — that one being `version`'s pointer to the
auto-mode contract, whose own row said the contract "does not modify behavior."

**Why this is hard to reverse.** Restoring the tables means regenerating 510 rows of prose
from a graph that deliberately states each edge once, re-deriving the direction and voice
each side had. Git has the bytes; the convention's cost would return with them.

**What replaces the convention.** CLAUDE.md now requires each edge stated once in the
graph, and adding a skill means adding its edges there. The reciprocal-pair count is the
measure of what the old rule cost: 39 pairs, every one a place two copies could drift.

**What this does not change.** `/help`'s diagrams and reference card still enumerate
skills — that is user-facing navigation, not per-skill payload.
