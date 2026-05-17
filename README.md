# claude-tweaks

A structured workflow system for Claude Code — from idea capture through build, review, and wrap-up.

## What this does

Claude Code is powerful but unstructured. claude-tweaks adds a complete development lifecycle: capture ideas, challenge assumptions, decompose into specs, build with quality gates, and learn from what was built. Every finding is explicitly resolved — nothing silently drops.

## Upgrading from v3 to v4

v4.0.0 is a breaking release. Two changes affect existing users:

1. **Browser tooling switched to agent-browser.** Install: `npm install -g agent-browser`. Uninstall is optional but recommended: `npm uninstall -g @playwright/cli`. Chrome MCP support is removed entirely.
2. **`/stories` schema bumped to v2.** Existing v1 story files (with CSS selectors) are detected on first run and you'll be prompted to regenerate — `/stories <url>` reuses your existing story names, descriptions, and journey assignments while replacing CSS selectors with semantic locators (role / text / testid). No silent breakage.

Run `/claude-tweaks:init` against your existing project to refresh the configuration after upgrading.

### What's new in v4.7 — Deep web research

`/claude-tweaks:research` adds citation-audited deep web research to the plugin. Four runtime modes trade depth for time:

- **quick** (~2-5 min) — fast scan, ~5-10 sources
- **standard** (~5-15 min) — balanced default
- **deep** (~15-30 min) — comprehensive synthesis with broader source pool
- **ultradeep** (~20-45 min) — multi-persona red-team with adversarial review

