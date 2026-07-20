---
name: claude-tweaks:deepen
description: Use when you want an architectural-depth pass on recently changed code — finds shallow modules (interface nearly as complex as implementation) and proposes deepening or collapsing them, ranked by leverage. Catches architecture entropy that line-level simplification misses. Works standalone or surfaced as a Next Action by /claude-tweaks:review and /claude-tweaks:reflect.
---
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.


# Deepen — Architectural Depth Pass

Find shallow modules and make them deeper. `/claude-tweaks:simplify` cleans up *within* files (verbose patterns, dead code, line-level complexity); `/claude-tweaks:deepen` works at the *module* level — it asks whether each abstraction earns its keep, and proposes deepening the ones that leak or collapsing the ones that only move complexity around. Architecture entropy is the silent tax on AI-assisted development; this is the pass that catches it. Part of the workflow lifecycle:

```
/claude-tweaks:build → /claude-tweaks:test → /claude-tweaks:review → /claude-tweaks:wrap-up
                                                     │
                                          [ /claude-tweaks:deepen ]
                                       (standalone, or surfaced as a Next Action
                                        by /review and /reflect on structural signals)
```

## When to Use

- A codebase has been moving fast under agent assistance and you want to catch architectural rot before it sets — run it every few days, not every build
- `/claude-tweaks:review` lens 3e (Architecture) or `/claude-tweaks:reflect`'s structural-debt lens flagged shallow abstractions, wrong boundaries, or pass-through wrappers
- After a feature lands and you suspect the new module surface is wider than it needs to be
- You're about to build on top of a module and want to know whether to deepen it first
- The user says "is this abstraction pulling its weight?", "this feels over-engineered", or "should this module exist?"

This is **not** a code-quality or bug pass — use `/claude-tweaks:review` for correctness and `/claude-tweaks:simplify` for line-level cleanup. `/deepen` only judges module depth.

## Input

`$ARGUMENTS` controls scope.

### Standalone (invoked directly):

1. **File paths or directories** — analyze module depth across those files
2. **Spec number** (e.g., `42`) — scope to files changed for that spec
3. **No arguments** — use `git diff --name-only` against the base branch or recent commits

```
/claude-tweaks:deepen                       → analyze recently changed modules
/claude-tweaks:deepen src/payments/         → analyze modules under that directory
/claude-tweaks:deepen 42                     → analyze modules changed for spec 42
```

### Pipeline / parent context:

A parent skill (or the user) may pass a file scope and a structural seed (e.g., the architecture finding that prompted the pass). Analyze only the provided scope — never expand to the whole codebase. A whole-repo depth audit is out of scope for this skill; it reviews recent work.

## Vocabulary Contract

This skill uses a controlled vocabulary so proposals stay precise and comparable: **module, interface, implementation, depth, seam, adapter, leverage**. Do not drift into `component`, `service`, `API` (unless it literally means a network API), or `boundary`. Definitions live in `_shared/criteria-architecture-depth.md` (the shared depth criteria). `depth-analysis.md` shows how `/deepen` applies them. Inconsistent language is the failure that makes refactor proposals impossible to weigh against each other.

## Step 1: Resolve Scope and Map Modules

> **Parallel execution:** Use parallel tool calls aggressively — read all in-scope files and their call sites (Grep for importers) concurrently. Depth is judged from call sites, so gather them before analyzing.

1. Resolve the file scope (see Input). Filter to source files — skip generated files, lock files, tests, and config.
2. For each in-scope module, read its interface (exports) and locate its call sites (`grep` for imports of its exports).
3. If no source files are in scope, state: "No changed modules to analyze." and stop.

## Step 2: Find Shallow Modules

