# Policy Schema — Canonical Config Lever Index

Every project-config lever claude-tweaks skills read, in one place — the way `_shared/work-record.md`'s Config Keys table indexes the work-record system's keys. `bin/lib/policy-schema.js` owns the same keys as data (name, type/enum, default) plus `auditPolicy(repoRoot)`, a deterministic validator. If this table and that file disagree, one of them has a bug — fix, don't fork.

`.claude-tweaks/policy.yml` is the canonical home for every lever below. `worktree.always` is `policy.yml`-only — it's mechanically enforced by `bin/lib/hooks/pre-tool-use.js`, which never reads CLAUDE.md. The reverse case also exists: most of the levers listed under "Additional levers" below have no documented `policy.yml` path at all yet — CLAUDE.md is their only current home.

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
- Bash write shapes: `cp`, `mv`, `tee`
<!-- gate-coverage:end -->

**What the gate can see at all.** It is a `PreToolUse` hook, so it inspects *tool calls* — `Edit`/`Write`/`NotebookEdit` inputs and the command string of a `Bash` call. Git and filesystem work performed by the plugin's own Node code via `execFileSync` never passes through a tool call and is therefore never gated: `bin/lib/health-core/durable-state.js`'s `git push` to the `health-state` branch is the standing example, and it is correct as written. Do not "fix" such a call by routing it through Bash.

**Not covered — deliberately.** `git merge`, `git checkout`, `git pull`, `git fetch`, and every other git subcommand pass freely. Bash write shapes beyond the three above (output redirection `>`/`>>`, `sed -i`, `python -c`, `perl -i`, nested `sh -c`) are *not* intercepted either — `fileWriteTargets` is best-effort by design, scoped to what `hooks/hooks.json`'s if-matcher can recognize structurally. Do not write a procedure that depends on those gaps: they are unpatched holes, not a supported bypass.

**The one exemption.** File writes targeting a path under the repo's own `.claude-tweaks/pipelines/` are allowed from anywhere — that directory is plugin-owned, gitignored pipeline bookkeeping (run config, the auto-decision log, staged proposals), not the project work this gate isolates. It applies to file-write targets only: a `git commit`/`git push` target is the command's *working directory*, so exempting those by prefix would permit any commit merely issued from inside a run dir. The exemption also fails closed — a relative or unresolvable path is never exempt.

**Consequence for procedures.** A `git push` from the main checkout is denied even after `close-run` clears the E1 worktree assignment (that clears wrong-checkout enforcement, not this policy). A merge followed by a push must therefore be **two separate Bash calls** — the merge from the main checkout, the push from inside a linked worktree. Chaining them into one command gets the whole invocation denied before either half runs, since the gate inspects the full command string up front.

