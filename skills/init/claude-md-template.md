# Phase 5: CLAUDE.md Template and Guidelines

## Core Principle

CLAUDE.md describes **how to work in this codebase** — the patterns to follow, the commands to run, the conventions to respect, and the mistakes to avoid. It is an operator's manual for an existing system, not a wishlist of improvements.

Every section should answer: "If I'm about to make a change here, what do I need to know?" Things that don't exist yet (missing CI, missing tests, missing linting) are work items for the INBOX, not entries in CLAUDE.md. The moment something is set up, _then_ it earns a place here.

This principle applies equally during initial generation and updates. When updating CLAUDE.md, evaluate every proposed change against: "Does this describe how to work in the codebase _as it is right now_?"

## Initial Mode Template

Produce CLAUDE.md from scratch following this template:

```markdown
# {project name}

{One-line description of what the project does.}

## Stack

| Layer | Tech |
|-------|------|
| ... | ... |

## Structure

{Directory tree showing key directories and their purpose — max 15 lines}

## Commands

{Key package scripts — what developers actually run daily.
Verify every command exists in package.json / Makefile / scripts before listing.}

## Conventions

{Observed naming, patterns, and rules — max 10 bullets}

## Philosophy

{Adaptive principles that calibrate how Claude approaches changes in this project.
Generated from the maturity classification detected in Phase 2h. See "Generating Philosophy" below.}

## Working Approach

How to execute any task here. These apply project-wide unless a more specific rule or instruction overrides them; use judgment on trivial tasks.

- **Think before coding.** State assumptions; ask rather than guess when uncertain. Push back when a simpler approach exists. Stop when confused.
- **Honest, not agreeable.** When the user proposes a direction, pressure-test it before agreeing — name the weakest assumption first, not the strengths. State disagreement plainly: no flattery openers, no hedging, no reflexive reassurance. If you genuinely can't find a flaw, say so rather than manufacturing one.
- **Simplicity first.** Write the minimum correct code for what was asked — nothing speculative, no abstractions for single-use code. ("Do it properly" above means correct, not more.)
- **Surgical changes.** Touch only what the task requires. Don't reformat or "improve" adjacent code. Match the surrounding style.
- **Goal-driven.** Define success criteria up front and loop until they're verified, rather than following steps blindly.
- **Read before you write.** Before adding code, read the file's exports, immediate callers, and shared utilities — duplicate logic usually already exists nearby.
- **Checkpoint multi-step work.** After each significant step, state what's done, what's verified, and what's left. Don't build on a state you can't describe back.
- **Fail loud.** "Done" is wrong if anything was skipped; "tests pass" is wrong if any were skipped. Surface uncertainty and partial results — never hide them.

## Testing

{Framework, run commands, file location, naming convention}

## Environment

{How to set up locally, where secrets live, required services}

## Git

{Commit convention, branch strategy, PR process}

## claude-tweaks Pipeline

**Artifacts:** design doc (one file, phases = `## Phase N` sections) → spec (one per work unit, via `/claude-tweaks:specify`) → `/claude-tweaks:flow`. No phase-plan files; skip `/superpowers:writing-plans`.

**Entry point:** `/claude-tweaks:specify` — accepts a topic (calls `/superpowers:brainstorming`), design-doc path, or INBOX ref.

**`/flow`:** specs only (rejects design docs). Size is not a stop signal — gate blocks on structural coupling (cross-task deps, scope leak). **Defaults to `auto` mode** (hands-off); pass `confirm` to gate the Manifesto, `interactive` for per-skill prompts, or `hybrid` for floor-gated prompts.

**`auto-mode`:** `/flow` defaults to `auto` on its own. The optional `auto-mode:` flag (Project Defaults below) sets `/build`'s default and can lower `/flow` to `interactive` project-wide (`default-off`) for anyone who wants it. Under auto, do NOT insert mid-pipeline reality-checks, path-selection prompts, or context concerns. Surface failures via ledger/failure card. See `_shared/auto-mode-contract.md` in the claude-tweaks plugin.

**Bookend architecture (v4.6+):** in default `auto` mode the pipeline has **one user-facing stop** — the Wrap-Up Review Console at the end (`/wrap-up` Step 8.6 — one consolidated batch). The Pipeline Config Manifesto (`/flow` Step 3) computes the policy levers, writes `config.yml`, and displays as a **read-only FYI** rather than stopping — pass `/flow … confirm` to turn it back into an "Approve all / Override / Cancel" gate. Mid-flow decisions are looked up from `.claude-tweaks/pipelines/{run-id}/config.yml` and logged to `decisions.md` in the same directory. Skills MUST NOT invent new mid-flow stops in auto. See `_shared/auto-mode-contract.md` and `_shared/auto-decision-log.md`.

