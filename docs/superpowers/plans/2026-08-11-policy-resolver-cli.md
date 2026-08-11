# Policy Resolver CLI — one read path for policy.yml and run config (#329)

> **For agentic workers:** execution strategy is owned by `/claude-tweaks:build` — ignore this block.

**Spec:** `.claude-tweaks/pipelines/2026-08-11T195542-spec-329-330-331/spec-329/work/329-spec.md` (record #329)

**Goal:** ship `bin/resolve-policy.js` — the single canonical read path for `.claude-tweaks/policy.yml` with an optional pipeline-run `config.yml` overlay — plus the library extension in `bin/lib/policy-schema.js` it is a thin shell over, and collapse `bin/lib/policy.js`'s three bespoke line-regex readers onto the one shared flat-line parser. No prose migration (that is #330); no key renames (that is #331).

**Verified current state (2026-08-11, this worktree):**
- `bin/lib/policy-schema.js` exports `POLICY_KEYS`, `RENAMED_KEYS` (one entry: `unattended-tier` → `autonomy`, migrate `'on'→'unattended'`, else `null`), `auditPolicy`, `resolveValue(key, rawValue)`. Internal helpers: `parseFlatLines(raw)` (flat `key: value`, skips indented lines), `isValidValue(entry, value)`, `extractMapEntry`.
- `bin/lib/policy.js` exports `isWorktreeAlwaysOn`, `readIntegrationBranch`, `readListKey` — each with its own line regex. Pinned by `tests/policy.test.js`.
- `bin/lib/model-profiles/policy-fragment.js` exports `parsePolicyModelConfig(raw)` — the only nested-block reader; throws on unknown 4-space field or malformed `frontier-run-cap`.
- `tests/policy-schema.test.js` + `tests/policy.test.js` pin existing behavior. Root `tests/` is already in the test glob — new tests there need **no** `package.json` change.
- `dispatch-pick-max-concurrent` is a live `POLICY_KEYS` row (default 3) — it STAYS there (#331 Non-Goal: it runs its own removal course); this plan only ADDS an alias entry.

## Pinned resolver semantics (from the spec — implementers do not re-litigate)

- **Envelope:** each requested key resolves to `{value, source}` with `source ∈ run-config | policy | default`, plus optional `"renamed-from"`, `"invalid": true`, or `{"error": "unknown-key"}` (error entries have no value/source).
- **Precedence per key:** run `config.yml` (when `--run` given) → `policy.yml` → `POLICY_KEYS` default. Every raw value passes validation regardless of source.
- **Alias normalization per source:** each source's parsed flat map is alias-normalized via `RENAMED_KEYS` *before* precedence. Old key present alone → resolves under the new name with that source's tag + `renamed-from`. Both old and new in one source → new wins, NO `renamed-from`, stray old key left for `auditPolicy`. `migrate(old)` returning `null` → that source contributes no value; if no source yields a value, resolve to the schema default with `source: "default"` + `renamed-from` — never `value: null`.
- **Malformed value:** resolves to the schema default with `source: "default"` AND `"invalid": true`. Does NOT cascade to the next source (a typo must not activate a different configured value). `source: "default"` alone = known-but-unset (no `invalid` flag).
- **Coercion:** integers/booleans return native JS types (reuse `resolveValue`/`isValidValue` logic — `resolveValue`'s signature stays untouched; `trust.js` calls it).
- **`model-profiles`:** policy-only (the `--run` overlay never applies). Delegate to `parsePolicyModelConfig(policyRaw)`: block present → `{value: <rows object>, source: "policy"}`; absent → `{value: null, source: "default"}` (no schema default — `null` is the documented absent shape). If the fragment reader throws (malformed block), emit `{value: null, source: "default", "invalid": true}`.
- **Repo root:** `git rev-parse --show-toplevel` from process cwd; fallback to cwd when not in a git repo. NEVER read `CLAUDE_PLUGIN_ROOT` (observed unset in Bash tool envs — #170), never a positional path arg.
- **Exit codes:** per-key errors are data (exit 0). Invocation failures — zero positional keys, or `--run <dir>` that does not exist — exit 1, stderr message, no JSON. A `--run` dir that exists but has no `config.yml` is NOT an error (no overlay yet).
- **Output:** a single JSON object keyed by requested name — never a bare array (array-attached properties are dropped by `JSON.stringify`). Stdout is pure JSON; nothing is written to stderr on the alias path.
- **Run `config.yml` bookkeeping keys** (`specs:`, `created:`, `mode:` etc.): inert — only requested keys resolve; no whole-file validation pass.

---

## Task 1: Library — multi-key resolver + alias entry in `bin/lib/policy-schema.js`

**Files:** `bin/lib/policy-schema.js`, `tests/resolve-policy-lib.test.js` (new)

1. Add to `RENAMED_KEYS`: `{ key: 'dispatch-pick-max-concurrent', replacedBy: 'dispatch-batch-size', migrate: (value) => value }` with a comment recording the removal condition pointer (`skills/dispatch/deprecated-aliases.md`).
2. Export a new function `resolvePolicyKeys(requestedKeys, { policyRaw, runConfigRaw })` implementing the pinned semantics above, pure (no fs), so it is testable without spawning. Internally: `parseFlatLines` per source → per-source alias normalization → per-key precedence walk → validate/coerce via `isValidValue` + the same coercion rules as `resolveValue`. Unknown key → `{error: "unknown-key"}` entry, siblings still resolve.
3. `module.exports` grows `resolvePolicyKeys` (and nothing else changes shape).
4. Focused unit tests in `tests/resolve-policy-lib.test.js` with **inline string fixtures** (raw YAML strings in the test file — no live-file reads): the alias-per-source cases, both-keys-in-one-source, null-migrate fall-through (AC 8's shape at library level), malformed-value + `invalid` flag + no-cascade, unknown key, native-type coercion, known-but-unset default.

**Verify:** `node --test tests/resolve-policy-lib.test.js` green; `node --test tests/policy-schema.test.js` still green. Note: the new alias entry makes `auditPolicy` report a present `dispatch-pick-max-concurrent` under `renamedKeys` (it is deprecated — intended fallout); if an existing test pins the old audit outcome for that key, update that expectation deliberately and say so in the commit.

## Task 2: `bin/lib/policy.js` readers become wrappers over the shared parse

**Files:** `bin/lib/policy.js`

Reimplement `isWorktreeAlwaysOn`, `readIntegrationBranch`, `readListKey` as thin wrappers over `policy-schema.js`'s `parseFlatLines` (export it from policy-schema.js — internal today). Public signatures and return values unchanged; their JS callers keep calling them. Behavior parity notes:
- `isWorktreeAlwaysOn`: `entries['worktree.always'] === 'true'` (comment-tolerance comes free from `parseFlatLines`). This stays a direct in-process read — the PreToolUse hook keeps requiring `policy.js`; nothing here shells out.
- `readIntegrationBranch`: `parseFlatLines` strips the `# comment` but not whitespace *inside* a value — post-check: a value containing whitespace returns `null` (the current regex `[^\s#]+ … $` rejects it).
- `readListKey`: comma-split/trim/filter of the parsed value; absent or empty → `[]`.

**Verify:** `node --test tests/policy.test.js` green unmodified — the existing suite is the parity contract. If any assertion fails, the wrapper is wrong, not the test (IL-95: do not edit the pinning suite to make the wrapper pass).

## Task 3: `bin/resolve-policy.js` CLI + spawn tests

**Files:** `bin/resolve-policy.js` (new), `tests/resolve-policy-cli.test.js` (new), `tests/fixtures/resolve-policy/` (new fixture dir)

1. CLI: parse `[--run <dir>] <key> [<key>…]`. Resolve repo root (pinned semantics), read `{root}/.claude-tweaks/policy.yml` (missing file → empty source), read `{runDir}/config.yml` when `--run` given (dir must exist; missing `config.yml` → no overlay). `model-profiles` requested → the delegation rule. Everything else → `resolvePolicyKeys`. Print the single JSON object.
2. Spawn tests: fixture repo dirs created under `os.tmpdir()` (NOT inside this repo — `git rev-parse` from a repo-internal fixture dir would resolve THIS repo's root and read the live `policy.yml`, the scheduled-failure trap the spec forbids). Copy frozen fixture files from `tests/fixtures/resolve-policy/` into the temp dir per test. Cover the spec's ACs 1–10 verbatim, including: AC 5 (alias fixture holding only `dispatch-pick-max-concurrent: 5`), AC 8 (run-config `unattended-tier: off` → `autonomy` = `supervised`, `source: "default"`, `renamed-from`), AC 10 (spawn with `CLAUDE_PLUGIN_ROOT` deleted from `env`), the exit-1 invocation failures (zero keys; nonexistent `--run` dir), and run-dir-without-config.yml as non-error.

**Verify:** `node --test tests/resolve-policy-cli.test.js` green.

## Task 4: Docs — CLI row + canonical-read-path section

**Files:** `docs/plugin-structure.md`, `skills/_shared/policy-schema.md`

1. `docs/plugin-structure.md`: add `bin/resolve-policy.js` to the CLI reference (match the existing row format — read the surrounding table first).
2. `skills/_shared/policy-schema.md`: add a short "Canonical read path" section documenting the resolver CLI as THE way prose reads policy/run-config values (JSON envelope, `--run` overlay, alias behavior, invalid flag), noting the two carve-outs: the PreToolUse hook's in-process `policy.js` read (hot path), and `model-profiles`' policy-only delegation. Cite the invocation-form contract in `docs/skill-authoring.md`'s "Plugin-root references" section (#170) — do not restate it. Do NOT migrate any read site (that is #330).

**Verify:** both files render sanely (read the edited regions back); no skill file outside these two changed.

## Final Verification (central, after all tasks)

1. Full suite: `npm test` — zero failures (IL-120: never scope to the new test files).
2. Spec acceptance walk: run the resolver CLI against a temp fixture for AC 1/3/5/7/8 shapes and eyeball the JSON.
3. `git diff --stat` review: no files outside the four tasks' declared sets.
