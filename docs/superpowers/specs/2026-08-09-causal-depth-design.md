# Causal-Depth Contract — design

**Date:** 2026-08-09
**Status:** approved in brainstorming; awaiting `/claude-tweaks:specify` decomposition
**Route:** design doc → `/claude-tweaks:specify` (this project skips `/superpowers:writing-plans`)

## Problem

The harness finds *proximate* causes well and *systemic* causes only reactively. `/superpowers:systematic-debugging` traces a bug to its confirmed cause, but its architecture-questioning step (Phase 4.5) fires only after three failed fixes. `/claude-tweaks:reflect`'s Near-misses lens (`full-mode.md` lens 3, reused verbatim by light mode) records what almost broke at wrap-up but does not walk upward from it. Nothing asks "why was this bug possible?" at the moment the causal chain is freshest — the 5-Whys / domain-jumping question (code → convention → process → tooling) that turns a fixed bug into a dead bug *class*.

**Evidence this pays:** every `[IL-nn]` rule in CLAUDE.md (see `docs/incident-log.md` for the full set) is the residue of exactly this domain-jump, performed manually and ad hoc — usually at wrap-up, from memory, hours after the trace went cold. The value is proven; the mechanism is missing.

## Decision summary (from brainstorming)

- **Trigger sites (v1):** the debugging path (hot) and reflect's near-miss lens (cold). Review findings and health-sweep findings were considered and deferred: review chains are speculative rather than traced, and drift causes are diffuse — both risk ritual answers.
- **Architecture:** a `_shared/` prose contract executed inline by its consumers (Approach A). A `/challenge` component mode (B) was rejected — the debugger already holds the entire trace, so a Skill round-trip buys ceremony, not information (the same reasoning `framing-check` uses to stay inline). Breadcrumb-and-defer to wrap-up (C) was rejected — it re-cools the chain and misses standalone `/test` runs.
- **Fire after the fix, not before it:** the causal step runs once the repro is green. The fix stays minimal and unblocked; the chain is still hot (same session, minutes later).
- **Bounded at 3 whys, not 5:** the chain typically leaves the code domain by the second why; literal five is folklore, and unbounded chains invite speculation.

## Phase 1: Contract and bindings

### New file: `skills/_shared/causal-depth.md`

Canonical statement of the why-chain procedure, in `reproduce-first-discipline.md`'s style: short, numbered, "Referenced from" header naming both consumers. Content:

1. **Input:** a confirmed proximate cause — a traced bug cause (debugging path) or a recorded near-miss (reflect).
2. **Procedure:** ask *"why was this possible?"* up to **3 times**, starting from the proximate cause. Each answer may jump domains — code → convention → process → tooling. Stop early when the next answer would leave what this project can change, or would be speculation rather than evidence.
3. **Verdict — two lines, no preamble:**

   ```
   CAUSAL: terminal | systemic
   RATIONALE: {one paragraph stating the chain walked}
   ```

   `terminal` — fixing the proximate cause is where fixing ends. `systemic` — the chain reached something above it: a convention with no enforcement, a fixture API that invites misuse, a missing gate.
4. **On `systemic`:** route the finding through `_shared/learning-routing.md`'s classifier (D1–D5). The contract adds no new destination, introduces no new store, and writes no files itself — persistence belongs to the router and its existing dedup/staging rules.
5. **Ambiguity resolves to `terminal`.** Same deliberate direction as `framing-check`'s resolve-to-`open`, same reason: a false `systemic` trains the reader to ignore the column. Do not manufacture depth for trivial bugs.
6. **Removal condition** (per the `[IL-85]` rule): if a sustained sample of logged invocations — 20+ across a release cycle, measurable from `decisions.md` history in archived runs — renders no `systemic` verdict that survives routing, the debugging-path binding is proposed for removal via `/claude-tweaks:harness-health`'s rule-expiry check. The contract file states this condition in its own text.

### Binding 1: `skills/_shared/reproduce-first-discipline.md`

New numbered step between the current step 2 ("fix the confirmed cause, re-run the repro and suite") and step 3 (escalation): after the repro is green, walk the causal chain per `_shared/causal-depth.md`. One sentence plus the citation — the discipline file stays small. This covers every consumer of the discipline at once: `/build` Common Step 5, `/test` Step 3 Fix Mode and QA-failure investigation, `/review`.

### Binding 2: `skills/reflect/full-mode.md` — the Near-misses lens

The Near-misses lens (lens 3) walks the chain per the contract before routing each near-miss, instead of only recording it. Because `light-mode.md` reuses full mode's Near-misses lens definition **verbatim by reference**, this single edit covers both modes — including `fast-lane` wrap-ups. Hindsight mode is deliberately not bound: its five evaluations are pre-ship action-gate questions ("should we change something before shipping?"), not incident-shaped inputs with a proximate cause to walk from. The routing itself is unchanged — reflect Step 3's existing auto-mode rows and `learning-routing.md` classification already handle staging.

### Edges and docs

- `docs/skill-graph.md`: add the contract's edges (consumers cite; relationships stated once, there).
- No `/help` or README diagram change: no new skill, no lifecycle change.
- No CLAUDE.md change: no new Don't; the contract is discoverable through its two citing files and the skill graph.

## Auto mode and audit

No new mid-flow stop (per `_shared/auto-mode-contract.md`'s strict rule). The verdict renders inline in the transcript; a `systemic` finding follows the existing staging paths — D4/D5 always staged for approval, D3 asked at the Review Console's queue-writes gate — and writes a `decisions.md` entry per `_shared/auto-decision-log.md`. In a standalone run with no pipeline run dir, the finding surfaces inline in conversation, the same degradation every other component uses.

## Error handling

- **Chain cannot be walked** (cause confirmed but no evidence for any "why possible"): verdict `terminal`, rationale states where the chain exhausted. Ambiguity-to-`terminal` covers this by construction.
- **Routing unavailable** (e.g., D4 with no memory dir in the invoking assistant's prompt): `learning-routing.md` already defines the degradation — re-run its classifier from rule 4; nothing new here.

## Testing and verification

No automated test in this repo reads skill prose, so verification is: the standard review pass; consistency of the three-way agreement (contract's "Referenced from" list ↔ the two citing files ↔ `docs/skill-graph.md` edges) — the `[IL-60]` check that a `_shared` addition actually reaches its consumers; and a whitespace-flexible grep (`[IL-66]`) confirming both bindings cite the contract by filename.

## Versioning

Minor bump (feature addition), written as an explicit task in the implementation plan per `[IL-12]`, with the version pre-check against `origin/main`, sibling worktree branches, and `docs/shipped-versions.tsv` at ship time.

## File-touch list

| File | Change |
|---|---|
| `skills/_shared/causal-depth.md` | new — the contract |
| `skills/_shared/reproduce-first-discipline.md` | one new step citing the contract |
| `skills/reflect/full-mode.md` | Near-misses lens walks the chain (light mode inherits by reference) |
| `docs/skill-graph.md` | new edges |
| `.claude-plugin/plugin.json` | minor version bump (at ship, per release discipline) |