Vendored from [199-biotechnologies/claude-deep-research-skill](https://github.com/199-biotechnologies/claude-deep-research-skill) (MIT). See `skills/research/UPSTREAM.md` for the vendoring contract, pinned commit, modifications, and update runbook. Reports land under `.claude-tweaks/research/`.

### What's new in v4.6 — Bookend Architecture + Auto-Mode Contract

The pipeline now has at most **two user-facing stops in `auto` mode**, regardless of how many decisions it makes:

- **Pipeline Config Manifesto** at the start (`/flow` Step 1.6) — one structured table pre-fills every policy lever (scope-creep, overlap, design-intent, leftover-routing, auto-fix-threshold, review-severity-floor, tidy-aggressiveness) with recommended defaults. Hit "Approve all recommendations" or override specific items.
- **Wrap-Up Review Console** at the end (`/wrap-up` Step 9.6) — one consolidated batch surfacing every auto-decided item, every staged item, skill updates, and config changes. Hit "Approve all" or override specific items.
- **Mid-flow** — pure automation. Every decision is logged to `.claude-tweaks/pipelines/{run-id}/decisions.md` with status (AUTO / STAGED / KEPT-PROMPT), rationale, and reversibility. The Review Console reads this log.

New shared files:
- `skills/_shared/auto-mode-contract.md` — single source of truth for what `auto` silences AND what it does not (ledger resolve Phase 2, INBOX/DEFERRED writes, `/challenge` lenses, governance gates, HARD-GATEs). Defines reversibility/confidence/severity floors and decision precedence.
- `skills/_shared/auto-decision-log.md` — audit-trail spec. Every auto-resolution logs a one-liner. The user reviews the log at wrap-up rather than upfront.

Per-pipeline state lives in `.claude-tweaks/pipelines/{ISO-timestamp}-{spec-slug}/` (config.yml + decisions.md + staged/) — collision-safe for parallel agents in the same checkout.

Per-skill rewrites: `/review` Step 3g (severity-based routing), `/tidy` (aggressiveness-based routing), `/init` Phase 3 (confidence-gated), `/build` Common Step 1.5 (scope-creep policy), `/specify` Step 1 + 2.5b + 2.5c (overlap + shape + design-intent policies), `/stories` Step 1 + 6 (legacy + journey-link auto), `/test` Step 3 (auto-fix-threshold), `/visual-review` Step 1 + 2 (auto-skip + log), `/capture` (`--route` arg), `/reflect` Step 3 (auto-route safety findings + stage rest), `/wrap-up` Step 4 + 7.5 (policy lookup + stage).

**Strict rule:** skills MUST NOT invent new mid-flow stops in `auto`. Mid-flow stops are reserved for HARD-GATEs and the explicit "not silenced" list.

### What's new in v4.5 — Impeccable Integration (feature-complete)

v4.5.0 shipped the integration in three internal phases. All three are now in place; v4.5.0 is the GA release of the full feature.

- **Phase 1** — wrapper skeleton + read-only integration. The `/claude-tweaks:design` skill exposes 6 mode signatures; `test` (CLI gate) and `review` (advisory critique + audit) are active. `/init` Step 0.9 walks the user through Impeccable plugin install, CLI install, and `/impeccable teach` setup. `/test` Step 1.5 is the deterministic CLI gate; `/review` Step 6.5 surfaces "Design Quality" findings advisorily.
- **Phase 2** — code-modifying integration. `/build` Common Step 1.7 lazy-loads Impeccable reference files into the implementer subagent's context (`pre-build` mode). `/specify` accepts polymorphic input (topic name → invokes `/superpowers:brainstorming`; design doc path → existing behavior), runs the Impeccable `shape` pre-step on frontend design docs, asks the design-intent question, and writes `surface:` + `design-intent:` frontmatter on every generated spec. `/flow` adds a `polish` phase between review and wrap-up that dispatches Impeccable's auto-fit + issue-driven commands; a re-verify gate (`/test skip-qa`, one-cycle cap) catches polish-broke-verification cases. New `no-polish` flag on `/flow` and `skip-qa` flag on `/test` are the user-facing controls.
- **Phase 3** — creative surfacing system. Intent-driven dispatch lights up in `polish` mode (reads `design-intent:` frontmatter and dispatches `bolder`, `quieter`, `distill`, `delight`+`animate`, `onboard` per the value). The `survey` mode goes active and produces ranked Creative Opportunities recommendations rendered as **three independent anchors** so creative commands cannot get buried:
  - **Anchor 1 — `polish` mode intent dispatch.** Auto-runs the matching creative command(s) when intent is declared (no decline tracking — explicit frontmatter is consent).
  - **Anchor 2 — `/visual-review` Creative Opportunities block.** Survey runs against captured screenshots; recommendations rendered after the findings table. Read-only.
  - **Anchor 3 — `/flow` pipeline summary Creative Opportunities block.** Survey runs against the full diff; recommendations rendered before Next Actions. Read-only. Decline tracking suppresses recommendations the user repeatedly ignored (2-decline threshold; reset via `/claude-tweaks:design reset-recommendations <spec>`).

The manual-only commands (`colorize`, `extract`, `overdrive`) are surfaced via `survey` recommendations only — they remain user-invoked to avoid creative drift. All v4.5 changes are gated by Phase 1's 3-layer detection — non-frontend specs and projects without Impeccable installed skip cleanly. The integration is opt-in via `/init` Step 0.9.

**Caches written by the wrapper** live alongside the open items ledger at `docs/plans/YYYY-MM-DD-{feature}-{audit|recommendations|declined}.json` (per CLAUDE.md, runtime state stays out of `~/.claude-tweaks/`). All three are cleaned up by `/wrap-up` Step 5 alongside the ledger.

### What's new in v4.2 — Token Saver

Three additions that reduce token consumption with no behavior change to skills:

- **Bash output filter** — a `PostToolUse[Bash]` hook compacts noisy test/build/CI output (>16KB) while preserving failure lines. Matches governor's logic: head + tail clipping, failure-marker regex, threshold-based decision. Filtered output ends with `[full output: ~/.claude-tweaks/logs/bash-{ts}.log]` — `Read` that path for unfiltered detail. No bypass command; the saved log is the escape hatch.
- **Statusline** — a self-sufficient 9-segment line: `model · ctx% · effort · git · session · weekly · saved · spec · ledger`. Auto-hides empty segments. Semantic ANSI 8-color (red/yellow/green) with `NO_COLOR` respect. Wired up by `/claude-tweaks:init` Step 0.8 — never overwrites an existing `statusLine.command`. Cross-platform (macOS, Windows, Linux best-effort).
- **Subagent output contract** — `skills/_shared/subagent-output-contract.md` defines Templates A/B/C for parallel-dispatched Task agents. Used today by `/browse`, `/help`, `/review` (review-lens dispatch + parallel-fix dispatch), and `/tidy`.

**New dependency:** Node (already used for the SessionStart agent-browser detection — no new install for most users). Git CLI is optional; the `git` segment hides when absent. `/claude-tweaks:init` detects missing deps and offers to install via the platform's package manager (brew / winget / scoop on macOS+Windows; manual sudo command printed for Linux).

To disable color: `export NO_COLOR=1`. To inspect raw bash output: `cat ~/.claude-tweaks/logs/bash-{ts}.log` (path appears in the filter footer).

### What's new in v4.1

Quality-of-life improvements that emerged from doing the v4.0 migration. Non-breaking; opt in by adding the relevant settings to your project's `CLAUDE.md`.

- **Project-level defaults** — new `Worktree`, `Subagent`, `Brainstorm`, `Pre-flight`, and `Plan audit` sections in CLAUDE.md let you set defaults that claude-tweaks reads before invoking sub-skills (worktree directory, subagent pattern for markdown projects, section-batching behavior, merge-check toggle, scope-keyword enforcement).
- **`/build` Plan Audit step** — verifies plan-referenced paths exist; when the plan declares `Scope keywords:`, greps the repo and lists files outside the plan that match. Catches "remove X" plans that miss a file.
- **Pre-flight merge check** — `/build worktree` and `/flow` fetch `origin/main` before creating a worktree and warn on divergence. Surfaces "main shipped while you were working in a worktree" early instead of at branch finish.
- **Scope-aware `/flow` routing** — when a design doc / plan touches 10+ files, ships a major version bump, or runs 300+ lines, `/flow` surfaces a warning suggesting `/specify` decomposition first. Bypassed in `auto` mode.
- **`/flow auto` keyword** — symmetrical with `/build auto`. Silences the merge-check and scope-check prompts (each auto-acknowledged in the ledger), making `/flow … auto` a single-decision invocation.
- **Adaptive section batching** — when a multi-section approval flow gets 2 consecutive yeses, remaining sections are batched into one approval. Configurable via `Brainstorm / section-confirmation` (`adaptive` | `per-section` | `batch`).

## Installation

```
/plugin marketplace add thomasholknielsen/claude-tweaks-marketplace
/plugin install claude-tweaks@claude-tweaks-marketplace
/plugin install superpowers@claude-plugins-official
/claude-tweaks:init
```

## How it works

```
  SKILL                      ARTIFACT                 SUPERPOWERS USED
  ─────                      ────────                 ────────────────

  capture ──────────────►  INBOX item
     │
  challenge ────────────►  Brief
     │
     │                     Design Doc          ◄───  brainstorm
     │                     (specify can invoke brainstorm directly on topic input — v4.5.0)
     │
  specify ──────────────►  Spec               (writes surface: + design-intent: frontmatter)
     │  calls: design shape (frontend only — appends Impeccable shape output to design doc)
     │                     (deletes Brief + Design Doc)
     │
  ┈┈ /claude-tweaks:flow automates below (worktree mode optional) ┈┈
     │
  build ────────────────►  Code + Journeys    ◄───  subagent-driven-development
     │  calls: design pre-build (lazy-load Impeccable references)
     │         simplify,                             executing-plans
     │         journeys                              using-git-worktrees ⚙
     ┊  (if UI changed)
  stories ──────────────►  Story YAML
     │
  test ─────────────────►  TEST_PASSED
     │  calls: design test (Impeccable detect — deterministic CLI gate)
     │
  review ───────────────►  Review Summary     ◄───  dispatching-parallel-agents
     │  calls: design review (Impeccable critique + audit — advisory)
     │         reflect,
     │         simplify,
     │         visual-review (calls: design survey — Creative Opportunities)
     │
  polish ───────────────►  Polished Code      (frontend specs only, v4.5.0)
     │  calls: design polish (auto-fit + issue-driven + intent-driven)
     │         test skip-qa  (re-verify gate, 1-cycle cap)
     │
  flow summary ─────────►  Pipeline report    (Creative Opportunities block)
     │  calls: design survey (full diff; decline tracking)
     │
  wrap-up ──────────────►  Done               ◄───  finishing-a-dev-branch ⚙
     │  calls: reflect
     │         (full)
                           (deletes Spec, plans, ledger, design caches)
```

> **Left column:** `/claude-tweaks:{name}` — **Right column:** `/superpowers:{name}` ([Superpowers plugin](https://github.com/obra/superpowers))
> **⚙** = worktree mode only — **┊** = conditional step
> `/claude-tweaks:init` runs once per project, before entering the pipeline.

## Skills

### Plan phase

**`/claude-tweaks:init`** — One-time project bootstrap. Scans the codebase, generates a CLAUDE.md with project-specific conventions and philosophy, creates workflow directories (`specs/`, `docs/plans/`, `docs/journeys/`), sets up browser integration (agent-browser), builds a documentation registry (`docs/REGISTRY.md`) mapping docs to code areas for automatic updates, and discovers existing user journeys.

**`/claude-tweaks:capture`** — Brain-dump an idea into `specs/INBOX.md`. Accepts free-text — no structure needed. Ideas are triaged later by `/claude-tweaks:tidy` or pulled into the pipeline by `/claude-tweaks:challenge`.

**`/claude-tweaks:challenge`** — Takes an INBOX item or topic and pressure-tests it before committing to an approach. Surfaces hidden assumptions, identifies risks, explores alternatives. Produces a Brief that feeds into brainstorming.

**`/superpowers:brainstorming`** *(Superpowers plugin)* — Generates solution approaches from the Brief. Explores multiple directions, evaluates tradeoffs, and produces a Design Doc with a recommended approach.

**`/claude-tweaks:specify`** — Decomposes a Design Doc into agent-sized specs with clear acceptance criteria. Each spec gets a numbered file in `specs/` with `surface:` and `design-intent:` frontmatter (v4.5.0). Detects implicit dependencies between specs (two specs touching the same files) and builds a file-to-spec map. Deletes the Brief and Design Doc after absorbing them. Uses `/superpowers:writing-plans` to structure the execution plan.

**Polymorphic input (v4.5.0):** `/specify` accepts either a design doc path (read directly) or a topic name (invokes `/superpowers:brainstorming` to produce the design doc, then continues into decomposition). When given a frontend design doc, `/specify` runs the Impeccable `shape` pre-step and asks a design-intent question (bold / quiet / minimal / delightful / onboarding / none) to populate the new frontmatter fields.

### Pipeline (automated by `/claude-tweaks:flow`)

**`/claude-tweaks:build`** — Implements a spec end-to-end. Two orthogonal choices:

| | **Current branch** | **Worktree** (default) |
|---|---|---|
| **Subagent** (default) | Fast solo work, no isolation | Isolated feature branch |
| **Batched** | Hands-on review per chunk | Full control + full isolation |

Uses `/superpowers:subagent-driven-development` and `/superpowers:executing-plans` for autonomous execution. In worktree mode, `/superpowers:using-git-worktrees` manages the isolated branch. Delegates code cleanup to `/claude-tweaks:simplify` and journey capture to `/claude-tweaks:journeys`. Updates docs matched by the documentation registry and tracks deferred items in the open items ledger.

```
/claude-tweaks:build 42                    → subagent + worktree (default)
/claude-tweaks:build 42 current-branch     → subagent + current branch (no isolation)
/claude-tweaks:build 42 batched            → human-reviewed batches + worktree
/claude-tweaks:build 42 auto               → subagent + worktree, no confirmations
```

**`/claude-tweaks:stories`** — Generates QA story YAML files by browsing your running app. Auto-detects the dev server, reads existing journey files as a skeleton, and extracts behavioral contracts from component source code (validation rules, state transitions, error paths) to generate tests that cover the full behavioral surface — not just what's visible on first render.

Stories include `source_files:` and `journey:` fields for change-aware scoping and coverage tracking. Supports auth profiles (`stories/auth.yml`), self-healing CSS selectors, and parallel orchestration across browser sessions. Auto-triggered by `/claude-tweaks:flow` when UI files changed.

**`/claude-tweaks:test`** — Mechanical "does it work?" gate. Runs types, lint, and tests from your project. In QA mode, validates story YAML files against the running app with enriched reporting — 5 finding categories (code-bug, stale-selector, ux-issue, flaky-env, story-bug), severity levels, and suggested fixes. Supports scoping by journey, tag, affected files, or retry of previous failures.

```
/claude-tweaks:test                        → standard suite (types + lint + tests)
/claude-tweaks:test qa                     → QA story validation
/claude-tweaks:test qa journey=checkout    → stories for one journey
/claude-tweaks:test all                    → full suite + QA stories
```

**`/claude-tweaks:review`** — Analytical "is it good?" gate. Gates on `/claude-tweaks:test` passing. Runs multiple review lenses in parallel — spec compliance, code quality, UX analysis. Delegates hindsight to `/claude-tweaks:reflect`, code cleanup to `/claude-tweaks:simplify`, and visual review to `/claude-tweaks:visual-review`. Detects journey regressions when changed files overlap with existing journey `files:` frontmatter. Uses `/superpowers:dispatching-parallel-agents` to fix 3+ independent issues in parallel. Every finding must be explicitly resolved — fix now, defer, or accept with reason.

| Mode | What it does |
|------|-------------|
| **code** (default) | Code review + UX analysis (when QA data available) + simplification |
| **full** (default in /flow) | Code review + visual browser review via `/visual-review` + idea generation |
| **visual** | Delegates to `/visual-review` — single page |
| **journey** | Delegates to `/visual-review` — walk a documented journey |
| **discover** | Delegates to `/visual-review` — scan and document all user journeys |

**`/claude-tweaks:wrap-up`** — Reflection and cleanup. Delegates structured reflection to `/claude-tweaks:reflect` (full mode) for knowledge capture. Routes learnings to CLAUDE.md and skill files, captures deferred work with triggers for re-activation, resolves every open ledger item. In worktree mode, uses `/superpowers:finishing-a-development-branch` to merge and clean up the feature branch. Deletes the spec, plan files, and ledger — leaving a clean slate.

### Component skills (standalone or called by lifecycle skills)

**`/claude-tweaks:reflect`** — Structured evaluation of recent work through four lenses: Surprises, Hindsight, Near-misses, and Fresh start. In **hindsight** mode (used by `/review` Step 4), focused on "should we change something before shipping?" In **full** mode (used by `/wrap-up` Step 3), broader knowledge capture. Works standalone against any recent changes.

**`/claude-tweaks:simplify`** — Code simplification via the `code-simplifier:code-simplifier` subagent. Catches unnecessary complexity from iterative development, verbose debugging patterns, and cross-file inconsistencies. Used by `/build` (Common Step 3) and `/review` (Step 5). Works standalone against any file scope.

**`/claude-tweaks:journeys`** — Creates or updates user journey documentation (`docs/journeys/`) for recently built features. Scans existing journeys for overlap, creates new journey files with persona-specific steps and "should feel" qualifiers, and updates existing journeys when builds modify their flows. Used by `/build` (Common Step 6). Works standalone.

**`/claude-tweaks:visual-review`** — Browser-based UI inspection with structured review steps: reconnaissance, first impressions, persona-based interaction, structured analysis, and creative reimagination. Three modes: **page** (single URL), **journey** (walk a documented journey testing "should feel" expectations), **discover** (scan and document all journeys in a brownfield project). Handles its own browser detection with fallback chain. Used by `/review` (Step 6). Works standalone: `/claude-tweaks:visual-review http://localhost:3000`.

### Utility skills

**`/claude-tweaks:flow`** — Automated pipeline: build → [stories →] test → review → polish → wrap-up in one command. Add `worktree` for isolated branches, `no-stories` to skip QA generation, `no-polish` to skip the polish phase entirely. Resume from any step with `/claude-tweaks:flow 42 review`. Run multiple specs sequentially (`/claude-tweaks:flow 42,45,48`) or in parallel across terminals with worktree mode.

**Polish phase (v4.5.0):** After review verdict PASS on a frontend spec, `/flow` invokes `/claude-tweaks:design polish <spec>` to dispatch Impeccable's auto-fit commands (`polish` / `clarify` / `harden`), issue-driven commands (`typeset` / `layout` / `adapt` / `optimize` when audit flagged matching findings), and intent-driven commands (`bolder` / `quieter` / `distill` / `delight`+`animate` / `onboard` per the spec's `design-intent:` frontmatter). When polish modifies code, a re-verify gate runs `/test skip-qa` (types + lint + tests, no QA) with a one-cycle cap — a re-verify failure stops the pipeline with a "Polish broke verification" failure card. Backend specs and projects without Impeccable installed skip polish cleanly.

**Pipeline summary Creative Opportunities block (v4.5.0):** Before Next Actions, `/flow` invokes `/claude-tweaks:design survey` against the full pipeline diff and renders a Creative Opportunities table when survey returns recommendations. `/flow` handles decline detection across re-runs by comparing the previous recommendations cache to the new diff and incrementing a per-spec decline counter for un-invoked recommendations; suggestions declined twice are suppressed.

**`/claude-tweaks:help`** — Dashboard with workflow status, command reference, and context-aware recommendations. Warns about dependency conflicts between in-progress specs.

**`/claude-tweaks:tidy`** — Batch backlog hygiene. Triages INBOX items, scans review/wrap-up history for recurring patterns across specs, audits the documentation registry, and recommends project-level fixes.

**`/claude-tweaks:browse`** — Browser automation via agent-browser. Defines session naming, screenshot/trace paths, and operation vocabulary used by /stories, /visual-review, and /review.

**`/claude-tweaks:research`** — Deep web research with citation-audited reports. Four runtime modes from quick (~2-5 min) to ultradeep (~20-45 min, multi-persona red-team). Built on [199-biotechnologies/claude-deep-research-skill](https://github.com/199-biotechnologies/claude-deep-research-skill) (MIT) — see `skills/research/UPSTREAM.md`.

**`/claude-tweaks:ledger`** — Query and resolve the open items ledger (`docs/plans/*-ledger.md`) that tracks findings across all pipeline phases. The ledger is a file on disk — it survives context window compression so findings from one phase aren't lost before a later phase can act on them.

**`/claude-tweaks:design`** *(v4.5.0)* — Wrapper for the [Impeccable](https://github.com/pbakaus/impeccable) frontend-design plugin. Six active modes:

- **`test`** — invoked by `/test` for the deterministic CLI gate (`npx impeccable detect`)
- **`review`** — invoked by `/review` for LLM `critique` + `audit` (advisory findings; writes audit cache for `polish`)
- **`shape`** — invoked by `/specify` on frontend design docs (runs `/impeccable shape`, output appended to design doc)
- **`pre-build`** — invoked by `/build` to lazy-load Impeccable references + project design context (`docs/design/PRODUCT.md`, `DESIGN.md` from `/impeccable teach`) into the implementer subagent
- **`polish`** — invoked by `/flow`'s polish phase to dispatch auto-fit (`polish` / `clarify` / `harden`) + issue-driven (`typeset` / `layout` / `adapt` / `optimize`) + intent-driven (`bolder` / `quieter` / `distill` / `delight`+`animate` / `onboard` per spec's `design-intent:` frontmatter) commands. **First wrapper mode that modifies code** — `/flow` follows up with the re-verify gate.
- **`survey`** — invoked by `/visual-review` (with screenshots) and `/flow`'s pipeline summary (with the full diff). Produces ranked Creative Opportunities recommendations spanning intent-driven and manual-only commands (`colorize` / `extract` / `overdrive`). Read-only — never invokes commands. Per-spec declined-recommendation tracking suppresses noise after 2 declines; reset via `/claude-tweaks:design reset-recommendations <spec>`.

The wrapper produces three independent surfacing anchors so creative commands cannot get buried: intent dispatch in polish, the Creative Opportunities block in `/visual-review`, and the Creative Opportunities block in `/flow`'s pipeline summary.

Handles 3-layer detection (kill-switch / spec frontmatter / file-extension sniff) so non-frontend specs skip cleanly. Set up by `/init` Step 0.9. Per-spec caches (`*-audit.json`, `*-recommendations.json`, `*-declined.json`) live in `docs/plans/` and are cleaned up by `/wrap-up`.

## Common workflows

```
# New repo — bootstrap and start capturing ideas
/claude-tweaks:init
/claude-tweaks:help                    # verify setup, see what's next
/claude-tweaks:capture "first feature idea"

# Full pipeline — idea to clean slate
/claude-tweaks:capture "users need meal planning"
/claude-tweaks:challenge meal planning
/superpowers:brainstorming
/claude-tweaks:specify meal planning
/claude-tweaks:flow 73

# Fast — spec already exists
/claude-tweaks:flow 42

# Resume from a specific step
/claude-tweaks:flow 42 review

# Parallel specs in separate terminals (worktree mode)
/claude-tweaks:flow 42 worktree       # Terminal 1
/claude-tweaks:flow 45 worktree       # Terminal 2
/claude-tweaks:flow 48 worktree       # Terminal 3

# Check pipeline status (navigation hub)
/claude-tweaks:help                    # what's ready, what's blocked, what's next

# Visual QA
/claude-tweaks:review 42 full
/claude-tweaks:visual-review journey:checkout-flow
/claude-tweaks:visual-review discover
```

## Dependencies

| Plugin / Tool | Source | Required |
|---------------|--------|----------|
| [Superpowers](https://github.com/obra/superpowers) | `/plugin install superpowers@claude-plugins-official` | Yes — brainstorming, planning, subagent execution, worktree management |
| agent-browser | `npm install -g agent-browser` | Optional — browser automation for /stories, /visual-review, /review qa |
| Node 18+ | brew/winget/scoop install nodejs | Yes (v4.2+) — bash filter hook, statusline. `/claude-tweaks:init` Step 0.8 offers to install via your package manager. |
| git CLI | brew/winget/apt install git | Optional — required only for the git segment in the statusline; everything else degrades gracefully. |

## Local development

```bash
claude --plugin-dir ./
```

## License

MIT
