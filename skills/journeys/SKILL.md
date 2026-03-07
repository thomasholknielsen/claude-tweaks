---
name: claude-tweaks:journeys
description: Use when you want to create or update user journey documentation for recently built features. Works standalone or as a step within /claude-tweaks:build.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a Next Actions block (context-specific numbered options with one recommended), not a navigation menu.


# Journeys — User Journey Documentation

Create or update journey files for features that have been built. Journeys document how personas interact with the system — they're what visual review tests against and what QA stories are generated from. Part of the workflow lifecycle:

```
/claude-tweaks:build → /claude-tweaks:test → /claude-tweaks:review → /claude-tweaks:wrap-up
       │
[ /claude-tweaks:journeys ]
 (after implementation)
```

## When to Use

- After building a feature — document the user flow it enables
- After modifying existing flows — update affected journeys
- When journey files are missing for existing features
- When `/claude-tweaks:review` flags missing journey coverage
- During `/claude-tweaks:build` Common Step 6 — invoked automatically

## Input

`$ARGUMENTS` controls scope.

### Standalone (invoked directly):

1. **Spec number** (e.g., `42`) — analyze files changed for that spec
2. **File paths** — analyze those specific files for journey impact
3. **No arguments** — use `git diff --name-only` against the base branch or recent commits

```
/claude-tweaks:journeys                       → analyze recent changes for journey impact
/claude-tweaks:journeys 42                    → journeys for spec 42's changes
/claude-tweaks:journeys src/app/checkout/     → journeys for checkout-related files
```

### Pipeline context (invoked by parent skill):

The parent skill passes:
- **Changed files** — files modified during the build
- **Spec or design doc context** — what was built and why

## Step 1: Determine Affected Journeys

> **Parallel execution:** Use parallel tool calls aggressively — all Read operations on journey files and changed source files are independent and should run concurrently.

Analyze what was built and identify journeys it enables or modifies — for any persona (end users, admins, developers, internal tooling users):

1. **Resolve scope** — from arguments, parent context, or git diff
2. **Scan existing journeys** — read `docs/journeys/*.md` to see if any existing journey includes pages, flows, features, CLI commands, or APIs that were just built or changed
3. **Identify new journeys** — if the work introduces a new flow for any persona that doesn't map to an existing journey, a new journey file is needed
4. **No interaction surface** — if the work has no flow impact for any persona (pure internal refactor, library-only changes with no behavioral shift), report "No user-facing journeys affected" and stop

## Step 2: Create New Journey Files

For each new journey identified, create a file at `docs/journeys/{journey-name}.md`:

```markdown
---
files:
  - {path/to/key-source-file.ts}
  - {path/to/another-file.ts}
---

# {Journey Name}

**Persona:** {Who is this user? Be specific — not "user" but "first-time visitor with no account" or "developer setting up local environment"}
**Goal:** {What are they trying to accomplish?}
**Entry point:** {Where do they start? URL or trigger}
**Success state:** {What does "done" look like? What should they feel at the end?}

## Steps

### 1. {Step name} — {Page or action}
- **URL:** {path}
- **Action:** {What the user does}
- **Should feel:** {The emotional/experiential quality — "fast and effortless", "guided but not forced", "like an accomplishment"}
- **Should understand:** {What the user should know after this step}
- **Red flags:** {What would make this step fail experientially — not just functionally}

### 2. {Next step}
...

## Origin
- Created during build of {spec number or design doc}
- Steps {N-M} built in this session
- Related specs: {list}
```

### Key Principles

- **"Should feel" is the most important field.** It's what visual review tests against. Be specific — "low commitment" not "good."
- **`files:` enables regression detection.** List the key source files that implement this journey's functionality — components, API routes, pages, services. `/review` uses this to detect when a future build changes files that an existing journey depends on. Don't list every file — just the ones whose changes would affect the journey's behavior.
- **One journey per goal**, not per feature. A journey may span features from multiple specs.
- **Include the entry point and success state.** These bookend the journey and define what "complete" means.
- **Personas are specific people**, not roles. "Developer who just joined the team and is setting up for the first time" not "developer."

## Step 3: Update Existing Journey Files

If the work modifies or extends an existing journey:

1. Read the existing journey file
2. Add, update, or reorder steps to reflect what was built
3. Update the `files:` frontmatter — add new source files, remove files that are no longer relevant
4. Update the Origin section to reference the current build
5. Preserve existing "Should feel" and "Red flags" for steps that weren't changed — those are tested expectations

## Step 4: Commit

Commit journey files separately from implementation code:

```
git add docs/journeys/{journey-name}.md
git commit -m "Add/update {journey name} journey"
```

## Step 5: Report

```
### User Journeys

| # | Journey | Action | Steps | Persona |
|---|---------|--------|-------|---------|
| 1 | {name} | Created | {N} steps | {persona} |
| 2 | {name} | Updated | +{N} steps, {M} modified | {persona} |
```

(or: "No user-facing journeys affected.")

### Standalone Next Actions

When invoked directly (not by a parent skill), end with:

```
### Next Actions

1. `/claude-tweaks:stories` — generate QA stories from journeys **(Recommended)**
2. `/claude-tweaks:review journey:{name}` — visual review of a journey
3. `/claude-tweaks:test` — verify implementation
```

When invoked by a parent, omit Next Actions — the parent handles flow control.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Skipping journey capture for features with an interaction surface | Journeys are what visual review tests against — no journey means no QA anchor. This applies to all personas: end users, admins, developers, internal tooling users. |
| Writing journeys with vague "should feel" | "Good" and "intuitive" are not testable. "Low commitment" and "like an accomplishment" are. |
| Asking the user whether to create a journey | Journey capture is automatic. The user didn't know they needed the spec either — that's why the workflow exists. |
| Listing every source file in `files:` | Only list files whose changes would affect the journey's behavior — key components, API routes, pages. |
| One journey per feature instead of per goal | A journey may span features from multiple specs — organize by user goal, not implementation boundary. |
| Skipping update of existing journeys | When a build modifies an existing flow, the journey file must reflect the change — stale journeys produce false regression signals. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:build` | Invokes /journeys after implementation (Common Step 6). Passes changed files and spec context. |
| `/claude-tweaks:review` | Reviews journey coverage in lens 3g-cov. Detects journey regressions when changed files overlap with journey `files:` frontmatter. Visual review modes walk documented journeys. |
| `/claude-tweaks:stories` | Generates QA story YAML files from journey documentation. Stories reference their source journey via the `journey:` field. |
| `/claude-tweaks:test` | Validates QA stories derived from journeys. Supports `journey={name}` filter for journey-scoped test execution. |
| `/claude-tweaks:flow` | /flow's build step invokes /journeys transitively through /build. |
