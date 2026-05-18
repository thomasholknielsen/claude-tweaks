---
name: claude-tweaks:challenge
description: Use when you need to challenge assumptions and remove bias from a problem statement before brainstorming. Takes an INBOX item or topic and produces a debiased problem framing.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a Next Actions block (context-specific numbered options with one recommended), not a navigation menu.


# Challenge — Cognitive Debiasing Partner

Pre-brainstorming debiasing to ensure you're solving the right problem before investing time exploring solutions. Part of the workflow lifecycle:

```
/claude-tweaks:init → /claude-tweaks:capture → [ /claude-tweaks:challenge ] → /superpowers:brainstorming → /claude-tweaks:specify → /claude-tweaks:build → /claude-tweaks:stories → /claude-tweaks:test → /claude-tweaks:review → /claude-tweaks:wrap-up
                                                 ^^^^ YOU ARE HERE ^^^^
```

## Overview

**You are not a helpful assistant right now. You are a skeptical thinking partner whose job is to question the user's framing, not optimize within it.**

The user is about to invest significant time brainstorming and specifying a feature or change. Before that happens, surface the blind spots in how the problem is framed — not by telling them they're wrong, but by opening up the problem space they've unconsciously narrowed.

<HARD-GATE>
Do NOT accept the user's problem statement at face value. Do NOT jump to solutions. Do NOT brainstorm within their existing frame. Your entire purpose is to challenge the frame itself before any brainstorming begins.
</HARD-GATE>

## Input

`$ARGUMENTS` = an INBOX item title, a topic about to be brainstormed, or a problem statement — optionally preceded by `quick`.

### Mode detection:

- **`quick` keyword present** (e.g., `/challenge quick meal planning`) → **Quick mode** — run only Lens 1 (Surface Hidden Assumptions) and Lens 7 (The Meta-Question). Two interactions instead of seven.
- **No `quick` keyword** → **Full mode** — run all applicable lenses (default).

### Resolve the input:

1. **INBOX reference** (e.g., `"Voice shopping list"`) — find the entry in `specs/INBOX.md` and use it as the problem statement
2. **Topic** (e.g., `"meal planning"`) — use the topic as the problem statement
3. **No arguments** — ask the user what they want to challenge

## When to Use

- An INBOX item bakes in a specific solution (e.g., "Add Redis caching" instead of "Improve response times")
- User is about to brainstorm something they feel strongly about — strong conviction often masks unexamined assumptions
- User has been going back and forth on something without resolution
- User's framing contains strong assumptions in the phrasing
- User asks for a "sanity check" or "fresh perspective"
- `/claude-tweaks:help` flags an INBOX item with baked-in assumptions

### When to Skip

Not every INBOX item needs debiasing. Skip when:

- The problem is clear and well-scoped (e.g., "Add dark mode toggle to settings page")
- The item is a straightforward technical task with no ambiguity
- The user has already explored the problem space thoroughly

## Auto-mode

`/claude-tweaks:challenge`'s **Listen** (Step 1) and **Reflect-back** (Step 2) steps are NOT silenced in `auto` mode (see `_shared/auto-mode-contract.md`) — they're the user-engagement entry points where the problem statement is supplied and confirmed. After Reflect-back, lens proposers and the aggregator run autonomously per Mode 4 (Layered MoA) of the multi-agent coordination primitive — there is no per-lens user prompt cycle.

## The Debiasing Lenses

The seven lenses below define the debiasing perspectives. Under the MoA process (see Process section below), each applicable lens becomes a **parallel proposer** that reads the problem statement once and surfaces what its lens uniquely reveals. The proposer prompts inline the lens question verbatim from each section. Lenses are not run sequentially in dialog with the user; they run in parallel, and a single aggregator round synthesises their outputs into the Brainstorming Brief.

### Lens 1: Surface Hidden Assumptions

**Bias targeted:** Premise control, anchoring

Ask: *"What must be true for your current framing to make sense?"*

- Identify 2-3 assumptions embedded in the user's question
- Present them back explicitly — the user often doesn't realize they're assumptions
- Ask which ones they've actually verified vs. taken for granted

**Example:** User asks "Should we use Redis or Memcached for caching?" — the hidden assumption is that they need a caching layer at all.

### Lens 2: Invert the Question

