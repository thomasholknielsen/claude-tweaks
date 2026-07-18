# Changelog

## v6.7.0 — Fast-lane pipeline profile

A new `ceremony-check` mode on `/claude-tweaks:assess-agent-autonomy` judges once, at materialize time, how much retrospective/documentation ceremony a record's actual content deserves — stored as a `ceremony:` materialized-header field and folded into a new `ceremony-profile` Manifesto lever (10th canonical lever; `unattended-tier` keeps its existing slot 9).

- **`/claude-tweaks:reflect` light mode** — new `skills/reflect/light-mode.md`: 2 lenses (Near-misses, Fresh start), no tradeoff review. Runs instead of full mode when `config.yml`'s `ceremony-profile` is `fast-lane`.
- **`/claude-tweaks:build` audit skip conditions** — Plan Audit and Architecture Alignment steps skip under `ceremony-profile: fast-lane`, on top of their existing size-based skip conditions.
- **`/claude-tweaks:wrap-up` narrower ceremony** — Step 7's independent skill-curation scan caps at top ~2 instead of top ~5; Step 6's doc/CLAUDE.md/ADR sub-scans gain a mechanical pre-check gate that skips all three when the diff touches no registry-matched path, no new dependency, and no schema/config file.
- **Escape hatch** — a Safety-regression finding during light-mode reflect downgrades `config.yml`'s `ceremony-profile` to `standard` for the remainder of the run, falling back to full-depth ceremony.

See `docs/superpowers/specs/2026-07-15-fast-lane-pipeline-profile-design.md` for the full design.

## v6.6.0 — Docs-health expansion + wrap-up integration + genre templates

Extends `/claude-tweaks:docs-health` with three new/strengthened judging dimensions, two new CLI subcommands, an inline integration into `/claude-tweaks:wrap-up`, and a unified template library backing missing-doc scaffolding.

