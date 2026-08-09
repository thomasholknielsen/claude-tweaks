# Multi-Spec Review Console — Trace Contract Alignment — Design

**Date:** 2026-08-09
**Status:** Approved for planning
**Scope:** `bin/lib/wrap-up/engine-render.js`, `bin/wrap-up-engine.js`, `bin/lib/wrap-up/tests/`, `skills/flow/multispec-review-console.md`

## Problem

`docs/superpowers/specs/2026-08-08-wrap-up-phase-architecture-design.md` rebuilt single-spec `/claude-tweaks:wrap-up`'s Review Console around `bin/wrap-up-engine.js`'s `plan`/`record`/`render` verbs plus a declarative curation registry (`skills/wrap-up/registry.js`) — the console's five curated sections (Skill updates, Documentation updates, Journey updates, Configuration updates, Reference repairs) render via `render --section console`, mechanically, from `engine-state.json`. That doc's own Risk 3 flagged what it deliberately left out of scope: *"Flow's consolidated multi-spec console is a parallel implementation... Follow-up record: align it to the trace contract."*

`skills/flow/multispec-review-console.md` (the console `/flow` renders once at the end of a multi-spec run) is that parallel implementation. It is a hand-maintained prose template, not engine-fed, and it is missing content the single-spec console has:

- Three sections absent entirely: **Low-confidence findings**, **Contested findings**, and **Cleanup actions** (the latter is currently only *executed*, via prose "Shared teardown" steps, never rendered as a row the user sees and can override before it runs — a behavioral gap, not just a formatting one).
- **Journey updates** and **Reference repairs** — both engine-rendered sections in single-spec — have no multi-spec equivalent at all.
- **Documentation updates**, a separate section in single-spec, is folded into "Configuration updates" in the multi-spec example.

Diffing the two consoles also surfaces the actual mechanism split, which single-spec's own architecture already draws: five sections (Skills/Docs/Journeys/Config/References) are engine-rendered from the curation registry; everything else in the console (Auto-applied, Pending review, Low-confidence findings, Contested findings, Cleanup actions, Queue writes, Memory updates, Upstream feedback) is prose-rendered directly from `decisions.md`/`staged/`. Multi-spec's gaps split cleanly along this same line — this design fixes both halves, each with the mechanism appropriate to it.

## Design summary

Two independent fixes, both scoped to the multi-spec path only. Single-spec's console and engine are unchanged.

1. **Engine extension.** Each spec in a multi-spec run already gets its own `engine-state.json` — `PIPELINE_RUN_DIR` for spec `{N}` is `{parent}/spec-{N}/`, and Phase 2's `plan`/`record` run there regardless of `MULTISPEC_REVIEW_DEFER` (only `render`, the console step, is deferred). A new pure function, `renderConsoleSectionsMulti`, merges N states' engine-rendered sections into one `Spec`-tagged table per section title — the same shape single-spec already produces, just with an extra column.
2. **Prose parity.** Low-confidence findings, Contested findings, and Cleanup actions are never engine-rendered even in single-spec — they're already hand-aggregated from `decisions.md`, the same mechanism `multispec-review-console.md` already uses successfully for Auto-applied/Pending review/Queue writes/Memory/Upstream. This fix is "aggregate three more section types the same way," no engine involvement.

## A — Engine: `renderConsoleSectionsMulti`

New function in `bin/lib/wrap-up/engine-render.js`, alongside the existing `renderConsoleSections`:

```
renderConsoleSectionsMulti(specStates, { startAt }) -> { markdown, nextNumber }
```

`specStates` is `[{ specId, state }, …]` in caller-supplied order (the multi-spec run's execution order). Same `SECTION_SPECS` loop as `renderConsoleSections`, but the outer loop is per section title and the inner loop is per spec: one section (e.g. "Skill updates") collects rows from every spec that had findings there, in `specStates` order, each row's `#` column followed by a new `Spec` column. A spec with zero findings for a section contributes no rows to it (same "omit if empty" behavior single-spec already has for the whole section). The existing forbidden-vocabulary guard (`assertCleanVocabulary`) runs over the merged output exactly as it does today.

**CLI (`bin/wrap-up-engine.js`):** new repeatable flag `--spec-state <id>=<path>` (e.g. `--spec-state 157=.../spec-157/engine-state.json`), valid only with `--section console`. When one or more `--spec-state` flags are given, `--run-dir` is not required for that invocation: the CLI loads each state file in flag order, builds `specStates`, and calls `renderConsoleSectionsMulti` instead of `renderConsoleSections`. `--strict` in this mode validates completeness per given state (the existing per-state `strictCheck`, run once per entry) — it has no opinion on specs that aren't passed in at all; a not-run or failed spec is simply omitted by the caller, and that fact is already reported by `multispec-review-console.md`'s own Not-run/Failed footer, so the engine doesn't need to learn multi-spec concepts like `manifest.yml` or run status to do this. Single-spec's `render --run-dir <dir> --section console` invocation shape is untouched.

`skills/flow/multispec-review-console.md`'s "When to run the consolidated console" procedure (steps 1-3) changes from "read each spec's `staged/`/`decisions.md` by hand" to: enumerate `spec-{N}/` subdirectories with an `engine-state.json` present (via `manifest.yml`, as today), invoke `render --section console --spec-state 157=... --spec-state 159=... --start-at n`, and insert the output verbatim — the same "insert `render`'s output verbatim, never hand-expand it" rule single-spec's own console file already states for the engine path.

## B — Prose parity: Low-confidence, Contested, Cleanup actions

Added directly to `multispec-review-console.md`'s console template, no engine change:

- **Low-confidence findings** / **Contested findings** — aggregate `decisions.md` STAGED entries carrying the unconfirmed-finding / contested-debate rationale across every spec, `Spec`-tagged, non-empty-only rendering — identical condition to single-spec's own two sections, just summed across specs.
- **Cleanup actions** — today's "Shared teardown" (dev-server teardown, branch-finish, per-issue claim release, grant removal, label cleanup) executes unconditionally after the approval decision, with nothing rendered first. New shape: render it as numbered rows *before* the `AskUserQuestion` call — 2 run-level rows with no `Spec` column (dev-server teardown, branch-finish — both genuinely shared across the whole run, per `multi-spec.md`'s single-shared-worktree model) plus 3 rows *per spec* (claim release / grant removal / label cleanup — each is naturally per-issue). Same content, same execution timing (still runs inside "On approval"/"On override"), now visible and coverable by Override before it runs — matching single-spec's Cleanup actions section, which is populated from the same canonical list in `cleanup-procedures.md`.

