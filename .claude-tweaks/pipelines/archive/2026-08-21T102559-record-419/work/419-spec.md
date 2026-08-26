---
record: 419
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
surface: backend
---
# 419: Boundary enforcement test: the plugin/ payload is self-contained

Surface: backend

## Current State

After the `plugin/` restructure (#418 — a hard `Blocked by` dependency; this suite has no tree to run against until it merges) the payload boundary exists structurally but nothing enforces it. The regression vectors are concrete: a new module recreates a colocated `tests/` dir under `plugin/bin/`; a skill references a repo-root path that doesn't ship; a lockfile lands in `plugin/` (the installer auto-runs dependency install when one is present, violating the zero-deps policy); a `require()` in `plugin/bin` reaches outside the payload.

## Deliverables

- `tests/payload-boundary.test.js` asserting, from the repo root:
  (a) every `${CLAUDE_PLUGIN_ROOT}`-relative path referenced in `plugin/**/*.md` and `plugin/hooks/hooks.json` resolves to a real file inside `plugin/`;
  (b) every `require()` in `plugin/bin/**` with a **string-literal argument** resolves inside `plugin/` (Node builtins exempt), and any `require()` with a **non-literal argument** is itself a failure listed by file:line — dynamic requires are not an accepted blind spot;
  (c) no directory named `tests` exists under `plugin/`;
  (d) no lockfile (`package-lock.json`, `npm-shrinkwrap.json`, `bun.lock`) exists under `plugin/`.
- **Extraction heuristic for (a), defined here, not invented at build time:** a `${CLAUDE_PLUGIN_ROOT}` reference counts as executable when it appears either outside any fenced code block, or inside a fenced block whose language tag is `bash`/`sh`/`json` — the contexts skills actually execute from. Illustrative mentions are excused only via the allowlist below.
- **Allowlist:** a `BOUNDARY_ALLOW` array at the top of the test file, entries `{ file, pattern, reason }` — reviewable in diff, asserted non-empty-reason by the test itself, so it can't silently grow.
- Wire the suite into `package.json`'s test globs.

## Acceptance Criteria

- Suite green on the restructured tree.
- Each assertion demonstrated to discriminate: introduce a temporary violation per assertion (a dangling path, an escaping require, a dynamic require, a `tests/` dir, a lockfile, an out-of-boundary symlink), show the test fail, revert (the verify-test-discrimination-by-reverting lesson — reading the test is not evidence it fails).
- `npm test` includes the new suite (glob coverage shown per IL-84).

## Technical Approach

Static scanning only — no execution of plugin code. `require()` resolution via `require.resolve` with paths pinned to `plugin/bin`. **Symlink semantics: a symlink under `plugin/` whose target resolves outside `plugin/` is a hard failure of assertion (a)/(b), never a silent skip** — an escaping symlink is exactly the boundary violation this suite exists to catch.

## Gotchas

- Assertion (a) is the load-bearing one — it converts the old false doc claim into an invariant; name the payload-boundary ADR in the test header comment so the contract is traceable.
- The heuristic + allowlist above are the contract; an implementer finding a context the heuristic misclassifies extends the allowlist with a reason, never weakens the heuristic inline.



## Original request

Boundary enforcement test: the plugin/ payload is self-contained

Surface: backend

## Current State

After the `plugin/` restructure (#418 — a hard `Blocked by` dependency; this suite has no tree to run against until it merges) the payload boundary exists structurally but nothing enforces it. The regression vectors are concrete: a new module recreates a colocated `tests/` dir under `plugin/bin/`; a skill references a repo-root path that doesn't ship; a lockfile lands in `plugin/` (the installer auto-runs dependency install when one is present, violating the zero-deps policy); a `require()` in `plugin/bin` reaches outside the payload.

## Deliverables

- `tests/payload-boundary.test.js` asserting, from the repo root:
  (a) every `${CLAUDE_PLUGIN_ROOT}`-relative path referenced in `plugin/**/*.md` and `plugin/hooks/hooks.json` resolves to a real file inside `plugin/`;
  (b) every `require()` in `plugin/bin/**` with a **string-literal argument** resolves inside `plugin/` (Node builtins exempt), and any `require()` with a **non-literal argument** is itself a failure listed by file:line — dynamic requires are not an accepted blind spot;
  (c) no directory named `tests` exists under `plugin/`;
  (d) no lockfile (`package-lock.json`, `npm-shrinkwrap.json`, `bun.lock`) exists under `plugin/`.
- **Extraction heuristic for (a), defined here, not invented at build time:** a `${CLAUDE_PLUGIN_ROOT}` reference counts as executable when it appears either outside any fenced code block, or inside a fenced block whose language tag is `bash`/`sh`/`json` — the contexts skills actually execute from. Illustrative mentions are excused only via the allowlist below.
- **Allowlist:** a `BOUNDARY_ALLOW` array at the top of the test file, entries `{ file, pattern, reason }` — reviewable in diff, asserted non-empty-reason by the test itself, so it can't silently grow.
- Wire the suite into `package.json`'s test globs.

## Acceptance Criteria

- Suite green on the restructured tree.
- Each assertion demonstrated to discriminate: introduce a temporary violation per assertion (a dangling path, an escaping require, a dynamic require, a `tests/` dir, a lockfile, an out-of-boundary symlink), show the test fail, revert (the verify-test-discrimination-by-reverting lesson — reading the test is not evidence it fails).
- `npm test` includes the new suite (glob coverage shown per IL-84).

## Technical Approach

Static scanning only — no execution of plugin code. `require()` resolution via `require.resolve` with paths pinned to `plugin/bin`. **Symlink semantics: a symlink under `plugin/` whose target resolves outside `plugin/` is a hard failure of assertion (a)/(b), never a silent skip** — an escaping symlink is exactly the boundary violation this suite exists to catch.

## Gotchas

- Assertion (a) is the load-bearing one — it converts the old false doc claim into an invariant; name the payload-boundary ADR in the test header comment so the contract is traceable.
- The heuristic + allowlist above are the contract; an implementer finding a context the heuristic misclassifies extends the allowlist with a reason, never weakens the heuristic inline.
