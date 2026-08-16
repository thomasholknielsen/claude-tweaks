---
name: challenge
description: Use when /specify needs a content-aware verdict on whether a record bakes in its own solution, or to stress-test a problem framing through a named debiasing lens. Keywords - framing, debias, assumptions, solution-baked, reframe, lens.
argument-hint: "framing-check | --lens=<n[,n...]> <#n|topic|problem statement>"
---
> **Interaction style:** Single decisions → one `AskUserQuestion` call, one option marked Recommended. Multi-item → batch table with recommendations pre-filled, then one `AskUserQuestion` for apply-all/override. Never more than one call per decision; resolve each before the next. Terminal `## Next Actions` → plain markdown: paste-ready fully-qualified commands, recommended first and bold, one per line — `AskUserQuestion` there only for a documented machine-consumed decision, named inline.

# Challenge — Framing Verdicts and Debiasing Lenses

Two-mode skill. `framing-check` is an inline component mode that judges whether a work record bakes in its own solution. `--lens` is a human-invoked escape hatch that applies a named debiasing lens to a problem you want stress-tested.

Lifecycle: `/claude-tweaks:capture` → `/claude-tweaks:specify` [ **framing-check** ] → `/claude-tweaks:build`

## When to Use

- **`framing-check`** — `/claude-tweaks:specify` is shaping a record and needs a framing verdict alongside its `ceremony-check` call. Never invoked directly by a human.
- **`--lens=<n[,n...]>`** — you want a specific debiasing perspective on a problem, before or during brainstorming. Invoked directly by a human, never by a pipeline.

Not for: producing a standalone document, dispatching subagents, or gating anything. This skill renders a verdict or a perspective; callers act on it.

## Input

`$ARGUMENTS` is either the literal `framing-check`, or `--lens=<n[,n...]>` followed by a work record reference (`#42`), a topic, or a problem statement.

The two forms are mutually exclusive. `framing-check` takes no further arguments — its input is the record body the caller already holds in memory.

For `--lens`, resolve the target the same way `/claude-tweaks:capture` does (see its Backend Selection): a `#{n}` reference fetches via `gh issue view {n} --json title,body` under `work-backend: github-issues`, or, under `work-backend: local-files`, glob `specs/{n}-*.md` for the matching file, then `readRecord(path)` (`bin/lib/issues/local-store.js`). A topic or problem statement is used as given.

## Mode: framing-check

**Called from:** `/claude-tweaks:specify`'s two record-creation paths — `shaping-mode.md`'s single-record path and `record-creation.md`'s per-sub-issue loop — immediately alongside the existing `ceremony-check` invocation. Every record, every run, no pre-filtering.

Invoked inline via the `Skill` tool, not as a Task-agent dispatch. The caller already holds the body; a subagent would only pay to re-derive it.

### Step 1: Gather

No fetch. Read what the caller already has in memory:

- The composed record body — `## Current State`, `## Deliverables`, `## Acceptance Criteria`.
- In shaping mode, the preserved `## Original request` block. This is the un-reframed source text and is the stronger framing signal, because shaping may already have laundered solution-baked phrasing into neutral spec prose. Judge both; weight the original request higher where they disagree.

### Step 2: Judge

Render `solution-baked` when the record's content shows any of:

- The Deliverables name a specific technology, library, vendor, or mechanism as the thing to build, while the Current State cites no measurement, profile, benchmark, or observed symptom that selects it over alternatives.
- The stated problem is a restatement of its own solution — "we need X" where X is the deliverable.
- The Acceptance Criteria can be satisfied by exactly one implementation, and the record never says why the alternatives lost.

Naming a solution is not itself the defect. A record that names a technology **and** justifies it from observed evidence is `open`. What makes a framing baked is a solution that was never traded off.

**Ambiguity resolves to `open`.** This is deliberately the opposite direction from `/claude-tweaks:assess-agent-autonomy`'s four modes, which resolve toward more caution. Here, more caution would mean manufacturing doubt about a framing that holds — see this skill's Anti-Patterns table. A missed flag costs nothing; a false flag trains the reader to ignore the column. Do not "align" this with its sibling modes.

### Step 3: Render

Output ONLY these two lines, no preamble:

```
FRAMING: open | solution-baked
RATIONALE: {one paragraph naming the specific content signal the verdict is based on}
```

On `solution-baked`, the RATIONALE must name the assumptions the caller is to write into `## Gotchas` — state each as a claim plus its validation status, e.g. "assumes read volume is the bottleneck (unvalidated — no profile cited)".

## Mode: --lens

Applies the named lens(es) from `lenses.md` in this skill's directory to the resolved target, **in the main thread with no subagent dispatch**, and returns the perspective in conversation. Writes no file. Read `lenses.md` — the seven debiasing lenses, addressed by number in `--lens` — only when this mode runs; `framing-check` never loads it.

Multiple lenses (`--lens=3,5`) run in sequence and are returned as separate labelled sections — there is no synthesis or aggregation step.

## Next Actions

Rendered only for `--lens` invocations (see Component-Skill Contract). Render as plain markdown (docs/skill-authoring.md's Skill handoffs convention):

**`/superpowers:brainstorming`** — explore solutions for the reframed problem, then `/claude-tweaks:specify` to decompose the resulting design doc (recommended)
`/claude-tweaks:challenge --lens=<n[,n...]> {topic|#N}` — apply a different lens to the same problem
`/claude-tweaks:specify {ref}` — shape this record into spec shape; framing-check runs automatically as part of it

## Component-Skill Contract

`framing-check` is **always** a component mode — invoked only by `/claude-tweaks:specify`, never by a human, and never renders `## Next Actions`.

`--lens` is **always** human-invoked and always renders `## Next Actions`. No pipeline orchestrator calls it.

The mode word in `$ARGUMENTS` is therefore the detection signal, and it is unambiguous — `$PIPELINE_RUN_DIR` is not consulted.

## Anti-Patterns

| Pattern | Why It Fails |
|---|---|
| Inventing a flaw to look rigorous when the framing holds | Manufactured doubt is as useless as false agreement — and here it trains the reader to ignore the verdict entirely. |
| Rendering `solution-baked` because the record names a technology | Naming a solution is not the defect; naming one that was never traded off is. Check for cited evidence first. |
| Resolving `framing-check` ambiguity toward `solution-baked` "to be conservative" | Inverted from this skill's siblings on purpose — see Step 2. Caution here means *not* flagging. |
| Dispatching `framing-check` as a Task agent | The caller already holds the body inline; a subagent only pays to re-derive it. |
| Writing a file, a brief, or a `decisions.md` entry from either mode | This skill renders a verdict or a perspective. Persistence is the caller's job. |
| Running `--lens` inside a pipeline | `--lens` is human-only. A pipeline that wants a framing judgment calls `framing-check`. |
| Offering solutions while applying a lens | Premature closure shuts down reframing — solutions belong in brainstorming. |
| Bracketing a challenge with flattery | Praise signals agreement and blunts the challenge before it lands. |
