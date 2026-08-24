---
record: 753
origin: human
risk: medium
size: medium
ceremony: standard
grants: [build]
surface: backend
---
# 753: globToRegExp: support recursive ** patterns so docs/REGISTRY.md skills/** actually matches skill files

Surface: backend

## Current State

`docs/plugin-structure.md`'s Auto-detect patterns for its own registry row are `skills/**`, `bin/**`. The mechanical matcher this row is scored with — `bin/lib/issues/blast-radius.js`'s `classifyDiffFiles` / `globToRegExp` — implements `*` as within-a-path-segment only (`[^/]*`), and has no `**` construct. `skills/**` therefore compiles to `^skills/[^/]*[^/]*$`, matching nothing deeper than `skills/{x}`; `bin/**` likewise matches `bin/hooks.js` but never `bin/lib/**`.

Measured on a real diff (7 changed files under `skills/`, incl. `skills/demo/SKILL.md`, `skills/specify/shaping-mode.md`, `skills/help/status-scan.md`):

```
7  docs/skill-authoring.md   (pattern: skills/**/*.md)
2  README.md
2  docs/getting-started.md
2  docs/skill-graph.md
1  CLAUDE.md
0  docs/plugin-structure.md  (patterns: skills/**, bin/**)
```

The one doc whose stated job is "directory tree, per-skill sub-file table, command reference" scores zero on a diff that touched seven skill files — it is structurally invisible to every mechanical registry-driven review trigger (`/build`'s "updates docs matched by the registry", `/tidy`'s registry audit, wrap-up's own overlap scan).

## Deliverables

Teach `globToRegExp` a real `**` construct (matching across path-segment boundaries, e.g. `.*` when the token spans a whole segment), so `skills/**`/`bin/**`-style registry patterns actually match files at any depth under those roots — fixing every consumer of `globToRegExp` at once rather than narrowing `docs/plugin-structure.md`'s own patterns to what the matcher happens to support today.

## Acceptance Criteria

- `globToRegExp('skills/**')` matches `skills/demo/SKILL.md`, `skills/specify/shaping-mode.md`, and deeper paths (e.g. `skills/_shared/foo/bar.md`), not just one segment deep.
- `globToRegExp('bin/**')` matches `bin/lib/issues/blast-radius.js` and other nested paths under `bin/`.
- Re-running the measurement above against `docs/plugin-structure.md`'s existing `skills/**`, `bin/**` patterns shows a non-zero score for a diff touching skill files.
- Existing `globToRegExp`/`classifyDiffFiles` callers and their existing test coverage keep passing — this is a superset fix (adding `**` support), not a behavior change to single-`*` matching.
- `npm test` green.

## Technical Approach

Extend `bin/lib/issues/blast-radius.js`'s `globToRegExp` to recognize a `**` token as matching across path-segment boundaries (typically compiled to `.*`), distinct from single-`*`'s existing within-segment (`[^/]*`) compilation. Add unit tests for `**` at various positions (trailing, as in `skills/**`; mid-pattern) alongside the existing single-`*` test coverage.

### Key Files

- `plugin/bin/lib/issues/blast-radius.js` — `globToRegExp`, `classifyDiffFiles`
- `docs/plugin-structure.md` — the registry row whose `skills/**`/`bin/**` patterns motivate this fix (no edit needed here once `globToRegExp` supports `**`; kept as the acceptance-criteria proof point)

## Gotchas

- Two candidate fixes exist; this record deliberately picks fixing `globToRegExp` over narrowing the registry's own patterns, because narrowing loses the recursive intent an LLM reading the registry correctly infers today and drops non-`.md` skill assets (e.g. `skills/backlog/routine-template.yml`).
- Any existing test or caller that relies on single-`*` NOT crossing a `/` boundary must continue to see that exact behavior — only a literal `**` token gains the new cross-boundary behavior.

## Original request

globToRegExp: support recursive ** patterns so docs/REGISTRY.md skills/** actually matches skill files

# Wrap-up Docs row — staged finding 1

**Target:** `docs/REGISTRY.md` (Auto-detect column, `docs/plugin-structure.md` row)
**Kind:** registry — pattern update
**Category:** staleness (registry accuracy)
**Classification:** additive edit, but the correct fix is ambiguous — staged rather than applied
**Reversibility:** high **Confidence:** medium

## Finding

`docs/plugin-structure.md`'s Auto-detect patterns are `skills/**`, `bin/**`. The mechanical
matcher this row is told to score with — `bin/lib/issues/blast-radius.js`'s
`classifyDiffFiles` / `globToRegExp` — implements `*` as within a path segment only
(`[^/]*`), and has no `**` construct. `skills/**` therefore compiles to
`^skills/[^/]*[^/]*$`, which matches nothing deeper than `skills/{x}`; `bin/**` likewise
matches `bin/hooks.js` but never `bin/lib/**`.

Measured on this run's own diff (7 changed files under `skills/`, incl. `skills/demo/SKILL.md`,
`skills/specify/shaping-mode.md`, `skills/help/status-scan.md`):

    7  docs/skill-authoring.md   (pattern: skills/**/*.md)
    2  README.md
    2  docs/getting-started.md
    2  docs/skill-graph.md
    1  CLAUDE.md
    0  docs/plugin-structure.md  (patterns: skills/**, bin/**)

So the one doc whose stated job is "directory tree, per-skill sub-file table, command reference"
scores zero on a diff that touched seven skill files — it is structurally invisible to every
mechanical registry-driven review trigger (`/build`'s "updates docs matched by the registry",
`/tidy`'s registry audit, this row's own overlap scan).

## Why it was not applied

Two defensible fixes, and picking one is a judgment call the console should make:

1. **Narrow the registry patterns** to what the matcher supports — e.g. `skills/*/*.md`,
   `bin/*.js`, `bin/lib/*/*.js`. Cheap, no code change, but loses the recursive intent an LLM
   reading the registry correctly infers today, and drops non-`.md` skill assets
   (`skills/backlog/routine-template.yml`).
2. **Teach `globToRegExp` a real `**`** (`.*` when the token spans a whole segment). Fixes every
   consumer at once and keeps the registry's intent readable — but it is a code change to a
   shared module with its own tests, i.e. outside a docs-curation row's remit.

Option 2 looks correct; it needs its own record.

## Suggested next step

File a backlog record for option 2 (`bin/lib/issues/blast-radius.js` — support `**` in
`globToRegExp`, with the registry's `skills/**` as the motivating case), or accept option 1 as
an interim registry edit.

