# upstream-drift: manifest schema and deterministic checks (Phase 2, leaf 1 of 3)

**Record:** #141 (parent #140). Build order for Phase 2 is #141 → #142 → #143.

**Goal:** Ship the data model and the deterministic half of the upstream-drift auditor — a committed manifest describing what this repo claims about each upstream dependency, plus three checks that test those claims against the artifact actually installed. This leaf alone would have caught the bug that motivated the whole design: `installed (2.1.8) != pinned (3.2.1)` is a one-line comparison, and nothing performed it for two verification passes.

**Architecture:** `tools/upstream-drift/` is maintainer-only tooling, not shipped payload (precedent: `evals/`). Dependency direction is one-way — this tool may import `bin/lib/health-core/`; nothing in `bin/` may import from `tools/`. `manifest.js` owns parsing and validation; `checks.js` owns the three checks and takes a plain entry object, so the two files are independent and testable in isolation. Every check **returns structured data and never prints** — rendering and issue filing belong to leaf #143.

**Tech stack:** Node 18+, `node:test`, CommonJS (matching `tests/` and `bin/lib/`), `child_process.spawnSync`. **Zero new npm dependencies** — the plugin ships none, so the YAML is hand-parsed over a deliberately small subset (the same posture as `bin/lib/policy.js`, which regex-matches flat dotted keys).

**Scope:** Leaf #141 only. Explicit non-goals, from the record: the LLM capability-triage half (#142), the runner / triggers / issue filing / CLI entry point (#143), and superpowers' manifest entry (its contract surface has not been audited — adding it is a data change once it has).

## Global constraints

