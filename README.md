# claude-tweaks

A structured workflow system for Claude Code — from idea capture through build, review, and wrap-up.

## What this does

Claude Code is powerful but unstructured. claude-tweaks adds a complete development lifecycle: capture ideas, challenge assumptions, decompose into specs, build with quality gates, and learn from what was built. Every finding is explicitly resolved — nothing silently drops.

### What's new in v6.7.0 — Fast-lane pipeline profile

A new `ceremony-profile` Manifesto lever (fed by `/claude-tweaks:assess-agent-autonomy`'s new
`ceremony-check` mode, judged once per record at materialize time) lets small, clean records
skip proportionate ceremony — a lighter `/claude-tweaks:reflect` mode, narrower build audits,
and a smaller wrap-up skill-curation scan — while a Safety-regression finding still trips an
escape hatch back to full depth for the rest of the run. See
`docs/superpowers/specs/2026-07-15-fast-lane-pipeline-profile-design.md`.

### What's new in v6.5.0 — Demo walkthrough redesign

`/claude-tweaks:demo`'s Verification Brief is now a self-contained digest instead of a pointer to
re-run another skill — vision/why, what shipped, and confirmed evidence (visual-review's result +
up to 3 committed screenshots, or a code-review digest + diff for non-UI work). `/wrap-up` gains a
safety-net gate that triggers a real visual-review pass before `demo:pending` is ever applied, for
the one path (`/review` outside `full` mode) where one might not have already run.
`/claude-tweaks:demo`'s verdict prompt reframes around vision/fit ("Does this do what you asked
for?") and gains an on-demand "Show me live" option for a live look via `agent-browser`.

### What's new in v6.4.0 — Unattended tier: fewer clicks in `auto` mode

A new opt-in policy lever, `unattended-tier` (off by default), lets three narrow, low-stakes
decision points — floor-clearing ledger residue, queue-write record creation, and ops-item
acknowledgment — resolve without a live click, everywhere `auto`/`hybrid` mode runs (headless
`/claude-tweaks:dispatch` firings or local `/claude-tweaks:flow` runs alike). Every action is
still logged to `decisions.md` and rolled into one consolidated push notification; HARD-GATEs,
merge conflicts, and every `Fix anyway`/`Accept`/`Drop` ledger disposition stay fully
human-gated regardless of the lever's state. See `skills/_shared/unattended-tier.md`.

### What's new in v6.3.0 — Human acceptance sign-off (`/claude-tweaks:demo`)

A new seventh work-record axis (`demo:pending` / `demo:approved` / `demo:changes-requested`)
closes the gap between tests passing, spec completion, and an actual human verifying a built
feature does what was asked. `/claude-tweaks:wrap-up` applies `demo:pending` and writes a
Verification Brief (what changed, why, how to verify) while it still has full build context;
the new `/claude-tweaks:demo` skill aggregates every pending record — across parallel threads,
regardless of merge timing — and captures your verdict.

### What's new in v6.0.0 — The unified work record

Every captured idea, health-skill finding, and human-filed issue is now the same thing: **one durable work record** (a GitHub issue, or its `local-files` twin — a plain markdown file), tracked through a single spine instead of the old two-file backlog design and per-artifact frontmatter:

```
BACKLOG ──/specify shapes──► READY ──human grants──► AUTHORIZED ──/dispatch claims──► BUILDING ──user merges──► CLOSED
```

with `parked` (on hold, wakes on a trigger) and not-planned (wontfix/duplicate/absorbed) exits at any stage. Two storage drivers back the same taxonomy — `work-backend: github-issues` (labels + native Issue Types) or `work-backend: local-files` (frontmatter on a tracked file) — set once by `/init`, read identically by every consumer skill. See "Work Records" below and `skills/_shared/work-record.md` for the full contract.

Human-granted `auto:build`/`auto:merge` labels replace the retired `tier:approved`/`tier:fast-track`/`tier:needs-review` three-way split — `/claude-tweaks:triage` is now the interactive grant gate only. A new skill, **`/claude-tweaks:dispatch`**, is the queue consumer: it claims an authorized record's whole file-overlap group and hands it to `/flow` — the `triage dispatch` headless subcommand no longer exists.

`/claude-tweaks:specify` and `/claude-tweaks:build`/`/flow` now **materialize** a record reference (`#N`) into a build-time header + spec-shaped body file rather than requiring a pre-existing numbered spec file — the legacy `specs/{n}-*.md` path still works as an alias for projects that haven't migrated. `/claude-tweaks:tidy` and `/claude-tweaks:help` scan the live record queue directly; the former INBOX scan, Deferred-Work scan, and the separate spec index they used to read are retired.

See "Migrating from 5.x" below if this project still carries pre-6.0 state (live `tier:*`/`status:*` labels, `specs/backlog/` files, or the old `backlog-backend` flag name).

### What's new in v5.27.0 — Native diagram generation replaces the Diagram Design companion

**`/claude-tweaks:visualize`** replaces the external `diagram-design` companion-plugin integration introduced in v4.7 with a fully native skill — no separate plugin install. It generates self-contained HTML+SVG diagrams (architecture, flowchart, sequence, state, ER, timeline, swimlane, quadrant, nested, tree, org chart, layers, venn, pyramid), themed from the project's own `DESIGN.md` tokens (or a neutral default skin when Impeccable isn't set up). An optional D2-backed enhanced rendering path handles diagrams-as-code source generation for types with a native D2 construct. The same three soft-hook call sites — `/journeys` Step 3.6, `/specify` Step 2.5d, `/review` Lens 3i-diagram — now suggest invoking it directly, gated by `diagram-suggestions: enabled` in CLAUDE.md (renamed from `diagram-integration:`), written by `/init` Step 11. Diagrams co-locate with what they illustrate (`docs/journeys/`, `docs/plans/`) rather than a single central folder; `docs/diagrams/` is the fallback for context-free, direct invocations.

