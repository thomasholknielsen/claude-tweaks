---
name: claude-tweaks:visualize
description: Use when you want a themed, project-local visual diagram — architecture, flowchart, sequence, state, ER, timeline, swimlane, quadrant, nested, tree, org chart, layer stack, venn, or pyramid — generated as self-contained HTML+SVG and styled from the project's own DESIGN.md tokens. Works standalone or as a soft-hook suggestion from /journeys, /specify, and /review.
---
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.


# Visualize — Themed Diagram Generation

Generates a self-contained HTML+SVG diagram, themed from the project's own design tokens, embeddable in project docs and optionally publishable via the `Artifact` tool.

```
                       [ /claude-tweaks:visualize ] ← utility (no fixed lifecycle position)
                                    ↑
   Used by: /claude-tweaks:journeys (Step 3.6), /claude-tweaks:specify (Step 2.5d),
            /claude-tweaks:review (Lens 3i-diagram), ad-hoc direct invocation
```

## When to Use

- A journey, spec, or review finding describes something a diagram would clarify — a state machine, a data model, a multi-actor flow, a decision tree, or a layered architecture.
- You want a quick diagram of an idea mid-conversation, whether or not it ends up as a committed project doc.
- You want to replace a hand-drawn or stale diagram with one that matches the project's actual current palette.

## Input

`$ARGUMENTS` is parsed as `<type> <topic>`:

| Type | Diagram |
|------|---------|
| `architecture` | 3+ components/services in a system layout |
| `flowchart` | Branching logic with named conditions |
| `sequence` | 2+ actors exchanging messages over time |
| `state` | An entity has named states + transitions |
| `er` | Schema/entities with relations |
| `timeline` | Ordered events along a fixed axis |
| `swimlane` | A process crosses 2+ roles/departments |
| `quadrant` | Two-axis ranking |
| `nested` | Contained/grouped relationships |
| `tree` | Parent-child hierarchy, taxonomy |
| `org-chart` | Reporting structure |
| `layers` | Abstraction levels (transport → app → ui) |
| `venn` | Set overlap |
| `pyramid` | Stacked priority/maturity levels |

`<topic>` is free text describing what to diagram. If `$ARGUMENTS` is empty, ask the user for both.

Flags:
- `--source <caller>` — set by soft-hook callers (`journeys`, `specify`, `review`) to select default placement (Step 4) without prompting.

## Workflow

### Step 1: Resolve type, topic, and generation path

Resolve `<type>` from Input. Look up the generation path — **enhanced** when the `d2` binary is installed (`d2 --version` exits 0) and the type has a D2-native mapping; **baseline** otherwise (always available):

| Type | Path | D2 construct |
|---|---|---|
| `sequence` | Enhanced | `shape: sequence_diagram` |
| `er` | Enhanced | `shape: sql_table` |
| `architecture`, `flowchart`, `tree`, `layers`, `state`, `org-chart`, `nested` | Enhanced | Container-based directed graph |
| `quadrant` | Enhanced (tentative — confirm against current D2 docs; fall back to baseline if unsupported) | Grid layout |
| `timeline`, `swimlane`, `venn`, `pyramid` | Baseline only | No native fit |

For the enhanced path, read `d2-enhanced-path.md` in this skill's directory, then continue at this file's Step 4. For the baseline path, continue directly below.

### Step 2: Token extraction and theming (baseline path)

Read `skills/_shared/visual-html-output.md` Steps 1-2. Extract tokens from `DESIGN.md`/`DESIGN.json` when present; otherwise run the fallback `AskUserQuestion` (once per session — see the dedupe rule in that file).

### Step 3: Generate the core fragment (baseline path)

Author the `<svg>` content directly for the diagram type and topic, binding every color to `var(--token-name)` from Step 2's extracted (or neutral fallback) palette. Follow `visual-html-output.md` Step 3's scoping rule — every custom class prefixed with a unique per-diagram slug.

### Step 4: Resolve placement

| Caller (`--source`) | Placement |
|---|---|
| `journeys` | `docs/journeys/{journey-name}-{type}.html` |
| `specify` | `docs/plans/{spec-slug}-{type}.html` |
| `review` | Ephemeral by default; ask before persisting near `docs/architecture.md` |
| *(none — direct invocation)* | Run `visual-html-output.md` Step 7's `AskUserQuestion`; "Save as a project doc" resolves to `docs/diagrams/{slug}.html` |

