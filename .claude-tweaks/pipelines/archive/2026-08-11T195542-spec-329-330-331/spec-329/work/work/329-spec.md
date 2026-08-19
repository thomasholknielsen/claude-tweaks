---
record: 329
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
fingerprint: policy-read-path-and-collapse:policy-resolver-cli-one-read-path-for-policy-yml-and-run-con
surface: backend
---
# 329: Policy resolver CLI: one read path for policy.yml and run config

Surface: backend

## Overview

Build `bin/resolve-policy.js` — the single canonical read path for `.claude-tweaks/policy.yml` and pipeline-run `config.yml` overlays. Today the flat policy file is read four parallel ways: three bespoke regex readers in `bin/lib/policy.js`, `bin/lib/policy-schema.js#resolveValue` (the documented canonical coercion contract, with exactly one caller — `bin/lib/issues/trust.js`), a dedicated nested-block parser for `model-profiles`, and a verbatim `grep -E "^{key}:" … | sed …` pipeline copy-pasted across skill prose, each site restating the key's default inline. This leaf ships the resolver and its library; the prose migration onto it is a separate follow-up leaf (see Prerequisites there), so nothing in `skills/**` changes here.

**Complexity:** Medium
**Estimated tasks:** 6

## Non-Goals

- Migrating any prose read site in `skills/**` — that is the follow-up leaf's entire scope
- Changing any key's name, default, or value set — the collapse leaf owns that
- Touching the PreToolUse hook's read path — `isWorktreeAlwaysOn` keeps its direct read (measured ~42 ms hot path; it must never shell out to a second node process)
- A YAML dependency or nested-config support beyond the existing `model-profiles` block reader — the zero-runtime-deps flat-line constraint is deliberate and load-bearing

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| — | none | — |

## Current State

- Schema data: `bin/lib/policy-schema.js` — `POLICY_KEYS` (name/type/enum/default per key), `RENAMED_KEYS` (audit-and-migrate entries, e.g. `unattended-tier` → `autonomy`), `parseFlatLines` (flat `key: value` matcher, skips indented lines by design), `resolveValue(key, rawValue)` (validate + coerce + default fallback), `auditPolicy(repoRoot)`
- Bespoke readers: `bin/lib/policy.js` — `isWorktreeAlwaysOn`, `readIntegrationBranch`, `readListKey`, each with its own line regex
- Nested key: `bin/lib/model-profiles/policy-fragment.js` — the only nested-block reader; `bin/lib/model-profiles/profiles.js#resolve()` consumes it
- Run config: `.claude-tweaks/pipelines/{run-id}/config.yml` — flat `key: value` lines (verified 2026-08-11 against a live run dir), containing Manifesto lever answers plus non-policy bookkeeping keys (`specs:`, `created:`, `mode:`) that must never be resolved as policy
- Deprecated-alias precedent: `dispatch-pick-max-concurrent` still resolves with a warn-once notice; removal condition in `skills/dispatch/deprecated-aliases.md`
- Tests: `tests/` (root suite) and `bin/lib/*/tests/` directories, each glob enumerated in `package.json`'s test script

## Deliverables

- [ ] `bin/resolve-policy.js` CLI: positional args are key names; optional `--run <dir>` overlays that run's `config.yml`; output is a single JSON object keyed by requested name, each entry `{value, source}` with `source` ∈ `run-config | policy | default`
- [ ] Unknown key → `{"error": "unknown-key"}` entry for that key (exit 0, errors are per-key data, not a process failure). Invocation-level failures are distinct: zero positional keys, or a `--run <dir>` that does not exist, exit 1 with a stderr message and no JSON; a run dir that exists but has no `config.yml` is NOT an error — it simply means no overlay (the Manifesto may not have written one yet)
- [ ] Alias resolution centralized, with these pinned semantics (each was an open question at red-team time):
  - `RENAMED_KEYS` is the **single** alias table the resolver reads. This leaf adds a `dispatch-pick-max-concurrent` → `dispatch-batch-size` entry (identity `migrate`) so the one prose-handled alias also routes through it
  - Alias normalization applies **per source**: each source's raw map (run `config.yml`, then `policy.yml`) is alias-normalized before precedence resolution, so an old key in `config.yml` resolves with `source: "run-config"` plus `"renamed-from"`
  - When a source holds **both** the old and the new key, the new key wins, `renamed-from` is not set, and the stray old key is left for `auditPolicy` to report
  - When `migrate(oldValue)` returns `null` (real case: the shipped `unattended-tier` entry), fall through to the schema default — `source: "default"`, still tagged `"renamed-from"` — never emit `value: null`
  - The old `warn-once` stderr notice is superseded by the `"renamed-from"` JSON field; stdout stays pure JSON and the resolver writes nothing to stderr on the alias path (calling prose surfaces the notice)