### What's new in v5.18.0 — shadcn/ui bootstrap + Phase 0 step renumbering

`/init` gains a new Optional Enhancement step: on a detected frontend project without `components.json`, it offers to bootstrap [shadcn/ui](https://ui.shadcn.com/) — CLI init, plus wiring shadcn's own first-party MCP server into `.mcp.json` and installing shadcn's official Skill (`skills add shadcn/ui`), both of which give Claude Code live project context so it stops guessing at component APIs. Writes a `shadcn-integration: enabled | cli-only | disabled` flag to CLAUDE.md's `## Design integration` section (currently write-only — no other skill reads it yet). See `/init` Step 12.

Also folded in: Phase 0's internal step numbering (previously `Step 0.1`–`Step 0.97`, an ad-hoc decimal scheme approaching its practical ceiling) is now two clean sequential groups — Core Bootstrap (Steps 1–8) and Optional Enhancements (Steps 9–14, order-agnostic and append-only). Every cross-reference in this README and the plugin's skill files has been updated to match.

### What's new in v5.15.0 — code-health: risk-based triage + closing-keyword safety net

`/claude-tweaks:recon` is renamed to `/claude-tweaks:code-health` (bare rename, no migration shim — the fingerprint-marker convention this rename introduced has since been unified into the single `work-fingerprint` marker every filing skill writes; see `skills/_shared/work-record.md`'s Fingerprint marker section). Findings now carry a `likelihood` and `effort` alongside `severity`; a new deterministic helper (`bin/lib/code-health/risk.js`) computes a `risk` tier (`severity × likelihood`, product-bucketed) the same way `dedup.js#decide()` already computes decisions — never LLM-judged. GitHub labels move from `code-health:{severity}` to `code-health:risk-{tier}` + `code-health:effort-{tier}` (criterion labels are kept, now with real descriptions); filing and CI gates move from `--min-severity`/`--fail-on critical` to `--min-risk`/`--fail-on risk-high`. Downstream, `/build` reads the `code-health-effort:` frontmatter to pick its implementer's model tier. (The `/flow --from-code-health`/`--quick-wins` batch-selection flags described here at v5.15.0 were later removed — issue selection and dispatch now live in `/claude-tweaks:triage` (grants authorization) and `/claude-tweaks:dispatch` (claims and executes), both described above; `/flow` itself never selects records.) Separately, a new harness-wide PostToolUse hook (warn tier, not gated on a resolved pipeline run) flags any commit that references a bare `#N` issue number without an immediately-preceding GitHub closing keyword — catching ad hoc fix commits that would otherwise silently leave the issue open.

### What's new in v5.1.0 — Hook surface: pipeline continuity + working-directory enforcement

A dispatcher-based hook surface (`bin/hooks.js`, registered via `hooks/hooks.json`) adds two things with no skill-level opt-in required:

- **Pipeline-run continuity across sessions and compaction** — SessionStart/SessionEnd/PreCompact hooks track the active pipeline run and re-surface it after a session restart or context compaction.
- **Mechanical working-directory enforcement during worktree runs** — PreToolUse/PostToolUse/SubagentStop hooks deny commits that land in the wrong checkout (scoped since v5.1.1 to the session that owns the run — commits from other sessions are allowed with a warning), log commit breadcrumbs, and flag Subagent Contract status-line violations.

Near-inert outside pipeline runs: SessionStart's dependency check always runs regardless of a resolved run directory, and each matched git command pays a ~30ms no-op spawn to check for one. With no run directory, there is no state to write or enforce — except three deliberate, run-independent exceptions added since this hook surface first shipped: a PostToolUse check warns (non-blocking) whenever a commit references a bare issue number without a recognized GitHub closing keyword immediately before it, since that gap matters most for ad hoc fix commits made outside any pipeline run; the `worktree.always` PreToolUse policy gate blocks Edit/Write/NotebookEdit/commit outside an isolated worktree, since its job is to require one even before any pipeline run exists; and a PostToolUse check warns on any write to a `docs/superpowers/specs/*-design.md` brainstorming artifact, since a session that hasn't reached `/specify` yet has no pipeline run to gate on either. See CLAUDE.md Conventions → Hooks for the full contract.

### What's new in v5.0.0 — Code-health v2: LLM-as-judge + scheduled Routine

Code-health v2 replaces the v1 mechanical-lens spine with an LLM-as-judge model: the LLM evaluates the repo against a criteria catalog, calling deterministic tool checks as evidence. Area-type routing, content-hash skip, hotspot priority, fingerprinting, and dedup are handled by deterministic helpers. The v1 subagent dance and `plan-judgment` / `ingest-judgment` phases are removed. Code-health now runs as a scheduled Routine for continuous, hands-off coverage — no manual invocation needed.

### What's new in v4.7 — Deep web research + Diagram Design companion

**`/claude-tweaks:research`** adds citation-audited deep web research to the plugin. Four runtime modes trade depth for time:

- **quick** (~2-5 min, 5+ sources) — fast scan
- **standard** (~5-10 min, 10+ sources) — balanced default
- **deep** (~10-20 min, 15+ sources) — comprehensive synthesis with broader source pool
- **ultradeep** (~20-45 min) — multi-persona red-team with adversarial review

As of v4.15.0 this delegates to Claude Code's built-in `/deep-research` Dynamic Workflow when available, with a lean inline fallback otherwise. Reports land under `.claude-tweaks/research/`.

**`/claude-tweaks:visualize`** — native diagram generation, replacing the former `diagram-design` companion-plugin integration. Generates self-contained HTML+SVG diagrams (architecture, flowchart, sequence, state, ER, timeline, swimlane, quadrant, nested, tree, org chart, layers, venn, pyramid), themed from the project's own `DESIGN.md` tokens (or a neutral default skin when Impeccable isn't set up), with an optional D2-backed enhanced rendering path. Soft-hook nudges in `/journeys` Step 3.6, `/specify` Step 2.5d, and `/review` Lens 3i-diagram suggest invoking it — gated by `diagram-suggestions: enabled` in CLAUDE.md, written by `/init` Step 11. Diagrams co-locate with what they illustrate (`docs/journeys/`, `docs/plans/`) rather than a single central folder; `docs/diagrams/` is the fallback for context-free, direct invocations.

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

  capture ──────────────►  Backlog record
     │
  challenge ────────────►  Brief
     │
     │                     Design Doc          ◄───  brainstorm
     │                     (specify can invoke brainstorm directly on topic input)
     │
  specify ──────────────►  Ready record(s)    (writes surface: + design-intent: body metadata)
     │  calls: design shape (frontend only — appends Impeccable shape output to design doc)
     │  calls: visualize (diagram suggestion, all surfaces)
     │                     (deletes Brief + Design Doc)
     │
  ┈┈ /claude-tweaks:triage grants, /claude-tweaks:dispatch claims (utility skills, no fixed position) ┈┈
     │
  ┈┈ /claude-tweaks:flow automates below (worktree mode default) ┈┈
     │
  build ────────────────►  Code + Journeys    ◄───  subagent-driven-development
     │  calls: design pre-build (lazy-load Impeccable references)
     │         simplify,                             executing-plans
     │         journeys                              using-git-worktrees ⚙
     │           calls: visualize (diagram suggestion)
     ┊  (if UI changed)
  stories ──────────────►  Story YAML
     │
  test ─────────────────►  TEST_PASSED
     │  calls: design test (Impeccable detect — deterministic CLI gate)
     │
  review ───────────────►  Review Summary     ◄───  dispatching-parallel-agents
     │  calls: design review (Impeccable critique + audit — advisory)
     │         visualize (diagram gap finding — Lens 3i-diagram),
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
                           (deletes plans, ledger, design caches; legacy spec file
                            deleted too — a record-mode build's materialized file
                            stays on the branch as committed audit trail instead;
                            applies demo:pending + posts a Verification Brief on
                            the record — record mode only)
     │
  ┈┈ /claude-tweaks:demo resolves demo:pending → approved/changes-requested (utility skill, no fixed position — run anytime, aggregates every in-flight thread) ┈┈
```

> **Left column:** `/claude-tweaks:{name}` — **Right column:** `/superpowers:{name}` ([Superpowers plugin](https://github.com/obra/superpowers))
> **⚙** = worktree mode only — **┊** = conditional step
> `/claude-tweaks:init` runs once per project, before entering the pipeline.

## Work Records

Every unit of work — a captured idea, a health-skill finding, or a human-filed issue — is the same thing underneath: a **work record**, tracked through one spine regardless of who filed it:

```
BACKLOG ──/specify shapes──► READY ──human grants──► AUTHORIZED ──/dispatch claims──► BUILDING ──user merges──► CLOSED
```

- **backlog** — the default state: no stage label. `/claude-tweaks:capture` files here; health-skill records skip straight to `ready` instead (the born-ready rule — their output is spec-shaped by construction).
- **ready** — spec-shaped and agent-sized. `/claude-tweaks:specify` gets a record here, either by shaping it in place or by decomposing a design doc into a parent record plus ready leaves.
- **authorized** — carries a human-granted `auto:build` (optionally `+ auto:merge`). `/claude-tweaks:triage` is the interactive gate that grants this — machinery can only strip or downgrade a grant, never originate one.
- **building** — an agent holds the claim. `/claude-tweaks:dispatch` claims an authorized record's whole file-overlap group and hands it to `/claude-tweaks:flow`.
- **closed** — completed via your own merge (close-via-merge — the pipeline never runs `gh issue close`), or not-planned (wontfix, duplicate, absorbed into another record).

A record can also **park** at any pre-authorized stage (on hold, with a wake trigger — a date or a watched file path) via `/claude-tweaks:tidy`'s Defer action, and can close as not-planned at any point.

Two storage drivers back the same taxonomy, set once by `/claude-tweaks:init` and read identically by every consumer skill:

| Driver | Where a record lives | Notes |
|---|---|---|
| `work-backend: github-issues` | A GitHub issue | Labels express stage/scoring/grants/bot-state; native GitHub Issue Types or `type:*` labels express Type. Headless dispatch (`/claude-tweaks:dispatch`) requires this driver — GitHub's RBAC is the mechanism the authorization model depends on. |
| `work-backend: local-files` | `specs/{id}-{slug}.md`, one file per record | Frontmatter expresses the same facets for isomorphism. `/claude-tweaks:triage`'s grants are recorded but have no headless consumer — run `/claude-tweaks:flow`/`/claude-tweaks:build` manually against a chosen record instead. |

See `skills/_shared/work-record.md` for the full seven-axis contract (Type, Origin, Scoring, Stage, Authorization, Bot state, Acceptance), the complete label taxonomy, and the permission matrix governing which skill may add or remove which label.

## Skills

### Plan phase

**`/claude-tweaks:init`** — One-time project bootstrap. Scans the codebase, generates a CLAUDE.md with project-specific conventions and philosophy, creates workflow directories (`specs/`, `docs/plans/`, `docs/journeys/`), sets up browser integration (agent-browser), builds a documentation registry (`docs/REGISTRY.md`) mapping docs to code areas for automatic updates, and discovers existing user journeys.

**`/claude-tweaks:capture`** — Brain-dump an idea into a new backlog work record (a GitHub issue carrying only `by:capture`, or a local `specs/{id}-{slug}.md` file — no stage label, per `work-backend`). Accepts free-text — no structure needed. Ideas are triaged later by `/claude-tweaks:tidy` or pulled into the pipeline by `/claude-tweaks:challenge`.

**`/claude-tweaks:challenge`** — Takes a backlog work record or topic and pressure-tests it before committing to an approach. Surfaces hidden assumptions, identifies risks, explores alternatives. Produces a Brief that feeds into brainstorming.

**`/superpowers:brainstorming`** *(Superpowers plugin)* — Generates solution approaches from the Brief. Explores multiple directions, evaluates tradeoffs, and produces a Design Doc with a recommended approach.

**`/claude-tweaks:specify`** — Shapes a single work record into spec shape (adds `ready` plus risk/effort scoring), or decomposes a Design Doc into a parent record plus agent-sized `ready` leaf records with clear acceptance criteria. Each record carries `Surface:`/`Design-intent:` body metadata (not frontmatter — plain text lines at the top of the body). Detects implicit dependencies between leaves (and against open records) that touch the same files and links them (`Blocked by #N`, or a native sub-issue/dependency edge under `work-links: native`). Deletes the Brief and Design Doc after absorbing them into the surviving records. Uses `/superpowers:writing-plans` to structure the execution plan.

**Polymorphic input:** `/specify` accepts a work record reference (`#N`, an issue URL, or a local record id) to shape in place, a design doc path or topic name (invokes `/superpowers:brainstorming` when no doc exists yet) to decompose, or a backlog reference (title keywords) that resolves to whichever mode applies. When the target is (or becomes) a frontend record, `/specify` runs the Impeccable `shape` pre-step and asks a design-intent question (bold / quiet / minimal / delightful / onboarding / none) to populate the body metadata.

### Pipeline (automated by `/claude-tweaks:flow`)

**`/claude-tweaks:build`** — Implements a work record or spec end-to-end (`#N` record reference is the primary input; a spec number is the legacy alias — both materialize into the same build-time file via `skills/flow/materialize.md`). Two orthogonal choices:

| | **Current branch** | **Worktree** (default) |
|---|---|---|
| **Subagent** (default) | Fast solo work, no isolation | Isolated feature branch |
| **Batched** | Hands-on review per chunk | Full control + full isolation |

Uses `/superpowers:subagent-driven-development` and `/superpowers:executing-plans` for autonomous execution. In worktree mode, `/superpowers:using-git-worktrees` manages the isolated branch. Delegates code cleanup to `/claude-tweaks:simplify` and journey capture to `/claude-tweaks:journeys`. When a behavioral bug surfaces during verification, delegates to `/superpowers:systematic-debugging` — reproduce on command first, then fix the confirmed cause (no edit-and-pray). Updates docs matched by the documentation registry and tracks deferred items in the open items ledger.

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

**`/claude-tweaks:review`** — Analytical "is it good?" gate. Gates on `/claude-tweaks:test` passing. Runs multiple review lenses in parallel — spec compliance, code quality, UX analysis. Delegates hindsight to `/claude-tweaks:reflect`, code cleanup to `/claude-tweaks:simplify`, and visual review to `/claude-tweaks:visual-review`. The architecture lens flags shallow modules and surfaces `/claude-tweaks:deepen` for a dedicated depth pass; confirmed bug fixes route through `/superpowers:systematic-debugging` (reproduce first). Detects journey regressions when changed files overlap with existing journey `files:` frontmatter. Uses `/superpowers:dispatching-parallel-agents` to fix 3+ independent issues in parallel. Every finding must be explicitly resolved — fix now, defer, or accept with reason.

| Mode | What it does |
|------|-------------|
| **code** (default) | Code review + UX analysis (when QA data available) + simplification |
| **full** (default in /flow) | Code review + visual browser review via `/visual-review` + idea generation |
| **visual** | Delegates to `/visual-review` — single page |
| **journey** | Delegates to `/visual-review` — walk a documented journey |
| **discover** | Delegates to `/visual-review` — scan and document all user journeys |

**`/claude-tweaks:wrap-up`** — Reflection and cleanup. Delegates structured reflection to `/claude-tweaks:reflect` (full mode) for knowledge capture. Routes learnings to CLAUDE.md and skill files, records significant decisions as ADRs in `docs/decisions/` when they pass a 3-factor gate (hard-to-reverse, surprising, a real trade-off — kept deliberately rare), captures deferred work with triggers for re-activation, resolves every open ledger item. In worktree mode, uses `/superpowers:finishing-a-development-branch` to merge and clean up the feature branch. Deletes plan files and the ledger — leaving a clean slate. A legacy spec file is deleted too; a record-mode build's materialized file (`{run-dir}/work/{n}-spec.md`) stays on the branch as committed audit trail instead.

### Component skills (standalone or called by lifecycle skills)

**`/claude-tweaks:reflect`** — Structured evaluation of recent work through four lenses: Surprises, Hindsight, Near-misses, and Fresh start. In **hindsight** mode (used by `/review` Step 4), focused on "should we change something before shipping?" In **full** mode (used by `/wrap-up` Step 3), broader knowledge capture. Works standalone against any recent changes.

**`/claude-tweaks:simplify`** — Code simplification via the `code-simplifier:code-simplifier` subagent. Catches unnecessary complexity from iterative development, verbose debugging patterns, and cross-file inconsistencies. Used by `/build` (Common Step 3) and `/review` (Step 5). Works standalone against any file scope.

**`/claude-tweaks:deepen`** — Architectural depth pass at the module level (where `/simplify` works at the line level). Finds shallow modules — interfaces nearly as complex as their implementation — using a leverage-based depth model (not a line ratio) and the deletion test ("would removing this concentrate complexity, or just move it?"). Presents deepening/collapse candidates ranked by leverage in a two-stage flow: candidates first, then a focused interface conversation only for the ones you pick — never a runaway rewrite. Classifies dependencies (pure / local stand-in / network-boundary → port + adapter) to keep the deepened module testable. Surfaced as a Next Action by `/review` (lens 3e) and `/reflect` (structural-debt lens); run it standalone every few days to catch architecture entropy. In `auto` mode it stages candidates rather than refactoring.

**`/claude-tweaks:journeys`** — Creates or updates user journey documentation (`docs/journeys/`) for recently built features. Scans existing journeys for overlap, creates new journey files with persona-specific steps and "should feel" qualifiers, and updates existing journeys when builds modify their flows. Used by `/build` (Common Step 6). Works standalone.

**`/claude-tweaks:visual-review`** — Browser-based UI inspection with structured review steps: reconnaissance, first impressions, persona-based interaction, structured analysis, and creative reimagination. Three modes: **page** (single URL), **journey** (walk a documented journey testing "should feel" expectations), **discover** (scan and document all journeys in a brownfield project). Handles its own browser detection with fallback chain. Used by `/review` (Step 6). Works standalone: `/claude-tweaks:visual-review http://localhost:3000`.

**`/claude-tweaks:visualize`** — Generates a themed, project-local visual diagram (architecture, flowchart, sequence, state, ER, timeline, swimlane, quadrant, nested, tree, org chart, layer stack, venn, pyramid) as a self-contained HTML+SVG file, styled from the project's own `DESIGN.md` tokens (or a neutral default skin when Impeccable isn't set up). An optional D2-backed enhanced rendering path handles diagram types with a native D2 construct. Soft-hook nudges in `/journeys` Step 3.6, `/specify` Step 2.5d, and `/review` Lens 3i-diagram suggest invoking it — gated by `diagram-suggestions: enabled` in CLAUDE.md, written by `/init` Step 11. Diagrams co-locate with what they illustrate (`docs/journeys/`, `docs/plans/`) rather than a single central folder; `docs/diagrams/` is the fallback for context-free, direct invocations. Works standalone: `/claude-tweaks:visualize`.

