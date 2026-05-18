# Diagram Integration — Soft-Hook Procedure

Canonical procedure for skills that surface "consider a diagram here" recommendations via the [`cathrynlavery/diagram-design`](https://github.com/cathrynlavery/diagram-design) companion plugin. Referenced from `/journeys` (Step 3.6), `/specify` (Step 2.5d), and `/review` (Lens 3i extension).

This is a **soft-hook contract** — claude-tweaks never invokes diagram-design directly. It emits a one-line recommendation the user (or Claude) can act on in the conversation. Diagram-design has no slash command — its skill auto-triggers from its YAML description when the conversation calls for a diagram.

## When to read this file

A caller reads this file only when ALL of the following hold:

1. The caller's signal-detection step matched (e.g., journey has multiple personas; spec mentions a state machine; diff added structural complexity).
2. The `diagram-integration` flag is `enabled` in the project's CLAUDE.md.
3. The caller has not already emitted a diagram recommendation for the same artifact in this run.

If any condition fails, skip silently — do NOT emit a recommendation, do NOT log, do NOT prompt the user.

## Step 1: Read the flag

Read the project's CLAUDE.md and look for a `diagram-integration:` line (typically under the `## Design integration` section).

| Value | Behavior |
|-------|----------|
| `enabled` | Proceed to Step 2 |
| `disabled` | Skip silently — do not emit a recommendation |
| *(missing)* | Skip silently — treat as `disabled` |

The flag is set by `/init` Phase 0.95. Pre-v4.7 projects will have it missing; that is correct silent-skip behavior, not an error.

## Step 2: Map signal → diagram type

The caller passed in a signal name. Use this mapping to pick the diagram type:

| Signal | Diagram type | Suggest when |
|--------|--------------|--------------|
| `multi-actor` | `sequence` | 2+ services / actors exchange messages over time |
| `multi-persona` | `swimlane` | A journey or process crosses 2+ roles / departments |
| `state-machine` | `state` | An entity has named states + transitions |
| `data-model` | `er` | New schema / entities with relations |
| `decision-tree` | `flowchart` | Branching logic with named conditions |
| `architecture` | `architecture` | 3+ components / services in a system layout |
| `hierarchy` | `tree` | Parent-child relationships, taxonomy |
| `layers` | `layers` | Abstraction levels (e.g., transport → app → ui) |
| `chronology` | `timeline` | Ordered events along a fixed axis |
| `prioritization` | `quadrant` | Two-axis ranking (urgent/important, etc.) |

When more than one signal matches a single artifact, suggest the **most specific** one and stop — never emit more than two suggestions per artifact (noise).

## Step 3: Emit the recommendation

Use this canonical phrasing (substitute the bracketed parts):

```
**Diagram suggestion:** This {artifact} describes a {signal-description}.
Consider creating a {diagram-type} diagram — the `diagram-design` plugin
will generate one if you ask Claude to draw it. Suggested output path:
`docs/diagrams/{slug}.html`.
```

**Slug convention:** kebab-case derived from the artifact name. Examples:
- Journey `checkout-flow` → `docs/diagrams/checkout-flow-swimlane.html`
- Spec `42-order-state-machine` → `docs/diagrams/42-order-state.html`
- Review finding for `src/state/` → `docs/diagrams/order-lifecycle-state.html`

**Format placement** depends on the caller:
- `/journeys` — block above "Step 4: Commit" in the skill's output
- `/specify` — block above Step 9 summary in the skill's output
- `/review` — single row in the Lens 3i findings table with severity `Low`, category `Docs`

The user (or Claude on the user's behalf) decides whether to act. The plugin has no slash command — acting means saying "yes, draw the state diagram" in the next turn, at which point diagram-design's skill auto-triggers.

## Step 4: Audit log (auto mode only)

When running inside a pipeline (`$PIPELINE_RUN_DIR` is set), write a one-line entry to `$PIPELINE_RUN_DIR/decisions.md`:

```
STAGED {HH:MM:SS} — diagram-suggestion: {caller} suggested {diagram-type} for {artifact}. User can accept in next turn. Reversibility: high.
```

This is `STAGED`, not `AUTO` — the recommendation is *surfaced*, not *acted on*. If the user accepts in the conversation and Claude invokes diagram-design, that invocation is a normal tool call (not logged here).

## Skip / no-op cases

- Flag is `disabled` or missing → silent skip, no log
- Caller already emitted a recommendation for this artifact in this run → silent skip
- Signal is too weak to be confident → silent skip (better to under-recommend than spam)

## Why this is one-shot, not a full integration

diagram-design has no callable surface (no CLI, no slash command). claude-tweaks can only nudge — the actual invocation happens conversationally when the user accepts. That's the entire integration contract.

Do not attempt to:
- Auto-invoke diagram-design via the Task tool or a wrapper
- Track declines beyond the in-run dedupe in "Skip / no-op cases"
- Generate the diagram content from claude-tweaks — diagram-design owns the editorial system

If the user repeatedly declines diagram recommendations, that's a sign they prefer to flip `diagram-integration: disabled` — not a sign claude-tweaks should silence itself heuristically.
