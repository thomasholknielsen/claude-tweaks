# Policy Schema — Canonical Config Lever Index

Every project-config lever claude-tweaks skills read, in one place — the way `_shared/work-record.md`'s Config Keys table indexes the work-record system's keys. `bin/lib/policy-schema.js` owns the same keys as data (name, type/enum, default) plus `auditPolicy(repoRoot)`, a deterministic validator. If this table and that file disagree, one of them has a bug — fix, don't fork.

`.claude-tweaks/policy.yml` is the canonical **and only** home for every lever below — no key in this table is read from CLAUDE.md. `worktree.always` is additionally enforced mechanically by `bin/lib/hooks/pre-tool-use.js`, which reads `policy.yml` directly. A recognized key still sitting in a project's CLAUDE.md no longer applies to anything; `auditPolicy()` reports it under `migratableKeys` and `/claude-tweaks:init --update`'s Config Home Drift check offers to move it.

## Worktree & execution

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `worktree.always` | `policy.yml` only — no CLAUDE.md path exists | `/claude-tweaks:init`, `/claude-tweaks:build`, `_shared/git-discipline.md`; mechanically enforced by `bin/lib/hooks/pre-tool-use.js` | `false` (unenforced) | Whether covered operations must occur inside a linked git worktree — see the coverage block below for exactly which |
| `execution.always` | `policy.yml` | `/claude-tweaks:build`, `_shared/git-discipline.md` | unset (both `subagent`/`batched` selectable) | Locks /claude-tweaks:build's execution axis to the set value, when set — the other value is not offered and is substituted with an inline notice if passed explicitly (see build/SKILL.md's Execution axis paragraph). Distinct from execution-strategy, which sets an overridable default rather than a lock |
| `execution-strategy` | `policy.yml` | `/claude-tweaks:build` | `subagent` | Default value of `/claude-tweaks:build`'s execution axis when no argument is passed. Distinct from `execution.always`: this sets a default an explicit argument still overrides, while `execution.always` locks the axis and rejects the other value |
| `git-strategy` | `policy.yml` | `/claude-tweaks:build`, `/claude-tweaks:flow` | `worktree` | Default value of the Git axis when no argument is passed — matches /claude-tweaks:build's own documented default and /claude-tweaks:flow's intrinsic one. Set current-branch to opt a project out of worktree isolation by default; an explicit argument still wins, and worktree.always overrides both |

### `worktree.always` coverage — canonical

**This block is the single statement of what the gate intercepts.** Every other file cites it; none restates the list. `bin/lib/hooks/pre-tool-use.js`'s exported `GATE_COVERAGE` constant is its machine counterpart, and `tests/hooks-gate-coverage.test.js` asserts the two agree — so widening the gate fails a test until this block is updated.

