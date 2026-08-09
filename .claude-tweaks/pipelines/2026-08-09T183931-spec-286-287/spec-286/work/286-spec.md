---
record: 286
origin: human
risk: low
size: low
ceremony: fast-lane
grants: []
fingerprint: multispec-console-trace-alignment:engine-multi-spec-console-section-merging
surface: infra
---
# 286: Engine: multi-spec console section merging

Surface: infra

## Overview

`bin/lib/wrap-up/engine-render.js`'s `renderConsoleSections(state, {startAt})` renders single-spec `/claude-tweaks:wrap-up`'s 5 curated Review Console sections (Skill updates, Documentation updates, Journey updates, Configuration updates, Reference repairs) from one `engine-state.json`. In a multi-spec `/flow` run, each spec already gets its own `engine-state.json` (Phase 2's `plan`/`record` run per-spec regardless of `MULTISPEC_REVIEW_DEFER`; only the console-render step is deferred), but nothing merges N specs' states into one consolidated console today — `/flow`'s consolidated console currently hand-writes a 2-section subset instead of using the engine at all. This record adds the merge capability to the engine itself; leaf #287 (blocked by this one) rewrites the multi-spec console skill file to call it.

**Complexity:** Low
**Estimated tasks:** 5

## Non-Goals

- Does not change single-spec `render --run-dir <dir> --section console` (or `--section trace`) behavior — that invocation shape and its output stay byte-for-byte unchanged.
- Does not touch the curation registry (`bin/lib/wrap-up/registry.js`), `plan`, or `record` verbs — only `render`'s console path gains a new mode.
- Does not read `manifest.yml` or know what a "spec" is beyond the caller-supplied `id` label in `--spec-state <id>=<path>` — enumerating a multi-spec run's `spec-{N}/` subdirectories and deciding which ones to pass in stays the caller's job (#287).
- Does not add Low-confidence findings, Contested findings, or Cleanup actions to any console — those are prose-only sections in single-spec too (never engine-rendered) and are #287's concern.
- Does not validate that every `--spec-state` file was produced by the same plugin/engine version — see Gotchas.
- Does not deduplicate `--spec-state` entries sharing the same `id` — see Acceptance Criteria 14 and Gotchas.

## Prerequisites

None — no blocking records.

## Current State

- `bin/lib/wrap-up/engine-render.js` — exports `renderTrace`, `renderConsoleSections`, `strictCheck`, `FORBIDDEN_VOCABULARY`. `renderConsoleSections(state, {startAt})` iterates a fixed `SECTION_SPECS` array (5 entries: `skills`, `docs`, `journeys`, `claude-md`+`decision-records` merged, `references`) over one state's `results` object, returns `{markdown, nextNumber}`. Each row is `| # | Target | Change | Disposition |`.
- `bin/wrap-up-engine.js` — CLI wiring `plan`/`record`/`render`. `render` currently accepts `--run-dir <dir> --section trace|console [--strict] [--start-at n]`; loads `engine-state.json` from `--run-dir` and dispatches to `renderTrace` or `renderConsoleSections`.
- `bin/lib/wrap-up/tests/` — existing `node --test` suite covering the engine modules, including `renderConsoleSections`/`renderTrace`/`strictCheck`.

## Deliverables

- [ ] Add `renderConsoleSectionsMulti(specStates, { startAt })` to `bin/lib/wrap-up/engine-render.js`, exported alongside the existing functions.
- [ ] Add a repeatable `--spec-state <id>=<path>` CLI flag to `wrap-up-engine.js`'s argument parser, valid only in combination with `--section console`.
- [ ] Wire the `render` verb: when one or more `--spec-state` flags are given, load each path's `engine-state.json`, build `specStates` in flag order, and call `renderConsoleSectionsMulti` instead of `renderConsoleSections`; `--run-dir` becomes optional for this invocation shape.
- [ ] Add malformed-invocation error paths (exit code 2): `--spec-state` combined with `--run-dir` on `--section console`; `--spec-state` used with `--section trace`; a `--spec-state` value with no `=` separator; a `--spec-state` path that doesn't exist or whose content isn't valid JSON.
- [ ] Add unit tests in `bin/lib/wrap-up/tests/` covering the new function and CLI flag (see Acceptance Criteria).

## Acceptance Criteria

1. `renderConsoleSectionsMulti([{specId:'157',state:A},{specId:'159',state:B}], {startAt:1})` returns one merged markdown block per section title (e.g. one "Skill updates" table), with rows from spec `157` appearing before spec `159`'s rows within that table, matching `specStates` order.
2. Each emitted row's second column (immediately after `#`) is `Spec`, containing that row's `specId` — e.g. `| 3 | 157 | src/foo.ts | ... | ... |`.
3. A spec contributing zero findings to a given section title contributes zero rows to it — no empty placeholder row for that spec.
4. A section with zero findings across every given spec is omitted from the merged output entirely (same "omit if empty" behavior `renderConsoleSections` already has for a single state).
5. Row numbering (`#` column) is continuous across specs and across sections in the merged output, starting at the given `startAt`.
6. `assertCleanVocabulary` (the existing forbidden-vocabulary guard) runs over the full merged markdown output and throws under the same conditions it already throws for `renderConsoleSections`.
7. `node bin/wrap-up-engine.js render --section console --spec-state 157=/path/a.json --spec-state 159=/path/b.json --start-at 1` prints the merged markdown to stdout and exits 0. This is the exact repeatable-flag shape #287 depends on: one `--spec-state {id}={path}` flag per spec, given in spec execution order.
8. `node bin/wrap-up-engine.js render --section console --run-dir /path --spec-state 157=/path/a.json` (both flags given for `--section console`) exits 2 with a usage message on stderr.
9. `node bin/wrap-up-engine.js render --section trace --spec-state 157=/path/a.json` (spec-state on the trace section) exits 2 with a usage message on stderr.
10. `--strict` with one or more `--spec-state` entries validates completeness per given state (`strictCheck` run once per entry, results merged) and exits 2 if any given state is incomplete, printing the merged table first, matching the existing single-state `--strict` print-then-exit ordering.
11. The full existing `bin/lib/wrap-up/tests/` suite still passes unchanged — single-spec `render --run-dir <dir> --section console` (no `--spec-state`) output is byte-for-byte identical to before this change.
12. `node bin/wrap-up-engine.js render --section console --spec-state 157=/nonexistent/path.json` (a `--spec-state` path that doesn't exist, or whose content isn't valid JSON) exits 2 with an error message on stderr naming the failing path — not a silent empty section and not an uncaught exception/stack trace.
13. `node bin/wrap-up-engine.js render --section console --spec-state 157` (a `--spec-state` value with no `=`) exits 2 with a usage message on stderr.
14. Two `--spec-state` flags given the same `id` (e.g. `--spec-state 157=a.json --spec-state 157=b.json`) are NOT deduplicated — both contribute their rows independently, tagged with the same `Spec` value, in flag order. This is documented caller behavior, not validated by the function: the caller (#287) is responsible for passing unique, non-empty ids; this leaf adds no uniqueness check.

## Technical Approach

`renderConsoleSectionsMulti` mirrors `renderConsoleSections`'s existing `SECTION_SPECS` loop but swaps the loop nesting: outer loop over `SECTION_SPECS` (section title), inner loop over `specStates` in given order, collecting that spec's findings for the section's `rowIds`. Row rendering adds one column: `| # | Spec | Target | Change | Disposition |` instead of `| # | Target | Change | Disposition |`. Reuse the existing `dispositionFor` helper unchanged — only the table header and row-assembly line change shape.

### Data / API Surface

```js
// bin/lib/wrap-up/engine-render.js
function renderConsoleSectionsMulti(specStates, { startAt = 1 } = {}) {
  // specStates: [{ specId: string, state: object }, ...], in caller-supplied order
  // returns: { markdown: string, nextNumber: number }
}
module.exports = { renderTrace, renderConsoleSections, renderConsoleSectionsMulti, strictCheck, FORBIDDEN_VOCABULARY };
```

CLI flag parsing in `bin/wrap-up-engine.js`'s `parseArgs`: `--spec-state` is repeatable — each occurrence's value is `id=path`, split on the first `=` only; a value with no `=` at all is a malformed invocation (AC13). Accumulate valid entries into an array of `{specId, path}` in encounter order — duplicate `specId` values are accepted without deduplication (AC14). At the `render` verb's dispatch point: if the accumulated `specStates` array is non-empty — require `section === 'console'` (else `usageExit()`, exit 2) and require `!runDir` given (else `usageExit()`, exit 2); load each path's `engine-state.json` via `fs.readFileSync` + `JSON.parse`, catching both a missing-file error and a JSON parse error and reporting the specific failing path on stderr before exiting 2 (AC12) — do not let either propagate as an uncaught exception; build the `{specId, state}` array; call `renderConsoleSectionsMulti(specStates, {startAt})` instead of `renderConsoleSections`. `--strict` in this mode: run the existing `strictCheck(state)` once per given state, collect all `missing` results, print the merged console table first, then exit 2 if any state had missing rows — mirrors the existing single-state `--strict` behavior of printing before exiting.

### Key Files

- `bin/lib/wrap-up/engine-render.js` — add `renderConsoleSectionsMulti`, export it.
- `bin/wrap-up-engine.js` — add `--spec-state` flag parsing, the multi-state dispatch branch inside the `render` verb handler, the four new usage/error paths (AC 8, 9, 12, 13).
- `bin/lib/wrap-up/tests/` — extend the existing engine-render test file (check the directory first to match its existing file/naming convention rather than adding a new top-level test file).

## Gotchas

- The existing `renderConsoleSections` function, `SECTION_SPECS`, and `dispositionFor` must not change behavior — single-spec's console depends on today's exact output byte-for-byte. Add the new function; only extract shared helpers if doing so provably doesn't change `renderConsoleSections`'s existing test results.
- `assertCleanVocabulary` must run once over the final *merged* markdown string, not per-spec-then-concatenated — matches how the existing function checks its own final output once, and catches vocabulary that could straddle a section boundary between two specs' findings.
- `engine-render.js`'s own header comment states "No fs, no git, no clock" for this module — `renderConsoleSectionsMulti` must stay a pure function of its `specStates` argument. All `fs.readFileSync` calls for loading state files belong in the CLI (`wrap-up-engine.js`'s `render` verb handler), never in the renderer module.
- Per this repo's `[IL-84]`: a *new* `bin/lib/wrap-up/tests/` subdirectory would need its glob added to `package.json`'s test script — check first whether adding a file to the existing tests directory (the expected approach here) already falls under its current glob before assuming any `package.json` change is needed.
- Every `--spec-state` file passed to one `render` call is assumed to come from the same plugin version's `record` verb — true by construction, since every spec in one multi-spec `/flow` run shares the same engine binary within that run. No cross-state schema-version check is added; this is a stated assumption, not a validated invariant. Do not add defensive version-mismatch handling — the scenario it would guard against (mixed engine versions inside one run) cannot occur through any real caller, and speculative validation for it is out of scope.

<!-- work-fingerprint: multispec-console-trace-alignment:engine-multi-spec-console-section-merging -->