**`/claude-tweaks:assess-agent-autonomy`** — Content-aware trust and ceremony-depth verdicts replacing mechanical label lookups. Four modes: **grant-check** (informs `/triage`'s Step 2 recommendation, reading a record's actual body content rather than just its risk/effort labels), **merge-check** (replaces `/dispatch`'s Auto-merge gate — weighs diff content, review findings, and a test-exclusion-aware blast-radius summary holistically instead of a hard line-count cutoff), **failure-check** (replaces `/dispatch`'s blanket failure-revocation rule — classifies a failure as correctness/transient/ambiguous so a flaky test or infrastructure hiccup no longer permanently strips merge trust), and **ceremony-check** (informs `/flow`'s materialization step of how much wrap-up ceremony a record's actual content deserves, independent of merge trust). Invoked inline by its callers, never directly by a human.

### Utility skills

**`/claude-tweaks:flow`** — Automated pipeline: build → [stories →] test → review → polish → wrap-up in one command. **Runs hands-off by default (`auto` mode)** — the Pipeline Config Manifesto displays as a read-only FYI and the pipeline proceeds without an approval stop; the only user-facing stop is the Wrap-Up Review Console at the end. Pass `confirm` to inspect/override the policy levers at a Manifesto gate first, `interactive` for per-skill prompts. Defaults to worktree git strategy; pass `current-branch` to commit on the current branch instead. Add `no-stories` to skip QA generation, `no-polish` to skip the polish phase entirely, `no-deepen` to skip the end-of-run depth survey. At the Pipeline Summary, flow runs `/claude-tweaks:deepen`'s read-only analysis and surfaces shallow-module candidates as a **Depth Opportunities** recommendation block — it never refactors module interfaces in a hands-off run (architecture is low-reversibility; you run `/deepen` deliberately to act). Resume from any step with `/claude-tweaks:flow 42 review`. Run multiple specs sequentially (`/claude-tweaks:flow 42,45,48`) or in parallel across terminals — each terminal gets its own isolated worktree.

