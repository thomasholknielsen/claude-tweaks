---
name: claude-tweaks:help
description: Use when you need a quick reference for available commands, want to see workflow status, or need a recommendation for what to do next.
argument-hint: "[status|commands|<topic>] [--budget <n>]"
---
> **Interaction style:** Single decisions → one `AskUserQuestion` call, one option marked Recommended. Multi-item → batch table with recommendations pre-filled, then one `AskUserQuestion` for apply-all/override. Never more than one call per decision. End with `## Next Actions` via `AskUserQuestion`, not a navigation menu.


# Help — Quick Reference + Workflow Dashboard

One-stop reference and status dashboard for the workflow system. Combines command help, pipeline scanning, and next-step recommendations.

```
/claude-tweaks:capture → /claude-tweaks:challenge → /superpowers:brainstorming → /claude-tweaks:specify → /claude-tweaks:build → /claude-tweaks:review → /claude-tweaks:wrap-up
    ↑                                                                                                                                            |
    └──────────────────────────────────── [ /claude-tweaks:help ] (dashboard + reference) ←──────────────────────────────────────────────────────┘
                                            ^^^^ YOU ARE HERE ^^^^
```

## When to Use

- You need a quick reference for available commands and their syntax
- You want to see what's in the pipeline and what needs attention
- You're unsure what to do next in the workflow
- You want a recommendation based on current pipeline state
- After completing a batch of work, to check what's unblocked

## Input

`$ARGUMENTS` controls what to show:

| Argument | Behavior |
|----------|----------|
| *(none)* | Cheat sheet + status scan + recommendation |
| `status` | Pipeline status scan + recommendation (skips Section 1's cheat sheet) |
| `commands` | Quick reference cheat sheet only — read `reference-card.md` in this skill's directory and present its contents |
| *spec number or topic* | Same as *(none)* — full cheat sheet + status scan + recommendation. No per-spec/topic filtering is implemented; none of the three sections' skip conditions below match a bare spec number or topic string. |
| `--budget <n>` | Caps rows rendered in the Ready-to-Build and Needs-Attention dashboard tables (default: 10). Combine with any other argument, e.g. `status --budget 5`. See `status-scan.md`'s Present Dashboard section for truncation and overflow-note behavior. |

> Default (no arg) is the cheat-sheet-first dashboard. The status scan (Section 2) is moderately expensive — when the user just wants command syntax, the `commands` arg avoids it.

---

## Section 1: Quick Reference Cheat Sheet

*(Skip if `$ARGUMENTS` = `status`)*

For the canonical cheat sheet — lifecycle, component, and utility commands; common workflows; artifact lifecycle; bookend architecture summary — read `reference-card.md` in this skill's directory. **Rendering rule:** present the Lifecycle / Component / Utility command tables verbatim. Collapse the Common Workflows section to a list of workflow headings (e.g., "Feature from scratch", "Fast pipeline (spec ready)", "Brownfield onboarding" — see `reference-card.md`'s own Common Workflows section for the current, authoritative list) unless the user explicitly asked for "examples" or "workflows" in `$ARGUMENTS` — in that case, render the workflows verbatim too. Always keep the Artifact Lifecycle and Bookend Architecture summary verbatim. The reference card is the single source of truth for the command catalog; do not maintain a separate copy here.

---

## Section 2: Pipeline Status Scan

*(Skip if `$ARGUMENTS` = `commands`)*

> **Parallel execution:** When both Section 1 and Section 2 run (default, no-argument invocation), issue Section 1's `reference-card.md` Read alongside dispatching Section 2's Stage Task agents below — a static Read and a live Task-agent dispatch are fully independent and should run concurrently rather than sequentially.

Read `status-scan.md` in this skill's directory for the full parallel-dispatch procedure (Stages 1-7 including sub-stages 4.5, 4.6, and 4.7; execution model, dispatch contract, agent template, and dashboard rendering). Stages 1, 4.5, 4.6, and 4.7 dispatch as Task agents; Stages 2, 5, and 6 run as parallel tool calls in the main thread alongside them; Stage 7 runs last, after the others, because it reads their output. The orchestrator assembles the dashboard once everything has returned.

---

## Section 3: Recommendation

*(Always included unless `$ARGUMENTS` = `commands`)*

### Priority Order