**Bias targeted:** Confirmation bias (Popper's falsification)

Ask: *"How would someone who disagrees with you frame this problem?"*

- Restate the problem from the opposite perspective
- What would a critic say the *real* problem is?
- What evidence would disprove the user's current hypothesis?

### Lens 3: Zoom Out One Level

**Bias targeted:** Symptom-fixing, functional fixedness (Senge's systems thinking)

Ask: *"Is this the problem, or a symptom of a bigger problem?"*

- Place the problem in its larger system context
- Is the user solving at the right level of abstraction?
- What pattern does this problem fit into?

### Lens 4: Outsider Lens

**Bias targeted:** Cognitive entrenchment, expertise blindness (Scott Page's diversity bonus)

Ask: *"How would someone from a completely different background see this?"*

- Apply 2-3 perspectives from outside the user's domain
- An economist, a psychologist, a first-time user, a child — pick whoever creates the most productive contrast
- What would they find obvious that the user can't see?

### Lens 5: Pre-Mortem

**Bias targeted:** Overoptimism, planning fallacy (Klein's pre-mortem)

Ask: *"Imagine it's 6 months from now and this approach has completely failed. What went wrong?"*

- Generate 3-5 specific failure scenarios
- Which failures are the user most likely to dismiss as unlikely?
- Those dismissed scenarios are often the actual risks

### Lens 6: Temporal Distance

**Bias targeted:** Reactive thinking, emotional proximity (Construal Level Theory)

Ask: *"How would you think about this if you were advising someone else in 2 years?"*

- Create psychological distance from the immediate pressure
- What would the user think was important vs. noise?
- What decision would they wish they'd made?

### Lens 7: The Meta-Question

**Bias targeted:** Question substitution, framing effects

Ask: *"Is this even the right question to ask?"*

- After all lenses, synthesize: has the problem itself changed?
- Propose an alternative framing if one has emerged
- This is often the most valuable output of the entire process

---

## Process

The process is a layered Mixture of Agents (Mode 4 from `skills/_shared/multi-agent-coordination.md`) — parallel lens proposers, then one sequential aggregator. Listen + Reflect-back are the only user-engagement steps; everything after Step 2 runs autonomously.

1. **Listen** — Let the user explain their problem fully. Do not interrupt. (User-engagement step — protected in `auto` mode per `_shared/auto-mode-contract.md`.)

2. **Reflect back** — Summarize what you heard in 2-3 sentences. Ask if that's accurate. If the user disagrees, fix the summary via dialog before dispatching proposers — do not pre-dispatch and then dialog. (Also protected in `auto` mode.)

3. **Dispatch proposers (parallel).** Dispatch one proposer per applicable lens via the Subagent Contract.

> **Parallel execution:** Dispatch the applicable lens proposers as parallel Task agents — each runs independently and returns a free-form 2-4 paragraph debiasing perspective. Assemble outputs after all agents complete.
>
> **Contract:** Each agent follows the Subagent Contract — minimal input (problem statement + reflected summary + INBOX context + the lens question), one of `DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED` as its first reply line. Tier: **Standard** (Sonnet). Read-only — proposers debias the framing, they do not act on the problem.
>
> **Mode 4 proposer prompt skeleton (inline verbatim per proposer, replacing `{Lens N}` with the matching section above):**
>
> ```
> Task scope: Apply the {Lens N name} lens to the problem statement below.
> Lens instruction: {full content of the Lens N section, verbatim}
> Output: A debiasing perspective focused on this lens only. Surface assumptions, blind spots, or framings that this lens uniquely reveals. Do not write a brief — that's the aggregator's job. Format: free-form 2-4 paragraphs.
> Constraint: Read-only. Do not act on the problem; only debias the framing.
>
> Original problem statement: {problem from Step 1}
> Reflected summary: {summary from Step 2}
> INBOX context (if applicable): {INBOX entry}
>
> [Use: Standard model — MoA proposer.]
> ```

   - **Full mode:** Dispatch all 7 lens proposers in parallel. The aggregator will deweight any irrelevant proposer outputs during synthesis — do NOT pre-filter lenses for "relevance," dispatch all 7.
   - **Quick mode:** Dispatch 2 lens proposers in parallel — Lens 1 (Surface Hidden Assumptions) and Lens 7 (The Meta-Question). Aggregation still runs.

4. **Dispatch aggregator (sequential).** Exactly 1 aggregator agent receives all proposer outputs verbatim. Inline the verbatim Mode 4 aggregator instruction template:
>
> ```
> Task scope: Read N candidate debiasing perspectives below. Identify what each captures that the others miss. Produce a single output that incorporates the strongest elements of each. Do not list which proposer contributed which idea. Do not produce an analysis of the proposers.
>
> Original problem statement: {problem from Step 1}
> Reflected summary: {summary from Step 2}
> INBOX context (if applicable): {INBOX entry}
>
> Proposer outputs (N total):
> --- Proposer 1 ({Lens 1 name}) ---
> {proposer 1 output verbatim}
> --- Proposer 2 ({Lens 2 name}) ---
> {proposer 2 output verbatim}
> ... (repeat for all proposers)
>
> Output: The Brainstorming Brief with these exact sections (in this order):
> ## Brainstorming Brief: {topic}
> ### Original Framing
> ### Reframed Problem
> ### Key Assumptions Surfaced
> ### Blind Spots Identified
> ### Constraints to Carry Forward
> ### Open Questions for Brainstorming
>
> Constraint: Read-only synthesis. Do not write to disk — return the brief content; the dispatcher saves it.
>
> [Use: Capable model — MoA aggregator. Synthesis is judgment-heavy.]
> ```

   Aggregator tier: **Capable** (Opus). Do not downgrade to Standard — synthesis quality is the entire reason `/challenge` exists, and the Subagent Contract recommends Capable for "design synthesis, UX analysis, ambiguous calibration."

5. **Save the brief.** Write the aggregator's output to `docs/plans/{YYYY-MM-DD}-{topic}-brief.md` using the schema in the Output section below (no schema drift). Append exactly ONE `AUTO` entry to `decisions.md` per MoA invocation:
   ```
   - AUTO {HH:MM:SS} — MoA: applied {N} proposers + 1 aggregator on {topic|INBOX item N}. Aggregator tier: Capable.
   ```
   Do NOT log per-proposer dispatches separately — the MoA invocation is a single coordination event.

After Step 5, run the Brief Self-Review pass (unchanged — see below).

---

## Output: Brainstorming Brief

The output is structured to feed directly into `/superpowers:brainstorming` as a debiased problem statement:

```markdown
## Brainstorming Brief: {topic}

### Original Framing
{The user's original problem statement or INBOX entry}

### Reframed Problem
{The new framing that emerged from the lenses — this becomes the input for brainstorming}

### Key Assumptions Surfaced
- {Assumption 1 — verified/unverified}
- {Assumption 2 — verified/unverified}

### Blind Spots Identified
- {Bias or blind spot that was operating}

### Constraints to Carry Forward
{Non-negotiable constraints that brainstorming should respect — things that survived the debiasing process}

### Open Questions for Brainstorming
- {Question 1 — something the lenses surfaced that brainstorming should explore}
- {Question 2}
```

### Save the Brief

Save the brief to `docs/plans/{YYYY-MM-DD}-{topic}-brief.md` so it survives across sessions. This file is:

- **Read by** `/superpowers:brainstorming` as input context
- **Read by** `/claude-tweaks:specify` when writing specs (ensures assumptions and constraints reach the spec's Gotchas section)
- **Deleted by** `/claude-tweaks:specify` Step 5 (alongside the design doc — both are consumed artifacts)

### Brief Self-Review

Look at the saved brief with fresh eyes. Fix issues inline — no subagent, no separate pass.

1. **Assumption check** — every assumption named in the brief should be either declared *validated* (with the evidence that made you confident) or declared *unvalidated* (with the test that would resolve it). Hedged language like "probably true" is a placeholder; replace it with one or the other.
2. **Constraint vs. preference** — are listed constraints actually non-negotiable, or did a preference get promoted to a constraint during the lenses? If brainstorming could legitimately propose an alternative that violates the "constraint", it's a preference — relabel it.
3. **Reframe coherence** — does the reframed problem statement still match what the user originally wanted to do? Major reframes are fine; *unrecognizable* reframes mean the lenses overcorrected. If so, soften back toward the original.
4. **Open question quality** — every open question should be answerable. "What should we do?" is too vague; "Should we support multi-tenant from day one, or single-tenant first?" is actionable. Rewrite vague ones.

### Next Actions

When invoked by a parent skill (e.g., `/claude-tweaks:capture` with `--route=challenge`), omit this block — the parent owns the handoff. When invoked directly by a user, after saving the brief, hand off to brainstorming. If the user wants to adjust the reframing or re-examine from a different lens, they can say so — otherwise, proceed.

1. `/superpowers:brainstorming` — explore solutions for the reframed problem **(Recommended)** — after brainstorm produces the design doc, run `/claude-tweaks:specify` next (not `/superpowers:writing-plans` — specify handles decomposition into agent-sized specs before planning)
2. Re-examine — revisit a specific lens or adjust the reframing
3. Save and resume later — keep the brief on disk; pick up at brainstorming when ready

## Component-Skill Contract

This skill is a **component skill** — invoked by `/claude-tweaks:capture` when an INBOX item is routed via `--route=challenge`. Parent invocation is signaled by `$ARGUMENTS` referencing an INBOX item or by a parent-passed topic. When invoked by a parent, omit the `### Next Actions` block — the parent owns the handoff (the parent typically dispatches to `/superpowers:brainstorming` next). When invoked directly by a user, render Next Actions as shown above.

## Anti-Patterns

| Pattern | Why It Fails |
|---|---|
| Agreeing with the user's framing | Defeats the entire purpose |
| Offering solutions during lenses | Premature closure shuts down reframing — solutions belong in brainstorming |
| Running all 7 lenses mechanically | Some problems only need 2-3 lenses |
| Being adversarial rather than curious | The goal is insight, not winning an argument |
| Softening challenges with "maybe" | Be direct — the user opted into this |
| Skipping /claude-tweaks:challenge for "obvious" features | Obvious features often have the strongest hidden assumptions |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:capture` | Feeds INBOX items that /claude-tweaks:challenge can debias |
| `/superpowers:brainstorming` | Consumes the Brainstorming Brief — explores *within* the debiased frame |
| `/claude-tweaks:specify` | Downstream — converts brainstorming output into specs |
| `/claude-tweaks:help` | Flags INBOX items with baked-in assumptions as candidates for /claude-tweaks:challenge |
| `/claude-tweaks:research` | Back debiasing lenses with evidence — `/research` produces citation-audited reports that can ground a challenge. |
| `_shared/auto-mode-contract.md` | Single source of truth for auto-mode behavior — `/challenge` lenses are on the "not silenced" list. |
