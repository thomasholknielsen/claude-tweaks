---
name: claude-tweaks:reflect
description: Use when you want to step back and evaluate recent work through structured lenses — approach correctness, structural debt, surprises, near-misses. Works standalone or as a step within /claude-tweaks:review and /claude-tweaks:wrap-up.
---
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.


# Reflect — Structured Evaluation of Recent Work

Step back from implementation and evaluate what was built through structured lenses. Surfaces improvements, surprises, and patterns worth capturing — before they fade from context. Part of the workflow lifecycle:

```
/claude-tweaks:build → /claude-tweaks:test → /claude-tweaks:review → /claude-tweaks:wrap-up
                                                     │                        │
                                                     └──────── /claude-tweaks:reflect ────────┘
                                                       component called from review (Step 4, hindsight mode)
                                                       and wrap-up (Step 3, full or light mode)
```

## When to Use

- After any implementation work — you want a second look before moving on
- During `/claude-tweaks:review` Step 4 — invoked in **hindsight** mode
- During `/claude-tweaks:wrap-up` Step 3 — invoked in **full** mode, or **light** mode when the run's `ceremony-profile` is `fast-lane`
- After a debugging session or refactor — capture what you learned
- After conversation-based work that had no formal review

## Modes

| Mode | Lenses | Invoked by | Best for |
|------|--------|------------|----------|
| **hindsight** | Approach, Structure, Consolidation, Convention, Skills | `/claude-tweaks:review` Step 4 | Pre-ship "should we change something?" gate |
| **full** | All four lenses (Surprises, Approach, Near-misses, Fresh start) + Tradeoff review | `/claude-tweaks:wrap-up` Step 3 | Post-review knowledge capture |
| **light** | Near-misses, Fresh start (no tradeoff review) | `/claude-tweaks:wrap-up` Step 3, when `ceremony-profile: fast-lane` | Cheap post-review capture for a fast-lane record |
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
- **Mode** — `hindsight` (from `/review`) or `full`/`light` (from `/wrap-up`; `light` when the run's
  `ceremony-profile` is `fast-lane`, `full` otherwise)
- **Scope** — changes already analyzed by the parent
- **Ledger phase** — `review/hindsight` (from `/review`) or `wrap-up` (from `/wrap-up`)
- **Seed context** (full and light modes only) — review summary, key learnings, tradeoffs accepted

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
- **Light mode** → see `light-mode.md` in this skill's directory (2 lenses, no tradeoff review; narrowed subset of full, for `ceremony-profile: fast-lane` wrap-ups)

## Step 3: Route Findings

### Auto mode (policy-driven routing — shared across every mode)

> **Canonical reference:** `_shared/auto-mode-contract.md` defines what `auto` may and may not silence — read it before adding or changing any auto-mode handling here. Every auto-resolution MUST write an entry to the auto-decision log per `_shared/auto-decision-log.md` (path: `{run-dir}/decisions.md`, canonical entry schema lives there). Silent automation without an audit trail is forbidden.

When a pipeline run directory exists, route findings by category without prompting:

| Finding type | Default routing | Log entry |
|---|---|---|
| Safety regression (security, data loss, broken invariants — e.g., token expiry bug, auth bypass, dropped writes, resource leak, race condition on shared state) | KEPT-PROMPT — surfaces inline; cannot defer safety findings autonomously | `KEPT-PROMPT {time} — Step 3: safety finding "{summary}". Surfaced inline.` |
| Convention drift, code smell, simplification opportunity | STAGED — write to `staged/reflect-{n}.md`. Surface at Wrap-Up Review Console. | `STAGED {time} — Step 3: convention finding "{summary}". Stage path: staged/reflect-{n}.md.` |
| Tangential idea (new feature, alternative design) | STAGED → backlog work-record candidate. Wrap-Up Review Console asks before creating the record (never autonomous). | `STAGED {time} — Step 3: tangential idea "{summary}" — backlog candidate. Surface at Review Console.` |
| Pattern observation, design tradeoff acknowledgment | STAGED — write to `staged/reflect-{n}.md`. Most go to skill updates handled in `/wrap-up` Step 7. | `STAGED {time} — Step 3: pattern observation "{summary}". Stage path: staged/reflect-{n}.md.` |

Default behavior: **defer everything** to the Review Console. The exception is safety regressions, which always surface inline.

**Stage-file format** (`{run-dir}/staged/reflect-{n}.md`):

```markdown
# Reflect — staged finding {n}

**Category:** {convention | tangential | observation}
**Severity:** {low | med | high}
**Reversibility:** {high | med | low}
**Source:** {full | hindsight | light} mode, lens "{lens name}"
**Files:** {comma-separated paths or "general"}

## Finding

{1-3 sentences. What was observed; why it might matter.}

## Suggested resolution

{Optional. Concrete change or routing recommendation.}

## Decision-log reference

{Copy the matching `STAGED …` line from `decisions.md` so the Console can cross-link.}
```

For a **tangential** finding specifically — the one category that becomes a Queue-writes record
proposal (see `review-console.md`'s "On approval" step 5 and `flow/multispec-review-console.md`,
both of which read a `Title:`/`Type:`/`Labels:` header off the staged file to create the record) —
prepend that header above the `# Reflect —` line, the same shape `wrap-up/leftover-routing.md`
step 3 writes for `leftover-{slug}.md`:

```markdown
Title: {short work-record title}
Type: {bug | feature | task}
Labels: {comma-separated labels or "none"}

# Reflect — staged finding {n}

**Category:** tangential
**Severity:** {low | med | high}
**Reversibility:** {high | med | low}
**Source:** {full | hindsight | light} mode, lens "{lens name}"
**Files:** {comma-separated paths or "general"}

## Finding

{1-3 sentences. What was observed; why it might matter.}

## Suggested resolution

{Optional. Concrete change or routing recommendation.}

## Decision-log reference

{Copy the matching `STAGED …` line from `decisions.md` so the Console can cross-link.}
```

Without this header the Console's record-creation step has nothing to read a title, type, or
labels from — it is required whenever `**Category:** tangential`, and omitted for `convention`/
`observation` findings (those are never Queue writes).

Number `{n}` is a per-run sequence counter — increment as each staged file is written so multiple stages in one run never collide.

### Interactive mode (batch user routing — differs by mode)

- **Hindsight mode** → see `hindsight-mode.md` (Implementation Hindsight batch table + recommendation rules)
- **Full mode** → see `full-mode.md` (Reflection Insights batch table + routing guide)
- **Light mode** → same mechanics as full mode (see `full-mode.md`'s Interactive mode section); only the lens set feeding the table narrows

## Step 4: Ledger Integration

**Write all findings to the open items ledger** (see `/claude-tweaks:ledger`):

| Context | Phase | Behavior |
|---------|-------|----------|
| Invoked by `/review` | `review/hindsight` | Write findings. Status: `open` for "Change now"; update to `fixed` after changes. |
| Invoked by `/wrap-up` | `wrap-up` | Write insights. "Implement now" items get `open` until implemented (then `fixed`); "Defer" items get `deferred`. |
| Standalone, ledger exists | `reflect` | Write findings/insights to existing ledger. |
| Standalone, no ledger | *(skip)* | Present findings without ledger tracking. |

## Step 5: Report

When invoked directly (not by a parent skill), present findings and end with the Next Actions block below. When invoked by a parent, omit Next Actions — the parent handles flow control.

## Next Actions

When invoked directly (not by a parent skill), call `AskUserQuestion`:

- `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`
- Option 1 — `label`: `"Full review (Recommended)"`, `description`: `"/claude-tweaks:review {spec} — full code review"`
- Option 2 — `label`: `"Verify changes"`, `description`: `"/claude-tweaks:test {spec} — verify changes from reflection"`
- Option 3 — `label`: `"Capture + clean up"`, `description`: `"/claude-tweaks:wrap-up {spec} — capture learnings and clean up"`

## Component-Skill Contract

This skill is a **component skill** — invoked by `/claude-tweaks:review` (Step 4, `hindsight` mode) and `/claude-tweaks:wrap-up` (Step 3, `full` or `light` mode). Parent invocation is signaled by `$PIPELINE_RUN_DIR` being set (set by `/review`, `/wrap-up`, or other pipeline orchestrators) — or, when standalone `/wrap-up` has no run directory of its own to set, by an explicit `--source wrap-up` flag it passes instead. When invoked by a parent (via either signal), omit the `## Next Actions` block — the parent owns the handoff. When invoked directly by a user (neither signal present), render Next Actions as shown above.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Accepting all hindsight findings as-is | The action gate exists for a reason — "change now" items must be fixed |
| Running full mode during review | Review needs the focused hindsight gate, not the broader reflection. Full mode is for wrap-up or standalone. |
| Skipping reflection for "simple" work | Simple work still surfaces surprises and near-misses worth capturing |
| Silently dropping insights with no obvious destination | Every insight gets an explicit decision — even "don't capture" requires a stated reason |
| Generic findings ("improve error handling") | Findings must be specific and actionable — cite the file, the pattern, the concrete change |
| Re-deriving insights already in Key Learnings | When review's Key Learnings are available, use them as seeds — don't re-analyze from scratch |
| Padding findings with praise of the work before naming what's weak | Reflection exists to surface weaknesses — strengths are easy to see unaided; lead with the weakness |
| Manufacturing a finding to look thorough when the work is sound | "I looked and found nothing worth changing" is a valid, honest reflect outcome — don't invent one |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:review` | Invokes /reflect in **hindsight** mode (Step 4). Passes analyzed changes and review context. Receives hindsight findings for the review summary. |
| `/claude-tweaks:wrap-up` | Invokes /reflect in **full** mode (Step 3), or **light** mode when the run's `ceremony-profile` is `fast-lane`. Passes review summary, key learnings, and tradeoffs. Receives routed insights for knowledge capture. |
| `/claude-tweaks:build` | Produces the code that /reflect evaluates |
| `/claude-tweaks:deepen` | The structural-debt lens (premature abstractions, wrong boundaries) seeds /deepen candidates — when /reflect surfaces module-level structural debt, it recommends `/claude-tweaks:deepen` for a dedicated depth pass rather than resolving it inline |
| `/claude-tweaks:test` | /reflect may trigger re-verification after "Change now" fixes |
| `/claude-tweaks:ledger` | /reflect writes findings to the ledger using the phase provided by the parent (or `reflect` when standalone) |
| `/claude-tweaks:capture` | /reflect may route complex insights needing brainstorming through /capture, which files a fresh backlog work record |
| `/claude-tweaks:help` | /help references /reflect in the workflow diagram and reference card. |
| `_shared/work-record.md` (`parked`) | /reflect routes deferred improvements to a new work record here (with origin, files, trigger) |
| `_shared/auto-mode-contract.md` | Single source of truth for auto-mode behavior — read before adding any auto-mode handling |
| `_shared/auto-decision-log.md` | Canonical schema and path for the auto-decision log written in Step 3 (`{run-dir}/decisions.md`). |