- [ ] Malformed-but-present values resolve to the schema default with an additional `"invalid": true` flag — this is the deliberate carve-out from the absence≠failure rule: `source: "default"` alone means known-but-unset; `source: "default"` + `invalid` means present-but-rejected. A malformed higher-precedence value does **not** cascade to the next source (a typo must not silently activate a different configured value); it degrades to the schema default directly, matching `resolveValue`'s existing contract
- [ ] Repo root resolution: `git rev-parse --show-toplevel` from the process cwd, falling back to cwd itself when not in a git repo — never from `CLAUDE_PLUGIN_ROOT` (observed unset in Bash tool environments) and never from a positional path argument
- [ ] `model-profiles`, when requested, delegates to `bin/lib/model-profiles/policy-fragment.js`'s existing reader, wrapped in the same envelope: `{value: <rows object>, source: "policy"}` when the block exists, `{value: null, source: "default"}` when absent (the key has no schema default — `null` is the documented absent shape). It is policy-only: the `--run` overlay never applies to it (run configs hold flat lever lines, not nested blocks)
- [ ] `bin/lib/policy.js`'s three readers become thin wrappers over `policy-schema.js`'s shared parse (public signatures and return values unchanged; their JS callers keep calling them) so exactly one flat-line parser implementation remains
- [ ] Unit tests (frozen fixture files, never this repo's live `policy.yml`); if a new `bin/lib/{name}/tests/` directory is created, its glob is added to `package.json`'s test script in the same change
- [ ] `docs/plugin-structure.md` gains the CLI row; `skills/_shared/policy-schema.md` documents the resolver as the canonical read path

## Acceptance Criteria

1. `node bin/resolve-policy.js autonomy` against a fixture setting `autonomy: unattended` prints `{"autonomy": {"value": "unattended", "source": "policy"}}`
2. The same call against a fixture without the key prints `source: "default"` and the `POLICY_KEYS` default (`supervised`)
3. With `--run <fixture-dir>` where the run's `config.yml` sets a requested key, that value wins and `source` is `"run-config"`; a key absent from `config.yml` falls through to `policy.yml`, then to the default
4. Requesting a key name absent from `POLICY_KEYS` yields `{"error": "unknown-key"}` for that key while sibling keys in the same call still resolve
5. A fixture holding only `dispatch-pick-max-concurrent: 5` resolves a request for `dispatch-batch-size` to `5` with `"renamed-from": "dispatch-pick-max-concurrent"` — via the `RENAMED_KEYS` entry this leaf adds (the single alias table, per the Deliverables)
6. Integer and boolean keys return native JS types in the JSON (via `resolveValue`'s existing coercion), never strings
7. A malformed value (e.g. `trust-revert-window-days: banana`) resolves to the schema default with `source: "default"` **and** `"invalid": true` — distinguishing present-but-rejected from known-but-unset (which carries no `invalid` flag)
8. A fixture whose `config.yml` holds the old key `unattended-tier: off` (migrate → null) resolves a request for `autonomy` to the schema default `supervised` with `"renamed-from": "unattended-tier"` — the null-migrate fall-through pinned by test
9. `model-profiles` requested with no block present yields `{"value": null, "source": "default"}`; with a block present, the parsed rows object with `source: "policy"`
10. A test spawns the CLI with `CLAUDE_PLUGIN_ROOT` deleted from the environment and asserts correct output — pinning that the CLI never reads it
11. Full suite green: `npm test` passes with zero failures, including all pre-existing `bin/lib/*/tests/` suites (`isWorktreeAlwaysOn`/`readIntegrationBranch`/`readListKey` behavior pinned unchanged by existing tests)

## Technical Approach

The CLI is a thin shell over library code so the logic is testable without spawning processes. Precedence is resolved per requested key: run-config value (when `--run` given and the key parses from `config.yml`) → policy.yml value → `POLICY_KEYS` default; every raw value passes through `resolveValue` for validation/coercion regardless of source.

### Data / API Surface

- CLI: `resolve-policy [--run <dir>] <key> [<key>…]` → stdout JSON object `{ [key]: {value, source, error?, "renamed-from"?} }`
- Library: extend `bin/lib/policy-schema.js` exports with the multi-key resolve function the CLI calls (name at implementer's discretion; keep `resolveValue`'s existing signature untouched — it has an external caller in `trust.js`)

### Key Files

- `bin/resolve-policy.js` — new CLI entry point
- `bin/lib/policy-schema.js` — shared parse + multi-key resolution + alias application
- `bin/lib/policy.js` — readers become wrappers over the shared parse
- `docs/plugin-structure.md` — CLI reference row
- `skills/_shared/policy-schema.md` — canonical-read-path section
- `package.json` — test glob, only if a new tests directory is added

### Package Dependencies

- none (zero runtime deps is a hard constraint)

## Gotchas

- `parseFlatLines` deliberately skips indented lines — dot-notation is how namespacing is expressed, never indentation; don't "fix" that while extracting the shared parse
- Absence and failure must not degrade to the same sentinel: an unknown key is an explicit error entry, a known-but-unset key is `source: "default"` — never conflate them
- Return a JSON object, never a bare array with attached properties (properties on arrays are silently dropped by `JSON.stringify`)
- Test fixtures must be frozen files under the tests directory — a test reading this repo's live `policy.yml` is a scheduled failure timed to the collapse leaf
- `CLAUDE_PLUGIN_ROOT` was observed **unset** in this repo's own Bash tool environment on 2026-08-11 — the CLI itself must not read it, and the follow-up migration leaf is blocked on #170 (which owns that question) for the invocation-path decision
- The `--run` overlay consumes a run dir the *caller* resolved (via `PIPELINE_RUN_DIR` or newest-match) — the resolver never guesses a run dir itself; a wrong-run guess that then gets written back is the self-feeding-fallback class this repo has been bitten by
- `config.yml` may hold retired keys from older runs (observed: `unattended-tier` in a 2026-08-09 run dir) — inert because only requested keys resolve, but don't add a "validate the whole file" pass that would trip on them

## Decision Rationale

Sequencing read-path-unification before any renaming is the design's core decision: today every consumer hardcodes key names and defaults, so renames cost a repo-wide sweep; after this leaf plus the migration leaf, a rename costs one `POLICY_KEYS` row and one `RENAMED_KEYS` entry. Rejected alternatives: wholesale `namespace.key` rename first (maximum churn, leaves all four parsers and the axis duplication intact); nested YAML restructure (breaks the deliberate zero-deps flat-line constraint); precedence-unaware minimal resolver (the precedence chain — CLI arg > run config > policy > default — is the single most prose-restated logic in the plugin; leaving it in prose forfeits the main consolidation win). Alias dual-read in the resolver is a deliberate departure from the `unattended-tier` no-dual-read precedent: with one code path the shim is cheap, and it prevents an un-migrated `policy.yml` from silently reverting to defaults between a plugin update and `/claude-tweaks:init --update`'s migration offer; every alias still carries a recorded removal condition.


<!-- work-fingerprint: policy-read-path-and-collapse:policy-resolver-cli-one-read-path-for-policy-yml-and-run-con -->
