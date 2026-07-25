---
name: claude-tweaks:journeys
description: Use when you want to create or update user journey documentation for recently built features. Works standalone or as a step within /claude-tweaks:build.
argument-hint: "[<spec-number>|<file-path>...|--journey <name>]"
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
3. **`--journey <name>`** — target one existing (or new) journey directly by name, bypassing Step 1's scope resolution entirely — routes straight to Step 3 (Update Existing Journey Files) against `docs/journeys/{name}.md` if it exists, or Step 2 (Create New Journey Files) using `{name}` if it doesn't. This is the form `/claude-tweaks:journey-health` uses when recommending a re-run against a specific journey slug.
4. **No arguments** — use `git diff --name-only` against the base branch or recent commits

```
/claude-tweaks:journeys                       → analyze recent changes for journey impact
/claude-tweaks:journeys 42                    → journeys for spec 42's changes
/claude-tweaks:journeys src/app/checkout/     → journeys for checkout-related files
/claude-tweaks:journeys --journey checkout-flow → update the checkout-flow journey directly
```

### Pipeline context (invoked by parent skill):

The parent skill passes:
- **Changed files** — files modified during the build
- **Spec or design doc context** — what was built and why

## Step 1: Determine Affected Journeys

> **Parallel execution:** Use parallel tool calls aggressively — all Read operations on journey files and changed source files are independent and should run concurrently.

**`--journey <name>` exception:** skip this step entirely. Check whether `docs/journeys/{name}.md` exists — if it does, go straight to Step 3 (Update Existing Journey Files); if it doesn't, go straight to Step 2 (Create New Journey Files) using `{name}` as the journey-name. No scope resolution, existing-journey scan, or "no interaction surface" check applies — the caller already named the target.

Otherwise, analyze what was built and identify journeys it enables or modifies — for any persona (end users, admins, developers, internal tooling users):

1. **Resolve scope** — from arguments, parent context, or git diff
2. **Scan existing journeys** — read `docs/journeys/*.md` to see if any existing journey includes pages, flows, features, CLI commands, or APIs that were just built or changed
3. **Identify new journeys** — if the work introduces a new flow for any persona that doesn't map to an existing journey, a new journey file is needed
4. **Evidence checklist before concluding "no interaction surface"** — before reporting "No user-facing journeys affected" and stopping, check the diff against these 3 signals. Any single hit (OR, not AND across all three) disqualifies that conclusion:
   - **Signal 1 — Direct invocation surface:** does the diff touch a route/page/API endpoint/CLI command/exported function directly invoked by an end user, admin, or developer-user?
   - **Signal 2 — Observable output:** does the diff change any user-observable output (new field, error message, flag, response shape)?
   - **Signal 3 — Reachable capability:** does the diff add/remove/rename a capability reachable without reading source (a slash command, a CLI subcommand, a UI element)?

   **No signal fires** → report "No user-facing journeys affected" and stop.

   **Any signal fires** → the "no interaction surface" conclusion is disqualified. Re-examine items 2-3 above (the existing-journey scan and new-journey-need assessment) specifically in light of the fired signal(s) — don't let their earlier pass stand unquestioned. If that re-examination still concludes no journey update is warranted, log a one-line rationale citing which signal(s) fired and why the resulting change genuinely has no persona-visible effect worth documenting (e.g. "signal 1 fired — touches CLI command X, but X's behavior is unchanged, only an internal refactor of its implementation") before reporting "No user-facing journeys affected" — a disqualified case still needs its own evidence-anchored conclusion, not a silent return to the old unanchored judgment call.

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

Apply the four checks and the structural-validity check in `_shared/journey-self-review.md` (shared with `/claude-tweaks:journey-health`'s audit-time check).

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

## Step 3.6: Diagram Suggestion

Read the `diagram-suggestions` flag from CLAUDE.md (written by `/init` Step 11). When the flag is `disabled` or missing, skip this step silently.

When the flag is `enabled`, scan the journey file(s) just written/updated and detect the strongest signal:

| Journey contains | Signal | Suggested type |
|------------------|--------|-----------------|
| 2+ named personas or roles handing off between steps | `multi-persona` | `swimlane` |
| 3+ branches with named conditions (`If …`, "When the user is …", success-vs-error paths) | `decision-tree` | `flowchart` |
| 2+ external services / APIs the user passes through in sequence | `multi-actor` | `sequence` |
| None of the above | — | Skip — emit no recommendation |

Emit at most one recommendation per journey. Place the block above the "Step 4: Commit" output, prefixed `### Diagram suggestion`:

```
### Diagram suggestion

**Diagram suggestion:** This journey (`checkout-flow`) crosses 2 personas
(shopper → support agent). Consider a swimlane diagram:
`/claude-tweaks:visualize swimlane checkout-flow --source journeys`
```

The user decides whether to act — this is advisory, not automatic.

## Step 4: Commit

Commit journey files separately from implementation code. When a single invocation touches multiple journeys (see Step 5's Report table), commit each journey file separately — one commit per journey, using that journey's own name in the message — rather than one combined commit; this keeps `git log` traceable to a single journey per entry and matches the "separately from implementation code" rule at the file-granularity level, not just the code/docs boundary.

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
| Concluding "no interaction surface" without checking the 3-signal evidence checklist | An unanchored holistic judgment call produced zero true positives across this project's entire history (`docs/journeys/` never existed) despite the persona list explicitly including developers and internal tooling users — Step 1 item 4's checklist exists precisely so the conclusion is evidence-anchored, not a vibe call |
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
| `/claude-tweaks:journey-health` | Applies the same `_shared/journey-self-review.md` checks at audit time, on journeys nobody has touched recently. Never edits — files a GitHub issue instead of the fix-inline/stage/BLOCK routing this skill uses. |
| `_shared/journey-self-review.md` | Canonical four-check + structural-validity criteria Step 3.5 applies — shared with `/claude-tweaks:journey-health`'s audit-time check. |
| `/claude-tweaks:visualize` | Step 3.6 suggests invoking this skill when journey signals match (multi-persona → swimlane, decision branches → flowchart, multi-actor → sequence). Gated by `diagram-suggestions: enabled` in CLAUDE.md (written by `/init` Step 11). |
| `_shared/subagent-output-contract.md` | The Working-Directory Discipline rule referenced by Step 4 commit lives here (CWD anchoring before `git`). |
