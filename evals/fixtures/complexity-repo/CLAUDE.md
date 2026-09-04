# eval-fixture-minimal-node-repo

<!-- FROZEN FIXTURE (#631): intentionally pinned to the pre-6.48.0 policy-inside-CLAUDE.md
     shape for eval-harness determinism. The policy block below still names three retired
     keys — section-confirmation (retired, #331), merge-check (renamed branch-divergence-
     check, #331), review-severity-floor (renamed review-auto-apply-ceiling, #332) — on
     purpose, as a frozen legacy-shape snapshot, not staleness to fix in place. See
     evals/tests/frozen-fixture-policy-tolerance.test.js, which pins that the harness's
     actual policy resolution tolerates this frozen shape and never depends on these
     retired keys resolving to any particular value. -->

A minimal Node.js utility library (`src/`) — three small, independent, currently-uncalled functions. No entry point, no framework, no tests, no CI.

## Stack

| Layer | Tech |
|-------|------|
| Language | JavaScript (CommonJS, `'use strict'`) |
| Runtime | Node.js (v20.12.0 observed locally; not pinned — no `engines` field, no `.nvmrc`) |
| Package manager | npm |
| Dependencies | None — `package.json` declares zero deps/devDeps |

## Structure

```
src/            Independent utility functions — auth.js, clean-module.js, utils.js.
                Nothing imports another file in src/; no entry point exists.
specs/          Work-record backlog + spec index (claude-tweaks)
docs/           Docs root — journeys/, plans/, superpowers/ (claude-tweaks)
.worktrees/     Git-fallback isolated worktrees (claude-tweaks)
```

## Commands

No `scripts` exist in `package.json` yet — nothing to run beyond manually requiring a file (e.g. `node -e "console.log(require('./src/utils').lastNItems([1,2,3],2))"`).

## Conventions

- Every `src/` file opens with `'use strict'` and exports via a single named `module.exports = { fnName }` (observed in all 3 files; small sample).
- No cross-file imports exist within `src/` — each module is standalone.

## Philosophy

Greenfield. There are no users on this project yet. Always prefer the correct solution over the safe-migration path: rename things, change types, restructure, delete and rebuild. Don't add backward-compatibility shims or migration code for a project with no consumers — just make the change. Prefer latest stable versions and clean implementations.

- **Do it properly.** No display-only workarounds for data model issues, no "good enough" shortcuts that leave technical debt.
- **Assume zero cost.** Decide as if implementation is free.
- **Assume zero time.** Decide as if implementation is instant.
- **No implicit deferrals.** When something needs doing, either do it now or explicitly file a backlog work record (via `/claude-tweaks:capture`). Never silently skip work or leave TODO comments without a corresponding backlog record.
- **Dependencies.** Use latest stable versions when adding any; upgrade aggressively.

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

No test framework is configured and no test files exist. See backlog: "Add a test framework and package.json scripts."

## Environment

No environment configuration exists — no `.env`, no secrets, no required external services.

## Git

Single `master` branch, no remote configured. Commit history is too small (2 commits) to establish a message convention.

## Design integration

diagram-suggestions: enabled

## Work records

work-backend: local-files
work-types: labels
work-links: body-text

## claude-tweaks Pipeline

**Artifacts:** design doc (one file, phases = `## Phase N` sections) → spec (one per work unit, via `/claude-tweaks:specify`) → `/claude-tweaks:flow`. No phase-plan files; skip `/superpowers:writing-plans`.

**Entry point:** `/claude-tweaks:specify` — accepts a topic (calls `/superpowers:brainstorming`), design-doc path, or a backlog work-record ref.

**`/claude-tweaks:flow`:** specs only (rejects design docs). Size is not a stop signal — gate blocks on structural coupling (cross-task deps, scope leak). **Defaults to `auto` mode** (hands-off); pass `confirm` to gate the Manifesto, `interactive` for per-skill prompts, or `hybrid` for floor-gated prompts.

**`auto-mode`:** `/claude-tweaks:flow` defaults to `auto` on its own. The optional `auto-mode:` flag (Project Defaults below) sets `/claude-tweaks:build`'s default and can lower `/claude-tweaks:flow` to `interactive` project-wide (`default-off`) for anyone who wants it. Under auto, do NOT insert mid-pipeline reality-checks, path-selection prompts, or context concerns. Surface failures via ledger/failure card. See `_shared/auto-mode-contract.md` in the claude-tweaks plugin.

**Bookend architecture (v4.6+):** in default `auto` mode the pipeline has **one user-facing stop** — the Wrap-Up Review Console at the end (`/claude-tweaks:wrap-up` Step 8.6 — one consolidated batch). The Pipeline Config Manifesto (`/claude-tweaks:flow` Step 3) computes the policy levers, writes `config.yml`, and displays as a **read-only FYI** rather than stopping — pass `/claude-tweaks:flow … confirm` to turn it back into an "Approve all / Override / Cancel" gate. Mid-flow decisions are looked up from `.claude-tweaks/pipelines/{run-id}/config.yml` and logged to `decisions.md` in the same directory. Skills MUST NOT invent new mid-flow stops in auto. See `_shared/auto-mode-contract.md` and `_shared/auto-decision-log.md`.

**Project policy defaults** in this CLAUDE.md (under `## Auto-mode policy`) pre-fill the Manifesto — shown in the FYI display (default `auto`) and used as the pre-filled recommendations when the gate runs (`confirm` / `hybrid`). See the section below.

**Superpowers overrides:** `/superpowers:brainstorming` stops after the design doc — route to `/claude-tweaks:specify`, never `/superpowers:writing-plans`. `/superpowers:subagent-driven-development` and `/superpowers:executing-plans` don't auto-invoke `/superpowers:finishing-a-development-branch`.

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
leftover-default: defer            # defer | backlog | drop
auto-fix-threshold: lint+type      # lint-only | lint+type | lint+type+test
review-severity-floor: low         # none | low | medium  (auto-apply cutoff)
tidy-aggressiveness: conservative  # conservative | moderate | aggressive
```

## Don'ts

- **Don't hand-build SQL strings from user input, even with sanitization.** `src/auth.js`'s `buildUserLookupQuery` strips non-alphanumeric/underscore characters from `username` before interpolating it into a raw SQL template literal. That regex is the *only* thing preventing injection today — any future edit that loosens it, adds another interpolated field, or copies this pattern elsewhere reintroduces SQL injection. Use a parameterized query / prepared statement instead once a real DB driver is wired in.
