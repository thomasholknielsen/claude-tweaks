---
record: 14
origin: human
risk: medium
effort: medium
grants: []
surface: backend
---
Surface: backend

## Current State

`skills/flow/multi-spec.md`'s dependency-aware reordering (Steps "Frontmatter pre-flight", "Build the DAG", "Prerequisites") reads `depends-on:` frontmatter, and its own text already admits the scope of what it reads:

> Steps 3-5 below (frontmatter pre-flight, dependency-aware ordering, conflict detection) read spec-file header fields (`depends-on:`, `Files:`) that don't yet exist on the materialized record header (`materialize.md`'s pinned header format) — this pre-flight enrichment applies to the legacy spec-file alias today. (`skills/flow/multi-spec.md:12`)

Confirmed against `skills/flow/materialize.md`'s "The pinned header format" section: the materialized record header (`record`, `origin`, `risk`, `effort`, `ceremony`, `grants`, `fingerprint`, `surface`, `design-intent`, `parked-at-shaping`) carries **no dependency field of any kind** — not `depends-on:`, not `blocked-by:`. So for any record produced through the current unified work-record pipeline (`/specify` → `/flow`), multi-spec ordering has zero dependency data to read, regardless of field naming. The original bug report's framing ("two field names for the same concept, pick one") undersells the gap: the real issue is that dependency data never reaches the materialized header at all.

