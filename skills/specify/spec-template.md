# Spec Template

The spec must be detailed enough for `/superpowers:writing-plans` to produce a TDD execution plan without additional context. `/superpowers:writing-plans` assumes zero codebase familiarity — the spec provides the anchoring.

```markdown
---
tier: {1-5}
status: not-started
progress: 0
blocked-by: [{spec numbers or empty}]
surface: {frontend | backend | infra | mixed}
design-intent: {bold | quiet | minimal | delightful | onboarding | none}
recon-issue: {GitHub issue number, only when derived from one — omit otherwise}
recon-fingerprint: {fingerprint marker from the issue body, when present — omit otherwise}
code-health-effort: {low | medium | high — only when derived from a code-health issue carrying a code-health:effort-<tier> label; omit otherwise}
---

# {Number}: {Title}

## Overview

{1-2 paragraphs describing what this work unit delivers and why. Absorb key decisions and rationale from the design doc — the design doc will be deleted after this step.}

**Complexity:** {Low | Medium | High}
**Estimated tasks:** {3-8}

## Non-Goals

{Explicit boundaries. What this spec does NOT cover. Prevents `/superpowers:writing-plans` from scope-creeping beyond the work unit boundary.}

- {Thing that might seem in scope but isn't}
- {Related work that belongs in a different spec}

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| {N} | {title} | {status} |

## Current State

{What already exists in the codebase that this work builds on. Not a code dump — pointers that give `/superpowers:writing-plans` its starting points.}

- Data: `{path}` — {what tables/models exist}
- API: `{path}` — {what endpoints exist}
- UI: `{path}` — {what components exist}
- Tests: `{path}` — {what test patterns to follow}

## Deliverables

- [ ] {Concrete deliverable 1}
- [ ] {Concrete deliverable 2}
- [ ] ...

## Acceptance Criteria

1. {Specific, testable criterion that `/superpowers:writing-plans` can convert to a TDD step}
2. {Specific, testable criterion}
3. ...

## Technical Approach

{Key architectural decisions absorbed from the design doc, specific to this work unit.}

### Data / API Surface

{If this spec involves data model or API changes, define the contract surface. Table/model names, field types, endpoint signatures, validation schemas. Not full implementation — just enough for `/superpowers:writing-plans` to generate exact code.}

### Key Files

- `{path}` — {what changes or new file purpose}
- `{path}` — {what changes}

### Package Dependencies

- `{package}` — {what's needed from it}

## Gotchas

{Things learned during brainstorming, from past experience, or from project memory that `/superpowers:writing-plans` won't know. These prevent common subagent mistakes.}

- {e.g., "Use upsert, not delete+insert for this operation"}
- {e.g., "The status enum values are exactly: draft, published, archived"}
- {e.g., "This mutation needs a transaction — it modifies two tables atomically"}
- {e.g., "Import shared types from the contracts package, don't redeclare inline"}

## Decision Rationale (optional)

{Absorbed from the design doc. Why this approach was chosen, what alternatives were rejected, and key tradeoffs accepted. Only included in the first spec of a decomposition — subsequent specs reference "See Spec {N} Decision Rationale."}

## Assumptions (optional)

{Absorbed from the brief. Validated assumptions, surfaced blind spots, and hard constraints that shaped this spec. Only included when the brief contains assumptions relevant to this specific spec.}

## Open Questions (optional)

{Populated by /specify Step 5 multi-persona red-team. Each row is a question raised by a persona during red-team review. When empty, this section is omitted from the spec entirely — do not emit an empty header.}

| Persona | Finding | Suggested Resolution |
|---------|---------|---------------------|
| {Implementer | Maintainer | Skeptical Reviewer} | {finding text} | {resolution or "—"} |

{Resolve each row during Step 6 Self-Review: edit the spec to remove the ambiguity, or explicitly accept the finding inline. When all rows are resolved, delete the section.}

## Manual Steps

Operations that **cannot be automated by a capable CLI user** — not things that merely live outside the codebase. `/build` Step 2.5 probes each item at execution time; items with a CLI/API and credentials are run inline, not seeded as manual.

Only list an item here if at least one is true:
- **No CLI/API exists** — dashboard-only action, physical task, or vendor-side
- **Requires human judgment** — a name, value, or copy decision someone must make at execution time
- **Requires out-of-band signoff** — security review, legal approval, change-management ticket

State the reason in each entry using the `reason-not-auto` qualifier (see `/claude-tweaks:ledger` Required-for-ops section).

**Do not list** items like these — they have CLIs and will be auto-executed by `/build` Step 2.5:
- ~~"Set `STRIPE_SECRET_KEY` in production"~~ → `gh secret set` / `vercel env add` / `fly secrets set`
- ~~"Run `terraform apply`"~~ → shell command
- ~~"Register a Stripe webhook"~~ → `stripe webhooks create`
- ~~"Create a LaunchDarkly flag"~~ → `ldcli flags create`

Examples that **do belong here**:
- "Approve renewed Stripe terms of service in the dashboard (reason-not-auto: no-cli)"
- "Choose final display name for the meal-planning feature before launch copy is locked (reason-not-auto: requires-judgment)"
- "Get security review signoff on the new third-party data flow (reason-not-auto: requires-signoff)"

{If none: delete this section.}
```

