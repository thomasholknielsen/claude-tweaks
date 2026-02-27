# Spec Template

The spec must be detailed enough for `/write-plan` to produce a TDD execution plan without additional context. `/write-plan` assumes zero codebase familiarity — the spec provides the anchoring.

```markdown
---
tier: {1-5}
status: not-started
progress: 0
blocked-by: [{spec numbers or empty}]
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
