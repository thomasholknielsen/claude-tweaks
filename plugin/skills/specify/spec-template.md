# Record Body Template

The record body must be detailed enough for `/superpowers:writing-plans` to produce a TDD execution plan without additional context. `/superpowers:writing-plans` assumes zero codebase familiarity — the body provides the anchoring.

This template covers the record's **body** only — the GitHub issue body, or the `local-files` twin's body text (`bin/lib/issues/local-store.js`). Title and Type are separate record fields, never body content — see `## Facets` at the end of this file for what lives outside the body.

Every record body opens with a short metadata block — plain body-metadata lines, never YAML frontmatter. `Surface:`, `Design-intent:`, and `Design-seed:` are lifted verbatim into the materialized header by `/flow`/`/build` at build time (spec 20's contract). `Visual-reference:` (when present) stays a body-metadata line only — `/claude-tweaks:build`'s `design-prebuild.md` reads it directly from the record body, not from the materialized header (not `/claude-tweaks:design-wrapper`'s `pre-build` mode, which never references this field). Legacy `frontend` (pre-migration spec frontmatter) reads as `web`; `mixed` is retired — pick the single dominant surface per sub-issue, since a unit that is genuinely both frontend and backend at once is a decomposition smell.

**`mobile` means a native app surface** — SwiftUI, UIKit, Compose, React Native, Flutter — not a web page viewed on a phone. A responsive web layout is `web`; use `mobile` only when the code being changed is native app code. The distinction is load-bearing rather than descriptive: `/claude-tweaks:design-wrapper` routes `mobile` to Impeccable's native track and skips the two web-only surfaces (the bundled HTML detector behind `test` mode, and `live` mode) rather than running them and reporting a pass they could not have failed. Declaring `mobile` on a responsive web feature therefore turns the design CLI gate off for it. `desktop` takes the web path on a stated assumption — see the track-resolution table in `skills/design-wrapper/SKILL.md`, which is the single source of truth for how each value routes. `terminal` is a CLI/TUI surface — help text, output formatting, prompts, exit codes; it is declared only, never sniffed (no file extension implies it), and it takes the design pipeline's terminal track (`skills/design-wrapper/terminal-routing.md`). `Parent:` is decomposition-mode-only, present on a sub-issue's body only under `work-backend: github-issues` + `work-links: body-text` — the one combination with no other way to record a sub-issue's own parent (`work-links: native`'s sub-issue relationship is queryable from either side; `work-backend: local-files` carries `facets.parent`). `/claude-tweaks:review`'s Step 1.6 (`skills/review/SKILL.md`) reads it to resolve a sub-issue's parent when checking for a `## Cross-Spec Promises` section (`_shared/work-record.md`).

`Design-seed:` is the one metadata line **`/specify` never writes**. The template declares it so the line is a recognized body-metadata field rather than stray prose when it does appear; the *value* can only be written after the build, because it comes from the direction contract Impeccable puts in the built artifact and `/specify` runs before any code exists. `/claude-tweaks:design-wrapper`'s `review` mode writes it post-build, per `_shared/design-contract.md`. Do not copy `Design-intent:`'s pattern here and go looking for a value at shaping time — there is nothing to read yet. The field is **never required**: a `ready` sub-issue without one is normal and stays valid, exactly as with `Surface:`, and no structural check may start demanding it. Most records will never carry one, since most work is not a new design surface.

```markdown
Surface: {web | mobile | desktop | backend | infra | terminal}
Design-intent: {bold | quiet | minimal | delightful | onboarding | none}
Design-seed: {the seed key from the built artifact's Impeccable direction contract, copied verbatim — NOT written by /specify; see below}
Visual-reference: {path to an accepted shape-time scaffold file — omitted when /specify's Step 2.5b-ii variant-exploration step was skipped, declined, or not offered (non-frontend records)}
Parent: {#N — decomposition-mode sub-issues under work-links: body-text only; omitted otherwise (native links, work-backend: local-files, and Shaping mode)}

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

{Key architectural decisions absorbed from the design doc, specific to this work unit. When a `/claude-tweaks:research` report already exists for this topic — prior-art lookup, dependency behavior, or an existing convention elsewhere in the codebase — cite its finding directly here (or in Gotchas below) rather than re-deriving it; `docs/skill-graph.md`'s `## specify` section names this as the advisory research↔specify edge.}

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

State the reason in each entry using the `reason-not-auto` qualifier (see `_shared/ledger-format.md`'s Required-for-ops section).

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
- An AC asserting "styling/classes are unchanged" as literal string equality (`className === "flex p-4 text-sm"` ≠ class-*set* equivalence or a rendered/visual check) — a class-sorting formatter such as `prettier-plugin-tailwindcss` reorders class tokens on every commit, making literal-string equality structurally unenforceable

If you would need `/superpowers:writing-plans` to guess, the spec is incomplete — finish it before handing off. Vagueness here compounds into plan failures downstream.

## Delete + Tombstone Acceptance Criteria

A spec that both (a) requires deleting a symbol and asserting a grep for it returns zero matches, and (b) requires leaving a tombstone comment naming that symbol (e.g., `// removed: parseLegacyConfig — see spec 311`) is structurally self-defeating: the tombstone comment is itself a match for the grep it's supposed to satisfy. This is not a one-off — any "delete + tombstone comment" acceptance criterion pair hits it.

When a spec calls for both deletion and a tombstone comment, do one of:
- **Scope the grep to exclude the tombstone** — e.g., `grep -rn "parseLegacyConfig" src/ | grep -v "// removed:"` returns zero matches. Default to this: it keeps the tombstone's full diagnostic value (naming exactly what was removed and why) without weakening the "fully deleted" guarantee the AC exists to provide.
- **Word the tombstone without the exact symbol name** (e.g., "see CHANGELOG.md for what was removed here") only when the exact name isn't operationally necessary for future readers — this is the fallback, not the default, since it loses the tombstone's specificity.

Never write a bare "zero matches anywhere" AC alongside a tombstone requirement without picking one of these — it fails at review time every time.

## Empirical Premise-Check Deliverables

When a spec's technical approach rests on an assumption about how an external system, harness, or tool actually behaves — an undocumented payload shape, an unconfirmed API contract, an assumed invocation path — write a blocking first deliverable ("Task 0") that captures the real behavior before any other deliverable's fixtures are written. Word its scope as an enumeration, not a single check, and cover every path that reaches the feature, not just every shape the resulting payload can take:

- **Who initiates it** — a person typing the trigger directly (a slash command, a manual action), the model invoking it as part of its own reasoning, a Task-dispatched subagent invoking it on the model's behalf, and a headless/non-interactive run (`claude -p`, a scheduled Routine) invoking it with no one watching. These are different code paths through the harness and can diverge in whether an event fires at all, not just in what it contains.
- **Every shape the payload can take once it does fire** — qualified vs. bare identifiers, success vs. failure, nested vs. top-level invocation.

Enumerating only the second list and skipping the first is the failure mode to design against: it reads as thorough (every input shape is covered) while silently leaving out an entire initiation path that never produces an event to shape-check in the first place — a gap no fixture built from the captured shapes can catch, because the missing case never got captured. Name each initiator path explicitly in the Task 0 deliverable's own text; do not let "covers all invocation shapes" stand in for it.

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

## Facets

Type, stage/scoring labels, and parent/dependency links are **record facets** — tracked on the record itself, never as free-form prose in the body's narrative. Type and stage/scoring are always native labels/frontmatter, outside the body entirely. Parent/dependency links follow the driver: native labels/frontmatter under `work-links: native` (or `local-files`), but under `work-links: body-text` they ARE literal body lines (`Parent: #N`, `Blocked by #N`) — structured, parseable markers, not narrative text, but body text nonetheless. The table below is the source of truth for which representation applies; the canonical taxonomy (the axes, the label names, who may set what) is `_shared/work-record.md`.

| Facet | `github-issues` | `local-files` |
|-------|------------------|----------------|
| Type | Native GitHub Issue Type (`work-types: native`) or a `type:*` label (`work-types: labels`) | `type:` frontmatter line |
| Stage + scoring | `ready`, `risk:*`, `size:*` labels | `stage:`, `risk:`, `size:` frontmatter lines |
| Parent marker (`isParentIssue`) — decomposition parent; carries the acceptance gate for its sub-issues | `parent-issue` label (a retired name is still read on the read side only — see `_shared/work-record.md`'s Label taxonomy) | `is-parent-issue: true` frontmatter line |
| Parent link | Sub-issue relationship (`work-links: native`) or a parent task-list entry (`- [ ] #{subIssueNum}`) + the sub-issue's own `Parent: #N` body line (`work-links: body-text`) | `parent:` frontmatter line |
| Dependency links | Blocked-by dependency API (`work-links: native`) or `Blocked by #N` body lines (`work-links: body-text`) | `blocked-by: [...]` frontmatter line |

The `local-files` frontmatter keys above are exactly `local-store.js`'s documented set (`bin/lib/issues/local-store.js`) — don't invent new keys here.

`/specify` adds `ready`, `risk:*`/`size:*` (when unstamped), and Type (when absent), and removes `parked` on promotion (plus the parent-guard residue strip on a parent-marked record — `_shared/work-record.md`'s matrix carries the carve-out); it never touches `auto:*`/`bot:*`. See `_shared/work-record.md`'s permission matrix for the complete rule set.