## No Placeholders

Every spec section must contain content that `/superpowers:writing-plans` can act on without guessing. These are **spec failures, never write them**:

- `TBD`, `TODO`, `(to be filled in)`, incomplete sections, or vague requirements
- "Works correctly", "handles edge cases", "with appropriate validation" — without naming the specific behavior, the specific edge cases, or the specific validation rule
- "Similar to spec N" (cross-reference if the rationale carries; otherwise repeat the substance — the engineer may be reading specs out of order)
- Acceptance criteria that can't be converted to a TDD test (`"feels fast"` ≠ `"p95 < 200ms on the journey defined in spec 41"`)
- "Standard error handling" — name the error class, the user-facing message, the log format
- Types, models, endpoints, or files referenced anywhere in the spec that aren't defined in `Data / API Surface` or `Key Files`
- Gotchas that say "be careful" without saying what to do (`"watch out for races"` ≠ `"use upsert, not delete+insert"`)

If you would need `/superpowers:writing-plans` to guess, the spec is incomplete — finish it before handing off. Vagueness here compounds into plan failures downstream.

## Delete + Tombstone Acceptance Criteria

A spec that both (a) requires deleting a symbol and asserting a grep for it returns zero matches, and (b) requires leaving a tombstone comment naming that symbol (e.g., `// removed: parseLegacyConfig — see spec 311`) is structurally self-defeating: the tombstone comment is itself a match for the grep it's supposed to satisfy. This is not a one-off — any "delete + tombstone comment" acceptance criterion pair hits it.

When a spec calls for both deletion and a tombstone comment, do one of:
- **Scope the grep to exclude the tombstone** — e.g., `grep -rn "parseLegacyConfig" src/ | grep -v "// removed:"` returns zero matches. Default to this: it keeps the tombstone's full diagnostic value (naming exactly what was removed and why) without weakening the "fully deleted" guarantee the AC exists to provide.
- **Word the tombstone without the exact symbol name** (e.g., "see CHANGELOG.md for what was removed here") only when the exact name isn't operationally necessary for future readers — this is the fallback, not the default, since it loses the tombstone's specificity.

Never write a bare "zero matches anywhere" AC alongside a tombstone requirement without picking one of these — it fails at review time every time.

## Why Each Section Matters for `/superpowers:writing-plans`

| Section | What `/superpowers:writing-plans` does with it |
|---------|-------------------------------|
| **Overview** | Sets the goal and context for the plan header |
| **Non-Goals** | Prevents scope creep in task decomposition |
| **Current State** | Gives starting points — avoids blind codebase exploration |
| **Deliverables** | Maps to plan tasks (roughly 1 deliverable = 1-2 tasks) |
| **Acceptance Criteria** | Becomes the "verify" step in each TDD cycle |
| **Data / API Surface** | Enables exact code generation — names, types, endpoints |
| **Key Files** | Exact paths for the plan's "Files" section |
| **Gotchas** | Injected as constraints into subagent prompts |
| **Open Questions** | Reviewed during Step 6 Self-Review — must be resolved (clarified or accepted) before the spec is handed to `/superpowers:writing-plans`. The section is appended by Step 5 multi-persona red-team and is optional (omitted when red-team finds no general-location ambiguities). |
| **Manual Steps** | Classified at build start (Step 2.5) — auto-executable items run inline; only items that fail the triage (no-cli, requires-judgment, requires-signoff, auth-not-configured) seed the ledger as `ops` |

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

