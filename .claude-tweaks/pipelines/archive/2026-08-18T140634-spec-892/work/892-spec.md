---
record: 892
origin: human
risk: medium
size: medium
ceremony: standard
grants: [build]
fingerprint: verify-runner:bin-verify-js-deterministic-verification-runner-verification
surface: terminal
---
# 892: bin/verify.js: deterministic verification runner + verification.md migration

Surface: terminal

**Related:** #881, #882

## Overview

Replace `plugin/skills/test/verification.md`'s prose-orchestrated bash capture discipline with a deterministic runner CLI, `plugin/bin/verify.js`. The model keeps resolving the project's check commands from CLAUDE.md/package.json exactly as verification.md Step 1 documents (Option A, decided at design time); the runner owns everything after resolution: execution with the fail-fast ordering policy, per-check capture to log files, real exit-code keying, bounded failure-region extraction, and a machine-readable `report.json` whose `sha`+`dirty` fields turn `TEST_PASSED`/`VERIFICATION_SHA` into an evidence artifact instead of a prose claim. This retires the incident cluster behind IL-120 (verification scope substitution), piped-output truncation hiding real failures, wrapper-vs-command exit-code ambiguity, and the `;`-chained capture snippet that worktree-always sessions refuse by text shape.

**Complexity:** Medium
**Estimated tasks:** 6

## Non-Goals

