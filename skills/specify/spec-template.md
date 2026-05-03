# Spec Template

The spec must be detailed enough for `/write-plan` to produce a TDD execution plan without additional context. `/write-plan` assumes zero codebase familiarity — the spec provides the anchoring.

```markdown
---
tier: {1-5}
status: not-started
progress: 0
blocked-by: [{spec numbers or empty}]
surface: {frontend | backend | infra | mixed}
design-intent: {bold | quiet | minimal | delightful | onboarding | none}
---

# {Number}: {Title}

## Overview

{1-2 paragraphs describing what this work unit delivers and why. Absorb key decisions and rationale from the design doc — the design doc will be deleted after this step.}

**Complexity:** {Low | Medium | High}
**Estimated tasks:** {3-8}

## Non-Goals

{Explicit boundaries. What this spec does NOT cover. Prevents `/write-plan` from scope-creeping beyond the work unit boundary.}

- {Thing that might seem in scope but isn't}
- {Related work that belongs in a different spec}

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| {N} | {title} | {status} |

## Current State

{What already exists in the codebase that this work builds on. Not a code dump — pointers that give `/write-plan` its starting points.}

- Data: `{path}` — {what tables/models exist}
- API: `{path}` — {what endpoints exist}
- UI: `{path}` — {what components exist}
- Tests: `{path}` — {what test patterns to follow}

## Deliverables

- [ ] {Concrete deliverable 1}
- [ ] {Concrete deliverable 2}
- [ ] ...

## Acceptance Criteria

1. {Specific, testable criterion that `/write-plan` can convert to a TDD step}
2. {Specific, testable criterion}
3. ...

## Technical Approach

{Key architectural decisions absorbed from the design doc, specific to this work unit.}

### Data / API Surface

{If this spec involves data model or API changes, define the contract surface. Table/model names, field types, endpoint signatures, validation schemas. Not full implementation — just enough for `/write-plan` to generate exact code.}

### Key Files

- `{path}` — {what changes or new file purpose}
- `{path}` — {what changes}

### Package Dependencies

- `{package}` — {what's needed from it}

## Gotchas

{Things learned during brainstorming, from past experience, or from project memory that `/write-plan` won't know. These prevent common subagent mistakes.}

- {e.g., "Use upsert, not delete+insert for this operation"}
- {e.g., "The status enum values are exactly: draft, published, archived"}
- {e.g., "This mutation needs a transaction — it modifies two tables atomically"}
- {e.g., "Import shared types from the contracts package, don't redeclare inline"}

## Decision Rationale (optional)

{Absorbed from the design doc. Why this approach was chosen, what alternatives were rejected, and key tradeoffs accepted. Only included in the first spec of a decomposition — subsequent specs reference "See Spec {N} Decision Rationale."}

## Assumptions (optional)

{Absorbed from the brief. Validated assumptions, surfaced blind spots, and hard constraints that shaped this spec. Only included when the brief contains assumptions relevant to this specific spec.}

## Manual Steps

{Operations a human must perform after this spec is built and merged. Things the pipeline cannot do — only detect.}

- {e.g., "Set `STRIPE_SECRET_KEY` in production environment"}
- {e.g., "Run `terraform apply` in `infra/payments/`"}
- {e.g., "Register a webhook at the payment provider dashboard for `/api/webhooks/stripe`"}
- {e.g., "Create feature flag `enable_meal_planning` in LaunchDarkly"}

{If none: delete this section.}
```

## Why Each Section Matters for `/write-plan`