Apply the depth criteria in `_shared/criteria-architecture-depth.md`; `depth-analysis.md` (this skill's directory) shows how those criteria map onto Steps 2-4:

1. **Judge depth as leverage** — how much behavior each caller exercises per unit of interface it must learn. Not a line ratio. Make the judgment from the call sites.
2. **Run the deletion test** on each suspected-shallow module — would deleting it *concentrate* complexity (it earns its keep — not a candidate) or *just move* it (shallow — a candidate)?
3. **Classify each candidate** as a **deepen** opportunity (a real abstraction that leaks) or a **collapse** opportunity (a pass-through that only moves complexity). Report each as what it is — never dress a collapse up as a deepening.

## Step 3: Rank and Present Candidates (Stage 1 of 2)

Rank candidates by leverage per unit of churn (callers affected, interface shrink, blast radius — see `_shared/criteria-architecture-depth.md`). Present them as a numbered list. **Do not propose interfaces yet** — present *what* is shallow and *why*, then ask which to explore. Proposing concrete interfaces for every candidate up front is the runaway-rewrite this skill exists to prevent.

```
Found {N} depth opportunities in {scope}, ranked by leverage:

| # | Module | Kind | Why it's shallow | Leverage | Blast radius |
|---|--------|------|------------------|----------|--------------|
| 1 | {path} | deepen | {one line — what leaks / what callers must know} | {callers affected, interface shrink} | {files touched} |
| 2 | {path} | collapse | {one line — what it only moves} | {…} | {…} |

Which would you like to explore? (number, several numbers, or "none")
```

If zero candidates, state: "No shallow modules found in scope — the abstractions in this change are earning their keep." and stop (skip to Report).

### Auto mode

Depth refactors are architectural and low-reversibility. In `auto` mode (a pipeline run directory exists), **never apply a refactor autonomously**. Stage the ranked candidate list to `{run-dir}/staged/deepen-{n}.md` and log one entry to `decisions.md` per `_shared/auto-decision-log.md`:

```
- STAGED {HH:MM:SS} — Step 3: {N} depth candidates in {scope}. Architectural — staged for Review Console. Reversibility: low.
```

Surface at the Wrap-Up Review Console. Do not run Steps 4-5 in auto mode — interface design requires the user. See `_shared/auto-mode-contract.md`.

## Step 4: Design the Interface (Stage 2 of 2 — interactive only)

For each candidate the user picked, hold a focused interface conversation — do not jump to code. Per the `Brainstorm / section-confirmation: adaptive` convention, if the user accepts two consecutive candidates' designs without modification, batch the rest into a single approval.

1. **Propose the deepened (or collapsed) interface** — the smallest surface that hides the most behavior. Show the before/after signature, not the implementation.
2. **Classify dependencies** for testability (pure computation / local stand-in / network boundary → port + adapter) per `_shared/criteria-architecture-depth.md`. State how the deepened module will be tested.
3. **Name the trade-off** — what the new shape makes easy, what it makes harder, and what would force revisiting it. If the trade-off is genuinely hard-to-reverse, surprising, and a real choice, flag it as an `[ADR-candidate]` so wrap-up can record it (see `_shared/decision-records.md`).
4. Confirm before implementing.

## Step 5: Apply and Verify

1. Implement the approved interface change(s) within the scoped files. Preserve behavior — depth refactors change *structure*, not *behavior*.
2. Run the shared verification procedure from `verification.md` in the `/claude-tweaks:test` skill's directory (types, lint, tests). Apply the Working Directory Discipline rule from `_shared/subagent-output-contract.md` before any verification command.
3. **If verification fails** — this is a BLOCKED gate. Never silently retry or self-fix. Surface the failing check and return control:

```
BLOCKED
Reason: verification failed after a depth refactor.
Failing check: {typecheck | lint | tests}
Next: caller decides whether to revert the refactor, fix the regression, or stage for review.
```

A depth refactor that breaks tests is suspect — it likely changed behavior, not just structure. Prefer reverting over patching.

4. Commit each accepted refactor separately (one commit per module) so any single change can be reverted cleanly.

## Report

```
### Architectural Depth Pass

| # | Module | Kind | Change | Lines | Tested via |
|---|--------|------|--------|-------|------------|
| 1 | {path} | deepen | {interface before → after} | {-N/+M} | {pure / stand-in / port+adapter} |

Verification: {pass/fail}
Candidates not actioned: {N} (staged / declined — listed for follow-up)
```

If no changes were made: "No depth changes — abstractions reviewed are earning their keep." List any candidates the user declined so they aren't silently dropped.

## Next Actions

When invoked directly (not by a parent skill), call `AskUserQuestion`:

- `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`
- Option 1 — `label`: `"Verify refactor (Recommended)"`, `description`: `"/claude-tweaks:test — verify the refactor end-to-end"`
- Option 2 — `label`: `"Re-review architecture"`, `description`: `"/claude-tweaks:review {spec} — re-review the changed architecture"`
- Option 3 — `label`: `"Line-level cleanup"`, `description`: `"/claude-tweaks:simplify — line-level cleanup on the refactored files"`

When invoked by a parent, omit Next Actions — the parent handles flow control.

## Component-Skill Contract

When `$PIPELINE_RUN_DIR` is set, `/claude-tweaks:deepen` is running inside a pipeline (invoked by `/claude-tweaks:flow` at its Pipeline Summary, or surfaced by `/claude-tweaks:review` / `/claude-tweaks:reflect`). In that case:

- Omit the `## Next Actions` block — the parent owns the handoff.
- Run **analysis-only**: Steps 1-3 (map modules → deletion test → leverage ranking). **Do not run Step 4 (interface design) or Step 5 (apply)** — those are interactive and low-reversibility, and a hands-off pipeline must never refactor module interfaces unattended.
- **Return the ranked candidate list to the caller** so it can render a recommendation block (e.g., `/flow`'s Depth Opportunities block). Log a `STAGED` entry per Step 3's auto path; never an `AUTO`-applied entry.

Direct invocation may pass `--source <parent-skill>` as an explicit fallback when ambiguity exists (rare; `$PIPELINE_RUN_DIR` is the primary signal).

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Measuring depth as implementation-lines ÷ interface-lines | Rewards padding the implementation and punishes simple-but-deep modules — judge leverage from call sites, not line counts |
| Proposing interfaces for every candidate up front | That's the runaway rewrite — Stage 1 presents *what* and *why*; interface design happens only for candidates the user picks |
| Dressing a collapse up as a deepening | A pass-through that fails the deletion test should be inlined, not "deepened" — call it what it is |
| Drifting into component / service / boundary vocabulary | Inconsistent language makes proposals impossible to compare — use the controlled vocabulary |
| Changing behavior during a depth refactor | Depth refactors change structure only — if behavior must change, that's a different skill. Broken tests mean you changed behavior |
| Auto-applying a refactor in `auto` mode | Architecture is low-reversibility — auto mode stages candidates for the Review Console, never refactors silently |
| Running a whole-repo depth audit | This skill reviews recent work — a codebase-wide audit is a different, deliberate exercise |
| Deepening a module by pushing a network call into previously pure code | That trades testability for a smaller surface — flag it as a risk, don't do it silently |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:simplify` | Complementary, different altitude — /simplify cleans up *within* files (line-level), /deepen restructures *across* module interfaces. Run /simplify after /deepen for line-level cleanup on the refactored files. |
| `/claude-tweaks:review` | /review lens 3e (Architecture) flags shallow abstractions and wrong boundaries; when it does, /review surfaces `/claude-tweaks:deepen` as a Next Action. /deepen is the deeper, dedicated follow-up to that lens. |
| `/claude-tweaks:reflect` | /reflect's structural-debt lens ("premature abstractions, wrong boundaries") seeds /deepen candidates; /reflect surfaces /deepen as a Next Action when it finds structural debt. |
| `/claude-tweaks:test` | /deepen uses the shared verification procedure from /test's `verification.md` to confirm a refactor preserved behavior. |
| `/claude-tweaks:build` | Produces the modules /deepen evaluates. Architectural deviations build catches in Common Step 4.5 can route to /deepen for restructuring. |
| `/claude-tweaks:help` | /help references /deepen in the workflow diagram and reference card. |
| `/claude-tweaks:flow` | Invoked BY /flow at the Pipeline Summary (Step 5) in analysis-only mode — /flow runs the read-only depth analysis hands-off and renders the ranked candidates as a Depth Opportunities recommendation block, but never applies a refactor (the responsible boundary for low-reversibility work in an auto pipeline). Skipped by `no-deepen`. |
| `/claude-tweaks:wrap-up` | Hard-to-reverse interface trade-offs /deepen flags `[ADR-candidate]` in Step 4 are picked up by /wrap-up's Step 6.3 and run through the 3-factor gate for possible ADR creation — see the `_shared/decision-records.md` row below. |
| `/claude-tweaks:code-health` | `/code-health` applies the architecture-depth criterion proactively on a schedule; `/deepen` applies it reactively to code you are changing. Both read `_shared/criteria-architecture-depth.md` — see that row below. |
| `/claude-tweaks:ledger` | `/deepen` does not currently write ledger items — pipeline staging goes through the Auto-Mode Contract instead (`decisions.md` + `{run-dir}/staged/deepen-{n}.md`, per Step 3's Auto mode note and the Component-Skill Contract above), and `/flow` renders returned candidates directly as a Depth Opportunities block, never via the ledger. `ledger/SKILL.md`'s Relationship table and Phase Taxonomy list a `deepen` phase that does not match this file's documented staging path — flagged as an open cross-file discrepancy, not resolved here. |
| `_shared/decision-records.md` | Hard-to-reverse interface trade-offs surfaced in Step 4 are flagged `[ADR-candidate]` for /wrap-up to record. |
| `_shared/auto-mode-contract.md` | Single source of truth for auto-mode behavior — /deepen always stages in auto (architecture is low-reversibility), never auto-refactors. |
| `_shared/subagent-output-contract.md` | The Working-Directory Discipline rule referenced by Step 5 verify lives here (CWD anchoring before `git` / `node --test`). |
| `_shared/criteria-architecture-depth.md` | The shared depth criteria (leverage, deletion test, dependency classification, vocabulary) — single source of truth read by both /deepen and /code-health's architecture-depth lens. |