**Polish phase:** After review verdict PASS on a frontend spec, `/flow` invokes `/claude-tweaks:design-wrapper polish <spec>` to dispatch Impeccable's auto-fit commands (`polish` / `clarify` / `harden`), issue-driven commands (`typeset` / `layout` / `adapt` / `optimize` when audit flagged matching findings), and intent-driven commands (`bolder` / `quieter` / `distill` / `delight`+`animate` / `onboard` per the spec's `design-intent:` frontmatter). When polish modifies code, a re-verify gate runs `/test skip-qa` (types + lint + tests, no QA) with a one-cycle cap — a re-verify failure stops the pipeline with a "Polish broke verification" failure card. Backend specs and projects without Impeccable installed skip polish cleanly.

**Pipeline summary Creative Opportunities block:** Before Next Actions, `/flow` invokes `/claude-tweaks:design-wrapper survey` against the full pipeline diff and renders a Creative Opportunities table when survey returns recommendations. `/flow` handles decline detection across re-runs by comparing the previous recommendations cache to the new diff and incrementing a per-spec decline counter for un-invoked recommendations; suggestions declined twice are suppressed.

**`/claude-tweaks:help`** — Dashboard with workflow status, command reference, and context-aware recommendations. Warns about dependency conflicts between in-progress specs. Surfaces the current branch's open PR (review decision, CI checks, unresolved threads) and ranks blocked-PR work first in recommendations.