## Project facts

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `project.maturity` | `policy.yml` (the machine flag; CLAUDE.md's Philosophy section holds a separate narrative description, not this flag) | `/claude-tweaks:init` Phase 3, `/claude-tweaks:build`, `/claude-tweaks:specify` | `greenfield` (absent or invalid value) | `greenfield`/`pre-launch`/`early-production`/`established` — scales `/build`'s test-discipline instruction and `/specify`'s decomposition strategy |
| `auto-mode` | `policy.yml` or CLAUDE.md — commented-out optional template line, unaffected by this spec | `/claude-tweaks:flow`, `/claude-tweaks:tidy`, `/claude-tweaks:build` standalone | unset (`/flow` still defaults to `auto`) | `default-on`/`default-off` — whether standalone `/build` and unattended `/tidy` firings default to auto mode |
| `integration-branch` | `policy.yml` only | `/claude-tweaks:routine`, `/claude-tweaks:dispatch`, `/claude-tweaks:wrap-up`, `/claude-tweaks:build`, `/claude-tweaks:flow`, `/claude-tweaks:assess-agent-autonomy` — all via `_shared/integration-branch.md` | unset (each consumer keeps its own GitHub-default fallback) | The branch where finished work lands and new work starts. Set it on any repo whose active development branch isn't its GitHub default — a `dev` → `staging` → `main` model — where the default is the one branch nothing should be measured against |

## Dispatch & merge

Canonical defaults for the keys in this section also live in `_shared/work-record.md`'s Config keys table — if the two disagree, that file wins for these specific keys (it's the older, most-cited source); update both together.

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `dispatch-retry-ceiling` | `policy.yml` (CLAUDE.md also honored — one grep checks both) | `/claude-tweaks:dispatch` | `3` | Consecutive autonomous build failures before `bot:blocked` + `auto:*` removal |
| `dispatch-pick-max-concurrent` | `policy.yml` | `/claude-tweaks:dispatch` | `3` | Max concurrent groups a bare `/dispatch` multi-pick runs |
| `automerge-max-lines` | `policy.yml` (CLAUDE.md also honored) | `/claude-tweaks:dispatch`, `/claude-tweaks:assess-agent-autonomy` | `40` | Auto-merge blast-radius guideline (lines) — a weighted input to `merge-check`, not a hard cutoff |
| `automerge-max-files` | `policy.yml` (CLAUDE.md also honored) | `/claude-tweaks:dispatch`, `/claude-tweaks:assess-agent-autonomy` | `2` | Auto-merge blast-radius guideline (files) — same weighted treatment |
| `merge-sensitive-paths` | `policy.yml` | `/claude-tweaks:assess-agent-autonomy`, `/claude-tweaks:review` | `[]` (empty) | Comma-separated path globs forcing a hard needs-human floor in `merge-check`, and feeding `/review`'s diff-heuristic risk proxy |
| `work-links` | `policy.yml` (CLAUDE.md also honored) | Work-record system (`/claude-tweaks:dispatch`, `/claude-tweaks:wrap-up`, etc.) | `body-text` | Native sub-issue/blocked-by APIs vs. `Blocked by #N` body-text lines |

## Review

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `review-effort-floor` | `policy.yml` | `/claude-tweaks:review` | unset (no floor) | Project-level floor (`low`/`medium`/`high`/`xhigh`/`max`) that raises (never lowers) the resolved review-effort tier |
| `review-diff-heuristic-thresholds` | `policy.yml` | `/claude-tweaks:review` | `{high: {files: 10, lines: 300}, medium: {files: 3, lines: 50}}` | File/line thresholds for the diff-size review-effort heuristic. **Presence-only validated** — its value is a nested object, but `policy.yml` only supports flat `key: value` lines and no flat-line encoding for this shape has ever been specified; `auditPolicy()` checks the key name only, not the value |

## Harness-health budgets

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `harness-health.scoped-rule-budget` | `policy.yml` | `/claude-tweaks:harness-health` | `30` | Line-count budget for path-scoped `.claude/rules/*.md` files |
| `harness-health.always-loaded-budget` | `policy.yml` | `/claude-tweaks:harness-health` | `150` | Line-count budget for CLAUDE.md and unscoped rule files |

## Auto-mode levers

