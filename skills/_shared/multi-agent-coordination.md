# Multi-Agent Coordination Primitive

Canonical patterns for how parallel subagents *interact* — composition rules, comparison logic, and decision-log shapes for four intra-family coordination modes. Consumed by `/review` (Reproduction, Debate), `/specify` (Multi-persona red-team), and `/challenge` (Layered MoA).

This file is the single source of truth. Skills inline the relevant dispatch template **literally** in their `Task()` prompts — agents only see what's in their prompt, they cannot read sibling files.

## Why this exists

The Subagent Contract (`subagent-output-contract.md`) describes how agents **format output** (Templates A/B/C, status protocol, model tiers). It does not describe how multiple agents **compose**. Three forces shape coordination:

1. **False positives in single-agent review** — one agent, even Capable, hallucinates findings. Cutting that requires N>1 with deterministic match rules.
2. **Cross-lens disagreement is signal, not noise** — when two reviewer lenses contradict each other on the same line, the right move is one structured debate round, not silent suppression.
3. **Synthesis quality is layer-bounded** — a single agent producing a synthesis of N candidates loses information. Two layers (proposers → aggregator) beats one; three layers degrades. Hard limits prevent drift.

The primitive addresses these with exactly four modes, each with hard limits (not parameters).

## Composition rule

The primitive describes how agents **interact**; the Subagent Contract describes how agents **format output**. The two compose: a coordination dispatch sends N Template-A (or B / C) agents in one batch, then the primitive's comparison/aggregation logic decides what survives.

A coordination caller writes one Task() prompt per agent (each containing the relevant Template literally), runs them in parallel (or layered, for MoA), then applies the primitive's deterministic rules to the returned outputs.

## Hard limits

| Mode | Agents | Layers | Rounds | Parameterizable? |
|---|---|---|---|---|
| Reproduction | 2 | 1 | 1 | No — N=2 always |
| Debate | 2 | 1 | 1 | No — exactly one critique round |
| Multi-persona red-team | 3 | 1 | 1 | No — 3 fixed personas |
| Layered MoA | N proposers + 1 aggregator | 2 | 1 | Proposer count only |

No mode composition. You cannot reproduce a debate. You cannot run MoA inside red-team. Modes are leaf operations.

## Mode 1 — Reproduction

### Purpose

Cut false positives in single-agent review by dispatching two identical agents and keeping only findings both surface. Each one's hallucinations are unlikely to land at the same `Path:Line` with the same severity bucket.

### Shape