| Section | What `/write-plan` does with it |
|---------|-------------------------------|
| **Overview** | Sets the goal and context for the plan header |
| **Non-Goals** | Prevents scope creep in task decomposition |
| **Current State** | Gives starting points — avoids blind codebase exploration |
| **Deliverables** | Maps to plan tasks (roughly 1 deliverable = 1-2 tasks) |
| **Acceptance Criteria** | Becomes the "verify" step in each TDD cycle |
| **Data / API Surface** | Enables exact code generation — names, types, endpoints |
| **Key Files** | Exact paths for the plan's "Files" section |
| **Gotchas** | Injected as constraints into subagent prompts |
| **Manual Steps** | Seeded into the ledger as `ops` phase items at build start — surfaced in the final summary so nothing is forgotten |

## Frontmatter reference (canonical spec)

This section is the canonical definition of the design-related frontmatter fields. Other docs (`skills/design/frontend-detection.md`, `skills/design/SKILL.md`, `skills/specify/SKILL.md`) reference this section as the source of truth.

### `surface:` field

Declares which surface area of the system the spec touches. Used by `/claude-tweaks:design`'s Layer 2 detection to decide whether to invoke Impeccable on this spec.

```yaml
surface: frontend  # frontend | backend | infra | mixed
```

| Value | Meaning | Wrapper behavior |
|-------|---------|------------------|
| `frontend` | The spec touches UI code — components, pages, styles, routes | Layer 2 passes; Layer 3 sniff still runs to filter file lists |
| `backend` | The spec touches server-side code only — APIs, services, data access, jobs | Layer 2 skips — wrapper returns `{skipped: "non-frontend spec (surface declared)"}` |
| `infra` | The spec touches infrastructure-as-code, CI/CD, deployment, container config | Layer 2 skips — same as `backend` |
| `mixed` | The spec touches both frontend and backend (full-stack feature) | Layer 2 passes; Layer 3 sniff filters changed files to UI-only for Impeccable's purposes |
| *(missing)* | Falls through to Layer 3 file-extension sniff | Pre-Phase 2 specs lack this field; behavior is unchanged |

`/specify` writes this field on every new spec (Phase 2+). For specs created before Phase 2, the field is absent and Layer 3 sniff handles them correctly — there is no need to backfill historical specs.

### `design-intent:` field

Declares the spec's creative direction. Used by Phase 3's intent-driven dispatch in `polish` mode. Phase 2 reads but does not act on the field; Phase 3 will dispatch the matching command.

```yaml
design-intent: bold  # bold | quiet | minimal | delightful | onboarding | none
# or comma-separated for multiple intents:
design-intent: delightful, onboarding
```

| Value | Meaning | Phase 3 dispatch (forward-compat) |
|-------|---------|-----------------------------------|
| `bold` | Eye-catching, confident — wants visual weight and presence | `/impeccable bolder <files>` becomes eligible |
| `quiet` | Restrained, refined — wants to recede and let content lead | `/impeccable quieter <files>` becomes eligible |
| `minimal` | Strip to essence — wants reduction, not addition | `/impeccable distill <files>` becomes eligible (intent-only — avoids conflict with `/simplify`) |
| `delightful` | Personality, micro-interactions — wants to surprise the user | `/impeccable delight <files>` becomes eligible |
| `onboarding` | First-run flows, empty states — wants to teach the user the surface | `/impeccable onboard <files>` becomes eligible |
| `none` | No specific creative direction — auto-fit + issue-driven only | No intent-driven commands run |
| *(missing)* | Treated as `none` | Same as `none` |

The user can declare multiple intents (e.g., `design-intent: delightful, onboarding` for a "first-run experience that should feel playful"). `/specify` collects answers as comma-separated when the user replies with multiple numbers to the design-intent question.

### Why two fields, not one

`surface:` answers "is this even frontend work?" — gates the entire wrapper invocation.
`design-intent:` answers "what creative direction does this spec want?" — gates only intent-driven commands.

Keeping them separate means a frontend spec with no creative intent (`surface: frontend`, `design-intent: none`) still runs auto-fit + issue-driven commands but skips the intent-driven creative commands that would otherwise need explicit user direction. A backend spec (`surface: backend`) skips everything — no Impeccable invocations, no token cost.
