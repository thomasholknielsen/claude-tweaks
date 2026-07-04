---
name: claude-tweaks:help
description: Use when you need a quick reference for available commands, want to see workflow status, or need a recommendation for what to do next.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a Next Actions block (context-specific numbered options with one recommended), not a navigation menu.


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
| `status` | Pipeline status scan only |
| `commands` | Quick reference cheat sheet only — read `reference-card.md` in this skill's directory and present its contents |
| *spec number or topic* | Targeted status for that specific spec/topic |

> Default (no arg) is the cheat-sheet-first dashboard. The status scan (Section 2) is moderately expensive — when the user just wants command syntax, the `commands` arg avoids it.

---

## Section 1: Quick Reference Cheat Sheet

*(Skip if `$ARGUMENTS` = `status`)*

For the canonical cheat sheet — lifecycle, component, and utility commands; common workflows; artifact lifecycle; bookend architecture summary — read `reference-card.md` in this skill's directory. **Rendering rule:** present the Lifecycle / Component / Utility command tables verbatim. Collapse the Common Workflows section to a list of workflow headings (e.g., "New repo bootstrap", "Full pipeline", "Resume from step") unless the user explicitly asked for "examples" or "workflows" in `$ARGUMENTS` — in that case, render the workflows verbatim too. Always keep the Artifact Lifecycle and Bookend Architecture summary verbatim. The reference card is the single source of truth for the command catalog; do not maintain a separate copy here.

---

## Section 2: Pipeline Status Scan

*(Skip if `$ARGUMENTS` = `commands`)*

Read `status-scan.md` in this skill's directory for the full parallel-dispatch procedure (Stages 1-7, dispatch contract, agent template, and dashboard rendering). The orchestrator dispatches the seven stages in parallel and assembles the dashboard after all agents complete.

---

## Section 3: Recommendation

*(Always included unless `$ARGUMENTS` = `commands`)*

### Priority Order