- **No new runtime dependencies.** Hand-rolled YAML subset, enumerated below. Anything outside the subset throws rather than being silently misparsed.
- **Checks never print.** They return structured results. A check that `console.log`s is a bug — #143 owns rendering.
- **Reverting any one check's implementation must make that check's own test fail.** Verify by actually reverting and re-running, not by reading the test (`[IL-62]`, and the same rule in this project's memory on test discrimination).
- **Unit tests must not depend on Impeccable being installed.** They drive synthetic fixtures (temp dirs, `node -e` commands) so the negative cases are constructible and the suite is green on a machine with no global CLI. The real manifest is covered by a schema-conformance test only.
- **Working directory:** all work happens in the worktree `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/impeccable-upstream-contract` on branch `worktree-impeccable-upstream-contract`.

## Established facts

Every fact below was **executed** against this machine on 2026-08-06, not inferred:

| Fact | Value | How established |
|---|---|---|
| Installed Impeccable CLI | `3.5.0` | `npx --no-install impeccable --version` → `3.5.0`, exit 0 |
| CLI package root | `/Users/thomasholknielsen/.nvm/versions/node/v20.12.0/lib/node_modules/impeccable` | `npm root -g` + `ls` |
| `cli/engine/cli/main.mjs` | exists under that root | `ls` |
| `cli/engine/registry/antipatterns.mjs` | exists under that root | `ls` |
| stdout assertion literal | `process.stdout.write(formatFindings` present at `main.mjs:424` | `grep -n` |
| Installed Impeccable plugin versions | `3.0.6` **and** `4.0.2`, side by side | glob of `~/.claude/plugins/cache/*/impeccable/*/.claude-plugin/plugin.json` |
| Each candidate's own `version` field | matches its directory name (3.0.6→3.0.6, 4.0.2→4.0.2) | `grep '"version"'` per file, read individually |
| Plugin `polish` command | `` | `polish [target]` | `` present in `skills/impeccable/SKILL.md:54` | `grep -n` |
| Plugin `live.mjs` | exists at `skills/impeccable/scripts/live.mjs` | `ls` |
| Existing pin literals | `PINNED = '3.5.0'` (`tests/impeccable-cli-contract.test.js:8`), `<!-- upstream-pin: impeccable-cli@3.5.0 -->` (`skills/design-wrapper/impeccable-cli.md:3`) | `grep -n` |
| `package.json` test script | enumerates globs explicitly; a new directory is not picked up on its own (`[IL-84]`) | read |

**A note on reading those two `plugin.json` files.** A single `grep -h '"version"' fileA fileB` returned the two values in an order that did not match the argument order. The per-file reads above are what the table records. Any code resolving a version from a multi-candidate glob must therefore read **each candidate's own file** and pair the version with that candidate's path — never zip two independently-ordered lists together.

## File structure

```
tools/upstream-drift/
  manifest.yml            # NEW — the committed manifest (Task 2)
  manifest.js             # NEW — YAML subset parse + schema validation (Task 1)
  checks.js               # NEW — checkVersion / checkAssertions / replayFixtures (Tasks 3-5)
  tests/
    manifest.test.js      # NEW — parser + validator + real-manifest conformance
    checks.test.js        # NEW — three checks, each with a negative case
package.json              # EDIT — add tools/upstream-drift/tests/*.test.js to the test script
```

## The manifest schema (single definition — both implementers read this section)

```yaml
dependencies:
  - name: impeccable-cli
    kind: npm-cli
    installed-probe:
      type: command
      run: "npx --no-install impeccable --version"
      root: "npm root -g"
      root-suffix: "impeccable"
    pinned: "3.5.0"
    upstream:
      repo: "pbakaus/impeccable"
      tag-prefix: "cli-v"
    contract-paths:
      - "cli/engine/cli/main.mjs"
      - "cli/engine/registry/antipatterns.mjs"
    assertions:
      - file: "skills/design-wrapper/impeccable-cli.md"
        claims: "findings JSON is written to stdout"
        upstream-path: "cli/engine/cli/main.mjs"
        must-match: "process.stdout.write(formatFindings"
    fixtures:
      - run: "node -e \"...\""
        expect:
          exit: 2
          stream: stdout
          keys: [antipattern, severity]
```

**Field contract, per dependency.** All eight keys are required; a missing or empty one is a validation error naming the dependency and the key.

| Key | Type | Meaning |
|---|---|---|
| `name` | string | Unique across the manifest; duplicates are a validation error |
| `kind` | string | `npm-cli` or `claude-plugin` — selects nothing in code today, carried for #143's rendering |
| `installed-probe` | map | How to resolve the installed version **from the artifact itself**, never from install metadata or `gitCommitSha` (`[IL-89]`). Two types, below. |
| `pinned` | string | The version this repo's claims were verified against |
| `upstream` | map | `repo` + `tag-prefix`; consumed by #142's capability diff, carried (and validated) here |
| `contract-paths` | list of strings | Upstream files constituting the contract. **Listed for #142 to diff across tags; this leaf does not parse their contents.** |
| `assertions` | list of maps | `file`, `claims`, `upstream-path`, `must-match` — all four required per assertion |
| `fixtures` | list of maps | `run` + `expect{exit, stream, keys}` — `stream` is `stdout` or `stderr`; `keys` may be empty for a non-JSON fixture |

**Probe types.**

- `type: command` — run `run`; trimmed stdout is the installed version. `root` is a second command whose trimmed stdout, joined with `root-suffix`, is the artifact root that `checkAssertions` resolves `upstream-path` against.
- `type: plugin-cache-glob` — `glob` is a path pattern of `.claude-plugin/plugin.json` files. Read **each** candidate's own `version` field. The set of those values is the installed-version set; the candidate whose `version` equals `pinned` supplies the artifact root (the `plugin.json`'s grandparent directory). This makes resolution and pin enforcement the same step, which is precisely the `[IL-89]` guidance the record cites, and it handles multiple installed versions rather than assuming one — this machine has two.

**Why `contract-paths` is listed but not parsed here.** The record's Gotchas warn that parsing `antipatterns.mjs` with an unbounded regex yields a false positive, because a trailing code comment contains the literal `` `advisory: true` ``. This leaf does not parse that file at all, so the hazard cannot fire — it is recorded here so leaf #142, which *will* diff these files, inherits the warning rather than rediscovering it. Relatedly, `must-match` is compared as a **literal substring** (`String.prototype.includes`), never as a regex: a cited literal like `` `polish [target]` `` contains regex metacharacters, and treating it as a pattern would match the wrong thing or throw.

## Tasks

### Task 1 — `manifest.js`: YAML subset parser and schema validation

**Files:** create `tools/upstream-drift/manifest.js`, `tools/upstream-drift/tests/manifest.test.js`, and any frozen fixture manifests under `tools/upstream-drift/tests/fixtures/`.

**Exports:** `parseManifest(text)` → `{ dependencies: [...] }`; `validateManifest(obj)` → array of error strings (empty when valid); `loadManifest(filePath)` → parsed **and** validated, throwing an `Error` whose message names every validation failure.

**Supported YAML subset** (anything else throws a parse error naming the line number — silence is the failure mode this whole tool exists to prevent):