### Step 5: Write wrapper outputs

Apply `visual-html-output.md` Step 4's adapters. Always write the standalone-file wrapper to the path from Step 4. Write the markdown-embed wrapper's content inline in this skill's own response (for the user to copy into a doc) rather than as a separate file — it's a snippet, not a standalone artifact.

### Step 6: Offer to publish via Artifact

Call `AskUserQuestion`: `question`: `"Also publish this as a shareable Artifact link?"`, `header`: `"Artifact"`, options `"Yes"` / `"No"` — no default marked Recommended; this is a genuine toss-up, not a best-practice call. On `"Yes"`, read `artifact-publish.md` in this skill's directory.

### Step 7: Registry update (persisted diagrams only)

If Step 4 resolved to `docs/diagrams/{slug}.html` (the context-free fallback path) and no `REGISTRY.md` row for `docs/diagrams/` exists yet, add one: `| docs/diagrams/ | Generated visual diagrams | — |` (no Auto-detect — matches `architecture.md`/`decisions/*.md` treatment). Diagrams placed under `docs/journeys/` or `docs/plans/` need no new row — they ride along with that doc's existing registry entry.

## Component-Skill Contract

When `$PIPELINE_RUN_DIR` is set, `/claude-tweaks:visualize` is running inside a pipeline (invoked by `/claude-tweaks:journeys`, `/claude-tweaks:specify`, `/claude-tweaks:review`, or another pipeline orchestrator). In that case omit the `## Next Actions` block — the parent owns the handoff.

Direct invocation may pass `--source <parent-skill>` as an explicit fallback when ambiguity exists (rare; `$PIPELINE_RUN_DIR` is the primary signal).

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Regenerating the core fragment separately per wrapper | The standalone file, markdown embed, and Artifact-published version drift apart. Generate once (Step 3), wrap three ways (Step 5). |
| Re-asking the DESIGN.md fallback question every invocation | Annoys a user who's already decided not to use Impeccable. Dedupe per session (`visual-html-output.md` Step 2). |
| Forcing a baseline-only type through the D2 enhanced path | Timeline/swimlane/venn/pyramid have no graph-shaped representation — this fights the tool the same way theming fights Mermaid/D2's own engines. |
| Auto-invoking the `Artifact` tool without asking | Publishing is always an explicit `AskUserQuestion` — never automatic, and silently skipped (not failed) if the tool isn't present in the session. |
| Writing every diagram to a single central `docs/diagrams/` folder regardless of caller | Co-locate with what the diagram illustrates (Step 4) — `docs/diagrams/` is the fallback for context-free invocations only. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:journeys` | Step 3.6 invokes this skill with `--source journeys` when a journey shows a multi-persona, decision-tree, or multi-actor signal. |
| `/claude-tweaks:specify` | Step 2.5d invokes this skill with `--source specify` for every surface (not just frontend) when the design doc describes a state machine, schema, multi-actor flow, decision tree, layered architecture, or hierarchy. |
| `/claude-tweaks:review` | Lens 3i-diagram invokes this skill with `--source review` as an informational finding when the diff added structural complexity with no matching diagram on disk. |
| `/claude-tweaks:design` | Not invoked directly — this skill reads `DESIGN.md`/`DESIGN.json` (written by `/impeccable:impeccable document`, the same files `/design pre-build` mode lazy-loads) but does not go through the `/design` wrapper, since it needs the raw token data, not a critique/audit/polish action. |
| `/claude-tweaks:init` | Step 11 offers to enable diagram suggestions (writes `diagram-suggestions: enabled/disabled` to CLAUDE.md — no install step, this skill is native). |
| `skills/_shared/visual-html-output.md` | Shared core this skill consumes for token extraction, wrapper adapters, MDX/Nextra compatibility, and the persist-vs-ephemeral decision. |

## Next Actions

After generating (and, if accepted, publishing), call `AskUserQuestion` with `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`, and:

- Option 1 — `label`: `"Generate another diagram (Recommended if more signals matched)"`, `description`: `"/claude-tweaks:visualize <type> <topic> — generate another diagram"`
- Option 2 — `label`: `"Continue the calling flow"`, `description`: `"Return to wherever this was invoked from (journey commit, spec summary, review findings)"`
- Option 3 (only when persisted) — `label`: `"View the file"`, `description`: `"Open {path} to see the generated diagram"`
