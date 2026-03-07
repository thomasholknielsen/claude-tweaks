---
name: claude-tweaks:reflect
description: Use when you want to step back and evaluate recent work through structured lenses — approach correctness, structural debt, surprises, near-misses. Works standalone or as a step within /claude-tweaks:review and /claude-tweaks:wrap-up.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a Next Actions block (context-specific numbered options with one recommended), not a navigation menu.


# Reflect — Structured Evaluation of Recent Work

Step back from implementation and evaluate what was built through structured lenses. Surfaces improvements, surprises, and patterns worth capturing — before they fade from context. Part of the workflow lifecycle:

```
/claude-tweaks:build → /claude-tweaks:test → /claude-tweaks:review → /claude-tweaks:wrap-up
                                                     │                        │
                                             [ /claude-tweaks:reflect ]       │
                                              (hindsight mode)                │
                                                                      [ /claude-tweaks:reflect ]
                                                                       (full mode)
```

## When to Use

- After any implementation work — you want a second look before moving on
- During `/claude-tweaks:review` Step 4 — invoked in **hindsight** mode
- During `/claude-tweaks:wrap-up` Step 3 — invoked in **full** mode
- After a debugging session or refactor — capture what you learned
- After conversation-based work that had no formal review

## Modes

| Mode | Lenses | Invoked by | Best for |
|------|--------|------------|----------|
| **hindsight** | Approach, Structure, Consolidation, Convention, Skills | `/claude-tweaks:review` Step 4 | Pre-ship "should we change something?" gate |
| **full** | All four lenses (Surprises, Hindsight, Near-misses, Fresh start) + Tradeoff review | `/claude-tweaks:wrap-up` Step 3 | Post-review knowledge capture |
| *(default)* | **full** when standalone | Direct invocation | General-purpose reflection |

## Input

`$ARGUMENTS` controls scope and mode.

### Standalone (invoked directly):

1. **Mode keyword** — `hindsight` or `full` (default: `full`)
2. **Scope** — spec number, file paths, or omitted:
   - Spec number (e.g., `42`) → scope to files changed for that spec
   - File paths → scope to those files
   - No scope → use `git diff` against the base branch or recent commits

```
/claude-tweaks:reflect                     → full mode, scope from git diff
/claude-tweaks:reflect 42                  → full mode, scope from spec 42
/claude-tweaks:reflect hindsight           → hindsight mode, scope from git diff
/claude-tweaks:reflect hindsight 42        → hindsight mode, scope from spec 42
/claude-tweaks:reflect src/api/ src/db/    → full mode, scope to those directories
```

### Pipeline context (invoked by parent skill):

The parent skill passes:
- **Mode** — `hindsight` (from `/review`) or `full` (from `/wrap-up`)
- **Scope** — changes already analyzed by the parent
- **Ledger phase** — `review/hindsight` (from `/review`) or `wrap-up` (from `/wrap-up`)
- **Seed context** (full mode only) — review summary, key learnings, tradeoffs accepted

When no ledger phase is provided (standalone), use `reflect` as the default phase.

## Step 1: Gather Context

> **Parallel execution:** Use parallel tool calls aggressively — all Read, Grep, and Bash operations for context gathering are independent and should run concurrently.

1. **Identify changed files** — from scope resolution above
2. **Read the changed files** — understand what was built
3. **Read git log** — understand the sequence of changes, commit messages, any false starts
4. **Check for existing context** — spec file, review summary, ledger entries

## Step 2: Run Lenses

### Hindsight Mode (5 evaluations)

This is an **action gate** — findings lead to changes, not just observations.

> **"Given everything we've found, should we change something before shipping this?"**

