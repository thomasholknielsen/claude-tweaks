# eval-fixture-depth-repo

A minimal Node.js key-value library (`src/`) — one real module (`store.js`), a thin convenience layer over it (`store-wrapper.js`), and two small callers. Tests run with the built-in `node --test`.

## Stack

| Layer | Tech |
|-------|------|
| Language | JavaScript (CommonJS, `'use strict'`) |
| Runtime | Node.js (not pinned — no `engines` field, no `.nvmrc`) |
| Package manager | npm |
| Dependencies | None — `package.json` declares zero deps/devDeps |

## Structure

```
src/            store.js (key-value store), store-wrapper.js (convenience layer),
                app.js and report.js (callers, both importing the wrapper).
test/           node --test suites.
specs/          Work-record backlog + spec index (claude-tweaks)
docs/           Docs root — journeys/, plans/, superpowers/ (claude-tweaks)
.worktrees/     Git-fallback isolated worktrees (claude-tweaks)
```

## Commands

```bash
npm test        # node --test "test/*.test.js"
```

## Conventions

- Every `src/` file opens with `'use strict'` and exports via a single named `module.exports = { fnName }`.
- `app.js` and `report.js` import `store-wrapper.js`, never `store.js` directly (observed convention, undocumented rationale).

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

`node --test "test/*.test.js"` via `npm test`. One suite (`test/store.test.js`) covering both callers and the store's key validation.

## Environment

No environment configuration exists — no `.env`, no secrets, no required external services.

## Git

Single default branch, no remote configured. Commit history is too small to establish a message convention.

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

**Superpowers overrides:** `/superpowers:brainstorming` stops after the design doc — route to `/claude-tweaks:specify`, never `/superpowers:writing-plans`. `/superpowers:subagent-driven-development` and `/superpowers:executing-plans` don't auto-invoke `/superpowers:finishing-a-development-branch`.