These 8 resolve from `policy.yml`. `/claude-tweaks:init` does not generate them into CLAUDE.md — omitting a lever means its default, so writing every lever out contradicts the "omit means default" principle.

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `unattended-tier` | `policy.yml` (CLAUDE.md also honored — canonical home is `_shared/unattended-tier.md`) | `/claude-tweaks:flow`, `/claude-tweaks:wrap-up`, `/claude-tweaks:ledger` | `off` | Opt-in narrowing of the ledger resolve-gate, queue-write auto-filing, and ops-ack |
| `scope-creep` | `policy.yml` (CLAUDE.md legacy fallback; standalone direct-read fixed in `build/plan-audit.md`) | `/claude-tweaks:build` | `add-to-plan` | `add-to-plan`/`stop-and-ask`/`drop` |
| `overlap` | `policy.yml` (via `/flow` Manifesto only — no standalone direct-read site exists) | `/flow` Manifesto → `/claude-tweaks:specify` | `companion` | `companion`/`extend`/`skip`/`replace` |
| `design-intent` | `policy.yml` (via `/flow` Manifesto/`config.yml`; a standalone invocation with no pipeline run dir asks the user inline instead of reading CLAUDE.md) | `/claude-tweaks:specify` | `none` | `none`/`bold`/`quiet`/`minimal`/`delightful`/`onboarding` |
| `leftover-default` | `policy.yml` (via `/flow` Manifesto/`config.yml` only — Step 4 is inherently pipeline-scoped, no standalone site exists) | `/claude-tweaks:wrap-up` | `defer` | `defer`/`backlog`/`drop` |
| `auto-fix-threshold` | `policy.yml` (via `/flow` Manifesto/`config.yml` only — no standalone direct-read site exists) | `/claude-tweaks:test` | `lint+type` | `lint-only`/`lint+type`/`lint+type+test` |
| `review-severity-floor` | `policy.yml` (via `/flow` Manifesto/`config.yml` only — no standalone direct-read site exists) | `/claude-tweaks:review` | `low` | `none`/`low`/`medium` auto-apply cutoff |
| `tidy-aggressiveness` | `policy.yml` (CLAUDE.md legacy fallback; standalone direct-read fixed in `tidy/SKILL.md`) | `/claude-tweaks:tidy` | `conservative` | `conservative`/`moderate`/`aggressive` |

## Additional levers

Most of these levers still have no documented `policy.yml` path at all — CLAUDE.md remains their only home. Three exceptions — `section-confirmation`, `scope-keywords-required`, `merge-check` — have their `policy.yml` path documented in the table below; `/claude-tweaks:init`'s template no longer generates any of the three into CLAUDE.md. `backlog-fetch-limit` and `promise-register-min-leaves` also appear in `_shared/work-record.md`'s Config keys table — if the two disagree, that file wins for those two keys, per the same rule the "Dispatch & merge" section states.

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `depth-survey` | CLAUDE.md only — no `policy.yml` path documented today | `/claude-tweaks:flow` | unset (enabled) | `off` disables the end-of-run Depth Opportunities survey project-wide (mirrors the `no-deepen` per-run flag) |
| `creative-survey` | CLAUDE.md only — no `policy.yml` path documented today | `/claude-tweaks:flow` | unset (enabled) | `off` disables the end-of-run Creative Opportunities survey project-wide (mirrors the `no-creative` per-run flag) |
| `backlog-fetch-limit` | CLAUDE.md only — no `policy.yml` path documented today | `/claude-tweaks:help`, `/claude-tweaks:tidy`, `/claude-tweaks:backlog` | `1000` | Cap on `gh issue list --limit` for every `_shared/record-queue-fetch.md` consumer — `gh` auto-paginates internally; this bounds how many rows before a truncation warning fires, not a hard cutoff on backlog size |
| `promise-register-min-leaves` | CLAUDE.md only — no `policy.yml` path documented today | `/claude-tweaks:specify` | `4` | Minimum leaf count in one `/specify` decomposition before a `## Cross-Spec Promises` section is seeded on the parent record |
| `scope-keywords-required` | `policy.yml` | `/claude-tweaks:build` | `false` | When `true`, `/build`'s plan-audit Check B refuses to start if any matched files aren't in the plan AND the plan/design has no `Scope keywords:` field — otherwise (default `false`) this is informational only, a warning |
| `section-confirmation` | `policy.yml` | `/superpowers:brainstorming`, `/claude-tweaks:deepen` | `adaptive` | Whether a skill's multi-section approval gate batches after 2 clean approvals (`adaptive`), always asks per-section, or always batches once |
| `merge-check` | `policy.yml` | `/claude-tweaks:build`, `/claude-tweaks:flow` | `true` | Pre-flight branch-divergence check — whether `/build`'s and `/flow`'s pre-flight step compares the current branch against its upstream and offers rebase-vs-continue; `false` skips this check. (Distinct from `/claude-tweaks:assess-agent-autonomy`'s `merge-check` verdict mode referenced elsewhere in this doc — same term, unrelated concept.) |
