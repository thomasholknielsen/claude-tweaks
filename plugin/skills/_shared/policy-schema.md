# Policy Schema — Canonical Config Lever Index

Every project-config lever claude-tweaks skills read, in one place — the way `_shared/work-record.md`'s Config Keys table indexes the work-record system's keys. `bin/lib/policy-schema.js` owns the same keys as data (name, type/enum, default) plus `auditPolicy(repoRoot)`, a deterministic validator. If this table and that file disagree, one of them has a bug — fix, don't fork.

`.claude-tweaks/policy.yml` is the canonical **and only** home for every lever below — no key in this table is read from CLAUDE.md. `worktree-always` is additionally enforced mechanically by `bin/lib/hooks/pre-tool-use.js`, which reads `policy.yml` directly. A recognized key still sitting in a project's CLAUDE.md no longer applies to anything; `auditPolicy()` reports it under `migratableKeys` and `/claude-tweaks:init --update`'s Config Home Drift check offers to move it.

## Canonical read path

`bin/resolve-policy.js` is THE canonical way skill prose reads any policy or run-config value:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" [--values | --all] [--run "$PIPELINE_RUN_DIR"] <key> [<key>…]
```

For shell-variable capture, `--values` prints one plain value per line in request order instead of the JSON envelope — coerced values render natively (`true`, `14`); an unset no-default key and an unknown key each print an empty line (the same empty string the retired grep pipeline produced); `model-profiles` has no scalar form and is an invocation error under `--values`. List-typed keys (e.g. `merge-sensitive-paths`) resolve to the raw comma-separated string in both modes when configured — callers split on `,`; only the unset default is a JSON `[]`, which `--values` renders as an empty line (same empty-means-none reading as the retired grep).

The `${CLAUDE_PLUGIN_ROOT}` spelling is a model-resolved placeholder, not a live env var — the substitution contract is `docs/skill-authoring.md`'s "Plugin-root references (`CLAUDE_PLUGIN_ROOT`)" section; follow it, it is not restated here.

Output is a single JSON object keyed by requested key. Each key resolves to the envelope `{value, source}` with `source ∈ run-config | policy | default`; precedence is run `config.yml` (when `--run` is given) → `policy.yml` → schema default. Integers and booleans come back as native JSON types. Optional envelope fields:

- `"renamed-from"` — the value arrived via a `RENAMED_KEYS` alias (deprecated key name in the source file)
- `"invalid": true` — a present-but-rejected value degraded to the schema default; distinct from known-but-unset, which is `source: "default"` with no flag
- `{"error": "unknown-key"}` — the requested key is not in the schema (no value/source)

Two carve-outs:

- The PreToolUse hook's `worktree-always` read stays an in-process `bin/lib/policy.js` call — hot path, never shells out.
- `model-profiles` is policy-only (the `--run` overlay never applies) and returns `{value: null, source: "default"}` when the block is absent. Any fragment-reader failure — a malformed block, or a malformed sibling model key such as `frontier-run-cap` (the reader parses all four model keys; its throws aren't sub-classified) — degrades to `{value: null, source: "default", invalid: true}`.

**Derived-default keys** come in two shapes; both are live, so a new derived key picks one deliberately and states the choice in its row.

*Shape A — resolve-time derivation, no static default* (`integration-model`, `merge-verification`): the `POLICY_KEYS` row carries no static `default`; the derivation's one prose statement lives here (`_shared/integration-model.md`'s forge-detection ladder; the `merge-verification` coverage block below) with a code twin in `bin/lib/` (`policy-schema.js`'s `detectIntegrationModel`; `merge-verification.js`'s `deriveMergeVerification`); `bin/resolve-policy.js` computes it only for an *absent* key (`source: "default"`, no `invalid` flag), never overwriting an `invalid: true` envelope; and `/claude-tweaks:help`'s policy mode renders the default as `computed (…)`.

*Shape B — in-loop derivation over a static base default* (`housekeeping-auto-merge`, #580): the row keeps a static `default` as the base (`false`, the `supervised` base), so schema default and effective default differ; the derivation runs inside `bin/lib/policy-schema.js`'s `resolvePolicyKeys` (`deriveHousekeepingAutoMerge`); it fires for any entry that resolved `source: "default"` — unset **and** set-but-invalid (the `invalid: true` flag survives, the value is derived) — and keeps `source: "default"` because that field is the derived-vs-explicit attribution surface its consumers read. Pick B when an existing consumer must keep reading the value as a plain default; A otherwise. `/claude-tweaks:help`'s policy mode does not yet render B's default as `computed (…)` (#636).

Consolidating the two is deferred until a further derived lever appears (#580's ledger). Adding a lever of either shape also walks `_shared/auto-mode-contract.md`'s "Adding a new policy lever" checklist when it is Manifesto-visible.

`--all` emits the whole resolved config in one call: every schema key mapped to its `{value, source}` envelope plus its metadata fields and shape (`summary`, `category`, `tier`, `type`, `default` — `default` is JSON `null` when the row has none, which consumers read as "no default"). It composes with `--run`, takes no key arguments, and is mutually exclusive with `--values`. Renderers (the `/claude-tweaks:help` policy mode, init's policy review) consume this instead of enumerating key names by hand.

## `resolveValue` — canonical coercion contract

`bin/lib/policy-schema.js` also exports `resolveValue(key, rawValue)`: look up `key` in
`POLICY_KEYS`, validate `rawValue` against that entry's `type` (`boolean`, `integer`, `enum`,
`string`, `list`, `opaque`), and fall back to the entry's `default` whenever `rawValue` is
absent, empty, or fails validation — never throwing on malformed input. `integer` and `boolean`
entries are additionally coerced to their native JS type; other types pass through unchanged once
validated. An unrecognized `key` returns `rawValue` untouched (nothing to coerce against).
`bin/lib/issues/trust.js`'s `resolveRevertWindowDays` is the first caller
(`trust-revert-window-days`); any future lever of the same shape — read a policy key, coerce with a
typed fallback to a documented default — should call `resolveValue` rather than re-deriving its own
parsing.

## Metadata fields

Every `POLICY_KEYS` row carries three human-facing fields alongside its shape: `summary`, `category`, and `tier`. `tests/policy-schema-metadata.test.js` pins completeness (a future lever cannot ship metadata-less), the category set against the mapping table below, the core-tier cap, and the no-duplication rule — the same prose↔constant pattern as `tests/hooks-gate-coverage.test.js`.

- **`summary`** — one plain-language sentence stating *what changes when you move this lever* (style target ≤ ~120 chars; hard test ceiling 140). It never restates the key name or type, and carries no implementation citations. This is a different altitude from each key's Meaning column in the sections below: the summary is for a project owner scanning their config; the Meaning prose is the deep contract for skill authors. Neither replaces the other, and no summary text may be duplicated into this file (test-enforced).
- **`category`** — one of the values in `POLICY_CATEGORIES` (exported beside `POLICY_KEYS`). The mapping below assigns every key-bearing section of this file to a category; it is many-sections-to-one-category, and a key may individually carry a different category than its section when its subject genuinely differs (the section mapping is orientation, the per-key field is truth).
- **`tier`** — `core` or `advanced`. Decision rule: `core` = levers that change what the pipeline may *do without a human* — enforcement gates, autonomy/trust posture, merge/execution defaults, integration identity. Tuning caps, thresholds, retention, and cosmetic/reporting knobs are `advanced`. The core tier is capped at 12 keys (enforced, not advisory).

| Section | Category |
|---------|----------|
| Worktree & execution | `pipeline-behavior` |
| Integration model | `merge-safety` |
| Project facts | `autonomy-trust` |
| Dispatch & merge | `merge-safety` |
| Review | `pipeline-behavior` |
| Documentation | `housekeeping` |
| Harness-health budgets | `health-sweeps` |
| Health-sweep filing | `health-sweeps` |
| Code-health focus verticals | `health-sweeps` |
| Auto-mode levers | `pipeline-behavior` |
| Model profiles | `models` |
| Additional levers | `housekeeping` |

## Key naming

Every key in `POLICY_KEYS` (and every `RENAMED_KEYS` replacement name) is a **flat kebab-case identifier** — `^[a-z0-9]+(-[a-z0-9]+)*$`, no dots. The full rule (why no dots, the `-floor`/`-ceiling`/`-cap` suffix vocabulary, one spelling per concept, renames only through `RENAMED_KEYS`, and the deliberate `auto-mode` keep verdict) lives in `_shared/policy-key-naming.md`; `tests/policy-key-naming.test.js` pins both files.

## Worktree & execution

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `worktree-always` | `policy.yml` only — no CLAUDE.md path exists | `/claude-tweaks:init`, `/claude-tweaks:build`, `_shared/git-discipline.md`; mechanically enforced by `bin/lib/hooks/pre-tool-use.js` | `false` (unenforced) | Whether covered operations must occur inside a linked git worktree — see the coverage block below for exactly which |
| `execution-strategy` | `policy.yml` | `/claude-tweaks:build`, `_shared/git-discipline.md` | `subagent` | `/claude-tweaks:build`'s execution axis, one key with two value classes: `subagent`/`batched` set the default when no argument is passed (an explicit argument still overrides); `subagent-only`/`batched-only` lock the axis — the other value is not offered and a contradicting explicit argument is substituted with an inline notice (see build/SKILL.md's Execution axis paragraph). `execution.always` is a deprecated alias: `migrate` maps `subagent` → `subagent-only` and `batched` → `batched-only`; a malformed value null-migrates to the schema default (`subagent`, unlocked); when both keys are set, the `execution-strategy` line wins (uniform alias rule — the audit/init drift check surfaces the conflict) |
| `git-strategy` | `policy.yml` | `/claude-tweaks:build`, `/claude-tweaks:flow` | `worktree` | Default value of the Git axis when no argument is passed — matches /claude-tweaks:build's own documented default and /claude-tweaks:flow's intrinsic one. Set current-branch to opt a project out of worktree isolation by default; an explicit argument still wins, and worktree-always overrides both |

### `worktree-always` coverage — canonical

**This block is the single statement of what the gate intercepts.** Every other file cites it; none restates the list. `bin/lib/hooks/pre-tool-use.js`'s exported `GATE_COVERAGE` constant is its machine counterpart, and `tests/hooks-gate-coverage.test.js` asserts the two agree — so widening the gate fails a test until this block is updated.

That binding exists because the list has drifted before. The gate was widened twice on 2026-07-20 (`push` in `c8f929e1`, `cp`/`mv`/`tee` in `cab6142b`) and neither commit swept the prose describing it; five skill files went on documenting the pre-widening gate, three of them prescribing procedures the widened gate denies (#138).

<!-- gate-coverage:begin -->
- Tools: `Edit`, `Write`, `NotebookEdit`
- Git actions: `commit`, `push`
- Bash write shapes: `cp`, `mv`, `tee`, `sed`, `perl`, `install`, `ln`, `truncate`, `dd`
- Exemptions: `.claude-tweaks/pipelines/`, `.claude-tweaks/policy.yml`, and an allowlisted `policy-only` commit
<!-- gate-coverage:end -->

`sed` and `perl` count only for an **in-place** edit (`-i`, `-i.bak`, `--in-place`, or a bundled `-pi`/`-ni`). A plain read such as `sed -n '…p' file` is not a write and stays allowed everywhere, including the main checkout.

**The cost that buys.** `hooks.json`'s if-matcher can only key on a command *name*, not its flags, so `Bash(sed *)` spawns the hook for **every** `sed` — read-only invocations included, where it resolves no target and allows. That is ~42 ms on each such call (see the measurement below). Breadth was chosen over precision deliberately: a narrower `Bash(sed -i*)` predicate would miss `sed -ni`, `sed --in-place`, and `perl -pi -e`, reintroducing exactly the silent-gap class this covers. A false negative here is invisible; the latency is not.

**What the gate can see at all.** It is a `PreToolUse` hook, so it inspects *tool calls* — `Edit`/`Write`/`NotebookEdit` inputs and the command string of a `Bash` call. Git and filesystem work performed by the plugin's own Node code via `execFileSync` never passes through a tool call and is therefore never gated: `bin/lib/health-core/durable-state.js`'s `git push` to the `health-state` branch is the standing example, and it is correct as written. Do not "fix" such a call by routing it through Bash.

**Not covered — deliberately, and measured.** `git merge`, `git checkout`, `git pull`, `git fetch`, and every other git subcommand pass freely. Two write shapes also remain uncovered, for two different reasons (#70):

- **Bare shell redirection** (`>`, `>>`). It has no command word, and `hooks/hooks.json`'s if-matcher can only recognize a named command — so catching it requires an unconditional `Bash` matcher that spawns the hook on *every* Bash tool call in every session. Measured on `bin/hooks.js pre-tool-use` with a no-target payload, 30 invocations: **42.0 ms idle, 67.9 ms under three concurrent test suites**. The contention figure is the operative one, since parallel worktree sessions are the normal working mode here. Declined on that cost, not on principle — revisit if the hook ever gets meaningfully cheaper.
- **Opaque program strings** (`python -c`, `sh -c`, `awk`). The write target lives inside a program this cannot parse, so no matcher and no latency budget would help.

Do not write a procedure that depends on either gap: they are unpatched holes, not a supported bypass. And do not add a `fileWriteTargets` branch without the matching `hooks.json` if-matcher — the hook never spawns, so the branch is dead code that reads exactly like a fix. `tests/hooks-gate-coverage.test.js` asserts the two lists agree precisely because that asymmetry hid `sed -i` for months.

**The two exemptions.** File writes targeting a path under the repo's own `.claude-tweaks/pipelines/` are allowed from anywhere — that directory is plugin-owned, gitignored pipeline bookkeeping (run config, the auto-decision log, staged proposals), not the project work this gate isolates. It applies to file-write targets only: a `git commit`/`git push` target is the command's *working directory*, so exempting those by prefix would permit any commit merely issued from inside a run dir. The exemption also fails closed — a relative or unresolvable path is never exempt.

The second (#537): an `Edit`/`Write`/`NotebookEdit` — the three file tools only, never a Bash write shape (`tee`/`cp`/`sed -i`/…), which stays gated for this file — whose target, once fully resolved to a real path (symlinks followed, `..` normalized, on-disk casing canonicalized), IS the repo root's `.claude-tweaks/policy.yml` — exact identity, never containment, so a symlinked alias resolves to the same allow and `policy.yml` itself being swapped for a symlink elsewhere resolves to the same deny. Alongside it, `git commit` is allowed when the **entire command string** matches an allowlist grammar — exactly `git commit` plus one or more `-m`/`--message` args and an optional `--no-verify`, in any order, and nothing else: no other flag, no pathspec, no shell operator (`&&`, `;`, `|`, `` $() ``, backticks), no env-var prefix, no path to `git` other than the bare word — **and** the staged set (`git diff --cached --name-status`) is provably one row — an Add, Modify, or Delete of `.claude-tweaks/policy.yml`; a rename or copy *into* that path is rejected on its status letter, since `--name-only` would collapse it to a single misleading line. `git push` stays gated regardless. Both exemptions fail closed: anything unprovable about a path, a command's grammar, or the staged set keeps the deny.

**Consequence for procedures.** A `git push` from the main checkout is denied even after `close-run` clears the E1 worktree assignment (that clears wrong-checkout enforcement, not this policy). A merge followed by a push must therefore be **two separate Bash calls** — the merge from the main checkout, the push from inside a linked worktree. Chaining them into one command gets the whole invocation denied before either half runs, since the gate inspects the full command string up front. The one exception: an isolated `.claude-tweaks/policy.yml` edit plus its allowlisted, policy-only-staged commit may now both run from a main checkout without a worktree.

### Teardown gate coverage — canonical

**This block is the single statement of what the teardown gate intercepts** (`bin/lib/hooks/pre-tool-use.js`'s `GATE_COVERAGE.teardownTools`/`teardownGitCommands` are its machine counterpart; `tests/hooks-gate-coverage.test.js` pins the two). The gate denies teardown of a worktree recorded as a **non-terminal** (`active`/`interrupted`) pipeline run's assignment — `close-run` is the sanctioned exit, and clearing the assignment lifts the gate. It is run-*targeted* rather than run-independent: it fires only when a recorded assignment matches the teardown target, and every ambiguity (unresolvable target, no match, recorded path gone, corrupt run-state, unconfidently-parsed command) resolves to allow. Foreign-owned runs get a warn instead of a deny, with a `wd-foreign-teardown` event on the target run. The companion warn tier lives in `close-run` itself: closing a run with no recorded wrap-up invocation appends `close-without-wrapup` and prints a warning — never a block, because dispatch's close-before-merge is sanctioned and human-typed wrap-ups leave no ledger event (measured, spec #371 finding (e)). `skills/wrap-up/cleanup-procedures-execution.md`'s Section C closes the run (step 3.6) immediately before removing the worktree (step 4) — the sanctioned exit this gate's own deny message points to.

<!-- teardown-gate-coverage:begin -->
- Tools: `ExitWorktree`
- Git commands: `worktree remove`
<!-- teardown-gate-coverage:end -->

`git worktree` subcommands other than `remove` (`list`, `add`, `prune`, `lock`, …) pass untouched. `git push`/merge are deliberately not gated (dispatch's auto-merge path), and SessionEnd is not hooked (it cannot deny) — that window belongs to the SessionStart run-integrity scan.

## Integration model

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `integration-model` | `policy.yml` | `/claude-tweaks:init` (Step 20 offer) | unset — computed at resolve time by `bin/resolve-policy.js`'s `detectIntegrationModel` (forge detection), never a schema literal | `pr-first`/`local-merge` — which backend a project integrates through. Explicit value validates and wins outright (ordinary enum validation, unconditional); detection runs only when the key is absent. See `_shared/integration-model.md` for the full resolution ladder, run-scoped pinning, and consumer table |
| `merge-verification` | `policy.yml` (per-run override via the Manifesto's `config.yml`, lever 11) | `/claude-tweaks:flow` Manifesto (lever row); merge-site consumers land in #560 | unset — derived at resolve time by `bin/lib/merge-verification.js` (wired through `bin/resolve-policy.js`), never a schema literal; see the coverage block below | `merge-when-green`/`wait`/`off` — how much CI verification a merge into the integration branch requires. Explicit value validates and wins outright; derivation runs only when the key is absent — an invalid value surfaces as `invalid: true` (an empty `--values` line), never silently overwritten by derivation, exactly as `integration-model` above. `bin/resolve-policy.js` is the only resolution path — there is deliberately no in-process resolver twin (the merge sites read the lever through the CLI, `_shared/pr-first-merge.md` Step 2.5), so no second contract exists to diverge from it. `wait` is explicit-config-only (the ladder never derives it) — it is the runtime fallback merge sites degrade to when `--auto` arming is unavailable, not a default. Read via `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --run "$PIPELINE_RUN_DIR" --values merge-verification` |
| `merge-authorization` | `config.yml` only — a live Manifesto `confirm`/`hybrid` override answer (lever 13); **never** `.claude-tweaks/policy.yml` (deliberate exclusion, see `_shared/auto-mode-contract.md`'s Bookend Architecture section) | `/claude-tweaks:flow` Manifesto (lever row); `wrap-up/review-console.md`'s Auto-merge short-circuit | `ask` | `ask`/`pre-authorized` — pre-authorizes, for this run only, that the run should merge itself once every HARD-GATE is green and the suite is proven. Read via `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --run "$PIPELINE_RUN_DIR" --values merge-authorization`; a `policy.yml` value is silently discarded by the resolver (falls back to `ask`, `source: default`) rather than winning as it would for every other lever — the one deliberate exception to the standard 4-level precedence chain. |

### `merge-verification` derivation — canonical

<!-- merge-verification-derivation:start -->
The single prose statement of the derived default (code twin: `bin/lib/merge-verification.js`'s `deriveMergeVerification`; every other file cites this block rather than restating it). Four branches, first match wins, no fall-through:

1. `integration-model` (`_shared/integration-model.md`) resolves `local-merge` → `off`. Short-circuits before any workflow read.
2. No PR-triggered CI → `off`. Detection reads only `{root}/.github/workflows/*.yml|*.yaml` and looks for a top-level `on:` naming `pull_request` or `pull_request_target` in any legal shape — bare string, flow array, block list, or mapping key. Trigger *presence* is a deliberate proxy for "CI verification is requested"; enforcement (branch protection) is out of scope. GitHub Actions-only by intent — a repo on another CI system derives `off` and opts in with the one-line explicit value.
3. Integration branch is the repository default branch → `merge-when-green`.
4. Any other (non-default) integration branch → `off`.

Branches 3–4 obtain both branches through the canonical resolution in `_shared/integration-branch.md` (its rank 3 `integration-branch:` policy key, else the rank-5 GitHub-default half) via the shared code resolver, never a hand-rolled detection. Every failed lookup — no `gh`, API error, no upstream, unreadable workflow file — resolves toward `off`, the permissive default, never toward the stricter value.
<!-- merge-verification-derivation:end -->

## Project facts

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `project-maturity` | `policy.yml` (the machine flag; CLAUDE.md's Philosophy section holds a separate narrative description, not this flag) | `/claude-tweaks:init` Phase 3, `/claude-tweaks:build`, `/claude-tweaks:specify` | `greenfield` (absent or invalid value) | `greenfield`/`pre-launch`/`early-production`/`established` — scales `/build`'s test-discipline instruction and `/specify`'s decomposition strategy |
| `auto-mode` | `policy.yml` | `/claude-tweaks:flow`, `/claude-tweaks:tidy`, `/claude-tweaks:build` standalone | unset (`/flow` still defaults to `auto`) | `default-on`/`default-off` — whether standalone `/build` and unattended `/tidy` firings default to auto mode |
| `integration-branch` | `policy.yml` only | `/claude-tweaks:routine`, `/claude-tweaks:dispatch`, `/claude-tweaks:wrap-up`, `/claude-tweaks:build`, `/claude-tweaks:flow`, `/claude-tweaks:assess-agent-autonomy`, plus the `SessionStart` worktree reaper (`bin/lib/hooks/worktree-reap.js` — the one non-skill consumer) — all via `_shared/integration-branch.md` | unset (each consumer keeps its own fallback; for the reaper that fallback is to reap nothing) | The branch where finished work lands and new work starts. Set it on any repo whose active development branch isn't its GitHub default — a `dev` → `staging` → `main` model — where the default is the one branch nothing should be measured against |
| `autonomy` | `policy.yml` | `/claude-tweaks:capture` (born-`ready` filing), `/claude-tweaks:backlog refine` (`refine-mode.md` Step 3's advisory trust consequence lines — the ceiling also decides whether that fetch runs at all, gated to `trusted`+ or `--trust` — and Step 3.6), `/claude-tweaks:backlog grant` (headless machine-grant mode), `/claude-tweaks:ledger`, `/claude-tweaks:wrap-up` (the bookkeeping capabilities below) — all via `_shared/autonomy-ceiling.md` | `supervised` | `supervised`/`trusted`/`unattended` — a **ceiling on autonomous action, not a level**. `bin/lib/issues/trust.js`'s per-class evidence (rendered read-only by `/claude-tweaks:help` and `/claude-tweaks:backlog overview`) moves the level; this lever only ever caps it — a class that has earned trust still cannot exceed the configured ceiling, and lowering the ceiling revokes immediately without destroying the evidence history. Resolved by `bin/lib/issues/autonomy.js` — `resolveCeiling` picks the tier by precedence, `permittedGrants` maps `(ceiling, trust row)` to a concrete permission set, and `bookkeepingPermissions(ceiling)` maps the ceiling alone (no trust row needed) to the bookkeeping capabilities `_shared/autonomy-ceiling.md`'s own table enumerates. `_shared/autonomy-ceiling.md` is the contract for all of this. `trusted` also unlocks born-`ready` filing for classes whose verdict is `clean`; `unattended` additionally unlocks machine-originated grants, gated behind the `grant-origination-enabled` opt-in below — `/claude-tweaks:backlog grant` is the one path that acts on it. At `supervised` — the default — trust is computed and displayed and never acted on, and none of the bookkeeping capabilities are unlocked |
| `trust-revert-window-days` | `policy.yml` | `bin/lib/issues/trust.js` (evidence engine), consumed by `_shared/trust-table.md`'s Fetch section | `14` | Minimum age in days since a closed record's tracker `closedAt` before its unreverted closing commit(s) count as known-good **operational** evidence in the trust table, alongside `demo:*` disposition evidence — see `_shared/autonomy-ceiling.md`. A malformed value (`0`, negative, non-integer) falls back to the default rather than throwing |
| `grant-origination-enabled` | `policy.yml` | `/claude-tweaks:backlog grant` (via `bin/lib/issues/grant-gate.js`) | `false` | The reserved second opt-in `_shared/autonomy-ceiling.md` names (read as `grantOriginationEnabled` in `permittedGrants`) — `autonomy: unattended` alone never authorizes a machine-originated grant; this key is the other half. A human sets it deliberately in a project's `policy.yml`; no skill ever writes it |
| `fleet-daily-grant-cap` | `policy.yml` | `/claude-tweaks:backlog grant` (via `bin/lib/issues/grant-gate.js`) | unset (uncapped) | Positive integer capping how many machine grants `/claude-tweaks:backlog grant` may issue per UTC day, counted from today-dated audit-comment markers. Absent means no cap — optional-when-absent, not a hard requirement of the machine-grant path |
| `risk-floor` | `policy.yml` | `/claude-tweaks:backlog grant` (via `bin/lib/issues/grant-gate.js` gate 5), `/claude-tweaks:demo`'s binary gate | `high` | `low`/`medium`/`high`/`always` — the risk tier at or above which `bin/lib/issues/oversight-floor.js`'s `exceedsOversightFloor` denies machine origination and requires a human review. `always` unconditionally denies regardless of the record's own tier. Shared with `size-floor` below — not prefixed `demo-`/`grant-`, since more than one consumer reads the same pair |
| `size-floor` | `policy.yml` | `/claude-tweaks:backlog grant` (via `bin/lib/issues/grant-gate.js` gate 5), `/claude-tweaks:demo`'s binary gate | `high` | `low`/`medium`/`high`/`always` — the size tier at or above which `exceedsOversightFloor` denies machine origination, symmetric with `risk-floor` above |
| `grant-sampling-every` | `policy.yml` | `/claude-tweaks:help` Stage 1 (`bin/lib/issues/grant-sampling.js`) | `10` | Flags every Nth machine-granted (audit-marker, like `fleet-daily-grant-cap`) merged record still `demo:pending`, in the Needs Attention table, with a `/claude-tweaks:demo #{n}` action (#310) |

## Dispatch & merge

Canonical defaults for the keys in this section also live in `_shared/work-record.md`'s Config keys table — if the two disagree, that file wins for these specific keys (it's the older, most-cited source); update both together.

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `dispatch-retry-ceiling` | `policy.yml` | `/claude-tweaks:dispatch` | `3` | Consecutive autonomous build failures before `bot:blocked` + `auto:*` removal |
| `dispatch-batch-size` | `policy.yml` | `/claude-tweaks:dispatch` | `3` | Max groups one `/dispatch` firing processes **sequentially**, one after another (never concurrently — see #155); remaining picks stay unclaimed in the queue for a later firing to select |
| `dispatch-pick-max-concurrent` | `policy.yml` | `/claude-tweaks:dispatch` | `3` | Deprecated alias for `dispatch-batch-size` — still resolves, emits one warn-tier notice per invocation. Removal condition: `skills/dispatch/deprecated-aliases.md` |
| `auto-merge-max-lines` | `policy.yml` | `/claude-tweaks:dispatch`, `/claude-tweaks:assess-agent-autonomy` | `40` | Auto-merge blast-radius guideline (lines) — a weighted input to the `merge-check` verdict, not a hard cutoff |
| `auto-merge-max-files` | `policy.yml` | `/claude-tweaks:dispatch`, `/claude-tweaks:assess-agent-autonomy` | `2` | Auto-merge blast-radius guideline (files) — same weighted treatment |
| `merge-sensitive-paths` | `policy.yml` | `/claude-tweaks:assess-agent-autonomy`, `/claude-tweaks:review` | `[]` (empty) | Comma-separated path globs forcing a hard needs-human floor in the `merge-check` verdict, and feeding `/review`'s diff-heuristic risk proxy |
| `work-links` | `policy.yml` | Work-record system (`/claude-tweaks:dispatch`, `/claude-tweaks:wrap-up`, etc.) | `body-text` | Native sub-issue/blocked-by APIs vs. `Blocked by #N` body-text lines |
| `pr-unarmed-age-hours` | `policy.yml` | `_shared/github-pr-scan.md`'s `repo-wide` scope | `24` | How long a green, gate-passed, granted PR may sit with `--auto` unarmed before the sweep surfaces `[pr-unarmed]` |
| `unsettled-age-hours` | `policy.yml` | `_shared/github-pr-scan.md`'s `repo-wide` scope | `24` | How long a live claim or stale `bot:in-progress` may sit with no PR progress before the sweep surfaces `[unsettled]` |
| `housekeeping-auto-merge` | `policy.yml` | `/claude-tweaks:tidy` Step 7.5 (creation-time arm, primary — #581), `_shared/github-pr-scan.md`'s `repo-wide` scope (sweep backstop) | derived from `autonomy`: `true` at `trusted`/`unattended`, else `false` | When it resolves true, tidy arms a green, marker-stamped Step-7 PR at creation (Step 7.5) — or, if that failed or the PR pre-dates the grant, via the sweep backstop; otherwise it stages like any other unarmed PR. An explicit key wins over the derivation in both directions (#580) |

## Review

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `review-effort-floor` | `policy.yml` | `/claude-tweaks:review` | unset (no floor) | Project-level floor (`low`/`medium`/`high`/`xhigh`/`max`) that raises (never lowers) the resolved review-effort tier |

## Documentation

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `doc-convention-adr` | `policy.yml` | `/claude-tweaks:wrap-up`'s Decision records curation row, via `_shared/existing-convention-detection.md` | unset (detect and ask on conflict) | Which convention wins when this repo's existing decision records disagree with the plugin's. `plugin` conforms forward, `project` resolves form from the corpus and any project skill. Written *by* the plugin after the user answers once at the Review Console — never a key a project fills in up front. Records **which source wins**, not a grammar, which is what keeps it flat-encodable |

## Harness-health budgets

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `harness-health-scoped-rule-budget` | `policy.yml` | `/claude-tweaks:harness-health` | `30` | Line-count budget for path-scoped `.claude/rules/*.md` files |
| `harness-health-always-loaded-budget` | `policy.yml` | `/claude-tweaks:harness-health` | `150` | Line-count budget for CLAUDE.md and unscoped rule files |

## Health-sweep filing

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `health-open-cap` | `policy.yml` | `/claude-tweaks:code-health`, `/claude-tweaks:harness-health`, `/claude-tweaks:docs-health`, `/claude-tweaks:journey-health` — via `bin/lib/health-core/digest.js` | `10` | Per-origin open-singleton-finding cap. At or above this count, a brand-new finding that would otherwise file its own issue is appended to that origin's digest issue instead (see each skill's FILE step). A regressed-reopen always bypasses the cap. `0` disables the throttle (unconditional filing, matching pre-#235 behavior); unset applies the default — 10 |

## Code-health focus verticals

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `experiment-flag-patterns` | `policy.yml` | `/claude-tweaks:code-health` `focus=experiment-cleanup` — `bin/lib/code-health/candidates-experiment-cleanup.js` | unset (`[]` — vertical inactive) | Comma-separated regex-source strings naming this repo's own feature-flag/experiment idiom — call-site patterns (e.g. `isEnabled\(['\"]([\w.-]+)['\"]`) or registry-entry patterns, each with a first capture group that is the flag identifier. Empty/absent means the generator is inactive: the focus run reports "no flag idiom configured" and never falls back to scanning the whole repo (IL-115 — absence of configuration is not a resolution failure). Example: `experiment-flag-patterns: isEnabled\(['\"]([\w.-]+)['\"]` |
| `experiment-flag-exclude` | `policy.yml` | `/claude-tweaks:code-health` `focus=experiment-cleanup` — `bin/lib/code-health/candidates-experiment-cleanup.js` | unset (`[]`) | Comma-separated kill-switch name substrings (case-insensitive) — a flag whose identifier matches any of these, or the shipped defaults `emergency`/`circuit`/`kill`, is never emitted as a candidate regardless of how many decision signals fired. Extends the defaults, never replaces them. Example: `experiment-flag-exclude: rollback,failsafe` |

## Auto-mode levers

These resolve from `policy.yml`. `/claude-tweaks:init` does not generate them into CLAUDE.md — omitting a lever means its default, so writing every lever out contradicts the "omit means default" principle.

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `scope-creep` | `policy.yml` | `/claude-tweaks:build` | `add-to-plan` | `add-to-plan`/`stop-and-ask`/`drop` |
| `overlap` | `policy.yml` (via `/flow` Manifesto only — no standalone direct-read site exists) | `/flow` Manifesto → `/claude-tweaks:specify` | `companion` | `companion`/`extend`/`skip`/`replace` |
| `design-intent` | `policy.yml` (via `/flow` Manifesto/`config.yml`; a standalone invocation with no pipeline run dir asks the user inline instead of reading CLAUDE.md) | `/claude-tweaks:specify` | `none` | `none`/`bold`/`quiet`/`minimal`/`delightful`/`onboarding` |
| `design-critique` | `policy.yml` (via `/flow` Manifesto/`config.yml`, or the resolver directly outside a pipeline run) | `/claude-tweaks:design-wrapper` `review` mode (Step 3.8 critic dispatch, #598) | `auto` | `off`/`auto`/`full` — how eagerly project-local craft critics run at review time; `auto` keys on `DESIGN.md` presence or a `Design-intent:` line, per `skills/design-wrapper/critics.md`. Critique only — writing-context assembly (`_shared/design-craft.md`) is untouched by every value |
| `leftover-default` | `policy.yml` (via `/flow` Manifesto/`config.yml` only — leftover routing is inherently pipeline-scoped, no standalone site exists) | `/claude-tweaks:wrap-up` | `defer` | `defer`/`backlog`/`drop` |
| `auto-fix-threshold` | `policy.yml` (via `/flow` Manifesto/`config.yml` only — no standalone direct-read site exists) | `/claude-tweaks:test` | `lint+type` | `lint-only`/`lint+type`/`lint+type+test` |
| `review-auto-apply-ceiling` | `policy.yml` (via `/flow` Manifesto/`config.yml` only — no standalone direct-read site exists) | `/claude-tweaks:review` | `low` | `none`/`low`/`medium` auto-apply ceiling — the maximum severity applied without asking (`medium` = Low and Medium auto-apply, High staged, Critical prompted); ceiling-conditional default at `unattended` — see `_shared/autonomy-ceiling.md` |
| `tidy-aggressiveness` | `policy.yml` | `/claude-tweaks:tidy` | `moderate` | `conservative`/`moderate`/`aggressive` |
| `superpowers-plans-retention` | `policy.yml` | `/claude-tweaks:wrap-up`'s cleanup-planning item 1 (`cleanup-procedures.md`) | `keep-forever` | `keep-forever` (never delete `docs/superpowers/plans/*.md` — this plugin's own ADR-0007 convention) / `prune-after-wrapup` (delete this spec's own plan/spec file(s) as part of cleanup) / `ask` (stage the decision for the Wrap-Up Review Console) |

## Model profiles

Registered by #219; the resolver that actually reads these five is `bin/lib/model-profiles/profiles.js` (`resolve()`). Full canonical-home/owner-skill/default/meaning table: `policy-schema-model-profiles.md` (split out per IL-70 — merged branch content pushed this file over its ceiling).

| Key |
|---|
| `model-stance` |
| `frontier-run-cap` |
| `model-ceiling` |
| `model-profiles` |
| `research-mode` |

## Additional levers

These levers resolve from `.claude-tweaks/policy.yml`, like every other lever in this file. `/claude-tweaks:init`'s CLAUDE.md template generates none of them — omitting a lever means its default. `backlog-fetch-limit` also appears in `_shared/work-record-config.md`'s table — if the two disagree, that file wins for that key, per the same rule the "Dispatch & merge" section states.

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `depth-survey` | `policy.yml` | `/claude-tweaks:flow` | unset (enabled) | `off` disables the end-of-run Depth Opportunities survey project-wide (mirrors the `no-deepen` per-run flag) |
| `creative-survey` | `policy.yml` | `/claude-tweaks:flow` | unset (enabled) | `off` disables the end-of-run Creative Opportunities survey project-wide (mirrors the `no-creative` per-run flag) |
| `backlog-fetch-limit` | `policy.yml` | `/claude-tweaks:help`, `/claude-tweaks:tidy`, `/claude-tweaks:backlog` | `1000` | Cap on `gh issue list --limit` for every `_shared/record-queue-fetch.md` consumer — `gh` auto-paginates internally; this bounds how many rows before a truncation warning fires, not a hard cutoff on backlog size |
| `record-snapshot-ttl-seconds` | `policy.yml` | `/claude-tweaks:backlog`, `/claude-tweaks:capture`, `/claude-tweaks:specify`, `_shared/trust-table.md`, `/claude-tweaks:help`, `/claude-tweaks:tidy`, `/claude-tweaks:visualize` | `300` | Freshness window for the session-scoped record snapshot (`_shared/record-queue-fetch.md`) — a consumer reads the cached `/tmp/ct-records-{session-id}.json` while its mtime is younger than this many seconds, and re-fetches once it ages past it |
| `scope-keywords-required` | `policy.yml` | `/claude-tweaks:build` | `false` | When `true`, `/build`'s plan-audit Check B refuses to start if any matched files aren't in the plan AND the plan/design has no `Scope keywords:` field — otherwise (default `false`) this is informational only, a warning |
| `branch-divergence-check` | `policy.yml` | `/claude-tweaks:build`, `/claude-tweaks:flow` | `true` | Pre-flight branch-divergence check — whether `/build`'s and `/flow`'s pre-flight step compares the current branch against its upstream and offers rebase-vs-continue; `false` skips this check. `merge-check` is a deprecated alias (identity `migrate`) — its collision with `/claude-tweaks:assess-agent-autonomy`'s `merge-check` verdict mode was resolved by this rename in #331 |