Declares the spec's creative direction. Used by `polish` mode's intent-driven dispatch (active in v4.5.0). The wrapper reads the field and invokes the matching command(s) on the changed UI files.

```yaml
design-intent: bold  # bold | quiet | minimal | delightful | onboarding | none
# or comma-separated for multiple intents:
design-intent: delightful, onboarding
```

| Value | Meaning | Polish-phase dispatch (active) |
|-------|---------|--------------------------------|
| `bold` | Eye-catching, confident — wants visual weight and presence | `/impeccable:impeccable bolder <files>` |
| `quiet` | Restrained, refined — wants to recede and let content lead | `/impeccable:impeccable quieter <files>` |
| `minimal` | Strip to essence — wants reduction, not addition | `/impeccable:impeccable distill <files>` (intent-only — avoids conflict with `/simplify`) |
| `delightful` | Personality, micro-interactions — wants to surprise the user | `/impeccable:impeccable delight <files>` then `/impeccable:impeccable animate <files>` (fixed pairing) |
| `onboarding` | First-run flows, empty states — wants to teach the user the surface | `/impeccable:impeccable onboard <files>` |
| `none` | No specific creative direction — auto-fit + issue-driven only | No intent-driven commands run |
| *(missing)* | Treated as `none` | Same as `none` |

The user can declare multiple intents (e.g., `design-intent: delightful, onboarding` for a "first-run experience that should feel playful"). `/specify` collects answers as comma-separated when the user replies with multiple numbers to the design-intent question.

### Why two fields, not one

`surface:` answers "is this even frontend work?" — gates the entire wrapper invocation.
`design-intent:` answers "what creative direction does this spec want?" — gates only intent-driven commands.

Keeping them separate means a frontend spec with no creative intent (`surface: frontend`, `design-intent: none`) still runs auto-fit + issue-driven commands but skips the intent-driven creative commands that would otherwise need explicit user direction. A backend spec (`surface: backend`) skips everything — no Impeccable invocations, no token cost.

### `recon-issue:` and `recon-fingerprint:` fields

Present only on specs derived from a GitHub issue — either directly (`/specify <issue-url>`, SKILL.md "Resolve the input" case 1) or via `/flow --from-code-health`'s batch path (`flow/from-code-health.md` Step 3, which stamps these itself rather than routing through case 1 — see that file).

```yaml
recon-issue: 142            # the GitHub issue number this spec resolves
recon-fingerprint: recon-a1b2c3d4   # from the issue body's <!-- code-health-fingerprint: ... --> marker, when present
```

| Field | Meaning | Consumer |
|-------|---------|----------|
| `recon-issue:` | The GitHub issue number to close when this spec's work merges | `/wrap-up` cleanup item 8 (issue-claim release, `cleanup-procedures.md` Section E) checks for this field's presence; cleanup item 5 (`cleanup-procedures.md` Section C) stamps the `Fixes #{issue}` closing-keyword carrier commit when it's present |
| `recon-fingerprint:` | The finding's fingerprint at issue-filing time, for future reverse-reconciliation (comparing against a freshly recomputed fingerprint to tell whether the flagged code has since changed) | Not yet consumed by any skill — write-only today; `recon-issue:` alone is sufficient for closure |
| `code-health-effort:` | The judged fix-cost tier from the originating code-health finding | `/claude-tweaks:build` Common Step 2 reads it to select the per-task implementer model tier (low→Fast, medium→Standard, high→Capable) when invoking `/superpowers:subagent-driven-development` |

Omit all three fields for specs not derived from a GitHub issue — there is no "none" sentinel; absence is the signal (same convention as `design-intent:`'s missing-field handling, but unlike it, absence here means "not applicable" rather than a default value). `code-health-effort:` is additionally omitted for specs derived from a non-code-health issue (e.g. a hand-filed bug report pulled via `--from-label`) even when `recon-issue:`/`recon-fingerprint:` are present, since only code-health's own findings carry an effort judgment.
