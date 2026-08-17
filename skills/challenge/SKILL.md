---
name: challenge
description: Use when /specify needs a content-aware verdict on whether a record bakes in its own solution, to run the evidence-or-accept-risk call on a solution:unjustified record, or to stress-test a problem framing through a named debiasing lens. Keywords - framing, debias, assumptions, solution-baked, evidence, accept risk, reframe, lens.
argument-hint: "framing-check | #<n> | --lens=<n[,n...]> <#n|topic|problem statement>"
---
> **Interaction style:** Single decisions → one `AskUserQuestion` call, one option marked Recommended. Multi-item → batch table with recommendations pre-filled, then one `AskUserQuestion` for apply-all/override. Never more than one call per decision; resolve each before the next. Terminal `## Next Actions` → plain markdown: paste-ready fully-qualified commands, recommended first and bold, one per line — `AskUserQuestion` there only for a documented machine-consumed decision, named inline.

# Challenge — Framing Verdicts and Debiasing Lenses

Three-mode skill. `framing-check` is an inline component mode that judges whether a work record bakes in its own solution. A bare `#N` record reference is the human-invoked evidence-or-accept-risk call on a record carrying `solution:unjustified`. `--lens` is a human-invoked escape hatch that applies a named debiasing lens to a problem you want stress-tested.

Lifecycle: `/claude-tweaks:capture` → `/claude-tweaks:specify` [ **framing-check** ] → `/claude-tweaks:build`

## When to Use

- **`framing-check`** — `/claude-tweaks:specify` is shaping a record and needs a framing verdict alongside its `ceremony-check` call. Never invoked directly by a human.
- **bare `#N`** — a record carries `solution:unjustified` and you want the one-step call: per-assumption evidence findings, then supply evidence or accept the risk. Invoked directly by a human (the backlog needs-you lane composes this launcher), never by a pipeline.
- **`--lens=<n[,n...]>`** — you want a specific debiasing perspective on a problem, before or during brainstorming. Invoked directly by a human, never by a pipeline.

Not for: producing a standalone document, dispatching subagents, or gating anything. This skill renders a verdict or a perspective; callers act on it.

## Input

`$ARGUMENTS` is the literal `framing-check`, a bare record reference (`#42`), or `--lens=<n[,n...]>` followed by a work record reference (`#42`), a topic, or a problem statement.

The three forms are mutually exclusive. `framing-check` takes no further arguments — its input is the record body the caller already holds in memory. A bare record reference with no `--lens=` prefix selects the evidence-or-accept-risk mode below.

For --lens and the bare record-reference form, resolve the target the same way `/claude-tweaks:capture` does (see its Backend Selection): a `#{n}` reference fetches via `gh issue view {n} --json title,body,labels` under `work-backend: github-issues` (the bare form needs `labels`; `--lens` ignores them), or, under `work-backend: local-files`, glob `specs/{n}-*.md` for the matching file, then `readRecord(path)` (`bin/lib/issues/local-store.js`). A topic or problem statement is used as given.

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

## Mode: bare `#N` (evidence-or-accept-risk)

