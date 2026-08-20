# Diátaxis Genre Templates

Canonical skeletons for the six doc genres `/claude-tweaks:docs-health` recognizes (the four core Diátaxis genres, plus the two native-exempt genres it already judges — see `_shared/criteria-docs-diataxis.md` Dimension 1). Consumed by `/claude-tweaks:init` Phase 8.5 (missing-doc backlog items point here) and `/claude-tweaks:wrap-up`'s missing-doc detection (`skills/wrap-up/docs-health-integration.md`, which scaffolds directly from here and fills in real content).

This is the single source of truth for the ADR and Journey templates — `_shared/decision-records.md` and `journeys/journey-template.md` each keep their own non-template content (the ADR gate and location convention; the journey key-principles and file-location convention) and point here for the literal skeleton, rather than duplicating it.

## Genre declarations

What each genre claims about placement and naming, and whether a doc-creating path runs `_shared/existing-convention-detection.md` before writing one. "Owns filename" means the plugin prescribes a filename grammar, not merely content.

| Genre | Owns filename | Detection | Aliases to glob | Project-skill keywords |
|---|---|---|---|---|
| Tutorial | no | Phase 2 | — | — |
| How-To | no | Phase 2 | — | — |
| Reference | no | Phase 2 | — | — |
| Explanation | no | Phase 2 | — | — |
| Journey | `docs/journeys/{journey-name}.md` | Phase 2 | `docs/journeys/` | — |
| ADR | `docs/decisions/NNNN-{kebab-slug}.md` | **active** | `docs/decisions/`, `docs/adr/`, `docs/rfcs/` | `adr`, `architecture decision`, `decision record` |

A row marked `Phase 2` declares intent only — **no consumer reads it yet**, and nothing should behave as though one does. Wiring a row means adding its consumer and its `doc-convention.{genre}` key in the same change.

## Tutorial

Learning-oriented — a concrete guided exercise, start to finish. No unexplained jumps: a reader with zero context follows every step and confirms progress at each one. No branching decision points ("if you're on Windows...") — that belongs in a How-To. Minimize explanation — link out to an Explanation doc for "why," don't inline it.

```markdown
# Your First {Thing}

A hands-on walkthrough that gets you from nothing to a working {result}. By the end, you'll have {concrete artifact/outcome} — not just understood how it works, but built it yourself.

## What you'll need

- {Prerequisite 1 — a tool, an account, a prior step}
- {Prerequisite 2}

## Step 1: {First action}

{One or two sentences of context, then the imperative instruction.}

\`\`\`{language}
{exact command or code}
\`\`\`

You should now see {concrete, verifiable result}.

## Step 2: {Next action}

...

## What you built

{One paragraph recapping what now exists and works.}

## Next steps

- {Pointer to a How-To guide for a related task}
- {Pointer to a Reference doc for the thing just built}
```

## How-To

Task-oriented, goal-directed steps assuming competence — the reader already knows the fundamentals a Tutorial would teach. Every step exists because it's needed to reach the stated goal, nothing extra. Branches are fine here (unlike Tutorial) — real tasks have real conditions. No narrative "why" — link to Explanation for that.

```markdown
# How to {accomplish a specific task}

{One sentence stating exactly what this guide accomplishes and for whom.}

## Before you start

- {Assumption 1 — what the reader is expected to already know/have}
- {Assumption 2}

## Steps

1. {Imperative step}
   \`\`\`{language}
   {command}
   \`\`\`
2. {Next step}
3. {Next step, with a branch:}
   - If {condition A}: {action}
   - If {condition B}: {action}

## Verify it worked

{How to confirm the task succeeded — a command to run, an output to check.}

## Related

- {Link to Reference doc for the underlying system}
- {Link to another related How-To}
```

## Reference

Information-oriented — states facts, never narrates. Structured for lookup (tables, consistent field ordering), not start-to-finish reading. Stays neutral on "why" — a Reference that argues for a design choice has drifted into Explanation's genre. Exhaustive within its stated scope, or honestly narrower — never partially covering what its title claims.

```markdown
# {Subject} Reference

{One sentence stating what this reference covers — its exact scope, nothing more.}

## {Category/Table 1}

| Field | Type | Description |
|-------|------|-------------|
| {name} | {type} | {description} |

## {Category/Table 2}

- **{Item}** — {fact, no explanation of why it exists this way}

## See also

- {Link to related Reference doc}
- {Link to an Explanation doc for context/rationale}
```

## Explanation

Understanding-oriented — discursive prose, no steps, no tables. Answers "why," not "how": the reader isn't trying to accomplish a task right now, they're building a mental model. Honest about tradeoffs — a one-sided "why we're right" is marketing copy, not an Explanation.

```markdown
# Understanding {Concept}

{One paragraph framing the question this doc answers — not "what is X" but "why does X work this way, what tradeoff does it represent."}

## The problem

{What forces / constraints made this decision or design necessary.}

## The approach

{What was chosen and why, in prose — not a table, not numbered steps.}

## Tradeoffs

{What this makes easy, what it makes hard, what alternatives were passed over and why.}

## See also

- {Link to a Reference doc for the concrete facts/API this explains}
- {Link to a How-To guide for the practical task this concept underlies}
```

## ADR (Architecture Decision Record)

Migrated from `_shared/decision-records.md`, which retains the ADR gate (hard-to-reverse AND surprising AND a real trade-off), the `docs/decisions/NNNN-{kebab-slug}.md` location convention, and the who-reads-who-writes contract. This is the literal skeleton only.

```markdown
# {NNNN}. {Decision title — a short noun phrase}

- **Status:** accepted
- **Date:** {YYYY-MM-DD}
- **Context:** {spec #, brief, or work that produced this decision}

## Context

{The forces at play — what made this decision necessary, what constraints applied. State the problem, not the solution.}

## Decision

{What we chose, in one or two sentences.}

## Alternatives considered

- **{Alternative A}** — {why we rejected it}
- **{Alternative B}** — {why we rejected it}

## Consequences

{What this makes easy, what it makes hard, and what would force us to revisit it.}
```

`Status` is `accepted` for a decision being recorded after the fact. If a later ADR overturns this one, change its status to `superseded by NNNN` rather than deleting it.

The `{NNNN}` in the H1 is the same zero-padded 4-digit value as the `{NNNN}` in the filename convention above — not two independent numbering schemes that happen to share a placeholder name. `# 12. {Title}` is non-conformant; `# 0012. {Title}` is correct.

## Journey

Migrated from `journeys/journey-template.md`, which retains the key principles ("should feel" is the most important field; `files:` enables `/review`'s regression detection; one journey per goal; personas are specific people) and the `docs/journeys/{journey-name}.md` location convention. This is the literal skeleton only.

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