- two-space block indentation; block maps and block sequences
- `- ` sequence items, including sequences of maps
- flow maps `{ a: 1, b: "x" }` and flow sequences `[a, "b", c]`
- double-quoted scalars with `\"` and `\\` escapes; bare scalars
- `#` comments to end of line — **but not inside a quoted scalar** (a `run:` command may legitimately contain `#`)
- tabs used for indentation are a hard error (YAML forbids them, and they would silently misnest)

**Tests:** round-trip the schema example above; a sequence of maps; flow forms; a `#` inside a quoted string surviving intact; a tab-indented input throwing; each of the eight required keys missing producing a validation error naming the dependency and key; a duplicate `name` producing an error; an assertion missing `must-match` producing an error; a fixture whose `expect.stream` is neither `stdout` nor `stderr` producing an error. Plus one **conformance** test that `loadManifest` succeeds on the real `tools/upstream-drift/manifest.yml` — that one is meant to fail if someone later adds a malformed entry.

Behavioral tests use frozen fixture strings, not the live manifest, so editing the real manifest never rewrites what the parser tests assert (`[IL-80]`).

### Task 2 — `manifest.yml`: the two Impeccable entries

**Files:** create `tools/upstream-drift/manifest.yml`.

Two entries, **never conflated** — the record names conflating them as the documented root cause of the original drift.

- `impeccable-cli`, `kind: npm-cli`, `pinned: "3.5.0"`, probe `type: command` (`npx --no-install impeccable --version`, root `npm root -g` + suffix `impeccable`), upstream `pbakaus/impeccable` with `tag-prefix: "cli-v"`, contract-paths `cli/engine/cli/main.mjs` and `cli/engine/registry/antipatterns.mjs`, one assertion (`impeccable-cli.md` claims findings JSON goes to stdout → `main.mjs` must contain `process.stdout.write(formatFindings`), and the two fixtures Phase 1 already recorded (`warning.html` → exit 2 / stdout / the eight documented keys; `clean.html` → exit 0 / stdout / no keys).
- `impeccable-plugin`, `kind: claude-plugin`, `pinned: "4.0.2"`, probe `type: plugin-cache-glob` over `~/.claude/plugins/cache/*/impeccable/*/.claude-plugin/plugin.json`, upstream `pbakaus/impeccable` with `tag-prefix: "skill-v"`, contract-paths `skills/impeccable/SKILL.md` and `skills/impeccable/scripts/context-signals.mjs`, and two assertions verified above: `command-map.md`'s `polish` claim → `skills/impeccable/SKILL.md` must contain `polish [target]`; `modes/live.md`'s live-scripts claim → `skills/impeccable/scripts/live.mjs` must contain `#!/usr/bin/env node` or another literal confirmed present at implementation time. **No fixtures** — the plugin has no executable CLI surface; `fixtures: []` is valid and the validator must accept an empty list (distinct from a missing key).

Pin the plugin to `4.0.2`, the installed version, per the design doc's explicit reasoning: every artifact Phases 3-4 consume is present at 4.0.2, and surfacing 4.0.4 as an upgrade-with-capability-diff is exactly the `latest != installed` trigger's job.

The CLI's own fixtures reference `tests/fixtures/impeccable-cli/*.html`, which exist from Phase 1. Their replay is **not** wired into `npm test` (Task 6) — it needs the global CLI, and a contributor without it must not see a red suite. `tests/impeccable-cli-contract.test.js` already covers that ground with an explicit skip-if-absent.

### Task 3 — `checkVersion(entry)`

**Files:** create `tools/upstream-drift/checks.js`; add tests to `tools/upstream-drift/tests/checks.test.js`.

Returns `{ check: 'version', name, status, installed, pinned, detail }` where `status` is one of:

- `ok` — the installed set contains `pinned`
- `breach` — the artifact is present but no installed version equals `pinned`. `detail` **names both versions** (record AC3: pinned `3.5.0` on a machine running `2.1.8` must report a breach naming both).
- `absent` — the artifact is not installed at all. **Distinct from `breach`**, per the record's Gotchas: absent is not this repo's problem; present-at-the-wrong-version is a breach.

`installed` is an array — the plugin probe can legitimately resolve several. A non-zero exit or a spawn error from a `command` probe is `absent`, not a crash; an empty glob is `absent`.

**Negative test:** a synthetic entry pinned to a version the probe does not return must yield `breach` with both versions in `detail`; a probe command that does not exist must yield `absent`, not `breach`.

### Task 4 — `checkAssertions(entry)`

