---
name: claude-tweaks:journeys
description: Use when you want to create or update user journey documentation for recently built features. Works standalone or as a step within /claude-tweaks:build.
---
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.


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

For each new journey identified, create a file at `docs/journeys/{journey-name}.md` using the template + key principles in `journey-template.md` in this skill's directory. The template covers frontmatter, persona/goal/entry-point/success-state framing, the per-step structure (URL / Action / Should feel / Should understand / Red flags), and the Origin trailer.

## Step 3: Update Existing Journey Files

If the work modifies or extends an existing journey:

1. Read the existing journey file
2. Add, update, or reorder steps to reflect what was built
3. Update the `files:` frontmatter — add new source files, remove files that are no longer relevant
4. Update the Origin section to reference the current build
5. Preserve existing "Should feel" and "Red flags" for steps that weren't changed — those are tested expectations

## Step 3.5: Journey Self-Review

Before committing, look at the journey file(s) with fresh eyes. Fix issues inline — no subagent.

1. **Persona check** — is the persona named and consistent across steps? "User" is a placeholder; replace with the actual role (`new visitor`, `paid subscriber`, `admin`).
2. **Step shape** — does each step have an action, a result, and either a page URL or a verbatim UI signal? Steps that just describe the page ("On the dashboard...") with no action don't belong.
3. **Origin coverage** — every `files:` entry should be reachable through the documented steps. If a changed file isn't visited by any step, either add the missing step or drop the file from `files:`.
4. **Outcome clarity** — what does success look like for this journey? If the journey ends in ambiguity ("user is logged in" without where they land), tighten it.

**Decision gate:** make one fix attempt per issue. Issues that remain after one fix attempt route by mode:

**Auto mode** (pipeline run directory exists): stage unresolved issues to `staged/journeys-{journey-slug}.md` (one file per journey, using the journey's kebab-case slug) and continue — journey files are documentation, not code, so a stale persona or vague success state must not block the pipeline. The Wrap-Up Review Console surfaces the staged file for batch approval. Append to the auto-decision log under the `## /journeys` heading in `{run-dir}/decisions.md` (per `_shared/auto-decision-log.md`):

```
- STAGED {HH:MM:SS} — Step 3.5: {N} journey self-review issues remain after one fix attempt. Stage path: staged/journeys-{journey-slug}.md. Reversibility: high.
```

Only BLOCK when the journey file is structurally invalid (missing required frontmatter, missing `## Steps` heading, no steps at all) — those are degraded output the caller must address before continuing.

**Interactive mode:** return control to the caller with status `BLOCKED` and the unresolved issues:

```
BLOCKED
Reason: journey self-review issues remain after one fix attempt.
Unresolved:
- {issue 1, file:line if applicable}
- {issue 2, ...}
Next: caller decides whether to escalate, defer, or accept.
```

> The `BLOCKED` status word here matches the Subagent Contract's `BLOCKED` (one of `DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED`). When `/journeys` is invoked from a parent skill (e.g., `/build`), the parent treats `BLOCKED` exactly like any other subagent BLOCKED — diagnose and re-dispatch with more context, or escalate. When invoked directly by a user, render the same block — the user is the "caller" who decides next steps.

Do NOT loop on fix attempts or silently ship a journey with known self-review issues.

## Step 3.6: Diagram Suggestion (companion plugin)

Soft-hook for the [`cathrynlavery/diagram-design`](https://github.com/cathrynlavery/diagram-design) companion plugin. Read the flag from CLAUDE.md (Step 1 of `_shared/diagram-integration-check.md`). When the flag is `disabled` or missing, skip this step silently.

When the flag is `enabled`, scan the journey file(s) just written/updated and detect the strongest signal:

| Journey contains | Signal |
|------------------|--------|
| 2+ named personas or roles handing off between steps | `multi-persona` (suggests `swimlane`) |
| 3+ branches with named conditions (`If …`, "When the user is …", success-vs-error paths) | `decision-tree` (suggests `flowchart`) |
| 2+ external services / APIs the user passes through in sequence | `multi-actor` (suggests `sequence`) |
| None of the above | Skip — emit no recommendation |

Emit at most one recommendation per journey, formatted per Step 3 of `_shared/diagram-integration-check.md`. Place the block above the "Step 4: Commit" output, prefixed `### Diagram suggestion`.

Example output:

```
### Diagram suggestion

**Diagram suggestion:** This journey (`checkout-flow`) crosses 2 personas
(shopper → support agent). Consider a swimlane diagram — the `diagram-design`
plugin will generate one if you ask Claude to draw it. Suggested output path:
`docs/diagrams/checkout-flow-swimlane.html`.
```

The user (or Claude on the user's behalf) decides whether to act — the plugin auto-triggers from its skill description if asked.

## Step 4: Commit

Commit journey files separately from implementation code.

### Working Directory Discipline

Apply the Working Directory Discipline rule from `_shared/subagent-output-contract.md` before any `git` command. On mismatch, return **BLOCKED** to the caller; do not commit from the wrong directory. Also follow `_shared/git-discipline.md` for the Git Rules.

### Commit commands

```
# Preferred when $WORKTREE is set:
git -C "$WORKTREE" add docs/journeys/{journey-name}.md
git -C "$WORKTREE" commit -m "Add/update {journey name} journey"

# Otherwise (after pwd verification above):
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

## Next Actions

When invoked directly (not by a parent skill), call `AskUserQuestion` with `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`, and:

- Option 1 — `label`: `"Generate QA stories (Recommended)"`, `description`: `"/claude-tweaks:stories — generate QA stories from journeys"`
- Option 2 — `label`: `"Visual review"`, `description`: `"/claude-tweaks:visual-review journey:{name} — visual review of a journey"`
- Option 3 — `label`: `"Verify"`, `description`: `"/claude-tweaks:test {spec} — verify implementation"`

When invoked by a parent, omit Next Actions — the parent handles flow control.

## Component-Skill Contract

This skill is a **component skill** — invoked by `/claude-tweaks:build` (Common Step 6). Parent invocation is signaled by `$PIPELINE_RUN_DIR` being set (the parent is running inside an active pipeline run). When invoked by a parent, omit the `## Next Actions` block — the parent owns the handoff. When invoked directly by a user (no `$PIPELINE_RUN_DIR`), render Next Actions as shown above.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Skipping journey capture for features with an interaction surface | Journeys are what visual review tests against — no journey means no QA anchor. This applies to all personas: end users, admins, developers, internal tooling users. |
| Writing journeys with vague "should feel" | "Good" and "intuitive" are not testable. "Low commitment" and "like an accomplishment" are. |
| Writing a journey with no `## Steps` heading | Step 3.5 self-review BLOCKs on structurally-invalid journey files — missing `## Steps` is the most common cause. Always render the heading even if the step list is short. |
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
| `/claude-tweaks:visual-review` | Visual review walks documented journeys (`journey:{name}` mode) and tests against each step's "should feel" expectations. |
| `/claude-tweaks:help` | /help references /journeys in the workflow diagram and reference card. |
| `_shared/auto-mode-contract.md` | Single source of truth for auto-mode behavior — read before adding any auto-mode handling |
| `_shared/auto-decision-log.md` | Canonical schema and path for the auto-decision log written in Step 3.5 (`{run-dir}/decisions.md` under `## /journeys`). |
| `_shared/diagram-integration-check.md` | Step 3.6 reads this for the flag check and signal→type mapping. Soft-hook only — emits a recommendation, never invokes the companion plugin. |
| `cathrynlavery/diagram-design` (companion) | Step 3.6 emits "consider a diagram here" recommendations when journey signals match (multi-persona → swimlane, decision branches → flowchart, multi-actor → sequence). Gated by `diagram-integration: enabled` in CLAUDE.md (written by `/init` Step 11). |