- 2 agents, parallel, 1 turn each.
- Identical prompts (same scope, same Template, same tier).
- Independent runs (no agent sees the other's output).

### Comparison rule

Two findings match when **all three** hold:

1. **Exact path match** — `src/auth.ts` matches `src/auth.ts`, not `src/auth/index.ts`.
2. **Line within ±2** — same finding, slight line-number disagreement is acceptable.
3. **Matching severity bucket** — `critical` + `high` collapse to one bucket; `medium` + `low` + `info` collapse to another. Cross-bucket mismatches do not reproduce.

### Auto-resolution

| Outcome | Status | Destination |
|---|---|---|
| Both agents surface a matching finding | `confirmed` | Surface to caller; treat as real |
| Only one agent surfaces a finding (path/line/severity mismatch) | `unconfirmed` | STAGED to Review Console — never silently dropped |

No outcome is "ask the user inline." Unconfirmed findings stage; the caller's Review Console handles disposition.

### Dispatch template (inline in caller's Task() calls)

```
{Same Template-A prompt sent to BOTH agents — identical scope, identical paths, identical output format.}

[Use: {Standard | Capable} model — reproduction agent. Independent run; do not assume any prior context.]
```

### Decision-log entry format

Per `auto-decision-log.md` schema:

```
- AUTO {HH:MM:SS} — /review reproduction: confirmed {N} findings, staged {M} unconfirmed. Reversibility: high (commit / stage path).
- STAGED {HH:MM:SS} — /review reproduction: finding {path}:{line} surfaced by one agent only. Stage path: staged/review-unconfirmed-{n}.patch.
```

### Review Console staging format

```
| Finding | Source | Severity | Reproducibility |
|---|---|---|---|
| `src/auth.ts:42` Missing expiry check | agent-A only | high | unconfirmed |
```

## Mode 2 — Debate

### Purpose

Resolve cross-lens disagreement deterministically. When two reviewer lenses (security and architecture, say) produce contradictory verdicts on the same region of code, run exactly one critique round between two judging agents.

### Shape

- Triggered, not always-on. Fires only when cross-lens `Path:Line` overlap is detected.
- 2 agents, parallel, 1 round.
- Each agent reads both contradicting verdicts and returns: `agree` / `disagree` / `partial` plus one paragraph reasoning.

### Trigger

The dispatcher scans findings across lenses. If two findings from different lenses share:

- **Exact path** match, and
- **Line within ±5** (looser tolerance than reproduction — "same region of code"), and
- **Contradicting verdicts** (e.g., one says "issue", one says "no issue", or differing severities across bucket boundaries),

then debate is dispatched on that pair.

### Comparison rule

Two judging agents each return a verdict. Resolution table:

| Verdict A | Verdict B | Outcome | Status |
|---|---|---|---|
| agree | agree | `confirmed` | AUTO |
| disagree | disagree | `unconfirmed` | AUTO |
| any other combination (incl. `partial`) | — | `contested` | STAGED |

### Auto-resolution

All three outcomes auto-resolve. No "ask the user inline."

### Dispatch template (inline in caller's Task() calls)

```
Two lenses disagreed on this region. Review the conflicting findings below and return:
1. Verdict: agree / disagree / partial
2. One paragraph of reasoning.

Contested region: {path}:{line}
Finding A (lens: {lensA}): {finding text}
Finding B (lens: {lensB}): {finding text}

[Use: Capable model — debate agent. Independent run; do not see the other judge's reasoning.]
```

### Decision-log entry format

```
- AUTO {HH:MM:SS} — /review debate: {path}:{line} confirmed (both agreed). Reversibility: high.
- AUTO {HH:MM:SS} — /review debate: {path}:{line} unconfirmed (both disagreed). Reversibility: high.
- STAGED {HH:MM:SS} — /review debate: {path}:{line} contested (mixed verdicts). Stage path: staged/review-debate-{n}.md.
```

### Review Console staging format

Used only for `contested` outcomes:

```
| Region | Lens A verdict | Lens B verdict | Judge A | Judge B | Disposition |
|---|---|---|---|---|---|
| `src/auth.ts:42-46` | issue | no issue | agree | partial | contested → user decision |
```

## Mode 3 — Multi-persona red-team

### Purpose

Surface ambiguity and under-specification in a spec doc by reading it through three fixed lenses. Each persona asks one question; their findings flag spots where the spec leaves room for diverging interpretations.

### Shape

- 3 agents, parallel, 1 turn each.
- Three fixed personas — extending the list is not parameterizable.

### Personas (inline in caller's Task() prompts, verbatim)

| Persona | Lens question |
|---|---|
| Implementer | "What's ambiguous or under-specified that would block me from starting to code?" |
| Maintainer | "What in this spec will be hard to maintain six months from now?" |
| Skeptical Reviewer | "What is this spec assuming that might not be true?" |

### Comparison / aggregation rule

Each persona returns findings as Template-A. Findings are written **into the artefact itself** (the spec being reviewed), not into a sidecar — either:

- An appended `## Open Questions` section at the bottom of the spec, with one bullet per finding labeled by persona, or
- Inline `<!-- ambiguity: {persona} — {question} -->` HTML comments at the location.

The dispatcher picks the form per caller; the primitive does not mandate one.

### Auto-resolution

Every finding produces a STAGED decision-log entry. None are auto-applied (these are *questions for the author*, not fixes). None are auto-dropped.

### Dispatch template (inline in caller's Task() calls — one Task() per persona)

```
You are reviewing a spec from the perspective of: {persona name}.

Your lens question: {persona lens question, verbatim}

Spec under review:
{spec content}

Return findings as Template-A. For each finding, give:
- Severity: medium / low (red-team findings are never critical or high — they're questions, not bugs)
- Path:Line: section heading or line in the spec
- Finding: the ambiguity, missing constraint, or assumption
- Evidence: which phrasing or omission in the spec triggered the lens

[Use: Standard model — {persona name} persona.]
```

### Decision-log entry format

```
- STAGED {HH:MM:SS} — /specify red-team ({persona}): {path}:{line} {finding}. Stage path: staged/specify-redteam-{n}.md.
```

### Review Console staging format

```
| Persona | Spec section | Question / ambiguity |
|---|---|---|
| Implementer | ## Acceptance criteria | What does "fast enough" mean in AC 3? |
```

## Mode 4 — Layered MoA

### Purpose

Improve synthesis quality on judgment-heavy work (challenge briefs, design framings) by dispatching N proposers in parallel, then one aggregator sequentially. The aggregator's instruction is verbatim across all callers.

### Shape

- 2 layers, no more. Layer 1 = N proposers in parallel. Layer 2 = 1 aggregator sequential.
- Layer 3 (aggregator-of-aggregators) is forbidden — research shows it degrades.
- Proposer count N is set by the caller; this primitive doc does not cap it.

### Aggregator instruction (verbatim, across all callers)

```
Read N candidate responses below. Identify what each captures that the others miss. Produce a single output that incorporates the strongest elements of each. Do not list which proposer contributed which idea. Do not produce an analysis of the proposers.
```

Do not paraphrase. Variations across callers produce inconsistent synthesis quality.

### Comparison / aggregation rule

The aggregator's output **is** the answer. The primitive does not run a post-aggregator vote or threshold. If the aggregator is asked to produce a verdict, the verdict is final.

### Auto-resolution

Single MoA invocation = one AUTO entry. Failure cases (a proposer returns BLOCKED) follow the Subagent Contract — re-dispatch with more context once, then accept what came back.

### Dispatch template (Layer 1, inline in caller's Task() calls — one Task() per proposer)

```
{Task scope and full context for the proposer's response.}

[Use: Standard model — MoA proposer. Independent run; do not see the other proposers' responses.]
```

### Dispatch template (Layer 2, inline in caller's single aggregator Task() call)

```
Read N candidate responses below. Identify what each captures that the others miss. Produce a single output that incorporates the strongest elements of each. Do not list which proposer contributed which idea. Do not produce an analysis of the proposers.

### Candidate 1
{Proposer 1 output verbatim}

### Candidate 2
{Proposer 2 output verbatim}

...

[Use: Capable model — MoA aggregator.]
```

### Decision-log entry format

```
- AUTO {HH:MM:SS} — /challenge MoA: {N} proposers ({tier}), 1 aggregator (Capable). Reversibility: med (aggregator output committed at {commit}).
```

### Review Console staging format

MoA never stages — the aggregator's output is the answer. The decision log entry is informational only.

## Anti-patterns

| Anti-pattern | Why it fails |
|---|---|
| Inventing a 5th mode | The four modes are selected for four specific gate problems. A new mode signals the gate is misshapen; fix the gate. |
| Composing modes (e.g., reproducing a debate) | Modes are leaf operations. Composition produces unbounded combinatorial agent counts and no clear winner-selection. |
| Exceeding the hard limits (N>2 reproduction, N>2 debate, >2 MoA layers, >3 red-team personas) | Each limit is research-grounded: reproduction past N=2 has diminishing returns; debate past N=2 produces vote-counting not deliberation; MoA past Layer 2 is aggregator-of-aggregators (degrades); red-team past 3 personas dilutes signal. |
| Leaving an outcome "ask the user inline" | Every outcome must auto-resolve to AUTO or STAGED. The Review Console is the user-facing gate, not the dispatcher. |
| Referencing the dispatch template from callers instead of inlining it | Callers can't `read` sibling files; agents only see prompt content. Inline the template literally in every Task() call. |
| Paraphrasing the MoA aggregator instruction | The instruction is verbatim across callers. Variations produce inconsistent synthesis quality. |
| Adding coordination-specific STATUS values (`CONTESTED`, `REPRODUCED`) to the decision log | The existing `AUTO` / `STAGED` / `KEPT-PROMPT` schema covers every outcome. Coordination-specific info goes in `action` and `detail`. |
| Skipping the decision-log entry to save tokens | Silent automation without an audit trail is forbidden per `auto-decision-log.md`. Always log. |

## See also

- `_shared/subagent-output-contract.md` — output templates and status protocol that compose with each dispatch
- `_shared/auto-decision-log.md` — entry schema for AUTO / STAGED / KEPT-PROMPT
- `bin/lib/coordination.js` — pure-function helpers for severity bucketing, finding matching, debate-verdict resolution, cross-lens overlap detection, and dispatch-shape construction