**`/claude-tweaks:tidy`** — Batch backlog hygiene. Scans the live work-record queue (backlog, parked, unsynced, unscored `ready`, `bot:blocked`, legacy-taxonomy records), scans review/wrap-up history for recurring patterns across specs, audits the documentation registry, and recommends project-level fixes. Also audits GitHub state — stale open PRs, code-health/harness-health/journey-health/docs-health-filed issues, addressed-but-unresolved review threads — with GitHub mutations (close, resolve) executing only after batch approval. Pass `--scope=<name>[,<name>...]` to narrow a run to specific scan steps (e.g. `--scope=github` for GitHub PR/issue triage only) instead of the full sweep.

**`/claude-tweaks:demo`** — The durable, cross-thread acceptance gate: aggregates every record `/claude-tweaks:wrap-up` has labeled `demo:pending` (open or closed — covers already-merged `auto:merge` work too), replays the Verification Brief `/wrap-up` wrote at build time so you never re-derive "how do I test this," and captures a real human verdict distinct from tests passing (`/test`) or code-quality review (`/review`). Approve resolves to `demo:approved`; requesting changes resolves to `demo:changes-requested` and files a linked follow-up backlog record. Bare `/demo` sweeps everything pending; `/demo #N` scopes to one record.

**`/claude-tweaks:browse`** — Browser automation via agent-browser. Defines session naming, screenshot/trace paths, and operation vocabulary used by /stories, /visual-review, and /review.