- **Three new/strengthened docs-health dimensions** — findability (is the doc discoverable/linked from where a reader would look, repo-scoped), placement-fit (does the doc live in the genre-appropriate location), and freshness-dependencies (does the doc's frontmatter track the source files it depends on, so drift can be detected) — added to `_shared/criteria-docs-diataxis.md`'s JUDGE procedure alongside the existing genre-drift, depth-mismatch, and dual-persona misleading-risk checks.
- **Two new CLI subcommands** — `find-refs <path> [--root <dir>]` (repo-scoped reference/backlink lookup backing the findability check) and `check-freshness <path> [--root <dir>]` (frontmatter-declared source-dependency staleness check) added to `bin/docs-health.js`.
- **`/claude-tweaks:wrap-up` docs-health integration** — new `skills/wrap-up/docs-health-integration.md`, loaded by Step 6.1: D1 applies the full docs-health JUDGE procedure inline to every doc this work's diff touched (additive findings fold into the Configuration Updates batch table; restructural findings file as `by:docs-health` GitHub issues through the same dedup/filing CLI machinery `/claude-tweaks:docs-health` itself uses), and D2 detects documentation this work should have produced but didn't, scaffolding new docs from the genre template library.
- **Unified 6-genre template library** — new `skills/_shared/diataxis-genre-templates.md` is now the single source of truth for all six doc genres `/claude-tweaks:docs-health` recognizes: the four core Diátaxis genres (Tutorial, How-To, Reference, Explanation — new) plus the two native-exempt genres it already judged, ADR and Journey, whose canonical skeletons migrated here from `_shared/decision-records.md` and `journeys/journey-template.md` (which now point here instead of duplicating the literal skeleton). Consumed by `/claude-tweaks:init` Phase 8.5's missing-doc backlog items and `/claude-tweaks:wrap-up`'s D2 missing-doc detection.
- `/claude-tweaks:wrap-up` Step 9/10 templates gained a `docs-health-issue` config-update type and two new Step 10 execution bullets (new-doc scaffolding from the template library, restructural docs-health filing) so approved docs-health findings from the Console/batch have somewhere to land.

## v4.15.0 — Research delegates to the built-in /deep-research

`/claude-tweaks:research` no longer ships a vendored Python engine. It now delegates to Claude Code's built-in `/deep-research` Dynamic Workflow when available, and falls back to a lean inline model-driven method otherwise.

- **Removed** the vendored `skills/research/scripts/` (10 Python modules), `schemas/`, `templates/`, the Python `tests/`, `requirements.txt`, `UPSTREAM.md`, and `LICENSE-UPSTREAM` — ~6,800 lines.
- **`skills/research/SKILL.md`** rewritten: availability pre-check → delegate to `/deep-research` → inline fallback → write `report.md` + `sources.json` under `.claude-tweaks/research/`. Adds an "Enabling the built-in path" setup note and a Component-Skill Contract.
- **`skills/research/reference/methodology.md`** rewritten as the lean inline fallback (decompose → parallel `WebSearch`/`WebFetch` → adversarial-verify subagents → synthesize) with the salvaged citation-discipline rules.
- **Regressions accepted:** HTML/PDF report generation, deterministic Python citation/DOI validation, continuation/resume state, and source-credibility scoring are dropped. Citation validation is now a model self-check; output is markdown + `sources.json`.
- The built-in path requires Claude Code ≥ 2.1.154 with Dynamic Workflows enabled (Pro: enable via `/config`). When unavailable, the inline fallback runs automatically.

## v4.14.0 — Remove the bash-output filter + savings meter

The v4.2 "token-saver" — a `PostToolUse[Bash]` hook that compacted noisy command output and a statusline `saved: ↓Nk` meter that reported the reclaimed tokens — has been removed. The observed savings never justified the surface area, and the harness already manages context.

- **Deleted** `bin/filter-bash-output.js` (the parser), `bin/lib/jsonl.js` and `bin/lib/paths.js` (telemetry plumbing used only by the filter and the savings meter), and `tests/filter-bash-output.test.js`.
- **`hooks/hooks.json`** drops the `PostToolUse[Bash]` block. Only the `SessionStart` dependency check remains.
- **Statusline** loses `renderSavings`/`formatK` and the `saved:` segment. Everything else (project, model, `ctx:`, effort, git, rate limits, active spec, open-ledger count) is unchanged.
- No migration needed. Stale `~/.claude-tweaks/logs/` files (raw bash logs + `filter.jsonl`) are now inert and can be deleted by hand.
- The **Subagent Contract** (clean-room input, Templates A/B/C, model-tier selection) is unaffected — it's dispatch discipline, not part of the filter.

## v4.13.0 — Filter compaction + universal Working Approach

Two additions, both folded in together: smarter bash-output compaction, and a standard task-execution guardrail block in every generated CLAUDE.md.

- **Bash filter now groups, not just clips.** `compactExcerpt` gained three shape-aware modes ahead of the old head/tail clip: file listings (git status / ls / find) collapse into a **by-directory histogram**, lint findings (ruff / flake8 / pylint / clippy / eslint stylish) collapse into a **by-rule histogram**, and identical adjacent runs **dedupe** into `line  (×N)`. Grouping only triggers when a clear majority of lines match the expected shape (ratio gates: 0.6 for paths, 0.5 for rules, min 8 lines) — otherwise it falls back to dedupe + clip, so prose output is never mangled. A new `Test summary:` section surfaces aggregate test-runner result lines (cargo `test result:`, jest `Tests:`/`Test Suites:`, pytest `N passed … in`, mocha `N passing`) that dedupe/clip would otherwise bury under per-test noise. New unit coverage for `dedupeLines`, `testSummaryLines`, `groupByDirectory`, `groupByRule`, and the `summarize` integration paths.
- **`/init` emits a `## Working Approach` block.** Every generated CLAUDE.md now carries a standard, non-adaptive block of universal task-execution guardrails — think-before-coding, simplicity-first, surgical-changes, goal-driven, read-before-write, checkpoint-multi-step, fail-loud — so ad-hoc work outside the pipeline (where no skill gate fires) gets the same discipline the lifecycle skills enforce. It complements the maturity-adaptive Philosophy section rather than repeating it, and **deliberately omits a token-budget rule** (context management is the harness's job; `_shared/auto-mode-contract.md` forbids the model from inserting context-window stop prompts).

## v4.7.1 — Statusline ledger fix

- **Statusline `ledger` segment now sums open rows across *all* `-ledger.md` files in the current checkout's `docs/plans`**, instead of reading only the most-recently-modified file. The old "newest file wins" logic both undercounted (open items in older ledgers were invisible) and relied on mtimes that are unreliable right after a worktree checkout. Worktree isolation is preserved — the scan is relative to the session's `cwd`, so side-by-side worktrees never see each other's uncommitted ledgers. Added `findOpenLedger` test coverage (previously none).

## v4.6 — Bookend Architecture + Auto-Mode Contract

The pipeline now has at most **two user-facing stops in `auto` mode**, regardless of how many decisions it makes:

- **Pipeline Config Manifesto** at the start (`/flow` Step 3) — one structured table pre-fills every policy lever (scope-creep, overlap, design-intent, leftover-routing, auto-fix-threshold, review-severity-floor, tidy-aggressiveness) with recommended defaults. Hit "Approve all recommendations" or override specific items.
- **Wrap-Up Review Console** at the end (`/wrap-up` Step 8.6) — one consolidated batch surfacing every auto-decided item, every staged item, skill updates, and config changes. Hit "Approve all" or override specific items.
- **Mid-flow** — pure automation. Every decision is logged to `.claude-tweaks/pipelines/{run-id}/decisions.md` with status (AUTO / STAGED / KEPT-PROMPT), rationale, and reversibility. The Review Console reads this log.

New shared files:
- `skills/_shared/auto-mode-contract.md` — single source of truth for what `auto` silences AND what it does not (ledger resolve Phase 2, INBOX/DEFERRED writes, `/challenge` lenses, governance gates, HARD-GATEs). Defines reversibility/confidence/severity floors and decision precedence.
- `skills/_shared/auto-decision-log.md` — audit-trail spec. Every auto-resolution logs a one-liner. The user reviews the log at wrap-up rather than upfront.

Per-pipeline state lives in `.claude-tweaks/pipelines/{ISO-timestamp}-{spec-slug}/` (config.yml + decisions.md + staged/) — collision-safe for parallel agents in the same checkout.

Per-skill rewrites: `/review` Step 3g (severity-based routing), `/tidy` (aggressiveness-based routing), `/init` Phase 3 (confidence-gated), `/build` Common Step 1.5 (scope-creep policy), `/specify` Step 1 + 2.5b + 2.5c (overlap + shape + design-intent policies), `/stories` Step 1 + 6 (legacy + journey-link auto), `/test` Step 3 (auto-fix-threshold), `/visual-review` Step 1 + 2 (auto-skip + log), `/capture` (`--route` arg), `/reflect` Step 3 (auto-route safety findings + stage rest), `/wrap-up` Step 4 + 7.5 (policy lookup + stage).

**Strict rule:** skills MUST NOT invent new mid-flow stops in `auto`. Mid-flow stops are reserved for HARD-GATEs and the explicit "not silenced" list.

## v4.5 — Impeccable Integration

Three-phase rollout of the `/claude-tweaks:design` wrapper for the [Impeccable](https://github.com/pbakaus/impeccable) frontend-design plugin:

- **Phase 1** — wrapper skeleton + read-only integration. The `/claude-tweaks:design` skill exposes 6 mode signatures; `test` (CLI gate) and `review` (advisory critique + audit) are active. `/init` Step 0.9 walks the user through Impeccable plugin install, CLI install, and `/impeccable teach` setup. `/test` Step 1.5 is the deterministic CLI gate; `/review` Step 6.5 surfaces "Design Quality" findings advisorily.
- **Phase 2** — code-modifying integration. `/build` Common Step 1.7 lazy-loads Impeccable reference files into the implementer subagent's context (`pre-build` mode). `/specify` accepts polymorphic input (topic name → invokes `/superpowers:brainstorming`; design doc path → existing behavior), runs the Impeccable `shape` pre-step on frontend design docs, asks the design-intent question, and writes `surface:` + `design-intent:` frontmatter on every generated spec. `/flow` adds a `polish` phase between review and wrap-up that dispatches Impeccable's auto-fit + issue-driven commands; a re-verify gate (`/test skip-qa`, one-cycle cap) catches polish-broke-verification cases. New `no-polish` flag on `/flow` and `skip-qa` flag on `/test` are the user-facing controls.
- **Phase 3** — creative surfacing system. Intent-driven dispatch lights up in `polish` mode (reads `design-intent:` frontmatter and dispatches `bolder`, `quieter`, `distill`, `delight`+`animate`, `onboard` per the value). The `survey` mode goes active and produces ranked Creative Opportunities recommendations rendered as **three independent anchors** so creative commands cannot get buried:
  - **Anchor 1 — `polish` mode intent dispatch.** Auto-runs the matching creative command(s) when intent is declared (no decline tracking — explicit frontmatter is consent).
  - **Anchor 2 — `/visual-review` Creative Opportunities block.** Survey runs against captured screenshots; recommendations rendered after the findings table. Read-only.
  - **Anchor 3 — `/flow` pipeline summary Creative Opportunities block.** Survey runs against the full diff; recommendations rendered before Next Actions. Read-only. Decline tracking suppresses recommendations the user repeatedly ignored (2-decline threshold; reset via `/claude-tweaks:design reset-recommendations <spec>`).

The manual-only commands (`colorize`, `extract`, `overdrive`) are surfaced via `survey` recommendations only — they remain user-invoked to avoid creative drift. All v4.5 changes are gated by Phase 1's 3-layer detection — non-frontend specs and projects without Impeccable installed skip cleanly. The integration is opt-in via `/init` Step 0.9.

**Caches written by the wrapper** live alongside the open items ledger at `docs/plans/YYYY-MM-DD-{feature}-{audit|recommendations|declined}.json`. All three are cleaned up by `/wrap-up` Step 5 alongside the ledger.

## v4.2 — Token Saver

Three additions that reduce token consumption with no behavior change to skills:

- **Bash output filter** — a `PostToolUse[Bash]` hook compacts noisy test/build/CI output (>16KB) while preserving failure lines. Matches governor's logic: head + tail clipping, failure-marker regex, threshold-based decision. Filtered output ends with `[full output: ~/.claude-tweaks/logs/bash-{ts}.log]` — `Read` that path for unfiltered detail. No bypass command; the saved log is the escape hatch.
- **Statusline** — a self-sufficient 9-segment line: `model · ctx% · effort · git · session · weekly · saved · spec · ledger`. Auto-hides empty segments. Semantic ANSI 8-color (red/yellow/green) with `NO_COLOR` respect. Wired up by `/claude-tweaks:init` Step 0.8 — never overwrites an existing `statusLine.command`. Cross-platform (macOS, Windows, Linux best-effort).
- **Subagent output contract** — `skills/_shared/subagent-output-contract.md` defines Templates A/B/C for parallel-dispatched Task agents. Used today by `/browse`, `/help`, `/review` (review-lens dispatch + parallel-fix dispatch), and `/tidy`.

**New dependency:** Node 18+ (used by the bash filter hook and statusline). `/claude-tweaks:init` Step 0.8 detects missing Node and offers to install via the platform's package manager (brew / winget / scoop on macOS+Windows; manual sudo command printed for Linux). Git CLI is optional; the `git` statusline segment hides when absent.

To disable color: `export NO_COLOR=1`. To inspect raw bash output: `cat ~/.claude-tweaks/logs/bash-{ts}.log` (path appears in the filter footer).

## v4.1

Quality-of-life improvements that emerged from doing the v4.0 migration. Non-breaking; opt in by adding the relevant settings to your project's `CLAUDE.md`.

- **Project-level defaults** — new `Worktree`, `Subagent`, `Brainstorm`, `Pre-flight`, and `Plan audit` sections in CLAUDE.md let you set defaults that claude-tweaks reads before invoking sub-skills (worktree directory, subagent pattern for markdown projects, section-batching behavior, merge-check toggle, scope-keyword enforcement).
- **`/build` Plan Audit step** — verifies plan-referenced paths exist; when the plan declares `Scope keywords:`, greps the repo and lists files outside the plan that match. Catches "remove X" plans that miss a file.
- **Pre-flight merge check** — `/build worktree` and `/flow` fetch `origin/main` before creating a worktree and warn on divergence. Surfaces "main shipped while you were working in a worktree" early instead of at branch finish.
- **Scope-aware `/flow` routing** — when a design doc / plan touches 10+ files, ships a major version bump, or runs 300+ lines, `/flow` surfaces a warning suggesting `/specify` decomposition first. Bypassed in `auto` mode.
- **`/flow auto` keyword** — symmetrical with `/build auto`. Silences the merge-check and scope-check prompts (each auto-acknowledged in the ledger), making `/flow … auto` a single-decision invocation.
- **Adaptive section batching** — when a multi-section approval flow gets 2 consecutive yeses, remaining sections are batched into one approval. Configurable via `Brainstorm / section-confirmation` (`adaptive` | `per-section` | `batch`).

## v4.0 — Breaking changes

Two changes affect users upgrading from v3:

1. **Browser tooling switched to agent-browser.** Install: `npm install -g agent-browser`. Uninstall is optional but recommended: `npm uninstall -g @playwright/cli`. Chrome MCP support is removed entirely.
2. **`/stories` schema bumped to v2.** Existing v1 story files (with CSS selectors) are detected on first run and you'll be prompted to regenerate — `/stories <url>` reuses your existing story names, descriptions, and journey assignments while replacing CSS selectors with semantic locators (role / text / testid). No silent breakage.

Run `/claude-tweaks:init` against your existing project to refresh the configuration after upgrading.
