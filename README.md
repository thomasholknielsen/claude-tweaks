# claude-tweaks

A structured workflow system for Claude Code — from idea capture through build, review, and wrap-up.

## What this does

Claude Code is powerful but unstructured. claude-tweaks adds a complete development lifecycle: capture ideas, challenge assumptions, decompose into specs, build with quality gates, and learn from what was built. Every finding is explicitly resolved — nothing silently drops.

### What's new in v4.7 — Deep web research + Diagram Design companion

**`/claude-tweaks:research`** adds citation-audited deep web research to the plugin. Four runtime modes trade depth for time:

- **quick** (~2-5 min, 5+ sources) — fast scan
- **standard** (~5-10 min, 10+ sources) — balanced default
- **deep** (~10-20 min, 15+ sources) — comprehensive synthesis with broader source pool
- **ultradeep** (~20-45 min) — multi-persona red-team with adversarial review

Vendored from [199-biotechnologies/claude-deep-research-skill](https://github.com/199-biotechnologies/claude-deep-research-skill) (MIT). See `skills/research/UPSTREAM.md` for the vendoring contract, pinned commit, modifications, and update runbook. Reports land under `.claude-tweaks/research/`.

**Diagram Design companion plugin** — a soft-hook integration with [`cathrynlavery/diagram-design`](https://github.com/cathrynlavery/diagram-design) (MIT, separately installed). Unlike Impeccable (wrapped via `/claude-tweaks:design`) or research (vendored), diagram-design has no callable surface — it's a pure-skill plugin that auto-triggers from its YAML description. claude-tweaks adds *contextual nudges* at three lifecycle moments:

- **`/specify` Step 2.5d** (new, all surfaces) — when the design doc describes state machines, schemas, multi-actor flows, decision trees, or layered architecture, the spec summary surfaces "consider a {type} diagram" with a suggested output path (`docs/diagrams/{slug}.html`). Un-gated from frontend — backend specs get architecture / ER / state diagrams too. Caps at 2 suggestions per spec.
- **`/journeys` Step 3.6** (new) — when a journey crosses 2+ personas, has 3+ named decision branches, or sequences 2+ external services, suggests the matching diagram type (swimlane / flowchart / sequence) before commit.
- **`/review` Lens 3i-diagram** (extension) — when the diff added structural complexity but `docs/diagrams/` has no matching file, emits one informational Lens 3i finding ("Visual documentation gap"). Mirrors the existing "doc-update missed" pattern.

All three hooks are gated by `diagram-integration: enabled` in CLAUDE.md, written by `/init` Phase 0.95 (always offered — not frontend-gated). Disabled / missing flag = silent no-op everywhere. claude-tweaks never invokes the plugin directly; the user accepts conversationally and diagram-design's skill auto-triggers. Shared procedure lives at `skills/_shared/diagram-integration-check.md` — flag-read, signal→type mapping (10 types), canonical phrasing, output convention.

See [CHANGELOG.md](CHANGELOG.md) for earlier release notes (v4.6, v4.5, v4.2, v4.1) and v3→v4 upgrade guidance.

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
     │                     (specify can invoke brainstorm directly on topic input)
     │
  specify ──────────────►  Spec               (writes surface: + design-intent: frontmatter)
     │  calls: design shape (frontend only — appends Impeccable shape output to design doc)
     │                     (deletes Brief + Design Doc)
     │
  ┈┈ /claude-tweaks:flow automates below (worktree mode default) ┈┈
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
  polish ───────────────►  Polished Code      (frontend specs only)
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

**`/claude-tweaks:specify`** — Decomposes a Design Doc into agent-sized specs with clear acceptance criteria. Each spec gets a numbered file in `specs/` with `surface:` and `design-intent:` frontmatter. Detects implicit dependencies between specs (two specs touching the same files) and builds a file-to-spec map. Deletes the Brief and Design Doc after absorbing them. Uses `/superpowers:writing-plans` to structure the execution plan.

**Polymorphic input:** `/specify` accepts either a design doc path (read directly) or a topic name (invokes `/superpowers:brainstorming` to produce the design doc, then continues into decomposition). When given a frontend design doc, `/specify` runs the Impeccable `shape` pre-step and asks a design-intent question (bold / quiet / minimal / delightful / onboarding / none) to populate the new frontmatter fields.

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

**`/claude-tweaks:flow`** — Automated pipeline: build → [stories →] test → review → polish → wrap-up in one command. **Runs hands-off by default (`auto` mode)** — the Pipeline Config Manifesto displays as a read-only FYI and the pipeline proceeds without an approval stop; the only user-facing stop is the Wrap-Up Review Console at the end. Pass `confirm` to inspect/override the policy levers at a Manifesto gate first, `interactive` for per-skill prompts. Defaults to worktree git strategy; pass `current-branch` to commit on the current branch instead. Add `no-stories` to skip QA generation, `no-polish` to skip the polish phase entirely. Resume from any step with `/claude-tweaks:flow 42 review`. Run multiple specs sequentially (`/claude-tweaks:flow 42,45,48`) or in parallel across terminals — each terminal gets its own isolated worktree.

**Polish phase:** After review verdict PASS on a frontend spec, `/flow` invokes `/claude-tweaks:design polish <spec>` to dispatch Impeccable's auto-fit commands (`polish` / `clarify` / `harden`), issue-driven commands (`typeset` / `layout` / `adapt` / `optimize` when audit flagged matching findings), and intent-driven commands (`bolder` / `quieter` / `distill` / `delight`+`animate` / `onboard` per the spec's `design-intent:` frontmatter). When polish modifies code, a re-verify gate runs `/test skip-qa` (types + lint + tests, no QA) with a one-cycle cap — a re-verify failure stops the pipeline with a "Polish broke verification" failure card. Backend specs and projects without Impeccable installed skip polish cleanly.

**Pipeline summary Creative Opportunities block:** Before Next Actions, `/flow` invokes `/claude-tweaks:design survey` against the full pipeline diff and renders a Creative Opportunities table when survey returns recommendations. `/flow` handles decline detection across re-runs by comparing the previous recommendations cache to the new diff and incrementing a per-spec decline counter for un-invoked recommendations; suggestions declined twice are suppressed.

**`/claude-tweaks:help`** — Dashboard with workflow status, command reference, and context-aware recommendations. Warns about dependency conflicts between in-progress specs.

**`/claude-tweaks:tidy`** — Batch backlog hygiene. Triages INBOX items, scans review/wrap-up history for recurring patterns across specs, audits the documentation registry, and recommends project-level fixes.

**`/claude-tweaks:browse`** — Browser automation via agent-browser. Defines session naming, screenshot/trace paths, and operation vocabulary used by /stories, /visual-review, and /review.

**`/claude-tweaks:research`** — Deep web research with citation-audited reports. Four runtime modes from quick (~2-5 min) to ultradeep (~20-45 min, multi-persona red-team). Built on [199-biotechnologies/claude-deep-research-skill](https://github.com/199-biotechnologies/claude-deep-research-skill) (MIT) — see `skills/research/UPSTREAM.md`.

**`/claude-tweaks:ledger`** — Query and resolve the open items ledger (`docs/plans/*-ledger.md`) that tracks findings across all pipeline phases. The ledger is a file on disk — it survives context window compression so findings from one phase aren't lost before a later phase can act on them.

**`/claude-tweaks:version`** — Reports the installed claude-tweaks plugin version (read from `.claude-plugin/plugin.json`). Useful for verifying the marketplace install picked up the right version.

**`/claude-tweaks:design`** — Wrapper for the [Impeccable](https://github.com/pbakaus/impeccable) frontend-design plugin. Six active modes:

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

## Configuration

### Worktree base ref (important for worktree mode)

claude-tweaks branches each worktree from your **current local HEAD** — the branch you ran `/build` or `/flow` on, including any merged specs or in-progress integration commits. The native `EnterWorktree` tool has no base-ref parameter, so the base is decided by the harness setting `worktree.baseRef`:

```json
// settings.json
{ "worktree": { "baseRef": "head" } }
```

The harness **default is `fresh`**, which branches from `origin/<default-branch>`. On a project whose integration branch is local and ahead of the remote default (e.g. a long-lived `dev`), `fresh` silently branches from a **stale** commit, and your work lands on the wrong base. Set `baseRef: "head"`. As a safety net, `/build` Common Step 1 verifies the worktree's actual base immediately after creation and stops if it doesn't match your HEAD.

## Local development

```bash
claude --plugin-dir ./
```

## License

MIT
