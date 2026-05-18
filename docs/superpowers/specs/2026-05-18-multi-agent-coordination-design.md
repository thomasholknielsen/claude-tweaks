# Multi-Agent Coordination Primitive + Three Gate Integrations

**Status:** Design approved 2026-05-18 — pending implementation plan
**Owner:** Thomas Holk Nielsen
**Scope:** `skills/_shared/multi-agent-coordination.md` (new) · `/review` · `/specify` · `/challenge` · `/wrap-up` Review Console template

---

## Context

Research on the LLM Council pattern and adjacent multi-agent techniques (debate, mixture-of-agents, multi-agent reflexion, verification-by-reproduction) identified four intra-family deliberation modes that could materially improve output on three high-leverage gates without requiring cross-family model access.

Cross-family council patterns (anonymised peer-review across GPT/Gemini/Claude/Grok) are explicitly out of scope — they require external API transport claude-tweaks does not adopt. Users who want classic LLM Council should install `llm-council-skill` from PyPI as a companion.

This spec adds **four coordination modes** as a shared primitive consumed by **three existing gates** (`/review`, `/specify`, `/challenge`). All work is intra-family (Claude Fast/Standard/Capable tiers); no new transport, no new external dependencies.

Background research: `.claude-tweaks/research/2026-05-17-llm-council-prompting-claude-tweaks/research_report.md`.

---

## Goals

1. Add four coordination modes (reproduction, debate, multi-persona red-team, layered MoA) as a shared primitive in `skills/_shared/multi-agent-coordination.md`.
2. Integrate the appropriate mode(s) into `/review`, `/specify`, `/challenge` as **default gate behavior** — no user-facing toggles, no per-invocation flags.
3. Compose with the existing Subagent Contract (Templates A/B/C stay; the primitive describes how agents interact, not how they format output).
4. Stay inside the v4.6 Auto-Mode / Bookend architecture — every coordination outcome auto-resolves with a `decisions.md` entry, or stages to the existing Wrap-Up Review Console. **Zero new mid-flow stops.**

## Non-goals

- Not cross-family. No OpenRouter, Bedrock, Poe, or non-Claude transport.
- Not classic LLM Council (no anonymised cross-family peer review with chairman). Users who want it should install `llm-council-skill` from PyPI.
- Not a generic agent-orchestration framework. Exactly four modes, no extensibility surface, no plugin hooks.
- Not changing the lifecycle. No new skill added; no skill removed; no existing gate's lifecycle position shifts.

## Operational rule (binding)

Coordination is **how these gates work**, not something the user toggles. Each mode has a baked-in turns budget chosen for sensible defaults. There is no `--coordination` flag, no Manifesto question, no `policy.yml` lever. If a default ever needs to change, it is a code edit to the primitive's mode definition — not a runtime configuration.

If a coordination outcome would naturally generate a question to the user, the design **must** specify the auto-resolution rule that replaces that question. No outcome is left "ask the user."

## Turns budget

| Mode | Turns | Parallelism |
|------|-------|-------------|
| Reproduction | 1 | N agents in same batch |
| Debate | 1 | 2 agents, 1 critique round |
| Multi-persona red-team | 1 | All personas in same batch |
| Layered MoA | 2 | Proposers parallel; aggregator sequential |

That is the complete budget surface. No knob is configurable at runtime.

---

## The primitive

**File:** `skills/_shared/multi-agent-coordination.md` (new — sibling to `subagent-output-contract.md`)

**Composition rule:** the primitive describes how agents **interact**; the Subagent Contract describes how agents **format output**. Together: a reproduction dispatch sends 2 Template-A agents in one batch, then the primitive's reproduction-comparison logic decides which findings survive.

### Mode 1 — Reproduction

**Purpose.** Cut single-source false positives by requiring a second independent agent to surface the same finding.

**Shape.** Dispatch the same task to **2 agents in one batch** (always 2, never N>2 — diminishing returns past the second). Both use the same Template-A output. Dispatcher compares findings.

**Comparison rule.** A finding from agent A is "reproduced" if agent B emits a finding with **matching `Path:Line` and matching severity bucket** (`critical`/`high` collapse into one bucket; `medium`/`low`/`info` collapse into another). Wording variance is ignored. Path matching is exact; line matching is ±2.

**Auto-resolution.**
- Reproduced findings → emitted to caller as `confirmed`.
- Single-source findings → emitted as `unconfirmed`. `STAGED` entry in `decisions.md`. Surfaced at Wrap-Up Review Console under "Low-confidence findings". Not silently dropped.

### Mode 2 — Debate

**Purpose.** Resolve cases where two reviewer agents materially disagree about the same artefact (one flags an issue at a location, another reviews the same location and does not).

