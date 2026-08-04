# Policy Schema — Canonical Config Lever Index

Every project-config lever claude-tweaks skills read, in one place — the way `_shared/work-record.md`'s Config Keys table indexes the work-record system's keys. `bin/lib/policy-schema.js` owns the same keys as data (name, type/enum, default) plus `auditPolicy(repoRoot)`, a deterministic validator. If this table and that file disagree, one of them has a bug — fix, don't fork.

`.claude-tweaks/policy.yml` is the canonical home for every lever below. CLAUDE.md remains a legacy fallback wherever a lever's Canonical home cell says so — for the 8 Auto-mode-policy levers specifically, `/claude-tweaks:init` no longer generates those lines (see the "Auto-mode policy" block retirement in `claude-md-template.md`), and Update Mode offers a one-time migration for existing projects that still have them (`skills/init/update-mode.md`'s "Auto-Mode-Policy Migration" section). The one exception is `worktree.always`, which has never had a CLAUDE.md path at all — it's mechanically enforced by `bin/lib/hooks/pre-tool-use.js`, which only ever reads `policy.yml`. The reverse exception also exists: most of the levers listed under "Additional levers" below have no documented `policy.yml` path at all yet — CLAUDE.md is their only current home.

## Worktree & execution

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `worktree.always` | `policy.yml` only — no CLAUDE.md path exists | `/claude-tweaks:init`, `/claude-tweaks:build`, `_shared/git-discipline.md`; mechanically enforced by `bin/lib/hooks/pre-tool-use.js` | `false` (unenforced) | Whether every `Edit`/`Write`/`NotebookEdit`/`git commit`/`git push` (and Bash `cp`/`mv`/`tee`) must occur inside a linked git worktree |
| `execution.always` | `policy.yml` | `/claude-tweaks:build`, `_shared/git-discipline.md` | unset (both `subagent`/`batched` selectable) | Locks /claude-tweaks:build's execution axis to the set value, when set — the other value is not offered and is substituted with an inline notice if passed explicitly (see build/SKILL.md's Execution axis paragraph). Distinct from execution-strategy, which sets an overridable default rather than a lock |
| `execution-strategy` | `policy.yml` | `/claude-tweaks:build` | `subagent` | Default value of `/claude-tweaks:build`'s execution axis when no argument is passed. Distinct from `execution.always`: this sets a default an explicit argument still overrides, while `execution.always` locks the axis and rejects the other value |
| `git-strategy` | `policy.yml` | `/claude-tweaks:build`, `/claude-tweaks:flow` | `worktree` | Default value of the Git axis when no argument is passed — matches /claude-tweaks:build's own documented default and /claude-tweaks:flow's intrinsic one. Set current-branch to opt a project out of worktree isolation by default; an explicit argument still wins, and worktree.always overrides both |

## Project facts

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `project.maturity` | `policy.yml` (the machine flag; CLAUDE.md's Philosophy section holds a separate narrative description, not this flag) | `/claude-tweaks:init` Phase 3, `/claude-tweaks:build`, `/claude-tweaks:specify` | `greenfield` (absent or invalid value) | `greenfield`/`pre-launch`/`early-production`/`established` — scales `/build`'s test-discipline instruction and `/specify`'s decomposition strategy |
| `auto-mode` | `policy.yml` or CLAUDE.md — commented-out optional template line, unaffected by this spec | `/claude-tweaks:flow`, `/claude-tweaks:tidy`, `/claude-tweaks:build` standalone | unset (`/flow` still defaults to `auto`) | `default-on`/`default-off` — whether standalone `/build` and unattended `/tidy` firings default to auto mode |

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

## Legacy dispatch aliases

Pre-rename aliases, still read when the current-name key is absent — no project should have to rename its policy file just because a skill was renamed. See `skills/dispatch/SKILL.md`'s own Configuration table for the authoritative alias mapping.

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `triage-retry-ceiling` | `policy.yml` (CLAUDE.md also honored) | `/claude-tweaks:dispatch` | `3` | Legacy alias for `dispatch-retry-ceiling` |
| `triage-fast-track-max-lines` | `policy.yml` (CLAUDE.md also honored) | `/claude-tweaks:dispatch` | `40` | Legacy alias for `automerge-max-lines` |
| `triage-fast-track-max-files` | `policy.yml` (CLAUDE.md also honored) | `/claude-tweaks:dispatch` | `2` | Legacy alias for `automerge-max-files` |
| `triage-dispatch-max-concurrent` | `policy.yml` | `/claude-tweaks:dispatch` | `3` | Legacy alias for `dispatch-pick-max-concurrent` |

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

These 8 were, until this spec, generated into every new CLAUDE.md's `## Auto-mode policy` block regardless of whether a project ever customized them — contradicting the very "omit means default" principle documented one section above that block. `/claude-tweaks:init` no longer generates that block; `policy.yml` is the canonical home going forward, with CLAUDE.md honored only for values already written there before this change.

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