**Project policy defaults** in this CLAUDE.md (under `## Auto-mode policy`) pre-fill the Manifesto — shown in the FYI display (default `auto`) and used as the pre-filled recommendations when the gate runs (`confirm` / `hybrid`). See the section below.

**Superpowers overrides:** `/superpowers:brainstorming` stops after the design doc — route to `/specify`, never `/superpowers:writing-plans`. `/superpowers:subagent-driven-development` and `/superpowers:executing-plans` don't auto-invoke `/superpowers:finishing-a-development-branch`.

## Project Defaults (optional)

Override skill-level defaults here. Omit any setting to use its default. Full setting reference in each skill's SKILL.md.

```
## Build
execution-strategy: subagent       # subagent | batched
git-strategy: current-branch       # current-branch | worktree

## Flow
git-strategy: worktree             # overrides Build setting in /flow context

## Worktree
directory: .worktrees
# Base ref is a harness setting, NOT a CLAUDE.md one. Set it in settings.json:
#   { "worktree": { "baseRef": "head" } }
# claude-tweaks branches worktrees from your current local HEAD. The harness
# default `fresh` branches from origin/<default-branch> and silently uses a
# stale base when your integration branch (e.g. dev) is ahead of the remote.

## Subagent
markdown-mode: streamlined         # streamlined | full

## Brainstorm
section-confirmation: adaptive     # adaptive | per-section | batch

## Pre-flight
merge-check: true

## Plan audit
scope-keywords-required: false

## Auto-mode
# /flow defaults to auto on its own — no flag needed. Uncomment to set a
# project-wide default: default-on also makes standalone /build run in auto;
# default-off lowers /flow to interactive (per-skill prompts).
# auto-mode: default-on            # default-on | default-off

## Auto-mode policy (pre-fills Pipeline Config Manifesto — v4.6+)
# Each lever has a sensible default. Override only what the project actually
# wants different. The Manifesto reads these as recommendations; the user can
# still override per-run.
scope-creep: add-to-plan           # add-to-plan | stop-and-ask | drop
overlap: companion                 # companion | extend | skip | replace
design-intent: none                # none | bold | quiet | minimal | delightful | onboarding
leftover-default: defer            # defer | inbox | drop
auto-fix-threshold: lint+type      # lint-only | lint+type | lint+type+test
review-severity-floor: low         # none | low | medium  (auto-apply cutoff)
tidy-aggressiveness: conservative  # conservative | moderate | aggressive
```

## Don'ts

{Anti-patterns observed or inferred — things that would break the project's conventions.
This section is the highest-ROI output. See "Mining Don'ts" below.}
```

## Update Mode

Produce a **patch** — not a full rewrite. For each stale/drifted item the user approved:

```markdown
## CLAUDE.md Patches

### Patch 1: {description}
**Location:** Line {N}, section "{section}"
**Current:** `{current text}`
**Proposed:** `{new text}`
**Reason:** {why — e.g., "script renamed", "convention changed", "new stack added"}