**Shape.** Exactly **1 critique round, 2 agents.** Each agent receives a stripped version of the other's finding (no model identity, no reasoning chain — just the finding text + evidence). Each emits a revised verdict using a small `agree | disagree | partial` marker plus reasoning.

**Trigger.** Invoked only when the dispatcher detects two reviewer agents producing contradictory verdicts on the same `Path:Line` region (within ±5 lines). Not invoked by default; not invoked when only one lens covered the region.

**Auto-resolution.**
- Both agents return `agree` → finding upgraded to `confirmed`. `AUTO` entry in `decisions.md` noting "debate converged positive after 1 round".
- Both agents return `disagree` → finding downgraded to `unconfirmed`. `AUTO` entry noting "debate converged negative after 1 round". Surfaced at Review Console under "Low-confidence findings".
- `partial` or mixed verdicts → finding becomes `contested`. `STAGED` entry. Surfaced at Review Console under "Contested findings" with both verdicts side-by-side. User picks at the Console, never mid-flow.

### Mode 3 — Multi-persona red-team

**Purpose.** Surface ambiguity, gaps, and unstated assumptions in a draft artefact by reading it through deliberately distinct lenses.

**Shape.** **3 persona-instantiated agents in one batch**, each reading the same artefact through a different lens. Findings union'd (not ranked, not debated).

**Personas (defined in the primitive, gate-customisable):**
- **Implementer** — "Could I build exactly what this asks for without asking a question?"
- **Maintainer** — "In 6 months, can someone changing related code know what they can/can't break?"
- **Skeptical Reviewer** — "What unstated assumption is doing the load-bearing work here?"

Each persona's prompt inlines its lens question verbatim plus the standard Template-A output contract narrowed to: ambiguity, gap, unstated assumption.

**Auto-resolution.** Each finding is written **into the artefact itself** as either:
- A new `## Open Questions` section appended to the artefact (one row per finding: persona + finding + suggested resolution if the persona offered one), or
- An inline `<!-- ambiguity: ... -->` HTML comment next to the specific sentence the persona flagged (when the persona pointed at a precise location).

`STAGED` entry in `decisions.md` per finding. Never surfaced as a mid-flow prompt.

### Mode 4 — Layered MoA

**Purpose.** Improve synthesis quality on tasks where diverse partial answers benefit from explicit aggregation (rather than just concatenation).

**Shape.** **2 layers, no more.**
- **Layer 1:** N proposer agents (typically 3) run in parallel, each producing a candidate answer to the same prompt under a different framing.
- **Layer 2:** 1 aggregator agent reads all proposer outputs + the original prompt and produces the final synthesised output.

**Aggregator instruction template** (inlined per dispatch, never referenced):
> "Read N candidate responses below. Identify what each captures that the others miss. Produce a single output that incorporates the strongest elements of each. Do not list which proposer contributed which idea. Do not produce an analysis of the proposers."

**Auto-resolution.** Aggregator output is the answer. No further reconciliation. If proposers wildly disagree, the aggregator's job is to surface the disagreement in its own output (e.g. "two viable framings exist — X favours…, Y favours…"). One `AUTO` entry per MoA invocation noting proposer count and aggregator tier.

### Interface