1. **Current PR blocked** — the current branch's open PR has failing CI, `CHANGES_REQUESTED`, or unresolved review threads (Stage 4.5). PR feedback is the most perishable work in the system — reviewer context decays fastest and it blocks in-flight work from merging. Recommend fixing CI, addressing threads, or resuming `/claude-tweaks:build` before anything below.
2. **Specs awaiting review** — review completed work before it goes stale
3. **Specs awaiting wrap-up** — wrap up reviewed work (captures learnings while fresh)
4. **Specs in progress** — finish what's started before starting new work
5. **Design docs unspecified** — specify before building (don't let designs go stale)
6. **Deferred items with met triggers** — promote before starting new work
7. **Specs ready to build** — pick the highest-priority spec with met prerequisites
8. **Promoted INBOX items** — items tagged `**Promoted:**` are ready for `/superpowers:brainstorming` (or `/claude-tweaks:challenge` first if they have baked-in assumptions). These have already been triaged and prioritized over unpromoted items.
9. **INBOX review** — if inbox is stale or has 10+ items, suggest `/claude-tweaks:tidy` before new brainstorming
10. **Challenge + Brainstorming** — if pipeline is empty and no promoted items exist, suggest promoting an INBOX item; if it has baked-in assumptions, run `/claude-tweaks:challenge` first, then `/superpowers:brainstorming`
11. **Nothing to do** — if everything is clean, say so

### Tie-Breaking

When multiple specs are ready to build at the same tier:
- Prefer specs that unblock other specs (check dependency graph)
- Prefer specs with no file overlap with in-progress work (avoids conflicts)
- Prefer smaller specs (faster feedback loop)
- Prefer specs with existing plans (less setup needed)

### Detecting Items That Need `/claude-tweaks:challenge`

An INBOX item likely needs debiasing when it:
- Names a specific technology as the solution (e.g., "Add Redis caching" instead of "Improve response times")
- Frames the problem as a solution (e.g., "Build a microservice for X" vs "X is too slow")
- Contains strong assumptions about the approach without exploring alternatives

**Mode recommendation:** Items with mild assumption signals (slightly solution-oriented phrasing, but the problem space is mostly clear) → recommend `/claude-tweaks:challenge quick {topic}`. Items with strong solution-baking or multiple competing assumptions → recommend full `/claude-tweaks:challenge {topic}`.

### Present Recommendation

Render the recommendation as the `## Next Actions` block below — `{recommended command}` becomes option 1 marked `**(Recommended)**`, with 1-3 alternatives drawn from the priority order.

## Next Actions

1. `{recommended command with parameters}` — {rationale} **(Recommended)**
2. `{alternative command}` — {description}
{3. `{option}` — {description}}

## Component-Skill Contract

`/claude-tweaks:help` is a **standalone-only** dashboard skill — it is not invoked by any parent skill in the workflow. There is no `PIPELINE_RUN_DIR` signal, no parent context to defer to, and the `## Next Actions` block always renders. If a future parent skill ever invokes `/help` (e.g., a "show me the pipeline" dispatch), the parent must update this contract before that lands; until then, treat parent invocation as not applicable.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Running a full scan when user just needs command syntax | Wastes time — respect the `commands` argument |
| Recommending new work when specs await review | Finish in-progress work first — stale reviews lose context |
| Recommending new work while the current PR has unresolved feedback or failing checks | In-flight work rots fastest — reviewer context decays and merge conflicts accumulate. The pipeline picture is incomplete without PR state. |
| Skipping the INBOX scan | Stale INBOX items create noise and slow down the pipeline |
| Not checking for baked-in assumptions | Solution-oriented INBOX items bypass the debiasing step |
| Triaging INBOX items from /help instead of handing off to /tidy | /help is a read-only dashboard — it reports status and recommends next steps. If the user wants to triage, delete, promote, merge, or defer INBOX items, hand off to `/claude-tweaks:tidy`. Do not improvise an ad-hoc walkthrough. |

For a detailed explanation of how context flows between skills via artifacts, read `context-flow.md` in this skill's directory.

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:capture` | Feeds items that /claude-tweaks:help surfaces |
| `/claude-tweaks:challenge` | /claude-tweaks:help flags items with baked-in assumptions for debiasing |
| `/claude-tweaks:specify` | /claude-tweaks:help flags unspecified design docs and uses Key Files from specs for implicit dependency detection |
| `/claude-tweaks:build` | /claude-tweaks:help recommends which spec to build |
| `/claude-tweaks:test` | /claude-tweaks:help can recommend /test when code changes exist but no review is warranted |
| `/claude-tweaks:review` | /claude-tweaks:help flags specs awaiting review |
| `/claude-tweaks:wrap-up` | /claude-tweaks:help flags specs awaiting wrap-up |
| `/claude-tweaks:tidy` | /claude-tweaks:help suggests /claude-tweaks:tidy when maintenance is needed |
| `specs/DEFERRED.md` | /claude-tweaks:help scans deferred items and flags those with met triggers |
| `/claude-tweaks:flow` | /claude-tweaks:help lists /claude-tweaks:flow as an automation option for ready specs |
| `/claude-tweaks:browse` | Utility skill — /claude-tweaks:help lists it in the utility skills table |
| `/claude-tweaks:stories` | Lifecycle skill — /claude-tweaks:help lists it between /test and /review |
| `/claude-tweaks:ledger` | Utility skill — /claude-tweaks:help lists it in the utility skills table and scans for active ledgers with open items |
| `/claude-tweaks:reflect` | Component skill — /claude-tweaks:help lists it in the component skills table |
| `/claude-tweaks:simplify` | Component skill — /claude-tweaks:help lists it in the component skills table |
| `/claude-tweaks:deepen` | Component skill — /claude-tweaks:help lists it in the component skills table |
| `/claude-tweaks:journeys` | Component skill — /claude-tweaks:help lists it in the component skills table |
| `/claude-tweaks:visual-review` | Component skill — /claude-tweaks:help lists it in the component skills table |
| `/claude-tweaks:init` | /init configures the workflow system that /help reports on — /help reads the same artifact paths /init bootstraps (INBOX, DEFERRED, specs, plans, docs registry) |
| `/claude-tweaks:version` | /version prints the installed plugin version; /help surfaces version-aware command syntax and points at /version for the canonical answer |
| `/claude-tweaks:design` | Utility wrapper — /help lists it in the utility skills table. /design is invoked by /build (Common Step 1.7 pre-build), /test (Step 1.5 CLI gate), /review (Step 6.5 advisory pass), /flow (polish phase), and /visual-review; standalone usage is rare. |
| `/claude-tweaks:research` | Utility skill — /help lists it in the utility skills table. /research has no fixed lifecycle position; /help may surface it as an option when an INBOX item or pending spec would benefit from prior-art research. |
| `_shared/auto-mode-contract.md` | Single source of truth for auto-mode behavior — read before adding any auto-mode handling to /help (e.g., if a future status scan ever auto-resolves recommendations) |
| `_shared/github-pr-scan.md` | Stage 4.5 scans the current branch's PR per this shared procedure (`current-pr` scope) — detection ladder, exact gh/GraphQL commands, output contract, severity mapping |