1. **Current PR blocked** — the current branch's open PR has failing CI, `CHANGES_REQUESTED`, or unresolved review threads (Stage 4.5). PR feedback is the most perishable work in the system — reviewer context decays fastest and it blocks in-flight work from merging. Recommend fixing CI, addressing threads, or resuming `/claude-tweaks:build` before anything below.
2. **Specs awaiting review** — review completed work before it goes stale
3. **Specs awaiting wrap-up** — wrap up reviewed work (captures learnings while fresh)
4. **Records building** (`bot:in-progress`, Stage 1) — finish what's started before starting new work
5. **Design docs unspecified** — specify before building (don't let designs go stale)
6. **Parked records with met triggers** — promote via `/claude-tweaks:specify` before starting new work
7. **Records pending authorization** (`ready`, not yet granted, Stage 1) — recommend `/claude-tweaks:backlog refine` to review and grant `auto:build`
8. **Authorized records** (Stage 1) — recommend `/claude-tweaks:dispatch` (headless) or `/claude-tweaks:build #{n}` (direct) for the highest-priority one with met prerequisites
9. **Backlog review** — if the backlog is stale or has 10+ records, suggest `/claude-tweaks:tidy` before new brainstorming
10. **Challenge + Brainstorming** — if the pipeline is empty, suggest brainstorming from a backlog record; if its title has baked-in assumptions, run `/claude-tweaks:challenge` first, then `/superpowers:brainstorming`
11. **Nothing to do** — if everything is clean, say so

### Tie-Breaking

Row order in the Ready-to-Build table comes from the shared `bin/lib/issues/ranking.js`'s `rankNextToBuild` — the same module `/claude-tweaks:backlog overview`'s bare-mode recommendation uses, so both consumers compute the identical order (see `status-scan.md` Stage 1 for the actual call). Its tie-break sequence: unblocks-count (most other candidates in the pool it unblocks, first) → file-overlap-free (no shared key files with another candidate, first) → effort (low first) → hasPlan (existing plan, first).

### Detecting Items That Need `/claude-tweaks:challenge`

A backlog record likely needs debiasing when its title or body:
- Names a specific technology as the solution (e.g., "Add Redis caching" instead of "Improve response times")
- Frames the problem as a solution (e.g., "Build a microservice for X" vs "X is too slow")
- Contains strong assumptions about the approach without exploring alternatives

**Mode recommendation:** Records with mild assumption signals (slightly solution-oriented phrasing, but the problem space is mostly clear) → recommend `/claude-tweaks:challenge quick {topic}`. Records with strong solution-baking or multiple competing assumptions → recommend full `/claude-tweaks:challenge {topic}`.

### Present Recommendation

Render the recommendation as the `## Next Actions` block below via one `AskUserQuestion` call — `{recommended command}` becomes option 1, labeled with a short name suffixed `(Recommended)`, with 1-3 alternatives drawn from the priority order.

## Next Actions

Call `AskUserQuestion`:

- `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`
- Option 1 — `label`: short name of the recommended command suffixed `(Recommended)`, `description`: the full command with parameters + rationale
- Option 2 (and optional option 3) — same shape, for each alternative drawn from the priority order

## Component-Skill Contract

`/claude-tweaks:help` is a **standalone-only** dashboard skill — it is not invoked by any parent skill in the workflow. There is no `PIPELINE_RUN_DIR` signal, no parent context to defer to, and the `## Next Actions` block always renders. If a future parent skill ever invokes `/help` (e.g., a "show me the pipeline" dispatch), the parent must update this contract before that lands; until then, treat parent invocation as not applicable.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Running a full scan when user just needs command syntax | Wastes time — respect the `commands` argument |
| Recommending new work when specs await review | Finish in-progress work first — stale reviews lose context |
| Recommending new work while the current PR has unresolved feedback or failing checks | In-flight work rots fastest — reviewer context decays and merge conflicts accumulate. The pipeline picture is incomplete without PR state. |
| Skipping the backlog scan | Stale backlog records create noise and slow down the pipeline |
| Not checking for baked-in assumptions | Solution-oriented backlog records bypass the debiasing step |
| Triaging backlog records from /help instead of handing off to /tidy | /help is a read-only dashboard — it reports status and recommends next steps. If the user wants to delete, promote, absorb, or defer backlog records, hand off to `/claude-tweaks:tidy`. Do not improvise an ad-hoc walkthrough. |

For a detailed explanation of how context flows between skills via artifacts, read `context-flow.md` in this skill's directory.

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:capture` | Feeds items that /claude-tweaks:help surfaces |
| `/claude-tweaks:challenge` | /claude-tweaks:help flags items with baked-in assumptions for debiasing |
| `/claude-tweaks:specify` | /claude-tweaks:help flags unspecified design docs and uses Key Files from open records for implicit dependency detection (Stage 1's conflict detection) |
| `/claude-tweaks:build` | /claude-tweaks:help recommends which spec to build |
| `/claude-tweaks:test` | /claude-tweaks:help can recommend /test when code changes exist but no review is warranted |
| `/claude-tweaks:review` | /claude-tweaks:help flags specs awaiting review |
| `/claude-tweaks:wrap-up` | /claude-tweaks:help flags specs awaiting wrap-up |
| `/claude-tweaks:tidy` | /claude-tweaks:help suggests /claude-tweaks:tidy when maintenance is needed |
| `/claude-tweaks:backlog` | Surfaces pending-authorization count, `bot:blocked` count, and rolling auto-merge count on the dashboard (Stage 4.6, `triage-queue` scope) — the reciprocal of `backlog/SKILL.md`'s own `/claude-tweaks:help` row. Shares `bin/lib/issues/ranking.js`'s `rankNextToBuild` with `overview` mode's recommendation section. |
| `/claude-tweaks:demo` | `/help` is the sole discovery surface for the acceptance queue — lists every outstanding `#N` (Stage 4.7, `acceptance-queue` scope), not just a count; `/demo #N` executes the walkthrough for one — the reciprocal of `demo/SKILL.md`'s own `/claude-tweaks:help` row. |
| `/claude-tweaks:dispatch` | /claude-tweaks:help surfaces the `authorized` and `building` counts dispatch acts on (Stage 1) — the reciprocal of `dispatch/SKILL.md`'s own `/claude-tweaks:help` row. |
| `/claude-tweaks:flow` | /claude-tweaks:help lists /claude-tweaks:flow as an automation option for ready specs |
| `/claude-tweaks:browse` | Utility skill — /claude-tweaks:help lists it in the utility skills table |
| `/claude-tweaks:stories` | Lifecycle skill — /claude-tweaks:help lists it between /test and /review |
| `/claude-tweaks:ledger` | Utility skill — /claude-tweaks:help lists it in the utility skills table. Does not scan ledger files or surface open items on the dashboard — the resolve gate (`/claude-tweaks:ledger resolve`, run by `/claude-tweaks:wrap-up` Step 8.5 or `/claude-tweaks:flow` Step 5) is what actually catches unresolved items. |
| `/claude-tweaks:reflect` | Component skill — /claude-tweaks:help lists it in the component skills table |
| `/claude-tweaks:simplify` | Component skill — /claude-tweaks:help lists it in the component skills table |
| `/claude-tweaks:deepen` | Component skill — /claude-tweaks:help lists it in the component skills table |
| `/claude-tweaks:journeys` | Component skill — /claude-tweaks:help lists it in the component skills table |
| `/claude-tweaks:visual-review` | Component skill — /claude-tweaks:help lists it in the component skills table |
| `/claude-tweaks:visualize` | Component skill — /claude-tweaks:help lists it in the component skills table |
| `/claude-tweaks:init` | /init configures the workflow system that /help reports on — /help reads the same artifact paths /init bootstraps (the work-record queue, plans, docs registry) |
| `/claude-tweaks:version` | /version prints the installed plugin version; /help surfaces version-aware command syntax and points at /version for the canonical answer |
| `/claude-tweaks:design-wrapper` | Utility wrapper — /help lists it in the utility skills table. /design-wrapper is invoked by /build (Common Step 1.7 pre-build), /test (Step 1.5 CLI gate), /review (Step 6.5 advisory pass), /flow (polish phase), and /visual-review; standalone usage is rare. |
| `/claude-tweaks:research` | Utility skill — /help lists it in the utility skills table. /research has no fixed lifecycle position; /help may surface it as an option when a backlog record or pending spec would benefit from prior-art research. |
| `_shared/auto-mode-contract.md` | Single source of truth for auto-mode behavior — read before adding any auto-mode handling to /help (e.g., if a future status scan ever auto-resolves recommendations) |
| `_shared/github-pr-scan.md` | Stage 4.5 scans the current branch's PR per this shared procedure (`current-pr` scope); Stage 4.6 scans the triage queue (`triage-queue` scope); Stage 4.7 scans the acceptance queue (`acceptance-queue` scope) — detection ladder, exact gh/GraphQL commands, output contract, severity mapping |
| `_shared/work-record.md` | Taxonomy home — the record label contract Stage 1's record scan reads (see that file's "The axes" table for the canonical list; not restated here). /help has no row in the permission matrix — it never adds or removes a label, only queries the taxonomy every other row writes to. |
