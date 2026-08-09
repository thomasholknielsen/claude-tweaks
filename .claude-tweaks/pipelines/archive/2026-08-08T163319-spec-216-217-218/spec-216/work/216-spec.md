---
record: 216
origin: human
risk: medium
effort: high
ceremony: standard
grants: []
fingerprint: 2026-08-08-model-profile-strategy:work-profile-table-and-resolver-profile-to-model-effort-with
surface: bin
---
# 216: Work-profile table and resolver: profile to (model, effort) with override chain

Surface: bin
Parent: #215

## Overview

Replace the contract's one-dimensional `Fast | Standard | Capable` tier system with a **work-profile table** resolving each profile to a (model, effort) pair, and give it a mechanism: a `bin/` resolver that merges the table with `policy.yml` overrides, a run stance, and CLI overrides. Today tiers are prompt tokens (`[Use: Standard model]`) nothing resolves, enforces, or tests — the IL-102 failure shape. After this leaf, the table is canonical in exactly one place, pinned to the resolver's exported data by test, and dispatching skills copy a mechanically-resolved `model` into the Agent tool's `model` parameter.

**Complexity:** High
**Estimated tasks:** 8

## Non-Goals

- Registering the new policy keys in `policy-schema.{md,js}` (#219) — this leaf *parses* them from `policy.yml` and exports their names; registration/docs land in #219.
- Rewriting the dispatch sites to the new grammar (#222) — this leaf changes the contract file and CLAUDE.md's contract paragraph only.
- Frontier slot enumeration in consumer skills (#220, #221) — this leaf defines the Frontier row, preconditions, and cap machinery.
- Enforcing singleton-ness in `resolve()` — singleton-only is a **caller obligation stated in the contract** (the resolver has no call-site identity input); the resolver enforces only the cap, stance, and unattended gates.
- Any statusline or OTEL cost accounting.

## Current State

- Tier system: `skills/_shared/subagent-output-contract.md` `## Model Selection` (line ~85) — a 13-line table mapping Fast→Haiku, Standard→Sonnet, Capable→Opus, with "cheapest that fits" and the BLOCKED upgrade path. No effort axis, no Fable slot, no mechanism.
- Prompt-side tier code: `bin/lib/coordination.js` interpolates `tier` strings into dispatch prompts (defaults at lines ~202/214/230) — untouched by this leaf (#222 updates its strings).
- Policy parsing precedent: `skills/assess-agent-autonomy/SKILL.md` merge-check greps `.claude-tweaks/policy.yml` directly; `bin/lib/policy-schema.js` holds the registered-key list.
- Test pinning precedent: `bin/lib/hooks/pre-tool-use.js` exports `GATE_COVERAGE`, pinned to prose by `tests/hooks-gate-coverage.test.js`.
- Module + test conventions: `bin/lib/{name}/` flat sibling dirs; per-module `tests/` globs enumerated in `package.json`'s test script.
- CLAUDE.md `### Subagent Contract (v4.2+)` paragraph restates the tier vocabulary.

## Deliverables

- [ ] `skills/_shared/subagent-output-contract.md` `## Model Selection` replaced by **exactly this table** (this is the literal markdown to ship; the pinning test parses these columns):

  | Profile | Model | Effort | Constraints |
  |---|---|---|---|
  | Fast | haiku | — | No effort dial (Haiku ignores effort) |
  | Standard | sonnet | high | — |
  | Capable | opus | high | — |
  | Frontier | fable | high | Singleton-only; degrades to Capable |

  plus: dispatch grammar `[Use: {Profile}]`; the ordered effort scale `low < medium < high < xhigh < max`; stance definition; upgrade path (BLOCKED-for-reasoning → one profile up; Capable→Frontier only at contract-enumerated singleton slots); the session-inherit protection rule ("no fresh-agent dispatch omits `model`; inherit only as an explicit, stated choice" — **fork dispatches are exempt**: the Agent tool ignores a fork's `model` override structurally, and fork usage is already restricted by IL-07); a note that profiles govern **dispatches only** (inline steps ride the session model by design); the best-effort mid-session rule ("a harness usage-limit warning observed in-session degrades Frontier to Capable for the remainder of the run — best-effort, no mechanism claimed"); and one added sentence in the inherited-context sizing rule noting Sonnet 5's tokenizer makes the inherited payload ~30% more expensive in tokens.
- [ ] `bin/lib/model-profiles/profiles.js` — exports `PROFILES` (rows matching the table above, as `{model, effort, singletonOnly?, degradeTo?}`), `POLICY_KEYS_READ = ['model-profiles', 'model-stance', 'model-ceiling', 'frontier-run-cap']` (the authoritative key names #219 pins against), `EFFORT_SCALE = ['low','medium','high','xhigh','max']`, and **pure** `resolve(profile, opts)` (no I/O, no side effects).
- [ ] `resolve()` transform pipeline, in this exact order: (1) table default row; (2) policy `model-profiles` row override — **partial rows merge**: only supplied fields override, `{effort: "low"}` keeps the default model; (3) `cliOverride` (beats policy); (4) stance effort shift — stance moves **effort only**, never promotes the model/profile upward; `economy` additionally resolves frontier as capable; (5) `model-ceiling` clamp — applies to table/policy/stance-derived results but **not** to an explicit `cliOverride` (the ceiling defends against skill defaults, not against the human's typed override); (6) frontier gates — `unattended`, economy stance, cap (`frontierUsed >= frontier-run-cap`) — evaluated last, on the final profile, regardless of how frontier was selected.
- [ ] `bin/resolve-profile.js` — CLI: `node bin/resolve-profile.js <profile> [--stance <s>] [--unattended] [--run-dir <path>]`; reads `.claude-tweaks/policy.yml` from cwd; owns all I/O: with `--run-dir`, reads the frontier tally count, passes it to `resolve()` as `frontierUsed`, and **appends one tally line only when the final resolution is frontier** (format: `frontier<TAB>{ISO-8601 timestamp}`, file `{run-dir}/frontier-tally.log`); prints the resolution JSON; exits non-zero with a named error on unknown profile or malformed policy.
- [ ] `effortLine` output — newly authored here, pinned by its own test, exactly: `[Effort: {effort} — apply {effort}-level reasoning depth to this task.]` (empty string for Fast/null effort).
- [ ] `bin/lib/model-profiles/tests/` — table pinning, override chain incl. partial-row merge, ceiling clamp + CLI-beats-ceiling, stance shifts, frontier gates/tally/cap, effortLine, fail-loud paths.
- [ ] `package.json` test script gains the new tests glob (IL-84).
- [ ] CLAUDE.md's Subagent Contract paragraph updated to profile vocabulary (definition stays in the contract file).

## Acceptance Criteria

1. `PROFILES` matches the literal table above; models are family aliases, never versioned IDs.
2. A test parses the markdown table's Profile/Model/Effort columns from `subagent-output-contract.md` and asserts row-for-row equality with `PROFILES`, plus substring assertions for the Frontier row's singleton-only and degrade-to-Capable constraints; authored per IL-105 (each assertion demonstrated red by negating the prose).
3. Override chain under test: policy row beats table; partial policy row merges; CLI beats policy; `model-ceiling: "standard"` clamps a capable resolution (source `"ceiling"`) but does not clamp a cliOverride.
4. Stance under test: `economy` drops effort one notch on `EFFORT_SCALE` and resolves frontier as capable; `max-rigor` raises one notch capped at `max`; no stance ever changes a profile's model upward; Fast is stance-invariant.
5. Frontier gates under test: `unattended: true`, economy stance, and `frontierUsed >= cap` each yield capable's pair with `source` naming the reason (`degraded:unattended` / `degraded:stance` / `degraded:cap`); the CLI appends a tally line on a frontier result and not otherwise.
6. Unknown profile and malformed policy throw; CLI exits non-zero naming the error — never a silent default.
7. `effortLine` equals the pinned template for each effort level and `""` for Fast.
8. `npm test` runs the new suite.

## Technical Approach

### Data / API Surface

`resolve(profile, opts)` where `opts = {policy?: object, stance?: "economy"|"default"|"max-rigor", cliOverride?: {model?, effort?}, unattended?: boolean, frontierUsed?: number}` → `{model, effort, source, effortLine}`. `source ∈ default|policy|cli|stance|ceiling|degraded:cap|degraded:stance|degraded:unattended`. Pure function; all file I/O (policy read, tally read/append) lives in the CLI wrapper. Exports: `PROFILES`, `POLICY_KEYS_READ`, `EFFORT_SCALE`, `resolve`.

### Key Files

- `skills/_shared/subagent-output-contract.md` — replace `## Model Selection`; add rules listed above
- `bin/lib/model-profiles/profiles.js` — new
- `bin/resolve-profile.js` — new: CLI wrapper (I/O owner)
- `bin/lib/model-profiles/tests/resolve.test.js`, `tests/table-pinning.test.js` — new
- `package.json` — test glob
- `CLAUDE.md` — Subagent Contract paragraph vocabulary

## Gotchas

- **`${CLAUDE_PLUGIN_ROOT}` does not resolve in Bash tool calls in this repo's own sessions** — verified live during specification (open record #170 tracks it; six existing CLI call sites share the assumption). Document the repo-local fallback (`node bin/resolve-profile.js` from the checkout root) in the contract's dispatch instruction, and follow whatever resolution #170 lands on.
- Effort binds mechanically only via agent frontmatter — the Agent tool has a `model` param but **no per-dispatch effort param**. `effortLine` is the best-effort prompt channel for generic dispatches; state this limitation in the contract with an upstream watch item. Do not claim effort is enforced.
- Open record #155 lists `subagent-output-contract.md` as a "check" target — coordinate if it starts building concurrently.
- The tally file is resolver-CLI-owned; do not write it through `bin/hooks.js` (hooks own `events.jsonl`/`run-state.json`). Archived-run resurrection (#208) doesn't apply — per-run scratch, never read after the run.
- IL-80: the table-pinning test reads live contract prose by necessity (pinning is its purpose); every other test freezes inputs as fixtures.
- Fail-loud direction (IL-50): this resolver's conservative direction is *error out*, never silently resolve a cheaper or more expensive model.


<!-- work-fingerprint: 2026-08-08-model-profile-strategy:work-profile-table-and-resolver-profile-to-model-effort-with -->
