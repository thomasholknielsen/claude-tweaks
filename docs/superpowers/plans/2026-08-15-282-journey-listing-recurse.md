# Plan: wrap-up Journeys row — recurse into docs/journeys/ subdirectories (#282)

## For agentic workers

Executed via `/claude-tweaks:build` (subagent strategy). Single task, two files.

## Context

`listMarkdownFiles(dirPath, relativePrefix)` in `bin/lib/wrap-up/facts.js` (~line 46) calls `fs.readdirSync(dirPath)` non-recursively, so a journey filed at `docs/journeys/<subdir>/<journey>.md` never appears in `facts.journeyFiles`, and the Journeys curation row's diff-overlap scan silently reports no candidates even when a nested journey's `files:` frontmatter genuinely overlaps the diff. `listMarkdownFiles` has exactly one call site (the `journeyFiles` assignment, ~line 122).

## Task 1: Recurse `listMarkdownFiles` into subdirectories

**Files:**
- `bin/lib/wrap-up/facts.js` (modify) — `listMarkdownFiles`, ~line 46
- `tests/bin-lib/wrap-up/facts.test.js` (modify) — add nested-journey coverage

**Change:** Rewrite `listMarkdownFiles` to walk `dirPath` recursively using `fs.readdirSync(dirPath, { withFileTypes: true })`: for each entry, if it's a directory (and not a symlink — do not follow symlinked directories, avoiding traversal loops), recurse into it with `relativePrefix` extended by the entry's name; if it's a `.md` file, emit `${relativePrefix}/${name}` exactly as today. Preserve the existing signature and the fail-open contract (missing/unreadable directory → `[]`, matching `gatherFacts()`'s never-throws invariant — wrap the top-level `readdirSync` in the same try/catch already present, and treat an unreadable subdirectory encountered mid-walk the same way: skip it, don't throw).

**Acceptance criteria (from the spec):**
- A journey at `docs/journeys/<subdir>/<file>.md` appears in `facts.journeyFiles`.
- The Journeys row's `scope.candidates` includes a nested journey whose `files:` frontmatter overlaps the diff (verified transitively — `buildJourneyFrontmatter` and the row's overlap scan are unchanged consumers of `journeyFiles`; the existing `docs/journeys/` unit test plus a live `wrap-up-engine.js plan` run against a nested-journey fixture is downstream integration coverage, not a new code path).
- A top-level journey (no subdirectory) still resolves — regression-tested by the existing `gatherFacts journeyFiles lists the journey markdown files` test staying green.
- Non-`.md` files at any depth stay excluded.
- `npm test` passes, with new coverage for the nested case in `tests/bin-lib/wrap-up/facts.test.js`.

**Verification:** `npm test` (targeted: `node --test tests/bin-lib/wrap-up/facts.test.js`, then full suite).