Returns `{ check: 'assertions', name, status, results: [...] }`, one result per assertion: `{ file, claims, upstreamPath, status, detail }` with status `ok`, `missing-file` (the `upstream-path` does not exist under the resolved root), or `unmatched` (the file exists but no longer contains `must-match`). Top-level `status` is `ok` only when every assertion is `ok`.

Root resolution comes from the entry's probe, per the schema section. When the root cannot be resolved (artifact absent), return `status: 'skipped'` with a detail saying so — an unresolvable root is not evidence that an assertion failed, and reporting it as a failure would produce exactly the kind of confident-but-wrong finding this tool exists to avoid.

Matching is literal substring, never regex (see the schema section).

**Negative test:** an assertion whose `must-match` is absent from a real on-disk fixture file yields `unmatched`; one naming a nonexistent `upstream-path` yields `missing-file`; the two are not collapsed into one status.

### Task 5 — `replayFixtures(entry)`

Returns `{ check: 'fixtures', name, status, results: [...] }`, one result per fixture: `{ run, status, detail, observed: { exit, stdoutLen, stderrLen } }`.

Execute each `run` with `spawnSync` and **`stdout` and `stderr` captured separately** — never merged, never `2>&1`. Merged output is what hid the original bug through two verification passes, so a test using `2>&1` would reproduce that blindness exactly. Read the exit code from `spawnSync`'s `status` field, not from a shell `$?` after a pipe (which would report the pipe's status).

Mismatch conditions, each with its own `detail`:

- exit code differs from `expect.exit`
- the stream named by `expect.stream` does not parse as JSON, **or the other stream carries the payload instead** — this is the exact failure the auditor exists to catch, and per record AC5 it must be reported as a mismatch, not passed over
- a key in `expect.keys` is missing from the first object of the parsed array

`expect.keys: []` means "do not inspect shape," and an empty `stdout` with `keys: []` is `ok`.

**Negative test — the load-bearing one:** a synthetic fixture whose command writes its JSON to **stderr** while `expect.stream` is `stdout` must be reported as a mismatch. Build it with `node -e` so it is deterministic and needs no global binary. Also cover a wrong exit code and a missing key.

### Task 6 — Wire the test glob, verify, and prove the checks discriminate

**Files:** edit `package.json`.

1. Add `tools/upstream-drift/tests/*.test.js` to the `test` script's enumerated glob list — a new test directory is not picked up on its own (`[IL-84]`).
2. Run the full `npm test` and confirm green, redirecting to a file before grepping rather than piping (long runs truncate, and a direct pipe can hide the real failure).
3. **Prove discrimination by reverting.** For each of the three checks in turn: break its implementation (e.g. make `checkVersion` always return `ok`; make `replayFixtures` ignore `expect.stream`), re-run that suite, confirm the matching test **fails**, then restore. Reading the test is not evidence (`[IL-62]`). Record the three observed failures in the handoff.

## Self-review

**Acceptance-criteria coverage.** AC1 (six fields per dependency) — Task 1's validator plus Task 2's data; the schema section adds `name` and `kind` as required, a superset. AC2 (two separate entries) — Task 2, with the rationale recorded. AC3 (`checkVersion` names both versions) — Task 3, with its negative test. AC4 (`checkAssertions` re-resolves cited literals) — Task 4. AC5 (`replayFixtures` separates streams, catches a stdout→stderr move) — Task 5's load-bearing negative test. AC6 (structured returns, never prints) — stated as a global constraint and inherent to every return shape above. AC7 (reverting a check fails its test) — Task 6 step 3, performed rather than asserted.

**Deliverables coverage.** `manifest.yml` (Task 2), `manifest.js` (Task 1), `checks.js` (Tasks 3-5), `tools/upstream-drift/tests/` with its glob in `package.json` (Tasks 1, 3-5, 6), and a negative test per check (Tasks 3, 4, 5).

**Where this plan goes beyond the record, deliberately.** The record's example manifest shows `installed-probe` as a flow map with no root-resolution field, but AC4 requires resolving `upstream-path` against something. Rather than leaving that implicit, the schema folds root resolution into the probe — which for the plugin makes pin enforcement and root selection one step, the shape `[IL-89]` argues for. `status: 'skipped'` on an unresolvable root is likewise an addition: the record does not name the case, and defaulting it to a failure would manufacture findings.

**What is deliberately not here.** No issue filing, dedup, fingerprinting, rendering, or CLI entry point (#143). No upstream tag enumeration or capability diffing (#142). No superpowers entry. No parsing of `contract-paths` contents. `bin/` is untouched, preserving the one-way dependency direction.