**`/claude-tweaks:research`** — Deep web research with citation-audited reports. Four runtime modes from quick (~2-5 min) to ultradeep (~20-45 min, multi-persona red-team). Delegates to Claude Code's built-in `/deep-research` Dynamic Workflow when available; falls back to a lean inline method otherwise. Reports land under `.claude-tweaks/research/`.

**`/claude-tweaks:ledger`** — Query and resolve the open items ledger (`docs/plans/*-ledger.md`) that tracks findings across all pipeline phases. The ledger is a file on disk — it survives context window compression so findings from one phase aren't lost before a later phase can act on them.

**`/claude-tweaks:version`** — Reports the installed claude-tweaks plugin version (read from `.claude-plugin/plugin.json`). Useful for verifying the marketplace install picked up the right version.

**`/claude-tweaks:code-health`** — Proactive, report-only repo-improvement finder. An LLM judges the repo against a criteria catalog, calling deterministic tool checks as evidence. Deterministic helpers handle scope rotation, content-hash skip (unchanged areas are skipped), fingerprinting, dedup against open GitHub issues, and issue filing. Workflow: SCOPE → CLASSIFY → JUDGE → validate-findings → file issues. Never edits code. Filed records are spec-shaped and born `ready` by construction — they skip `/specify` entirely and promote into agent-sized work with near-zero translation. Runs on a scheduled Routine for continuous coverage. Merged records close their issues through your own merge action — `Fixes #N` lines ride the merge commit or PR body; the pipeline never closes issues directly. Any records code-health files feed into `/claude-tweaks:triage`'s `ready` queue, which grants `auto:build`/`auto:merge` for autonomous building; `/claude-tweaks:dispatch` then claims (via atomic `refs/claims/issue-{N}` ref creation, so concurrent consumers — a scheduled routine, a second machine, a collaborator's agent — never double-build) and hands each authorized group to `/flow` — `/flow` itself never selects records. Stale claims (crashed runs) are swept by `/tidy`. `/init` offers a GitHub issue form so human-filed issues arrive pipeline-ready. For projects that land fixes on an integration branch before the default branch, `/init` also offers a companion GitHub Actions workflow that labels and comments on the affected issues until the fix reaches default and GitHub's native close fires.

**`/claude-tweaks:triage`** — The interactive human gate over the `ready` queue. Always interactive — no headless or argument-driven mode. Pulls ungranted `ready` records, gets a content-aware recommendation from `/claude-tweaks:assess-agent-autonomy`'s `grant-check` mode (reads the record's actual body, not just its risk/effort labels), re-verifies spec shape before granting (a `ready` label alone never authorizes — the gate re-fetches the body), and applies the grant after a single batch confirm — a human always executes the actual label write, even when the recommendation is accepted as-is. A record that hit its retry ceiling (`bot:blocked`) surfaces here as a re-authorization candidate. Triage only ever grants, strips, or flags a record back for re-shaping — it never claims, builds, or dispatches anything itself.

