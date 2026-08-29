---
record: 231
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
surface: backend
---
# 231: Add subprocess-level CLI test for bin/residue.js

Surface: backend

## Current State

`bin/residue.js` (115 lines) is a CLI entrypoint with no test that spawns it as a subprocess — unlike `bin/record-graph.js`, whose CLI wiring is exercised end-to-end by `tests/bin-lib/record-graph/cli-render.test.js` via `execFileSync`/`spawnSync`. residue's constituent probes (`bin/lib/residue/probes/*.js`) and helpers (`detect-test-script.js`, `finding.js`, `render.js`, `scope.js`, `scope-filter.js`) are unit-tested individually under `tests/bin-lib/residue/`, but the CLI's own arg-parsing/wiring layer (`parseArgs`, the required `--base` check, the `--json`/`--no-suite`/`--scope`/`--integration-branch` flags, and the usage-error exit path) is not exercised end-to-end.

Correction to the original filing: it cited `bin/lib/record-graph/tests/cli-render.test.js` and `bin/lib/residue/tests/cli.test.js` as the pattern/target paths. Verified against the live tree — neither path exists. This repo's actual convention is `tests/bin-lib/{module}/*.test.js` (confirmed via `package.json`'s `test` script: `find tests tools/upstream-drift/tests -name '*.test.js' | sort`), not `bin/lib/{module}/tests/`. The real pattern file is `tests/bin-lib/record-graph/cli-render.test.js`, and the new test belongs at `tests/bin-lib/residue/cli.test.js`.

## Deliverables

Add `tests/bin-lib/residue/cli.test.js`, spawning `bin/residue.js` as a subprocess (via `execFileSync`/`spawnSync`, matching `tests/bin-lib/record-graph/cli-render.test.js`'s pattern) with representative arguments, asserting on exit code and stdout/stderr shape rather than calling internal functions directly.

## Acceptance Criteria

- New test spawns `bin/residue.js` via `spawnSync`/`execFileSync` (not internal function calls)
- Covers at least one normal-invocation path (e.g. `--base <ref> --no-suite [--json]` against a throwaway git fixture, asserting exit code 0 and the shape of stdout) and one error/edge-case path (e.g. omitting `--base`, asserting exit code 2 and the usage message on stderr)
- `npm test`'s existing glob (`find tests tools/upstream-drift/tests -name '*.test.js'`) picks up the new file automatically — no `package.json` change needed

## Technical Approach

Follow `tests/bin-lib/record-graph/cli-render.test.js`'s structure: resolve `CLI` via `path.resolve(__dirname, '..', '..', '..', 'bin', 'residue.js')`, and use a `runExpectingFailure`-style helper for the error-path assertions (captures `error.status`/`error.stderr` directly rather than relying on `assert.throws(/Command failed/)`, which would pass for any nonzero exit code). `bin/residue.js` requires `--base` and exits 2 with a usage message on stderr when it's absent (`parseArgs`/`main`, `bin/residue.js` lines 54-57) — that's the cheapest error-path case, needing no fixture at all. For the normal-invocation path, run the CLI with `--base <some-valid-ref> --no-suite` against a temp git repo (or this repo's own checkout, since a `--no-suite --scope repo` read is non-mutating) and assert on the shape of the rendered (or `--json`) output.

## Gotchas

- `bin/residue.js` shells out to `git` and, unless `--no-suite` is passed, to `npm test` itself (`suiteRun()`, `bin/residue.js` lines 68-76, up to a 600s timeout) — the normal-invocation test case must pass `--no-suite` to stay fast and avoid a recursive/nested suite invocation.
- `probeForge` (invoked via the bare `run`, not the `git` wrapper) may shell out to `gh` — normal-invocation assertions should check output *shape* rather than exact forge-derived content, so the test doesn't become dependent on network/auth state in CI.

## Original request

Add subprocess-level CLI test for bin/residue.js

### Current State

`bin/residue.js` (114 lines) is a CLI entrypoint with no test that spawns it as a subprocess — unlike `bin/record-graph.js`, which `bin/lib/record-graph/tests/cli-render.test.js` exercises via `spawnSync`. Its constituent probes (`bin/lib/residue/probes/*.js`) and helpers are well unit-tested individually, but the CLI's own arg-parsing/wiring layer isn't exercised end-to-end.

### Deliverables

Add a test (e.g. `bin/lib/residue/tests/cli.test.js`) that spawns `bin/residue.js` as a subprocess with representative arguments and asserts on its exit code and stdout/stderr shape, following the pattern in `bin/lib/record-graph/tests/cli-render.test.js`.

### Acceptance Criteria

- New test spawns `bin/residue.js` via `spawnSync` (or equivalent) rather than calling internal functions directly
- Test covers at least the CLI's normal-invocation and one error/edge-case path
- `npm test` picks up the new test file (already globbed via `bin/lib/residue/tests/*.test.js` in `package.json`)

Origin: /claude-tweaks:init Update Mode reconnaissance (Phase 2f pain-point detection).