### Patch 2: ...
```

Apply patches using Edit tool calls with precise `old_string` → `new_string` replacements. Never rewrite the entire file in Update Mode unless the user explicitly asks for it.

## Mining Don'ts

The Don'ts section prevents more mistakes than any amount of positive guidance. Don'ts are **guardrails for patterns that exist** — they describe what _not_ to do when working in this codebase. They are never aspirational.

**The filter:** A Don't must describe a pattern that exists in the codebase and should not be violated. If something doesn't exist yet (no CI, no tests, no linting, stale dependencies), that's an INBOX item for improvement work — not a Don't.

Source Don'ts from:

1. **Inconsistencies found in 2f** — if the codebase uses both patterns, codify which is correct
2. **Common mistakes for this stack** — e.g., "don't use `getServerSideProps` in App Router" for Next.js 13+
3. **Observed anti-patterns in 2f** — if there are 50 `eslint-disable` for the same rule, that's a "don't disable rule X" candidate
4. **Convention violations** — if 95% of files use named exports, "don't use default exports" is a Don't
5. **Security footguns** — any auth, input validation, or data handling patterns that must not be violated

**Not Don'ts** (these belong in INBOX instead):

| Finding | Why not a Don't | INBOX example |
|---------|----------------|---------------|
| No CI pipeline | Nothing to violate — it doesn't exist | "Set up CI — project uses {framework}, deploy to {target}" |
| No tests in `src/utils/` | Aspirational, not a guardrail | "Add test coverage for utils — {functions} are complex" |
| Dependencies 3 major versions behind | Work to do, not a constraint | "Upgrade {dep} — current: {v}, latest: {v}, breaking: {list}" |
| No linting configured | Can't enforce what isn't set up | "Set up linting — codebase uses {patterns}, {N} files" |
| Commented-out code blocks | Cleanup task, not a convention | "Clean up dead code in {files}" |

## Generating Philosophy

The Philosophy section adapts to the project's maturity classification (from Phase 2h). It contains two types of entries:

### Universal principles (include in all projects)

These apply regardless of project maturity:

- **Do it properly.** No display-only workarounds for data model issues, no "good enough" shortcuts that leave technical debt. If a value needs renaming, rename it everywhere including the database. If a type needs changing, change it at the source.
- **Assume zero cost.** Decide as if implementation is free. Never choose an inferior design because the better one "isn't worth the effort."
- **Assume zero time.** Decide as if implementation is instant. Never choose a shortcut because the proper approach "takes too long."
- **No implicit deferrals.** When something needs doing, either do it now or explicitly add it to specs/INBOX.md with scope and context. Never silently skip work or leave TODO comments without a corresponding INBOX entry.

### Maturity-dependent principles (adapt to classification)

Select the appropriate entries based on the detected maturity:

#### Greenfield / Pre-launch

```markdown
Greenfield, pre-launch. There are no users on the platform yet. Always prefer the correct solution over the safe-migration path: rename columns, change types, restructure schemas, break APIs, delete and rebuild. Use db:push not migrations. Don't add backward-compatibility shims, expand-contract phases, or feature-migration code — just make the change. Prefer latest stable versions, modern APIs, and clean implementations. When in doubt, choose the newest production-ready approach and build it right the first time.
```

#### Early Production

```markdown
Early production. The platform has users but the codebase is still young. Prefer correct solutions but use migrations (not db:push) for schema changes. Breaking API changes are acceptable with coordination — document them, version if needed. Backward-compatibility shims are acceptable for short periods (< 1 sprint) to ease transitions, then remove them. Prefer modern approaches for new code; refactor existing code toward modern patterns when touched.
```

#### Established

```markdown
Established codebase with active users. Schema changes require migrations with rollback plans. API changes follow expand-contract: add the new, migrate consumers, remove the old. Backward compatibility is required for published interfaces. Feature flags for risky changes. Prefer stability over novelty — adopt new patterns in new code, migrate existing code incrementally. Test coverage gates before refactoring shared code.
```

### Additional maturity-dependent entries

| Signal | Greenfield | Established |
|--------|-----------|-------------|
| Developer tooling | "Developer-first. Prefer powerful developer tools over simplified abstractions. Code-based config with type safety over UI-driven config without guardrails." | Omit (team may have different preferences) |
| Automation | "Automation over manual actions. Everything reproducible: Terraform first, CLI scripts second, documented manual steps only as last resort." | Same, but emphasize change management and approval processes |
| Dependencies | "Use latest stable versions. Upgrade aggressively." | "Pin versions. Upgrade deliberately with testing." |

**Important:** Only include entries that match the project. A greenfield project with no infrastructure doesn't need the automation entry. An established project with no published APIs doesn't need the expand-contract entry. Adapt, don't copy blindly.

## Working Approach (universal behavior block)

`## Working Approach` is the one **standard, non-adaptive** section in the template — include it verbatim in every generated CLAUDE.md (like the `## claude-tweaks Pipeline` section). It encodes universal task-execution behavior (think-before-coding, honest-not-agreeable, simplicity, surgical changes, goal-driven, read-before-write, checkpointing, fail-loud) so that **ad-hoc work outside the pipeline** — where no skill gate fires — still gets the same guardrails the lifecycle skills enforce.

Two rules of thumb:

- **Complements Philosophy, doesn't repeat it.** Philosophy calibrates *how aggressive changes should be in this codebase* (maturity-dependent). Working Approach is *how to execute any task* (project-independent). If a bullet is already fully covered by an existing project convention, trim it to respect the 150-line budget.
- **No hard token-budget rule (deliberate).** The popular 8-rule CLAUDE.md template adds a "hard per-task / per-session token budget, summarize-and-restart on breach" rule. claude-tweaks **omits it on purpose**: context management is the harness's job, and `_shared/auto-mode-contract.md` explicitly forbids the model from inserting context-window/budget stop prompts. Do not add a token-budget bullet here.

## Principles

- **How to work here, not what's missing** — every entry should help someone working in the codebase right now. Improvements belong in INBOX.
- **Observed, not aspirational** — document what the codebase actually does, not what it should do
- **Under 150 lines** — if it doesn't fit, it belongs in a skill or rule
- **Commands must work** — verify scripts exist before listing them
- **Don'ts are guardrails, not wishes** — they describe existing patterns that should not be violated, never infrastructure that doesn't exist yet
- **Philosophy adapts to maturity** — the same principle stated differently for greenfield vs established projects prevents both reckless breaking changes and unnecessary conservatism
- **Working Approach is standard, not adaptive** — include the universal behavior block verbatim; it covers ad-hoc work that never triggers a skill gate. No token-budget rule (the harness owns context)
