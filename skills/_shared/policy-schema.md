# Policy Schema — Canonical Config Lever Index

Every project-config lever claude-tweaks skills read, in one place — the way `_shared/work-record.md`'s Config Keys table indexes the work-record system's keys. `bin/lib/policy-schema.js` owns the same 30 keys as data (name, type/enum, default) plus `auditPolicy(repoRoot)`, a deterministic validator. If this table and that file disagree, one of them has a bug — fix, don't fork.

`.claude-tweaks/policy.yml` is the canonical home for all 30 levers below. CLAUDE.md is a legacy fallback only, honored for projects that already wrote a value there before this schema existed — `/claude-tweaks:init` no longer generates new CLAUDE.md lever lines (see the "Auto-mode policy" block retirement in `claude-md-template.md`), and Update Mode offers a one-time migration for existing projects (`skills/init/update-mode.md`'s "Auto-Mode-Policy Migration" section). The one exception is `worktree.always`, which has never had a CLAUDE.md path at all — it's mechanically enforced by `bin/lib/hooks/pre-tool-use.js`, which only ever reads `policy.yml`.

## Worktree & execution

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `worktree.always` | `policy.yml` only — no CLAUDE.md path exists | `/claude-tweaks:init`, `/claude-tweaks:build`, `_shared/git-discipline.md`; mechanically enforced by `bin/lib/hooks/pre-tool-use.js` | `false` (unenforced) | Whether every `Edit`/`Write`/`NotebookEdit`/`git commit`/`git push` (and Bash `cp`/`mv`/`tee`) must occur inside a linked git worktree |
| `execution.always` | `policy.yml` | `/claude-tweaks:build`, `_shared/git-discipline.md` | unset (both `subagent`/`batched` selectable) | Locks `/claude-tweaks:build`'s execution-strategy axis to `subagent` only, when set |

## Project facts

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `project.maturity` | `policy.yml` (the machine flag; CLAUDE.md's Philosophy section holds a separate narrative description, not this flag) | `/claude-tweaks:init` Phase 3, `/claude-tweaks:build`, `/claude-tweaks:specify` | `greenfield` (absent or invalid value) | `greenfield`/`pre-launch`/`early-production`/`established` — scales `/build`'s test-discipline instruction and `/specify`'s decomposition strategy |
| `auto-mode` | `policy.yml` or CLAUDE.md — commented-out optional template line, unaffected by this spec | `/claude-tweaks:flow`, `/claude-tweaks:tidy`, `/claude-tweaks:build` standalone | unset (`/flow` still defaults to `auto`) | `default-on`/`default-off` — whether standalone `/build` and unattended `/tidy` firings default to auto mode |

## Dispatch & merge

Canonical defaults for these four also live in `_shared/work-record.md`'s Config keys table — if the two disagree, that file wins for these specific keys (it's the older, most-cited source); update both together.

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `dispatch-retry-ceiling` | `policy.yml` (CLAUDE.md also honored — one grep checks both) | `/claude-tweaks:dispatch` | `3` | Consecutive autonomous build failures before `bot:blocked` + `auto:*` removal |
| `dispatch-pick-max-concurrent` | `policy.yml` | `/claude-tweaks:dispatch` | `3` | Max concurrent groups a bare `/dispatch` multi-pick runs |
| `automerge-max-lines` | `policy.yml` (CLAUDE.md also honored) | `/claude-tweaks:dispatch`, `/claude-tweaks:assess-agent-autonomy` | `40` | Auto-merge blast-radius guideline (lines) — a weighted input to `merge-check`, not a hard cutoff |
| `automerge-max-files` | `policy.yml` (CLAUDE.md also honored) | `/claude-tweaks:dispatch`, `/claude-tweaks:assess-agent-autonomy` | `2` | Auto-merge blast-radius guideline (files) — same weighted treatment |
| `merge-sensitive-paths` | `policy.yml` | `/claude-tweaks:assess-agent-autonomy`, `/claude-tweaks:review` | `[]` (empty) | Comma-separated path globs forcing a hard needs-human floor in `merge-check`, and feeding `/review`'s diff-heuristic risk proxy |
| `work-links` | `policy.yml` (CLAUDE.md also honored) | Work-record system (`/claude-tweaks:dispatch`, `/claude-tweaks:wrap-up`, etc.) | `body-text` | Native sub-issue/blocked-by APIs vs. `Blocked by #N` body-text lines |
| `backlog-fetch-limit` | `policy.yml` | `/claude-tweaks:help`, `/claude-tweaks:tidy` | `1000` | Cap on `gh issue list --limit` for every `_shared/record-queue-fetch.md` consumer — `gh` auto-paginates internally; this bounds how many rows before a truncation warning fires, not a hard cutoff on backlog size |

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

## Flow surveys

| Key | Canonical home | Owner skill(s) | Default | Meaning |
|---|---|---|---|---|
| `depth-survey` | CLAUDE.md only — no `policy.yml` path documented today | `/claude-tweaks:flow` | unset (enabled) | `off` disables the end-of-run Depth Opportunities survey project-wide (mirrors the `no-deepen` per-run flag) |
| `creative-survey` | CLAUDE.md only — no `policy.yml` path documented today | `/claude-tweaks:flow` | unset (enabled) | `off` disables the end-of-run Creative Opportunities survey project-wide (mirrors the `no-creative` per-run flag) |
| `tidy-routine-autonomy` | CLAUDE.md only — no `policy.yml` path documented today | `/claude-tweaks:tidy` | `conservative` | `evidence-based` lets 2 of 4 specific cite-able finding shapes auto-apply under the `--scope=github` Standalone-auto routine path; `conservative` (default) stages everything |
