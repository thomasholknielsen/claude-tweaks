---
record: 282
origin: human
risk: low
size: low
ceremony: fast-lane
grants: []
surface: backend
---
# 282: wrap-up Journeys row: journey listing doesn't recurse into subdirectories

Surface: backend

## Current State

`buildJourneyFrontmatter(cwd, facts.journeyFiles)` in `bin/wrap-up-engine.js` receives `facts.journeyFiles` from `listMarkdownFiles(path.join(cwd, 'docs', 'journeys'), 'docs/journeys')` in `bin/lib/wrap-up/facts.js` (the `journeyFiles` line, ~line 122). `listMarkdownFiles` (lines 46-55) calls `fs.readdirSync(dirPath)` non-recursively and filters `.md` entries at that single directory level only — it never descends into subdirectories.

Any journey filed at `docs/journeys/<subdir>/<journey>.md` is therefore absent from `facts.journeyFiles`, so `/claude-tweaks:wrap-up`'s Journeys curation row's diff-overlap scan silently reports no journeys affected — `scope.candidates` comes back `[]` — even when a nested journey's `files:` frontmatter genuinely overlaps the current diff. Confirmed by direct repro: run `node bin/wrap-up-engine.js plan --run-dir ... --base ...` against a project with `docs/journeys/<subdir>/<journey>.md` whose `files:` frontmatter lists a path present in the diff, and inspect the returned worklist's Journeys row `scope.candidates`.

`listMarkdownFiles` has a single caller in the codebase (this journey listing) — no other consumer depends on today's non-recursive behavior.

## Deliverables

- `listMarkdownFiles` in `bin/lib/wrap-up/facts.js` walks `docs/journeys/` recursively, so `.md` files at any subdirectory depth are included in the returned relative-path list.
- Relative paths returned for nested files follow the same `{relativePrefix}/...` convention as top-level files today (e.g. `docs/journeys/checkout/happy-path.md`), so downstream consumers (`buildJourneyFrontmatter`, the Journeys row's diff-overlap scan) require no changes to consume the new entries.
- Test coverage for a journey filed in a subdirectory, confirming it is present in `facts.journeyFiles` and reaches the Journeys row's `scope.candidates` when its `files:` frontmatter overlaps the diff.

## Acceptance Criteria

- [ ] A journey filed at `docs/journeys/<subdir>/<file>.md` appears in `facts.journeyFiles` returned by `gatherFacts()`.
- [ ] Running `node bin/wrap-up-engine.js plan --run-dir ... --base ...` against a project with a nested journey whose `files:` frontmatter overlaps the diff includes that journey in the Journeys row's `scope.candidates`.
- [ ] A journey at the top level of `docs/journeys/` (no subdirectory) still resolves correctly — existing flat-listing behavior is unchanged for the non-nested case.
- [ ] Non-`.md` files under `docs/journeys/` (at any depth) are still excluded from the returned list.
- [ ] `npm test` passes, including new or updated coverage for `bin/lib/wrap-up/facts.js`'s journey-listing behavior.

## Technical Approach

Make `listMarkdownFiles` in `bin/lib/wrap-up/facts.js` recurse into subdirectories of `dirPath`, preserving its existing signature `(dirPath, relativePrefix)` and its existing degrade-to-`[]`-on-error behavior (the file's header states `gatherFacts()` never throws, wrapping every filesystem/git call in try/catch instead). A straightforward approach: use `fs.readdirSync(dirPath, { withFileTypes: true })`, recursing into each directory entry with `relativePrefix` extended by that entry's name, while continuing to filter and emit `.md` files as `${relativePrefix}/${name}` exactly as today.

`listMarkdownFiles` has exactly one call site (`facts.js`, the `journeyFiles` assignment) — this is a self-contained, single-function change with no ripple into `bin/wrap-up-engine.js`'s `buildJourneyFrontmatter` or any other caller.

## Gotchas

- Preserve the fail-open contract: a missing or unreadable `docs/journeys/` directory, or a subdirectory that becomes unreadable mid-traversal, must still degrade to `[]`/partial results rather than throwing — matching this file's stated invariant that `gatherFacts()` never throws.
- Decide the symlink policy explicitly: today's non-recursive `readdirSync` never had to consider symlinked subdirectories. The simplest safe choice is not to follow them, avoiding potential traversal loops.
- Keep the relative-path format stable (forward-slash `docs/journeys/<subdir>/<file>.md`) since it's consumed by `buildJourneyFrontmatter`'s frontmatter matching and any `files:` overlap logic downstream — don't introduce OS-specific path separators.

## Original request

wrap-up Journeys row: journey listing doesn't recurse into subdirectories

**Summary:** The Journeys curation row's journey-file listing does not recurse into subdirectories of `docs/journeys/`, so a journey filed in a domain subfolder is invisible to the row's diff-overlap scan and the row silently reports "no journeys affected" instead of surfacing the gap.

**Kind:** Defect

**Affected component:** `/claude-tweaks:wrap-up`'s Journeys curation row (`bin/wrap-up-engine.js`, `bin/lib/wrap-up/facts.js`)

**Repro steps:**
1. In a project with `docs/journeys/<subdir>/<journey>.md` (a journey filed one level below `docs/journeys/`), whose `files:` frontmatter lists a path genuinely present in the current diff.
2. Run `/claude-tweaks:wrap-up`'s Phase 2 engine plan step (`node bin/wrap-up-engine.js plan --run-dir ... --base ...`).
3. Inspect the Journeys row's `scope.candidates` in the returned worklist JSON.

**Expected vs. actual:**
Expected: `candidates` includes the subdirectory journey, since its `files:` frontmatter genuinely overlaps the diff.
Actual: `candidates` is `[]` — the row reports no journeys affected, even though a direct check confirms real overlap.

**Root cause:** `buildJourneyFrontmatter(cwd, facts.journeyFiles)` in `bin/wrap-up-engine.js` only maps over `facts.journeyFiles`, which comes from `listMarkdownFiles(path.join(cwd, "docs", "journeys"), "docs/journeys")` in `bin/lib/wrap-up/facts.js`. That function does not walk subdirectories, so any journey filed more than one directory level deep is silently excluded from the Journeys row's candidate set entirely — a project organizing journeys by domain folder loses row coverage for every nested journey.

**Suggested fix:** Make the journeys-file listing recurse into subdirectories.

**Plugin version:** 6.74.0

---
Filed via /claude-tweaks:feedback.