**`/claude-tweaks:review-backlog`** — Understand and prioritize the open work-record backlog. A two-lane pipeline: mechanical label filtering (`critical`/`risk-value`/`cleanup` modes) over already-scored records scales to any backlog size; a bounded LLM synthesis pass (default 40 records per run) covers only unscored records, producing thematic clusters, `priority:*` suggestions, and detected `**Related:**` cross-references — both applied via the same human batch-confirm pattern `/claude-tweaks:triage` uses for grants. Folds in `unsynced: true` local fallback records (surfacing, never fixing them — that stays `/claude-tweaks:tidy`'s job). Never shapes bodies, stamps `risk:*`/`effort:*`, or grants/claims anything.

**`/claude-tweaks:dispatch`** — The queue consumer between the gate and the executor: select → claim (whole file-overlap group, via atomic `refs/claims/issue-{N}` ref creation — the same lock code-health's fingerprinting relies on, so concurrent consumers never double-build) → invoke `/flow` → settle. Bare `/dispatch` is an interactive batch pick over the authorized queue; `dispatch next` is the headless-safe single-group form a scheduled Routine fires; `dispatch #N` claims a specific record's whole group directly; `dispatch #N,#M,...` claims exactly the named records' groups (e.g. handed off by `/claude-tweaks:triage`'s Next Actions after a grant). A group whose members all carry `auto:merge` merges without waiting for a live approval when `/claude-tweaks:assess-agent-autonomy`'s `merge-check` mode verdicts `auto-merge` for every member (weighing diff content, review findings, and blast radius holistically — not a fixed mechanical cutoff); anything less falls back to the normal wait. A failed build's effect on `auto:merge` depends on `failure-check`'s classification: `correctness`/`ambiguous` revokes it (no repeat unsupervised attempt), `transient` preserves it. After a configurable retry ceiling, all `auto:*` grants are stripped and `bot:blocked` flags for a human to re-triage. Dispatch may only downgrade or strip a grant it reads — it never originates authorization from nothing; only `/claude-tweaks:triage` grants.

For the full picture of how a work record moves through filing → shaping → authorization → dispatch → build → close → sweep, see [`docs/diagrams/github-issues-lifecycle.html`](docs/diagrams/github-issues-lifecycle.html) (architecture diagram) and [`docs/github-issues-integration-review.md`](docs/github-issues-integration-review.md) (2026-07-11 audit of the pre-unification system — 5 high-severity and 18 medium-severity findings, prioritized).

**`/claude-tweaks:routine`** — Instantiates a skill's plugin-shipped routine template (e.g. code-health's) into a live Claude Code cloud Routine for the current project, resolving account- and project-specific values (environment, repo) that a portable template can't hardcode, then calling `RemoteTrigger` directly — no manual `/schedule` walkthrough needed. Writes a committable instantiated record to `.claude-tweaks/routines/`. Supports `create`, `update`, and `status`, plus `--variant=<name>` to target a named template variant (e.g. tidy's `github-triage`) and `--dry-run` to inspect the assembled configuration before anything is created.

**`/claude-tweaks:harness-health`** — Recurring health check for `.claude/skills/*.md`, `.claude/rules/*.md`, and CLAUDE.md: picks one target to audit against the codebase (or checks for a new-skill gap), judges it via the shared `_shared/harness-health-analysis.md` procedure — also used by `/init` Phase 6 and `/wrap-up` Step 7 (skill-only for those two currently) — and always files a `harness-health`-labelled GitHub issue. Never edits anything directly (skills, rules, memory, or CLAUDE.md) — report-only, matching `/code-health`. Runs on a scheduled Routine for continuous coverage, rotating through skills, rules, and CLAUDE.md via a churn/staleness cursor shared with `/init` and `/wrap-up`. Memory (`~/.claude/projects/{slug}/memory/`) is audited only via an explicit `--kind memory --memory-dir <path>` invocation — never through the Routine's automatic rotation.