That binding exists because the list has drifted before. The gate was widened twice on 2026-07-20 (`push` in `c8f929e1`, `cp`/`mv`/`tee` in `cab6142b`) and neither commit swept the prose describing it; five skill files went on documenting the pre-widening gate, three of them prescribing procedures the widened gate denies (#138).

<!-- gate-coverage:begin -->
- Tools: `Edit`, `Write`, `NotebookEdit`
- Git actions: `commit`, `push`
- Bash write shapes: `cp`, `mv`, `tee`, `sed`, `perl`, `install`, `ln`, `truncate`, `dd`
<!-- gate-coverage:end -->

`sed` and `perl` count only for an **in-place** edit (`-i`, `-i.bak`, `--in-place`, or a bundled `-pi`/`-ni`). A plain read such as `sed -n '…p' file` is not a write and stays allowed everywhere, including the main checkout.

**The cost that buys.** `hooks.json`'s if-matcher can only key on a command *name*, not its flags, so `Bash(sed *)` spawns the hook for **every** `sed` — read-only invocations included, where it resolves no target and allows. That is ~42 ms on each such call (see the measurement below). Breadth was chosen over precision deliberately: a narrower `Bash(sed -i*)` predicate would miss `sed -ni`, `sed --in-place`, and `perl -pi -e`, reintroducing exactly the silent-gap class this covers. A false negative here is invisible; the latency is not.

**What the gate can see at all.** It is a `PreToolUse` hook, so it inspects *tool calls* — `Edit`/`Write`/`NotebookEdit` inputs and the command string of a `Bash` call. Git and filesystem work performed by the plugin's own Node code via `execFileSync` never passes through a tool call and is therefore never gated: `bin/lib/health-core/durable-state.js`'s `git push` to the `health-state` branch is the standing example, and it is correct as written. Do not "fix" such a call by routing it through Bash.

**Not covered — deliberately, and measured.** `git merge`, `git checkout`, `git pull`, `git fetch`, and every other git subcommand pass freely. Two write shapes also remain uncovered, for two different reasons (#70):

- **Bare shell redirection** (`>`, `>>`). It has no command word, and `hooks/hooks.json`'s if-matcher can only recognize a named command — so catching it requires an unconditional `Bash` matcher that spawns the hook on *every* Bash tool call in every session. Measured on `bin/hooks.js pre-tool-use` with a no-target payload, 30 invocations: **42.0 ms idle, 67.9 ms under three concurrent test suites**. The contention figure is the operative one, since parallel worktree sessions are the normal working mode here. Declined on that cost, not on principle — revisit if the hook ever gets meaningfully cheaper.
- **Opaque program strings** (`python -c`, `sh -c`, `awk`). The write target lives inside a program this cannot parse, so no matcher and no latency budget would help.

Do not write a procedure that depends on either gap: they are unpatched holes, not a supported bypass. And do not add a `fileWriteTargets` branch without the matching `hooks.json` if-matcher — the hook never spawns, so the branch is dead code that reads exactly like a fix. `tests/hooks-gate-coverage.test.js` asserts the two lists agree precisely because that asymmetry hid `sed -i` for months.

**The one exemption.** File writes targeting a path under the repo's own `.claude-tweaks/pipelines/` are allowed from anywhere — that directory is plugin-owned, gitignored pipeline bookkeeping (run config, the auto-decision log, staged proposals), not the project work this gate isolates. It applies to file-write targets only: a `git commit`/`git push` target is the command's *working directory*, so exempting those by prefix would permit any commit merely issued from inside a run dir. The exemption also fails closed — a relative or unresolvable path is never exempt.

**Consequence for procedures.** A `git push` from the main checkout is denied even after `close-run` clears the E1 worktree assignment (that clears wrong-checkout enforcement, not this policy). A merge followed by a push must therefore be **two separate Bash calls** — the merge from the main checkout, the push from inside a linked worktree. Chaining them into one command gets the whole invocation denied before either half runs, since the gate inspects the full command string up front.

## Project facts

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `project.maturity` | `policy.yml` (the machine flag; CLAUDE.md's Philosophy section holds a separate narrative description, not this flag) | `/claude-tweaks:init` Phase 3, `/claude-tweaks:build`, `/claude-tweaks:specify` | `greenfield` (absent or invalid value) | `greenfield`/`pre-launch`/`early-production`/`established` — scales `/build`'s test-discipline instruction and `/specify`'s decomposition strategy |
| `auto-mode` | `policy.yml` | `/claude-tweaks:flow`, `/claude-tweaks:tidy`, `/claude-tweaks:build` standalone | unset (`/flow` still defaults to `auto`) | `default-on`/`default-off` — whether standalone `/build` and unattended `/tidy` firings default to auto mode |
| `integration-branch` | `policy.yml` only | `/claude-tweaks:routine`, `/claude-tweaks:dispatch`, `/claude-tweaks:wrap-up`, `/claude-tweaks:build`, `/claude-tweaks:flow`, `/claude-tweaks:assess-agent-autonomy` — all via `_shared/integration-branch.md` | unset (each consumer keeps its own GitHub-default fallback) | The branch where finished work lands and new work starts. Set it on any repo whose active development branch isn't its GitHub default — a `dev` → `staging` → `main` model — where the default is the one branch nothing should be measured against |
| `autonomy` | `policy.yml` | `/claude-tweaks:capture` (born-`ready` filing), `/claude-tweaks:backlog refine` (`refine-mode.md` Step 3's advisory Trust column and Step 3.6) — all via `_shared/autonomy-ceiling.md` | `supervised` | `supervised`/`trusted`/`unattended` — a **ceiling on autonomous action, not a level**. `bin/lib/issues/trust.js`'s per-class evidence (rendered read-only by `/claude-tweaks:help` and `/claude-tweaks:backlog overview`) moves the level; this lever only ever caps it — a class that has earned trust still cannot exceed the configured ceiling, and lowering the ceiling revokes immediately without destroying the evidence history. Resolved by `bin/lib/issues/autonomy.js` — `resolveCeiling` picks the tier by precedence, and `permittedGrants` maps `(ceiling, trust row)` to a concrete permission set; `_shared/autonomy-ceiling.md` is the contract. `trusted` unlocks born-`ready` filing for classes whose verdict is `clean`; `unattended` additionally unlocks machine-originated grants, and that half is shut behind its own opt-in that nothing sets today. At `supervised` — the default — trust is computed and displayed and never acted on |

## Dispatch & merge

Canonical defaults for the keys in this section also live in `_shared/work-record.md`'s Config keys table — if the two disagree, that file wins for these specific keys (it's the older, most-cited source); update both together.

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `dispatch-retry-ceiling` | `policy.yml` | `/claude-tweaks:dispatch` | `3` | Consecutive autonomous build failures before `bot:blocked` + `auto:*` removal |
| `dispatch-pick-max-concurrent` | `policy.yml` | `/claude-tweaks:dispatch` | `3` | Max concurrent groups a bare `/dispatch` multi-pick runs |
| `automerge-max-lines` | `policy.yml` | `/claude-tweaks:dispatch`, `/claude-tweaks:assess-agent-autonomy` | `40` | Auto-merge blast-radius guideline (lines) — a weighted input to `merge-check`, not a hard cutoff |
| `automerge-max-files` | `policy.yml` | `/claude-tweaks:dispatch`, `/claude-tweaks:assess-agent-autonomy` | `2` | Auto-merge blast-radius guideline (files) — same weighted treatment |
| `merge-sensitive-paths` | `policy.yml` | `/claude-tweaks:assess-agent-autonomy`, `/claude-tweaks:review` | `[]` (empty) | Comma-separated path globs forcing a hard needs-human floor in `merge-check`, and feeding `/review`'s diff-heuristic risk proxy |
| `work-links` | `policy.yml` | Work-record system (`/claude-tweaks:dispatch`, `/claude-tweaks:wrap-up`, etc.) | `body-text` | Native sub-issue/blocked-by APIs vs. `Blocked by #N` body-text lines |

## Review

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `review-effort-floor` | `policy.yml` | `/claude-tweaks:review` | unset (no floor) | Project-level floor (`low`/`medium`/`high`/`xhigh`/`max`) that raises (never lowers) the resolved review-effort tier |
| `review-diff-heuristic-thresholds` | `policy.yml` | `/claude-tweaks:review` | `{high: {files: 10, lines: 300}, medium: {files: 3, lines: 50}}` | File/line thresholds for the diff-size review-effort heuristic. **Presence-only validated** — its value is a nested object, but `policy.yml` only supports flat `key: value` lines and no flat-line encoding for this shape has ever been specified; `auditPolicy()` checks the key name only, not the value |

## Documentation

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `doc-convention.adr` | `policy.yml` | `/claude-tweaks:wrap-up` Step 6.2, via `_shared/existing-convention-detection.md` | unset (detect and ask on conflict) | Which convention wins when this repo's existing decision records disagree with the plugin's. `plugin` conforms forward, `project` resolves form from the corpus and any project skill. Written *by* the plugin after the user answers once at the Review Console — never a key a project fills in up front. Records **which source wins**, not a grammar, which is what keeps it flat-encodable |

## Harness-health budgets

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `harness-health.scoped-rule-budget` | `policy.yml` | `/claude-tweaks:harness-health` | `30` | Line-count budget for path-scoped `.claude/rules/*.md` files |
| `harness-health.always-loaded-budget` | `policy.yml` | `/claude-tweaks:harness-health` | `150` | Line-count budget for CLAUDE.md and unscoped rule files |

## Auto-mode levers

These 8 resolve from `policy.yml`. `/claude-tweaks:init` does not generate them into CLAUDE.md — omitting a lever means its default, so writing every lever out contradicts the "omit means default" principle.

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `unattended-tier` | `policy.yml` (canonical home is `_shared/unattended-tier.md`) | `/claude-tweaks:flow`, `/claude-tweaks:wrap-up`, `/claude-tweaks:ledger` | `off` | Opt-in narrowing of the ledger resolve-gate, queue-write auto-filing, and ops-ack |
| `scope-creep` | `policy.yml` | `/claude-tweaks:build` | `add-to-plan` | `add-to-plan`/`stop-and-ask`/`drop` |
| `overlap` | `policy.yml` (via `/flow` Manifesto only — no standalone direct-read site exists) | `/flow` Manifesto → `/claude-tweaks:specify` | `companion` | `companion`/`extend`/`skip`/`replace` |
| `design-intent` | `policy.yml` (via `/flow` Manifesto/`config.yml`; a standalone invocation with no pipeline run dir asks the user inline instead of reading CLAUDE.md) | `/claude-tweaks:specify` | `none` | `none`/`bold`/`quiet`/`minimal`/`delightful`/`onboarding` |
| `leftover-default` | `policy.yml` (via `/flow` Manifesto/`config.yml` only — Step 4 is inherently pipeline-scoped, no standalone site exists) | `/claude-tweaks:wrap-up` | `defer` | `defer`/`backlog`/`drop` |
| `auto-fix-threshold` | `policy.yml` (via `/flow` Manifesto/`config.yml` only — no standalone direct-read site exists) | `/claude-tweaks:test` | `lint+type` | `lint-only`/`lint+type`/`lint+type+test` |
| `review-severity-floor` | `policy.yml` (via `/flow` Manifesto/`config.yml` only — no standalone direct-read site exists) | `/claude-tweaks:review` | `low` | `none`/`low`/`medium` auto-apply cutoff |
| `tidy-aggressiveness` | `policy.yml` | `/claude-tweaks:tidy` | `conservative` | `conservative`/`moderate`/`aggressive` |

## Additional levers

These levers resolve from `.claude-tweaks/policy.yml`, like every other lever in this file. `/claude-tweaks:init`'s CLAUDE.md template generates none of them — omitting a lever means its default. `backlog-fetch-limit` and `promise-register-min-leaves` also appear in `_shared/work-record-config.md`'s table — if the two disagree, that file wins for those two keys, per the same rule the "Dispatch & merge" section states.

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `depth-survey` | `policy.yml` | `/claude-tweaks:flow` | unset (enabled) | `off` disables the end-of-run Depth Opportunities survey project-wide (mirrors the `no-deepen` per-run flag) |
| `creative-survey` | `policy.yml` | `/claude-tweaks:flow` | unset (enabled) | `off` disables the end-of-run Creative Opportunities survey project-wide (mirrors the `no-creative` per-run flag) |
| `backlog-fetch-limit` | `policy.yml` | `/claude-tweaks:help`, `/claude-tweaks:tidy`, `/claude-tweaks:backlog` | `1000` | Cap on `gh issue list --limit` for every `_shared/record-queue-fetch.md` consumer — `gh` auto-paginates internally; this bounds how many rows before a truncation warning fires, not a hard cutoff on backlog size |
| `promise-register-min-leaves` | `policy.yml` | `/claude-tweaks:specify` | `4` | Minimum leaf count in one `/specify` decomposition before a `## Cross-Spec Promises` section is seeded on the parent record |
| `scope-keywords-required` | `policy.yml` | `/claude-tweaks:build` | `false` | When `true`, `/build`'s plan-audit Check B refuses to start if any matched files aren't in the plan AND the plan/design has no `Scope keywords:` field — otherwise (default `false`) this is informational only, a warning |
| `section-confirmation` | `policy.yml` | `/superpowers:brainstorming`, `/claude-tweaks:deepen` | `adaptive` | Whether a skill's multi-section approval gate batches after 2 clean approvals (`adaptive`), always asks per-section, or always batches once |
| `merge-check` | `policy.yml` | `/claude-tweaks:build`, `/claude-tweaks:flow` | `true` | Pre-flight branch-divergence check — whether `/build`'s and `/flow`'s pre-flight step compares the current branch against its upstream and offers rebase-vs-continue; `false` skips this check. (Distinct from `/claude-tweaks:assess-agent-autonomy`'s `merge-check` verdict mode referenced elsewhere in this doc — same term, unrelated concept.) |