**Human-invoked** — the remedy surface for a `solution:unjustified` record. `skills/backlog/overview-mode.md`'s Needs-you lane and `skills/backlog/refine-lanes.md`'s Needs-you section compose this launcher; a human can also run it directly. Not a gate: `solution:unjustified` stays non-gating (#471's decision) — records build fine with the label on; this mode is how a human clears or accepts it.

### Step 1: Resolve and gate

Fetch the record per the Input section's resolution (labels/facets included). If the record carries no unjustified-solution flag — no `solution:unjustified` label (nor the pre-rename spelling `framing:baked`) under `github-issues`, and no set `solutionUnjustified` facet under `local-files` — report that and stop — a general assumptions pass on an unflagged record is Lens 1's job, not this mode's.

### Step 2: Read the assumptions

Collect the assumption bullets `framing-check` wrote into the body's `## Gotchas` section — each a claim plus its validation status (e.g. "assumes read volume is the bottleneck (unvalidated — no profile cited)"). When `## Gotchas` is missing or carries no assumption-shaped bullets, derive the assumption list fresh from the body using `framing-check`'s own Step 2 signals, and say so in the rendering — the record was flagged before the Gotchas-writing behavior shipped, or the section was hand-edited away.

### Step 3: Bounded evidence search

One pass, in-repo only, in the main thread — no subagents. Caps, stated so the call stays one step: at most 3 `Grep` searches and 2 file reads per assumption, at most 12 search operations for the whole record. For each assumption, look for evidence that validates or contradicts it — measurements in docs, existing implementations, tests, incident-log entries. Classify each: `supported` (cite `file:line`), `contradicted` (cite `file:line`), or `no evidence found`; a cap exhausted mid-assumption reports `no evidence found (cap reached)`. This is a screening pass, not a verification subsystem — exhausting a cap is a normal outcome, never a reason to keep searching.

### Step 4: Render and decide

Render one table — assumption | classification | citation — then call `AskUserQuestion` once:

- `question`: `"Evidence findings are above — supply them to the record, accept the risk, or leave the label in place?"`, `header`: `"Evidence call"`, `multiSelect`: `false`
- Option 1 — `label`: `"Supply evidence (Recommended)"`, `description`: `"Append the findings under ## Gotchas and remove solution:unjustified."` (Recommended only when at least one assumption classified `supported` or `contradicted`; otherwise Option 2 takes the Recommended tag.)
- Option 2 — `label`: `"Accept the risk"`, `description`: `"Post an acceptance comment and remove the label — the assumptions stand unvalidated."`
- Option 3 — `label`: `"Leave it"`, `description`: `"No writes; the label stays."`

On **supply evidence**: append one bullet per assumption under `## Gotchas` — `- evidence ({YYYY-MM-DD}): {classification} — {citation, or "none found"}` — by composing the full updated body and writing it once (`gh issue edit {n} --body-file {tmp}` under `github-issues`; edit the record file under `local-files`). Then remove the label: `gh issue edit {n} --remove-label "solution:unjustified"`, adding `--remove-label "framing:baked"` when the pre-rename spelling is what the record carries — either spelling clears, the same promotion-time cleanup idiom as `skills/specify/shaping-mode.md`'s compose-then-write-once pass. Under `local-files`, clearing means deleting the `solution-unjustified:` frontmatter line — and any pre-rename `framing:` line — from the record file `specs/{n}-*.md`, folded into the same record-file edit that appends the evidence bullets (one write, not two); see the emit/read shape in `bin/lib/issues/local-store.js` (`serializeFrontmatter`/`parseFrontmatterLines`).

On **accept the risk**: post a comment naming each assumption accepted and stating the acceptance (`gh issue comment {n} --body-file {tmp}`), then the same label removal.

On **leave it**: no writes. Next Actions still renders.

## Mode: --lens

Applies the named lens(es) from `lenses.md` in this skill's directory to the resolved target, **in the main thread with no subagent dispatch**, and returns the perspective in conversation. Writes no file. Read `lenses.md` — the seven debiasing lenses, addressed by number in `--lens` — only when this mode runs; `framing-check` never loads it.

Multiple lenses (`--lens=3,5`) run in sequence and are returned as separate labelled sections — there is no synthesis or aggregation step.

## Next Actions

Rendered for `--lens` and bare-`#N` invocations (see Component-Skill Contract). Render as plain markdown (docs/skill-authoring.md's Skill handoffs convention). After a bare-`#N` run, the first line below is the recommended move (re-shaping confirms the clean state after a resolving choice, and is the shaping route when the label was left in place); after `--lens`, the brainstorming line is:

**`/claude-tweaks:specify {ref}`** — re-shape the record; `framing-check` re-runs and confirms the clean state (recommended after a bare-`#N` run)
**`/superpowers:brainstorming`** — explore solutions for the reframed problem, then `/claude-tweaks:specify` to decompose the resulting design doc (recommended)
`/claude-tweaks:challenge --lens=<n[,n...]> {topic|#N}` — apply a different lens to the same problem

## Component-Skill Contract

`framing-check` is **always** a component mode — invoked only by `/claude-tweaks:specify`, never by a human, and never renders `## Next Actions`.

`--lens` is **always** human-invoked and always renders `## Next Actions`. No pipeline orchestrator calls it.

Bare `#N` is likewise **always** human-invoked and always renders `## Next Actions`. No pipeline orchestrator calls it — a pipeline that wants a framing judgment calls `framing-check`.

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
| Dispatching the bare-`#N` evidence search to subagents | The search is capped and in-repo; a fan-out pays dispatch overhead precisely to break the caps that keep this a one-step call. |
| Escalating the evidence search past its stated caps "to be thorough" | The caps are the contract — this is a screening pass; deep verification is a different tool's job. |
| Treating `solution:unjustified` as a gate in the bare-`#N` mode | #471's decision stands: non-gating. The mode is the remedy surface — records build fine with the label on. |