Each mode is exposed as a documented orchestration pattern in `multi-agent-coordination.md`, with:
- The literal dispatch template (per Subagent Contract anti-pattern: inline, don't reference)
- The comparison / aggregation rule
- The decision-log entry format (using the **existing** `AUTO` / `STAGED` / `KEPT-PROMPT` STATUS values from `auto-decision-log.md`)
- The Review Console staging format

Callers inline the relevant section into their own `Task()` prompts, same pattern as how Templates A/B/C are inlined today.

### What the primitive does NOT do

- No model selection logic — existing Subagent Contract Fast/Standard/Capable tiers apply unchanged.
- No retry / loop logic beyond what each mode specifies (always 1 turn except MoA's 2).
- No cross-mode composition (you can't reproduce a debate result — modes are leaf operations).
- No support for >2 agents in debate, >2 layers in MoA, or >3 personas in red-team. These are hard limits in the primitive, not parameters.

---

## Gate integration: `/review`

**Current state.** `skills/review/SKILL.md` (402 lines) dispatches parallel reviewer lenses (security, performance, quality, errors, architecture, etc.) via Subagent Contract Form B. Each lens returns Template-A findings; results are assembled into `skills/review/review-summary-template.md`.

**Changes.**

1. Each lens dispatch becomes a **reproduction pair**: 2 identical agents in the same batch instead of 1. The primitive's comparison rule applied per lens.
2. After per-lens reproduction, the dispatcher scans for **cross-lens contradictions** on overlapping `Path:Line` regions. When found, **debate mode** runs (1 round, 2 agents — the two lens-agents that produced the contradicting outputs).
3. Findings are now categorised three ways when assembled:
   - **`confirmed`** — reproduced, no cross-lens contradiction → flows into the existing severity-grouped sections of the review summary as today.
   - **`unconfirmed`** — single-source, or debate converged negative → staged to a new Review Console subsection `### Low-confidence findings (not reproduced)`.
   - **`contested`** — debate inconclusive → staged to `### Contested findings (debate inconclusive)`.

**Files touched.**
- `skills/review/SKILL.md` — workflow section + parallel dispatch directives updated; ~50 line growth expected.
- `skills/review/review-summary-template.md` — add the three categorisation buckets to the template.

No new sub-file needed; the primitive sections are inlined into the parallel dispatch directives.

---

## Gate integration: `/specify`

**Current state.** `skills/specify/SKILL.md` (388 lines) produces a spec from a design doc using `skills/specify/spec-template.md`. Spec self-review is an existing user-facing step. A recent commit (4e0e44b) converted per-overlap interactive prompts into a single batch table — the anti-friction posture is already in place at this gate.

**Changes.**

1. After draft spec is written, **before** spec self-review, dispatch 3 personas (Implementer / Maintainer / Skeptical Reviewer) in one parallel batch, each reading the full draft. Each returns Template-A findings narrowed to: ambiguities, gaps, unstated assumptions.
2. Findings written **back into the spec body** as:
   - A new `## Open Questions` section at the end of the spec (one row per finding: persona + finding + suggested resolution if persona offered one), and/or
   - Inline `<!-- ambiguity: ... -->` HTML comments next to the specific sentence the persona flagged.
3. Existing spec self-review step naturally surfaces these — they're now part of the spec the user reviews. No new prompt.
4. `STAGED` `decisions.md` entries per finding.

**Files touched.**
- `skills/specify/SKILL.md` — workflow section updated; ~30 line growth expected.
- `skills/specify/spec-template.md` — add `## Open Questions` section to the template, marked optional (only populated when red-team finds something).

---

## Gate integration: `/challenge`

**Current state.** `skills/challenge/SKILL.md` (226 lines) applies debiasing lenses to an INBOX item; current implementation is single-pass sequential lens application. The recent friction-reduction commit (4e0e44b) dropped the Key Principles section; lens definitions live in the lens-by-lens bodies.

**Changes.**

1. Existing lenses become **proposer agents**: one parallel proposer per currently-defined lens in `skills/challenge/SKILL.md` (typically 3–5; exact set per current implementation, not pinned in this spec). Each proposer is focused on a single lens reading the same problem statement.
2. **Aggregator agent** (1 sequential round-trip after proposers complete) reads all proposer outputs + the original problem statement + the original INBOX item context, produces the debiased framing in the same shape `/challenge` outputs today.
3. Aggregator instruction inlined per primitive's template; explicit constraint that the aggregator does not enumerate proposers or expose internal structure to the user.
4. Output shape from the user's perspective is **unchanged** — same debiased problem framing they get today; quality improves because synthesis is now explicit rather than emergent from sequential lens application.

**Files touched.**
- `skills/challenge/SKILL.md` — workflow section updated; ~40 line growth expected.

No template changes — the output contract to downstream consumers (`/specify`, `/capture`) stays the same.

---

## Decision-log integration

**Schema (unchanged — reuses existing `auto-decision-log.md`):**

The existing `AUTO` / `STAGED` / `KEPT-PROMPT` STATUS values cover every coordination outcome. **No new STATUS values are introduced.** Coordination-specific information goes into the `action` and `detail` fields.

**Example entries** (illustrative format — full schema documented in `skills/_shared/auto-decision-log.md`):

```
## /review
- AUTO 14:32:14 — Reproduction: lens "security" finding src/auth.ts:42 reproduced. Confirmed. Reversibility: high.
- STAGED 14:32:18 — Reproduction: lens "perf" finding src/cache.ts:101 not reproduced. Staged to Review Console as low-confidence. Reversibility: high.
- AUTO 14:33:01 — Debate: cross-lens disagreement on src/auth.ts:42 converged positive after 1 round. Reversibility: high.
- STAGED 14:33:08 — Debate: cross-lens disagreement on src/api.ts:80 inconclusive (1 partial, 1 agree). Both verdicts staged. Reversibility: high.

## /specify
- STAGED 14:40:12 — Red-team: persona "Maintainer" flagged ambiguity at section 3.2. Written to spec as <!-- ambiguity: --> marker.

## /challenge
- AUTO 14:50:00 — MoA: applied 4 proposers + 1 aggregator on INBOX item 17. Aggregator tier: Standard.
```

**Wrap-Up Review Console additions** (append to existing template in `skills/wrap-up/SKILL.md`, do not create new console):

- New subsection: `### Low-confidence findings (not reproduced)` — table with columns: `Path:Line`, `Finding`, `Severity`, `Lens`. Shown only when non-empty.
- New subsection: `### Contested findings (debate inconclusive)` — table with columns: `Path:Line`, `Lens A verdict`, `Lens B verdict`. Shown only when non-empty.

Both subsections inherit the existing Console's "apply all / override" pattern.

**Files touched.**
- `skills/wrap-up/SKILL.md` — Console template additions.
- `skills/_shared/auto-decision-log.md` — **no changes**. Existing schema covers all new entries.

---

## Testing & rollout

**Test runner:** existing `node --test tests/` per CLAUDE.md stack. Tests live in `tests/multi-agent-coordination.test.js`.

**Unit tests for the primitive** (no real `Task()` invocation — assert on dispatch call shapes via recording):
- Reproduction dispatches exactly 2 agents in one batch with identical prompts.
- Comparison rule: matching `Path:Line` + matching severity bucket → `confirmed`; one-side-only → `unconfirmed` with correct `STAGED` decision-log entry.
- Debate triggers only on cross-lens `Path:Line` overlap (±5 lines) with contradicting verdicts; runs exactly 1 round with 2 agents; auto-resolves to one of `confirmed` / `unconfirmed` / `contested`.
- Multi-persona dispatches exactly 3 personas in one batch; findings written to artefact body in the documented format.
- Layered MoA dispatches N proposers in parallel + 1 aggregator sequential; aggregator's prompt contains all proposer outputs verbatim; output shape matches caller expectation.

**Integration tests** (one per gate, using fixture reviewer outputs):
- `/review` with two fixture lens outputs that overlap and disagree → debate triggers → expected three-bucket assembly.
- `/specify` with a fixture draft spec containing a deliberate ambiguity → red-team flags it → spec body contains `## Open Questions` section with the flagged ambiguity.
- `/challenge` with a fixture INBOX item → proposers + aggregator dispatched → output shape matches today's `/challenge` output contract.

**Rollout.** One PR containing the primitive file + all three gate integrations + test suite. No feature flag (per the operational rule above — there is no user-facing toggle).

**Acceptance criteria:**
1. All existing `node --test` tests pass.
2. New tests in `tests/multi-agent-coordination.test.js` pass.
3. Manually exercising `/review` on a spec produces the three-bucket review summary with at least one `confirmed` finding.
4. Manually exercising `/specify` on a known-ambiguous design doc produces a spec with a non-empty `## Open Questions` section.
5. Manually exercising `/challenge` on a known-biased INBOX item produces a debiased framing whose output shape matches the current `/challenge` output contract (downstream consumers do not break).

**Rollback path.** Revert the PR. No data migrations, no persisted state changes — `decisions.md` entries from the new modes remain readable (they use the existing schema) but no consumer requires them post-revert.

---

## Open questions for the implementation plan

These are intentionally left for the writing-plans step:

1. **Reviewer-lens authorship of the second reproduction agent.** Should the second agent get a slightly perturbed prompt (e.g. different opening framing) to encourage independent reasoning, or strictly identical prompts? The MAR literature suggests perturbation helps; identical prompts are simpler. Default position: identical, escalate to perturbed if false-positive rate doesn't drop.
2. **Severity bucket boundaries.** Spec collapses `critical`+`high` and `medium`+`low`+`info`. This is one choice; another is `critical` alone, `high`+`medium` together, `low`+`info` together. To validate against fixture data during implementation.
3. **Persona prompt depth in `/specify`.** Specs are larger than typical review artefacts. The Implementer persona may need explicit length guidance ("focus on the 3-5 most load-bearing ambiguities, not exhaustive enumeration"). To tune during integration testing.
4. **MoA proposer count in `/challenge`.** Spec says "3–5" — exact number per-invocation depends on which lenses are currently defined in `/challenge`. Implementation should read the existing lens list and dispatch one proposer per lens.

---

## References

- Background research: `.claude-tweaks/research/2026-05-17-llm-council-prompting-claude-tweaks/research_report.md`
- Existing Subagent Contract: `skills/_shared/subagent-output-contract.md`
- Existing Auto-Mode Contract: `skills/_shared/auto-mode-contract.md`
- Existing Auto-Decision Log schema: `skills/_shared/auto-decision-log.md`
- Pipeline run directory contract: `skills/_shared/pipeline-run-dir.md`