**`/claude-tweaks:journey-health`** — Recurring health check for `docs/journeys/*.md`: picks one journey to audit (or the decoupled coverage scan, when due), checks it against the codebase (file-existence, self-review criteria shared with `/claude-tweaks:journeys`, journey-story coverage shared with `/claude-tweaks:review`'s `3g-cov` lens), and always files a `journey-health`-labelled GitHub issue. A separate, interactive-only deep tier (`--deep`) actually runs the journey's QA stories via `/claude-tweaks:test` (or walks it live via `/claude-tweaks:visual-review` when no stories exist yet) and judges whether a failure means the journey/story text is stale or the app genuinely regressed. Never edits journeys, stories, or code — report-only, matching `/code-health` and `/harness-health`.

**`/claude-tweaks:docs-health`** — Recurring health check for `docs/**`: picks one doc to audit, judges it against the shared `_shared/criteria-docs-diataxis.md` procedure — Diátaxis genre-drift (implied doc type vs. actual content shape), depth-mismatch (implied reading investment vs. actual word count), findability (can a reader or agent actually discover this doc), factual staleness, and dual-persona misleading-risk tagging (human engineer vs. coding agent) — and always files a `docs-health`-labelled GitHub issue. Never edits docs content — report-only, matching `/code-health` and `/harness-health`. Scoped strictly to `docs/**`, excluding `docs/superpowers/**` (ephemeral build artifacts) and never overlapping `harness-health`'s `.claude/skills/**`/`.claude/rules/**`/CLAUDE.md territory. Runs on a scheduled Routine for continuous coverage.

**`/claude-tweaks:design-wrapper`** — Wrapper for the [Impeccable](https://github.com/pbakaus/impeccable) frontend-design plugin. Seven active modes:

- **`test`** — invoked by `/test` for the deterministic CLI gate (`npx impeccable detect`)
- **`review`** — invoked by `/review` for LLM `critique` + `audit` (advisory findings; writes audit cache for `polish`)
- **`shape`** — invoked by `/specify` on frontend design docs (runs `/impeccable shape`, output appended to design doc)
- **`pre-build`** — invoked by `/build` to lazy-load Impeccable references + project design context (`docs/design/PRODUCT.md`, `DESIGN.md` from `/impeccable init`) into the implementer subagent
- **`polish`** — invoked by `/flow`'s polish phase to dispatch auto-fit (`polish` / `clarify` / `harden`) + issue-driven (`typeset` / `layout` / `adapt` / `optimize`) + intent-driven (`bolder` / `quieter` / `distill` / `delight`+`animate` / `onboard` per spec's `design-intent:` frontmatter) commands. **First wrapper mode that modifies code** — `/flow` follows up with the re-verify gate.
- **`survey`** — invoked by `/visual-review` (with screenshots) and `/flow`'s pipeline summary (with the full diff). Produces ranked Creative Opportunities recommendations spanning intent-driven and manual-only commands (`colorize` / `extract` / `overdrive`). Read-only — never invokes commands. Per-spec declined-recommendation tracking suppresses noise after 2 declines; reset via `/claude-tweaks:design-wrapper reset-recommendations <spec>`.
- **`live`** — invoked by `/specify`'s shape-time variant-exploration step and `/visual-review`'s standalone Boost gate. Thin dispatcher to Impeccable's own interactive `live` command (element picker, real HTML/CSS variants, live parameter tuning, accept-to-source cleanup). Interactive-only — no auto-mode branch, by the same reasoning `live` itself has none.

The wrapper produces three independent surfacing anchors so creative commands cannot get buried: intent dispatch in polish, the Creative Opportunities block in `/visual-review`, and the Creative Opportunities block in `/flow`'s pipeline summary.

Handles 3-layer detection (kill-switch / spec frontmatter / file-extension sniff) so non-frontend specs skip cleanly. Set up by `/init` Step 10. Per-spec caches (`*-audit.json`, `*-recommendations.json`, `*-declined.json`) live in `docs/plans/` and are cleaned up by `/wrap-up`.

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
| [Superpowers](https://github.com/obra/superpowers) | `/plugin install superpowers@claude-plugins-official` | Yes — brainstorming, planning, subagent execution, worktree management, systematic debugging |
| agent-browser | `npm install -g agent-browser` | Optional — browser automation for /stories, /visual-review, /review qa |
| Node 18+ | brew/winget/scoop install nodejs | Yes — statusline. `/claude-tweaks:init` Step 8 offers to install via your package manager. |
| git CLI | brew/winget/apt install git | Optional — required only for the git segment in the statusline; everything else degrades gracefully. |

## Migrating from 5.x

Existing projects on claude-tweaks 5.x may carry pre-6.0 state: open GitHub issues (or `local-files` records) still stamped with the retired `tier:approved`/`tier:fast-track`/`tier:needs-review`/`status:blocked`/`status:in-progress` labels, `specs/backlog/*.md` entries from the earlier two-file backlog design, or a project CLAUDE.md with a `backlog-backend` flag that hasn't been renamed to `work-backend`. None of this breaks on upgrade — every consumer skill reads the old label set and the old flag name as read-only legacy aliases (see `/claude-tweaks:tidy`'s legacy-taxonomy finding). A dedicated migration pass — relabeling live records, folding `specs/backlog/` into the unified record store, and renaming the CLAUDE.md flag — is planned as separate follow-on work; this section will point to it once it lands.

## Configuration

### Worktree base ref (important for worktree mode)

claude-tweaks branches each worktree from your **current local HEAD** — the branch you ran `/build` or `/flow` on, including any merged specs or in-progress integration commits. The native `EnterWorktree` tool has no base-ref parameter, so the base is decided by the harness setting `worktree.baseRef`:

```json
// settings.json
{ "worktree": { "baseRef": "head" } }
```

The harness **default is `fresh`**, which branches from `origin/<default-branch>`. On a project whose integration branch is local and ahead of the remote default (e.g. a long-lived `dev`), `fresh` silently branches from a **stale** commit, and your work lands on the wrong base. Set `baseRef: "head"`. As a safety net, `/build` Common Step 1 verifies the worktree's actual base immediately after creation and stops if it doesn't match your HEAD.

### Worktree sessions and `claude --resume`

Because `worktree.always` forces nearly every session to enter a worktree on its first edit, this is worth knowing up front: entering a worktree mid-session (via `EnterWorktree`, or `Agent` with `isolation: "worktree"`) pivots that session's own storage into a project bucket keyed by the worktree's path, not the parent project's. `claude --resume` run from the parent project directory no longer lists it.

This is a known, accepted limitation in Claude Code itself — not something claude-tweaks controls or can work around. Anthropic has closed it as duplicate/not-planned: [#30906](https://github.com/anthropics/claude-code/issues/30906) ("Worktree cwd is not restored on session resume"), [#42596](https://github.com/anthropics/claude-code/issues/42596) ("Worktree sessions are transient and cannot be resumed"), [#48835](https://github.com/anthropics/claude-code/issues/48835) (silent `--resume` failure). Related open feature requests: #28019, #58591, #61366.

If you need to resume a session after it entered a worktree, `cd` into the worktree directory first and resume from there, or look for it under that worktree's own encoded project bucket. If resumability matters more than in-session automation for a given task, create the worktree manually (`git worktree add`, then `cd` in and launch `claude`) instead of letting a skill enter one for you mid-session.

## Local development

```bash
claude --plugin-dir ./
```

## License

MIT