| # | Evaluation | Question |
|---|-----------|----------|
| 1 | **Approach correctness** | Did we solve the right problem, or optimize for the wrong thing? |
| 2 | **Structural debt** | Did we introduce patterns we'll regret? Premature abstractions, wrong boundaries? |
| 3 | **Missing consolidation** | Opportunities to merge, deduplicate, or simplify that are obvious now? |
| 4 | **Convention drift** | Did we accidentally diverge from established project patterns? |
| 5 | **Skill-worthy patterns** | Did the work establish reusable patterns that should be documented in a project skill? |

For skill-worthy patterns: if yes, note the pattern — append a ledger entry with phase `review/skill` (when invoked by review) or `wrap-up` (when invoked by wrap-up or standalone). For patterns that don't fit any existing skill, use `[skill: NEW — {suggested-name}]`.

### Full Mode (4 lenses + tradeoff review)

Runs all four reflection lenses plus a tradeoff review. The Hindsight lens below covers the same ground as hindsight mode — full mode is a superset.

| Lens | Question | Surfaces |
|------|----------|----------|
| **1. Surprises** | "What surprised us?" — Unexpected constraints, library behavior, shape changes | Don'ts, skill updates |
| **2. Hindsight** | "What would we do differently?" — Better patterns discovered midway, over/under-engineering | Skill updates, conventions, spec adjustments |
| **3. Near-misses** | "What broke or almost broke?" — Unexpected test failures, type errors, cross-platform ripples | Don'ts, testing patterns, gotchas |
| **4. Fresh start** | "If we started fresh?" — Would we choose the same approach? What would v2 look like? | Architectural alternatives, memory files |

#### Seed from Review Learnings (full mode, pipeline context)

When invoked by `/wrap-up`, check the `/claude-tweaks:review` summary for the **Key Learnings** section. Use these as starting points for the four lenses rather than re-deriving from scratch.

#### Tradeoff Review (full mode only)

Check the `/claude-tweaks:review` summary for the **Tradeoffs Accepted** section. For each accepted tradeoff, assess whether it represents:

- A **project-wide pattern** worth documenting (e.g., "we always choose X over Y because Z") -> route to CLAUDE.md or a skill
- A **one-off decision** specific to this work -> no action needed
- A **known limitation** others should be aware of -> route to Don'ts or memory

## Step 3: Route Findings

### Hindsight Mode

Present all findings as a batch:

```
### Implementation Hindsight

| # | Finding | Recommended |
|---|---------|-------------|
| 1 | {description} | Change now |
| 2 | {description} | Change now |
| 3 | {description} | Defer — bigger scope, not relevant now |
| 4 | {description} | Capture to INBOX — needs exploration |

1. Apply all recommendations **(Recommended)**
2. Override specific items (tell me which #s to change)
```

**Recommendation rules:**
- **Change now** — the strong default. If the improvement is clear, make the change. Most hindsight findings are small enough to fix in a few minutes.
- **Defer** (DEFERRED.md) — the improvement is understood but it's bigger and not relevant to the current work. Include origin, files, trigger.
- **Capture to INBOX** — the finding is complex or uncertain and needs brainstorming/exploration before it can be acted on.
- **Accept as-is** — only when the current approach is genuinely better, or the finding is a false positive. Not a valid option for genuine improvements.

If any findings are **"Change now"**, make the changes, then re-run `/claude-tweaks:test` (or verification if standalone) and resume.

If no findings, state "No changes needed — approach is sound" and proceed.

### Full Mode

Collect all insights from the four lenses and the tradeoff review into a single table:

```
### Reflection Insights

| # | Insight | Recommended Destination |
|---|---------|------------------------|
| 1 | {description} | Implement now -> CLAUDE.md Don'ts |
| 2 | {description} | Implement now -> Skill: {name} |
| 3 | {description} | Defer — bigger, not relevant now |
| 4 | {description} | Capture to INBOX — needs brainstorming |

1. Apply all recommendations **(Recommended)**
2. Override specific items (tell me which #s to change)
```

**Routing guide:**

