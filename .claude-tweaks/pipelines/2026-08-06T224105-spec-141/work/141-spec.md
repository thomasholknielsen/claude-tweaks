---
record: 141
origin: human
risk: low
effort: medium
ceremony: standard
grants: [build, merge]
surface: backend
---
# 141: upstream-drift: manifest schema and the deterministic checks

Surface: backend
Parent: #140

## Overview

The data model and the deterministic half of the upstream-drift auditor: a committed manifest describing what this repo claims about each upstream dependency, plus the checks that test those claims against the artifact actually installed.

This leaf alone would have caught the bug that motivated the whole design — `installed (2.1.8) != pinned (3.2.1)` is a one-line comparison, and nothing performed it for two verification passes.

**Complexity:** Medium
**Estimated tasks:** 6-8

## Non-Goals

- The LLM capability-triage half (diffing upstream files across tags to find new capability). That is the sibling leaf.
- Issue filing, dedup, fingerprinting, or the CLI entry point. That is the third leaf.
- Auditing superpowers. This leaf ships the manifest entries for the two Impeccable artifacts only; superpowers' entry is a data addition once its contract surface has been audited.

## Current State

- `bin/lib/health-core/` — cache, fingerprint and dedup helpers the four shipped health sweeps use. This leaf may import from it; nothing in `bin/` may import from `tools/`.
- `tests/impeccable-cli-contract.test.js` — Phase 1's executed fixture test. It is the prototype for what `fixtures` entries replay, and its `PINNED` constant plus the `<!-- upstream-pin: impeccable-cli@3.5.0 -->` comment in `skills/design-wrapper/impeccable-cli.md` are the first two things the manifest must read.
- `evals/` — precedent for a non-shipped Node project living in this repo.
- `package.json` — its `test` script enumerates globs explicitly; a new test directory is not picked up automatically (`[IL-84]`).

## Deliverables

- [ ] `tools/upstream-drift/manifest.yml` — committed manifest with entries for the Impeccable **plugin** and the Impeccable **CLI** as two independent dependencies
- [ ] `tools/upstream-drift/manifest.js` — parse + validate, failing loudly on a malformed or incomplete entry
- [ ] `tools/upstream-drift/checks.js` — the three deterministic checks below
- [ ] `tools/upstream-drift/tests/` — unit coverage, with its glob added to `package.json`'s test script
- [ ] A negative test proving each check fails when it should, not merely that it passes today

## Acceptance Criteria

1. `manifest.yml` carries, per dependency: `installed-probe`, `pinned`, `upstream`, `contract-paths`, `assertions`, `fixtures`.
2. The Impeccable plugin and CLI are **two separate entries**. Conflating them is the documented root cause of the original drift.
3. `checkVersion(entry)` resolves the installed version via `installed-probe` and reports a breach when it differs from `pinned`. Given a manifest pinned to `3.5.0` on a machine running `2.1.8`, it reports a breach naming both versions.
4. `checkAssertions(entry)` re-resolves each cited literal against its named upstream path and reports which no longer resolve.
5. `replayFixtures(entry)` executes each recorded invocation with **stdout and stderr captured separately** and the exit code captured, and reports a mismatch against the recorded shape. A fixture whose JSON moves from stdout to stderr must be reported as a mismatch, since that is the exact failure the auditor exists to catch.
6. Every check returns structured data, never prints. Rendering and filing belong to the third leaf.
7. Reverting any one check's implementation makes its own test fail. Verify by actually reverting, not by reading (`[IL-62]`).

## Technical Approach

### Data / API Surface

```
# tools/upstream-drift/manifest.yml
dependencies:
  - name: impeccable-cli
    kind: npm-cli
    installed-probe: { type: command, run: "npx --no-install impeccable --version" }
    pinned: "3.5.0"
    upstream: { repo: "pbakaus/impeccable", tag-prefix: "cli-v" }
    contract-paths: ["cli/engine/cli/main.mjs", "cli/engine/registry/antipatterns.mjs"]
    assertions:
      - file: "skills/design-wrapper/impeccable-cli.md"
        claims: "findings JSON is written to stdout"
        upstream-path: "cli/engine/cli/main.mjs"
        must-match: "process.stdout.write(formatFindings"
    fixtures:
      - run: "npx --no-install impeccable detect --json --no-config --no-design-system tests/fixtures/impeccable-cli/warning.html"
        expect: { exit: 2, stream: stdout, keys: [antipattern, name, description, severity, category, file, line, snippet] }
```

`installed-probe` resolves from the artifact itself, never install metadata or `gitCommitSha` (`[IL-89]`).

For the **Impeccable plugin** entry that means globbing `~/.claude/plugins/cache/*/impeccable/*/.claude-plugin/plugin.json` and reading each candidate's own `version` field. `${CLAUDE_PLUGIN_ROOT}` is **not** the probe here — it resolves to claude-tweaks' own plugin root, so reading it would report this plugin's version under the Impeccable entry's name and compare it against Impeccable's pin. Right rule (`[IL-89]`), wrong artifact. A third-party plugin's root has no environment variable; the cache glob is the resolution, and selecting the candidate whose `version` equals `pinned` makes resolution and pin enforcement the same step. Verified 2026-08-06: the glob resolves `4.0.2` and `3.0.6` side by side on this machine, so the probe must handle multiple installed versions rather than assume one.

### Key Files

- `tools/upstream-drift/manifest.yml` — new
- `tools/upstream-drift/manifest.js` — new
- `tools/upstream-drift/checks.js` — new
- `tools/upstream-drift/tests/manifest.test.js` — new
- `tools/upstream-drift/tests/checks.test.js` — new
- `package.json` — add the new test glob

### Package Dependencies

- None new. YAML parsing: reuse whatever the repo already uses for `.claude-tweaks/policy.yml`; if that is hand-rolled, keep the manifest's YAML subset small enough to parse the same way rather than adding a dependency.

## Gotchas

- `npx --no-install impeccable --version` works on npm 7+ and returns the global binary — verified. Do not assume `--no-install` is npm-6-only syntax.
- A fixture replay MUST separate the streams. Merged output is what hid the original bug through two verification passes, and `2>&1` in a test would reproduce that blindness exactly.
- Capturing an exit code after a pipe gives the pipe's status, not the command's. Capture `$?` immediately, or use `spawnSync` and read `status`.
- Parsing the upstream rule registry with an unbounded regex produces a false positive: a trailing code comment in `antipatterns.mjs` contains the literal `` `advisory: true` ``. Bound any such parse to the array literal.
- The check must distinguish "CLI absent" from "CLI present at the wrong version". Those are different findings — the first is not this repo's problem, the second is a breach.