- Suite-count drop detection across runs — #881 owns it (the `counts` field this spec ships is its hook)
- Flake adjudication / a `--rerun-failed-isolated` flag — #882 owns it
- Runner-side command resolution from `.claude-tweaks/policy.yml` (design's Option B) — rejected for now; verification.md Step 1 stays prose, and `verify.js` must not read `policy.yml` or CLAUDE.md (see Gotchas)
- Any change to the QA story lane (`qa-procedures.md`, `qa-prompts.md`, `qa-reporting.md`) or the Design CLI gate (`design-gate.md`)
- Edits to the four consumer skills (`/test`, `/build`, `/deepen`, `/simplify`) — they cite verification.md and are untouched by contract

## Prerequisites

None.

## Current State

- Procedure: `plugin/skills/test/verification.md` — Step 2's "Capture, never stream" and "On a non-zero exit" sections own the capture/extraction discipline this CLI absorbs; Step 1 (Resolve Commands), Skip-if-recent, and Pre-existing failures stay prose
- Consumers: `/test` Step 1, `/build` Common Step 5, `/deepen` Step 5, `/simplify` — all cite verification.md rather than restating it
- CLI precedent: `plugin/bin/release.js`, `plugin/bin/file-feedback.js`, `plugin/bin/link-records.js` — argv-array spawning, never shell string interpolation of titles/values
- Module convention: `plugin/bin/lib/{name}/` flat sibling files (CLAUDE.md Structure section — NOT a nested `_shared/` wrapper); injectable-runner seam for testability as in `plugin/bin/lib/issues/` (functions take a runner override so tests inject fakes)
- Tests: `tests/bin-lib/{module}/` — `npm test`'s recursive glob picks a new directory up automatically (no package.json edit needed)
- Precedent for a machine-readable run report: the QA lane's `{RUN_DIR}/report.json` (`qa-reporting.md`)
- Docs: `docs/plugin-structure.md` lists the `plugin/bin/*.js` CLIs

## Deliverables

- [ ] `plugin/bin/lib/verify/` module (flat siblings, e.g. `args.js`, `run.js`, `extract.js`, `report.js`): parse `--cmd <name>=<command>` (repeatable) / `--json <path>` / `--log-dir <dir>`; execute with ordering policy; content-sniff the output family and extract failing regions; parse suite counts; compose and atomically write report.json
- [ ] `plugin/bin/verify.js` CLI entry over the module
- [ ] `tests/bin-lib/verify/` suite exercising the module through the injectable spawn seam (fake commands with controlled exit codes and output)
- [ ] Conformance test pinning verification.md's embedded invocation snippet to the real CLI surface
- [ ] `plugin/skills/test/verification.md` migration: Step 2's capture/extraction prose replaced by the canonical single-command invocation plus a short result-interpretation paragraph; Step 3 keeps its existing `Check | Status | Duration | Details` table, now sourced from report.json fields; `VERIFICATION_SHA` sourced from report.json's `sha` (with the `dirty` caveat noted)
- [ ] `docs/plugin-structure.md` row for the new CLI

## Acceptance Criteria

1. Ordering: `types` and `lint` run concurrently; `tests` starts only after every one of `types`/`lint` **that was supplied** exits 0 (absent stages are vacuously satisfied — `--cmd tests=…` alone starts immediately). A supplied types/lint failure reports `tests` as `skipped: fail-fast`. Asserted via fake commands through the seam, including the partial-set cases (`tests` alone; `lint`+`tests` without `types`)
2. Each check's stdout+stderr lands in its own log file under `--log-dir`; the runner's own stdout is bounded: one table row per check, plus at most one ≤100-line failing region per failed check, and never raw check output — asserted by a fake command emitting >1MB whose run leaves total runner stdout ≤64KB
3. report.json carries per-check `{command, exitCode, durationMs, logPath, summary, failingRegion}`, top-level `pass`, `startedAt`, `durationMs`, `sha` (from `git rev-parse HEAD`; `null` outside a repo), `dirty` (`true` iff `git status --porcelain` is non-empty; `null` outside a repo), and `counts` (`{tests, pass, fail}`) where a summary parses; the file is written atomically (temp file + rename)
4. The recorded `exitCode` is the check command's own exit code, including on failure (fake command exiting 7 records `exitCode: 7`)
5. Extraction family is sniffed from output content, never from the check's name, with this precedence: TAP markers (line-anchored `not ok`/`ok N`/`# tests`) → TAP extractor (`not ok` lines with trailing diagnostic context); else jest/vitest/pytest markers (line-anchored `FAIL `/`PASS `, `Tests: … failed`, `=== … passed/failed ===`) → summary-region extractor (`FAIL`/`Error:` regions plus trailing summary block); no match → generic tail (last 30 log lines), no `counts`. Each branch capped at 100 lines and covered by a fixture test
6. A `--cmd` whose command cannot spawn is recorded as a failed check carrying the spawn error — overall exit non-zero, never a silent skip; malformed argv (missing `=`, empty name, unknown flag) exits non-zero with usage on stderr
7. Overall process exit code is 0 iff every non-skipped check passed
8. verification.md's migrated Step 2 contains the invocation as one plain command (no `;`, `&&`, or pipe chains at the invocation level) and no longer contains the `LOG=`/`tail`/`grep` capture recipe; the conformance test validates the embedded snippet's flags against the CLI's real arg parser and proves it can fail (an unknown flag in the snippet turns the test red)
9. Unknown `--cmd` names (anything not `types`/`lint`/`tests`) run serially after the known stages, subject to the same fail-fast (skipped when any earlier supplied check failed), and appear in report.json like any other check
10. `--cmd` values are opaque strings: a value containing `&&`, `|`, or quotes is parsed intact and executed by the child shell (fixture test with a metacharacter-bearing command)
11. Full `npm test` passes — including the size-ceiling and prose-conformance suites over the edited verification.md — and a repo-wide sweep confirms no other skill text still cites the retired capture recipe (grep for `verify-test.log` and "Capture, never stream" outside verification.md's own history)

## Technical Approach

Option A: the model resolves commands, the runner executes — the incident cluster was about running and reading checks, not choosing them. Each command string spawns via `child_process.spawn(cmd, {shell: true})` with stdout/stderr piped to its log-file stream — the command is the caller's whole shell string by design, but the runner never composes a larger shell script around it. Defaults: `--log-dir` a fresh timestamped directory under `os.tmpdir()`; `--json` defaults to `{log-dir}/report.json`.

The ordered-name set `{types, lint, tests}` is a **closed contract** mirroring verification.md Step 2's project-generic three checks — it is not this repo's shape (this repo itself supplies only `--cmd tests="npm test"`); a project lacking a stage omits that `--cmd`. Adding a fourth ordered stage is a spec change to this contract, not a quiet code change; arbitrary extra checks are already served by unknown names (AC9).

### Data / API Surface

CLI: `verify.js [--cmd <name>=<command>]… [--json <path>] [--log-dir <dir>]`

```json
{
  "sha": "abc123… | null",
  "dirty": false,
  "startedAt": "ISO-8601",
  "durationMs": 12345,
  "pass": true,
  "checks": {
    "types": {
      "command": "tsc --noEmit",
      "exitCode": 0,
      "durationMs": 3210,
      "logPath": "/…/types.log",
      "summary": "one bounded line",
      "failingRegion": null,
      "counts": { "tests": 100, "pass": 100, "fail": 0 }
    }
  }
}
```

`counts` present only where a summary line parses (typically `tests`); `skipped` checks carry `{skipped: "fail-fast"}` in place of an exit code. The `counts` shape is **provisional until #881 consumes it** — future changes must be additive (new fields, never renamed/removed ones).

### Key Files

- `plugin/bin/verify.js` — new CLI entry
- `plugin/bin/lib/verify/args.js`, `run.js`, `extract.js`, `report.js` — new module, flat siblings
- `plugin/skills/test/verification.md` — Step 2/Step 3 migration
- `tests/bin-lib/verify/*.test.js` — new suite
- `docs/plugin-structure.md` — CLI table row

### Package Dependencies

None — node built-ins only (`child_process`, `fs`, `os`, `path`).

## Gotchas

- Fail toward scrutiny: any malformed/ambiguous state (unparseable counts, unreadable log, missing report field) must degrade to fail/absent, never to a fabricated pass — the same fail-direction discipline the `resolveRefutation` incident (docs/incident-log.md) established for sibling helpers
- Atomic report write is load-bearing: a crashed run must not leave a half-written report.json that a downstream gate reads as pass evidence — compose fully, write temp, rename
- The migrated invocation must stay ONE plain command at the invocation level — worktree-always sessions refuse `;`/`&&`/heredoc compound shapes by text shape. A compound `--cmd` *value* (e.g. `--cmd tests="a && b"`) is legal to the CLI but may still trip a session's text-shape guard; the documented fallback in the migrated prose is splitting it into two `--cmd` checks
- `verify.js` must not read `.claude-tweaks/policy.yml` or CLAUDE.md — command resolution stays caller-side (Option A's boundary). Review-enforced; a future Option B is a deliberate spec change, not scope creep
- Absent parse → omit `counts` entirely; never emit guessed or partial counts (a wrong count poisons #881's future drop-detection)
- `sha` alone is not proof of what was verified on a dirty tree — that's why `dirty` rides alongside it; downstream prose citing `VERIFICATION_SHA` should treat `dirty: true` as "verified this tree, which is not exactly commit `sha`"
- verification.md shrinks — run the FULL suite before merging, not just the new tests: prose-pinning suites elsewhere may cite the retired capture recipe, and near-ceiling files can trip size assertions on unrelated branches (docs/incident-log.md IL-120's build is the cautionary case)
- Don't document zsh-hostile recipes in the migrated prose (no `echo ===` separators, no `echo "$JSON" | …`) — known zsh traps in this repo's memory
- `spawn(cmd, {shell: true})` is deliberate for whole-string commands; keep titles/paths out of shell strings everywhere else (argv arrays, `--body-file` pattern per existing CLIs)

## Decision Rationale

See the parent record's Decision Rationale (Option A vs B, and why prose discipline is the wrong tool for capture/extraction).


<!-- work-fingerprint: verify-runner:bin-verify-js-deterministic-verification-runner-verification -->