| Finding Type | Suggested Destination |
|-------------|-----------|
| "Never do X because Y" (X exists in codebase) | CLAUDE.md Don'ts |
| "When building Z, always do W" | Existing skill update |
| "This reusable pattern emerged" | New skill candidate |
| "Remaining specs should use X instead" | Spec amendments |
| "A fundamentally better approach exists" | Skill update + Memory file |
| "We chose X over Y because Z" (from review tradeoffs) | CLAUDE.md Convention or Memory file (if it's a recurring decision) |
| "We should add X" (X doesn't exist yet) | INBOX — improvement work, not a convention |

**Recommendation rules:**
- **Implement now** — the strong default. If an insight leads to a concrete change (update CLAUDE.md, update a skill, add a rule, update memory), make the change.
- **Defer** (DEFERRED.md) — the insight leads to a known improvement but it's bigger and not relevant to the current work. Include origin, context, trigger.
- **Capture to INBOX** — the insight is complex or uncertain and needs brainstorming/exploration before it can be acted on.
- **Don't capture** — only for insights that are genuinely not actionable (one-off observations, context-specific facts, things already documented elsewhere). Must state why.

**Auto-apply when uniform:** When ALL insights are "Implement now" (none are "Defer" or "Capture to INBOX"), auto-apply without presenting the decision table. State: "Implementing {N} reflection insights:" followed by a brief list of changes, then proceed. When any insight has mixed routing, present the full batch table.

If any insight is "Implement now", handle it before returning control to the parent or presenting Next Actions.

## Step 4: Ledger Integration

**Write all findings to the open items ledger** (see `/claude-tweaks:ledger`):

| Context | Phase | Behavior |
|---------|-------|----------|
| Invoked by `/review` | `review/hindsight` | Write findings. Status: `open` for "Change now"; update to `fixed` after changes. |
| Invoked by `/wrap-up` | `wrap-up` | Write insights. "Implement now" items get `open` until implemented (then `fixed`); "Defer" items get `deferred`. |
| Standalone, ledger exists | `reflect` | Write findings/insights to existing ledger. |
| Standalone, no ledger | *(skip)* | Present findings without ledger tracking. |

## Standalone Next Actions

When invoked directly (not by a parent skill), end with:

```
### Next Actions

1. `/claude-tweaks:review {spec}` — full code review **(Recommended)**
2. `/claude-tweaks:test` — verify changes from reflection
3. `/claude-tweaks:wrap-up {spec}` — capture learnings and clean up
```

When invoked by a parent, omit Next Actions — the parent handles flow control.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Accepting all hindsight findings as-is | The action gate exists for a reason — "change now" items must be fixed |
| Running full mode during review | Review needs the focused hindsight gate, not the broader reflection. Full mode is for wrap-up or standalone. |
| Skipping reflection for "simple" work | Simple work still surfaces surprises and near-misses worth capturing |
| Silently dropping insights with no obvious destination | Every insight gets an explicit decision — even "don't capture" requires a stated reason |
| Generic findings ("improve error handling") | Findings must be specific and actionable — cite the file, the pattern, the concrete change |
| Re-deriving insights already in Key Learnings | When review's Key Learnings are available, use them as seeds — don't re-analyze from scratch |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:review` | Invokes /reflect in **hindsight** mode (Step 4). Passes analyzed changes and review context. Receives hindsight findings for the review summary. |
| `/claude-tweaks:wrap-up` | Invokes /reflect in **full** mode (Step 3). Passes review summary, key learnings, and tradeoffs. Receives routed insights for knowledge capture. |
| `/claude-tweaks:build` | Produces the code that /reflect evaluates |
| `/claude-tweaks:test` | /reflect may trigger re-verification after "Change now" fixes |
| `/claude-tweaks:ledger` | /reflect writes findings to the ledger using the phase provided by the parent (or `reflect` when standalone) |
| `/claude-tweaks:capture` | /reflect may create INBOX items for complex insights needing brainstorming |
| `specs/DEFERRED.md` | /reflect routes deferred improvements here (with origin, files, trigger) |