The record-side dependency representation already exists and is used elsewhere: `record.js`'s `DEP_RE`/`parseDependencies(body)` reads `Blocked by #N` lines from a GitHub-issue body (`work-backend: github-issues` + `work-links: body-text`); `local-store.js` records carry the same relationship as `facets.blockedBy` (`work-backend: local-files`); `work-links: native` records carry it in GitHub's own dependency graph (queried via `blockedBy`/`issueDependenciesSummary` GraphQL fields — see `capabilities-probe.js`'s `probeSchema`). None of these three representations are read during materialization today.

`spec-template.md`'s Facets table's `blocked-by: [...]` frontmatter line is the `local-files` driver's on-disk facet name — a different thing from `flow/multi-spec.md`'s legacy `depends-on:` spec-file convention, despite the superficial naming overlap. Conflating the two (as the original report did) would produce a wrong fix; they're two independent mechanisms that happen to describe the same concept in two different systems (current unified records vs. legacy hand-authored spec files).

This project's own `#20` ("Dispatch's queue selection doesn't check open Blocked-by dependencies") is the same class of gap in a different consumer: neither `/flow`'s multi-spec ordering nor `/dispatch`'s queue selection currently reads `record.js`'s canonical dependency representation.

## Deliverables

- Extend `skills/flow/materialize.md`'s pinned header format with a dependency field (e.g. `blocked-by: [n1, n2, ...]`), populated at materialization time per driver/`work-links` mode:
  - `work-backend: github-issues` + `work-links: body-text` — `parseDependencies(body)` over the already-fetched body (no extra read).
  - `work-backend: github-issues` + `work-links: native` — one `gh api graphql` call per record resolving `blockedBy`/`issueDependenciesSummary`, added to Resolution's existing per-record fetch.
  - `work-backend: local-files` — `facets.blockedBy`, already present on the read record.
  - Omit the line when the record has no dependencies (mirrors `risk`/`effort`'s omit-when-absent convention already used by every other optional header field).
- Update `skills/flow/multi-spec.md`'s "Frontmatter pre-flight" step to read the new materialized-header field for record-reference targets, in addition to (not instead of) the existing `depends-on:`/`Files:` read for the legacy numeric spec-file alias — both paths coexist, since the legacy alias is still supported and multi-spec.md's own text already scopes its current read to it explicitly.
- Update the "Build the DAG" and "Prerequisites" steps' language to reflect that the dependency source is now driver-aware, not solely `depends-on:` frontmatter.
- Correct or remove `multi-spec.md:12`'s caveat once the gap it describes is closed.

## Acceptance Criteria

- Two leaf records created via `/specify`'s decomposition mode with a real dependency between them (leaf B `Blocked by #`{leaf A}), when materialized together via `/flow #A,#B`, produce a materialized header on leaf B carrying the dependency — verified by reading the materialized file under the run dir.
- `/flow`'s multi-spec DAG construction detects that dependency and either confirms the user's order matches it or offers/auto-applies reordering — verified end-to-end (not just at the header-composition layer) with an intentionally-reversed `$ARGUMENTS` order.
- Cycle detection still fires correctly when two materialized records mutually depend on each other (regression check — the DAG logic itself is unchanged, only its input source is extended).
- The legacy numeric spec-file alias (`depends-on:` frontmatter in a hand-authored spec file, no GitHub/local record backing it) continues to work exactly as before — unaffected by this change.
- `grep -n "don't yet exist on the materialized record header" skills/flow/multi-spec.md` returns zero matches — the stale caveat is gone once the header carries the field.

## Technical Approach

### Key Files

- `skills/flow/materialize.md` — pinned header format + "Populating the header" section (add the new field + its population logic per driver/work-links mode).
- `skills/flow/multi-spec.md` — "Frontmatter pre-flight" (line ~16), "Build the DAG" (line ~26), "Prerequisites" (line ~10) steps; the stale caveat at line ~12.
- `bin/lib/issues/record.js` — `parseDependencies`/`DEP_RE` (read-only reuse, no changes expected unless a shared per-record-fetch helper is warranted).

Reuse `parseDependencies(body)` for the `body-text` path rather than writing a second parser — `record.js` is the one place `Blocked by #N` line matching is defined (`DEP_RE`), and `/dispatch`'s companion fix (`#20`) should converge on the same helper rather than each consumer growing its own regex.

## Gotchas

- Don't fix this as a pure rename (`depends-on:` → `blocked-by:` in `multi-spec.md` alone) — that would still no-op, since the materialized header never carried either field. The header needs the new field added, not an existing one renamed.
- `work-links: native` records need a live GraphQL read at materialization time to populate the dependency field — this is the one path that isn't "already-fetched data," unlike every other header field `materialize.md` currently populates.
- This repo's own open records show zero `Blocked by #N` body-text lines today (checked directly) and the capability probe reports `dependencies: true` (native dependency API available on this org/repo) — `work-links` isn't explicitly stamped in this project's CLAUDE.md, so confirm which mode is actually configured (or probe live, matching what `/init` would persist) before assuming which materialization path applies here.
- `#20` is the sibling gap in `/dispatch`'s queue selection — coordinate field/helper naming with whoever picks that one up so the two fixes don't diverge on representation.

## Original request

/specify writes blocked-by:, /flow's multi-spec ordering reads depends-on: — dependency-aware reordering silently no-ops

**Related:** #13

## Context

While auditing memenu's spec lifecycle (alongside #13), found a frontmatter schema mismatch between two skills that are supposed to compose.

## The mismatch

- `skills/specify/spec-template.md` and `/claude-tweaks:specify`'s Step 2 (Implicit Dependency Detection) write dependency info to a `blocked-by:` frontmatter field.
- `skills/flow/multi-spec.md` — the dependency-aware reordering procedure for `/flow`'s multi-spec mode — reads `depends-on:` frontmatter exclusively (DAG construction, cycle detection, and Pipeline Preview all key off `depends-on:`).

Two different field names for what's presented as the same concept. Whichever skill is "right," the other silently no-ops.

## Evidence

Confirmed empirically in a project using this plugin: every spec with a real dependency relationship declared it via `blocked-by:`; zero used `depends-on:`. `/flow`'s reordering logic would silently treat every one of those specs as dependency-free, falling back to the user's `$ARGUMENTS` order regardless of actual prerequisites.

## Suggested fix

Standardize on one field name across `specify/spec-template.md` and `flow/multi-spec.md`. `blocked-by:` is the one actually written in production use, so it's the likely candidate — but that's a call for whoever owns the dependency-ordering design intent.