The `[adr-convention]` row (inside Configuration updates) stays fully manual in both consoles — it's not engine-rendered in single-spec either. Multi-spec aggregates it per-spec exactly like Queue writes: per-item, never batched, never covered by "Approve all."

## C — Error handling

- Spec with no `engine-state.json` (not-run, or failed before Phase 2's `plan`) — simply omitted from `--spec-state`; already surfaced by the existing Not-run/Failed footer, no duplicate reporting needed.
- Engine binary errors or is absent entirely — the existing prose-fallback rule (`curation-engine.md` section 6) extends to the multi-spec case: render each present spec's sections by hand, tag the report `(engine unavailable — prose fallback ran)`, same as single-spec.
- A spec whose `engine-state.json` exists but is incomplete (an open worklist row never recorded) — `--strict` catches this per-state exactly as single-spec's own `render --strict` does; the console renders and then the run is flagged, matching today's single-spec failure mode rather than inventing a new one.

## D — Testing

`bin/lib/wrap-up/tests/` gains cases for `renderConsoleSectionsMulti`: multiple specs contributing to the same section title in order; a spec contributing zero findings to a section (must not emit an empty row for it); `Spec` column present on every row; row numbering continuous across specs and sections (mirrors the existing single-spec numbering test); forbidden-vocabulary guard still fires when a merged multi-spec finding smuggles internal vocabulary. No changes to existing single-spec fixtures or tests.

## File structure changes

| File | Change |
|------|--------|
| `bin/lib/wrap-up/engine-render.js` | Add `renderConsoleSectionsMulti`; export it |
| `bin/wrap-up-engine.js` | Add repeatable `--spec-state <id>=<path>` flag, console-section-only, mutually exclusive with `--run-dir` for that invocation |
| `bin/lib/wrap-up/tests/*` | New test cases per section D above |
| `skills/flow/multispec-review-console.md` | Rewrite "When to run" steps 1-3 and the console template: engine-fed sections replace the hand-written Skill updates/Configuration updates example; add Low-confidence findings, Contested findings, and Cleanup actions sections (prose-aggregated); split Documentation updates out of Configuration updates |
| `docs/superpowers/specs/2026-08-08-wrap-up-phase-architecture-design.md` | Risk 3 gets a one-line pointer to this doc as its resolution |
| `docs/skill-graph.md`, `docs/plugin-structure.md` | Update only if this changes the sub-file table or cross-skill edges — verify during planning, not assumed here |

## Risks

1. **Engine/prose split must stay legible.** Two different mechanisms now cooperate inside one rendered console (engine-fed sections + prose-aggregated sections). The plan should make `multispec-review-console.md` state explicitly, per section, which mechanism produced it — the same clarity single-spec's `review-console.md` already has ("insert `render`'s output verbatim... do not hand-expand it" vs. the prose-only sections' own conditional-render rules).
2. **Cleanup actions becoming approvable is a behavior change, not just a report change.** A user who previously only saw cleanup happen can now Override individual cleanup rows. The plan must verify `cleanup-procedures.md`'s canonical list still executes correctly when partially skipped in the multi-spec shared-worktree context (e.g. skipping branch-finish but not claim-release needs to leave a coherent state, same as single-spec already handles for its own Cleanup actions section).
3. **CLI flag interaction.** `--spec-state` and `--run-dir` both being valid-but-mutually-exclusive for `--section console` needs a clear, tested error path (malformed invocation, exit code 2) rather than silently preferring one.

## Decisions log (from brainstorming)

- Engine-rendered sections (Skills/Docs/Journeys/Config/References) merge via a genuine engine extension (`renderConsoleSectionsMulti` + CLI `--spec-state`), not a skill-prose-level merge of N separate `render` calls — chosen specifically to avoid reintroducing the hand-maintained-copy drift risk the phase-architecture redesign's Problem section already diagnosed for the old wrap-up steps.
- Prose-only sections (Low-confidence findings, Contested findings) get the same per-spec aggregation pattern already used for Auto-applied/Pending review — no engine work, since single-spec doesn't engine-render these either.
- Cleanup actions becomes a visible, approvable console section in multi-spec runs, matching single-spec — explicitly in scope, not deferred, since today's "execute via prose with no visible row" is a real behavioral gap relative to single-spec, not merely a cosmetic one.
- Scope is `/flow`'s multi-spec console only; `/claude-tweaks:dispatch`'s bundle path already routes through this same console (per `multispec-review-console.md`'s existing scope note), so no separate dispatch-side work is needed.
