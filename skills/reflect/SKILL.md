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
                                                     └──────── /claude-tweaks:reflect ────────┘
                                                       component called from review (Step 4, hindsight mode)
                                                       and wrap-up (Step 3, full mode)
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
| **full** | All four lenses (Surprises, Approach, Near-misses, Fresh start) + Tradeoff review | `/claude-tweaks:wrap-up` Step 3 | Post-review knowledge capture |
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

Mode-specific lens procedures live in sub-files (a given invocation only uses one):

- **Hindsight mode** → see `hindsight-mode.md` in this skill's directory (5 evaluations, action gate)
- **Full mode** → see `full-mode.md` in this skill's directory (4 lenses + tradeoff review; superset of hindsight)

## Step 3: Route Findings

### Auto mode (policy-driven routing — shared across both modes)

> **Canonical reference:** `_shared/auto-mode-contract.md` defines what `auto` may and may not silence — read it before adding or changing any auto-mode handling here. Every auto-resolution MUST write an entry to the auto-decision log per `_shared/auto-decision-log.md` (path: `{run-dir}/decisions.md`, canonical entry schema lives there). Silent automation without an audit trail is forbidden.

When a pipeline run directory exists, route findings by category without prompting:

| Finding type | Default routing | Log entry |
|---|---|---|
| Safety regression (security, data loss, broken invariants) | KEPT-PROMPT — surfaces inline; cannot defer safety findings autonomously | `KEPT-PROMPT {time} — Step 3: safety finding "{summary}". Surfaced inline.` |
| Convention drift, code smell, simplification opportunity | STAGED — write to `staged/reflect-{n}.md`. Surface at Wrap-Up Review Console. | `STAGED {time} — Step 3: convention finding "{summary}". Stage path: staged/reflect-{n}.md.` |
| Tangential idea (new feature, alternative design) | STAGED → INBOX candidate. Wrap-Up Review Console asks before writing to INBOX (never autonomous). | `STAGED {time} — Step 3: tangential idea "{summary}" — INBOX candidate. Surface at Review Console.` |
| Pattern observation, design tradeoff acknowledgment | STAGED — write to `staged/reflect-{n}.md`. Most go to skill updates handled in `/wrap-up` Step 7.5. | `STAGED {time} — Step 3: pattern observation "{summary}". Stage path: staged/reflect-{n}.md.` |

Default behavior: **defer everything** to the Review Console. The exception is safety regressions, which always surface inline.

### Interactive mode (batch user routing — differs by mode)

- **Hindsight mode** → see `hindsight-mode.md` (Implementation Hindsight batch table + recommendation rules)
- **Full mode** → see `full-mode.md` (Reflection Insights batch table + routing guide + auto-apply-when-uniform optimization)

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
| `/claude-tweaks:help` | /help references /reflect in the workflow diagram and reference card. |
| `specs/DEFERRED.md` | /reflect routes deferred improvements here (with origin, files, trigger) |
| `_shared/auto-mode-contract.md` | Single source of truth for auto-mode behavior — read before adding any auto-mode handling |
