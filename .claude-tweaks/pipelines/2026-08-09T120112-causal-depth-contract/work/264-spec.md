---
record: 264
origin: human
risk: low
size: low
ceremony: standard
grants: []
fingerprint: causal-depth:bind-a-causal-depth-why-chain-contract-into-reproduce-first
surface: backend
---
# 264: Bind a causal-depth why-chain contract into reproduce-first debugging and reflect Near-misses lens

Surface: backend

## Overview

Add `skills/_shared/causal-depth.md` — a canonical why-chain contract: after a confirmed proximate cause, ask "why was this possible?" up to 3 times (each answer may jump domains — code → convention → process → tooling), render a two-line `CAUSAL: terminal | systemic` verdict, and route `systemic` findings through `_shared/learning-routing.md`'s existing D1–D5 classifier. Bind it at two sites: `_shared/reproduce-first-discipline.md` (hot — fires after a behavioral bug's fix has a green repro; covers `/build` Common Step 5, `/test` Step 3 Fix Mode and QA-failure investigation, and behavioral bugs fixed during `/review`, all of which route through that discipline) and `skills/reflect/full-mode.md`'s Near-misses lens (cold — wrap-up; light mode inherits the definition verbatim by reference). This turns the domain-jump that produced every `[IL-nn]` rule from an ad-hoc wrap-up recall into a step bound to the moment the causal chain is freshest.

**Complexity:** Low
**Estimated tasks:** 6

## Non-Goals

- No new skill, no `/challenge` component mode, no Skill-tool invocation at either binding site — the contract is prose executed inline by its consumers, like `reproduce-first-discipline.md` itself
- No walking chains on `/review` *findings themselves* (code-quality observations with no traced failure) or health-sweep findings (drift causes are diffuse) — note the distinction: a behavioral bug fixed *during* review routes through `reproduce-first-discipline.md` and inherits the step; the deferred case is review findings as inputs in their own right
- No binding in `reflect/hindsight-mode.md` — its five evaluations are pre-ship action-gate questions, not incident-shaped inputs with a proximate cause to walk from
- No edit to `skills/reflect/light-mode.md` — it reuses full mode's Near-misses definition verbatim by reference
- No new destination, store, staging mechanism, or mid-flow stop — `learning-routing.md`, reflect Step 3's staging rows, and `_shared/auto-decision-log.md` already exist and are cited, not extended
- No literal five whys — the chain is bounded at 3

## Prerequisites

None — all cited contracts (`learning-routing.md`, `auto-decision-log.md`, `auto-mode-contract.md`) already exist on `main`.

## Current State

- `skills/_shared/reproduce-first-discipline.md` — 3-step discipline: step 1 reproduce; step 2 fix + re-run; step 3 is a conditional escalation branch off step 1 (cannot reproduce → stop), not a sequential continuation of step 2. Opens with a "Referenced from" line naming its consumers
- `skills/reflect/full-mode.md` — Near-misses is lens 3, defined as a terse table row ("What broke or almost broke?"), with per-lens elaboration paragraphs following the table for lenses needing more than a cell; `skills/reflect/light-mode.md`'s header states it reuses the Near-misses/Fresh-start lens definitions verbatim
- `skills/_shared/learning-routing.md` — the D1–D5 destination classifier with dedup and staging rules; consumers cite it rather than restating its tables
- `_shared/auto-decision-log.md` — the decisions.md entry schema with four statuses (`AUTO`/`STAGED`/`KEPT-PROMPT`/`SCANNED`); archived runs retain their `decisions.md` under `.claude-tweaks/pipelines/archive/`
- `docs/skill-graph.md` — the single home for cross-skill relationship edges
- Tests: no suite reads skill prose (CLAUDE.md notes this at `[IL-70]`), so verification is grep/consistency-based, not unit tests

## Deliverables

- [ ] New `skills/_shared/causal-depth.md` containing: the input definition with its two evidentiary bars stated explicitly (debugging path: a traced cause confirmed by a green repro; reflect path: a recorded near-miss's own trigger, a weaker bar by design — when no proximate cause is identifiable, render `terminal` with rationale "chain exhausted at input"); the ≤3-why domain-jumping procedure with both early-stop rules **and one worked example pair** (a stop-here answer vs a legitimate keep-going answer, so the boundary isn't reviewer-dependent); the two-line verdict contract; verdict logging — when a pipeline run dir exists, every invocation writes exactly one `decisions.md` line per `_shared/auto-decision-log.md` (`SCANNED` for `terminal`, `STAGED` for `systemic`); the routing rule for `systemic`; ambiguity-resolves-to-`terminal`; the executor rule (the walk is performed by the agent that executed the fix, in the context that holds the trace — dispatch prompts citing the discipline reach that agent by construction); the recorded removal condition; and a "Referenced from" opening naming both consumers
- [ ] `skills/_shared/reproduce-first-discipline.md`: insert the causal-depth citation as **new step 3** (walk the chain per `_shared/causal-depth.md` once the fix's repro is green), renumbering the escalation branch to step 4 — then sweep the repo for references to the discipline's step numbers before committing
- [ ] `skills/reflect/full-mode.md`: a dedicated elaboration paragraph after the lens table (mirroring the existing per-lens elaboration pattern) stating that each Near-misses finding walks the chain per `_shared/causal-depth.md` before Step 3 routing
- [ ] `docs/skill-graph.md`: edges for both consumers of the new contract
- [ ] Verification sweep: three-way consistency (contract's Referenced-from list ↔ the two citing files ↔ skill-graph edges) plus whitespace-flexible greps confirming both bindings cite the contract by filename
- [ ] Minor version bump in `.claude-plugin/plugin.json` as an explicit task, with the ship-time version pre-check

## Acceptance Criteria

1. `skills/_shared/causal-depth.md` exists, is under 40 KB, and its opening lines name both consumers (`reproduce-first-discipline.md` and `reflect/full-mode.md`'s Near-misses lens)
2. The contract text contains the literal two-line verdict format (`CAUSAL: terminal | systemic` on one line, `RATIONALE:` on the next), states that ambiguity resolves to `terminal`, states the 3-why bound with both early-stop rules plus one worked stop-here/keep-going example pair, states both evidentiary bars for its two input types, and states the removal condition in countable terms: if the archived pipeline runs of a full release cycle contain 20+ causal-depth `decisions.md` lines with zero `systemic` verdicts surviving routing, propose removing the debugging-path binding via `/claude-tweaks:harness-health`'s rule-expiry check (standalone no-run-dir invocations are uncounted, and the contract says so)
3. The contract's write behavior is exactly: no new files or stores; when a pipeline run dir exists, one `decisions.md` line per invocation — `SCANNED {time} — causal-depth: terminal …` or `STAGED {time} — causal-depth: systemic …` per `_shared/auto-decision-log.md` — and with no run dir the finding surfaces inline in conversation; `systemic` findings route through `_shared/learning-routing.md` by name; no mid-flow stop is introduced (`grep -c "AskUserQuestion" skills/_shared/causal-depth.md` returns 0)
4. `grep -c "causal-depth" skills/_shared/reproduce-first-discipline.md` returns ≥ 1; the citation is the discipline's step 3, the escalation branch is renumbered to step 4, and a repo-wide grep for stale references to the old step numbering returns clean (checked topic-consistently per `[IL-55]`, not by expecting zero matches)
5. `grep -c "causal-depth" skills/reflect/full-mode.md` returns ≥ 1, in a dedicated elaboration paragraph following the lens table, and `git diff` shows zero changes to `skills/reflect/light-mode.md`
6. `docs/skill-graph.md` names `causal-depth.md` with edges to both consumers
7. `npm test` passes with the same count as the pre-change baseline (no test additions expected — no suite reads skill prose)

## Technical Approach

A prose contract executed inline — the citing files are already read at exactly the moments the procedure should run (`reproduce-first-discipline.md` when a behavioral bug is being fixed; `full-mode.md` when reflect runs its lenses), which is what binds the step to a real event rather than prose-and-memory. The executing agent is whichever agent performs the fix or the reflect pass — in subagent dispatch models that agent's own context holds the trace, so the hot-chain premise survives the handoff by construction. No runtime code, no hook changes, no schema changes.

### Data / API Surface

The verdict contract (rendered inline in the transcript; consumers parse nothing):

```
CAUSAL: terminal | systemic
RATIONALE: {one paragraph stating the chain walked}
```

`terminal` — fixing the proximate cause is where fixing ends. `systemic` — the chain reached something above it (a convention with no enforcement, a fixture API that invites misuse, a missing gate). On `systemic`, route through `_shared/learning-routing.md`'s classifier. Write surface: no new files or stores; the only write is the one-line-per-invocation `decisions.md` entry when a run dir exists (`SCANNED` for `terminal`, `STAGED` for `systemic`) — which is also what makes the removal condition countable.

### Key Files

- `skills/_shared/causal-depth.md` — new contract file
- `skills/_shared/reproduce-first-discipline.md` — new step 3, escalation renumbered to 4
- `skills/reflect/full-mode.md` — Near-misses elaboration paragraph
- `docs/skill-graph.md` — new edges
- `.claude-plugin/plugin.json` — minor version bump

## Gotchas

- `light-mode.md` inherits full mode's Near-misses definition verbatim by reference — do NOT edit `light-mode.md`; editing `full-mode.md` covers fast-lane wrap-ups automatically
- Hindsight mode stays unbound deliberately — don't "complete" the pattern by adding the citation there
- Ambiguity resolves to `terminal`, deliberately opposite to `assess-agent-autonomy`'s conservative direction and for the same reason `framing-check` resolves to `open`: a false `systemic` trains readers to ignore the column. Don't align it with siblings
- `[IL-60]`: a `_shared` addition reaches consumers only when each consumer's own citing sentence names it — both bindings must cite `causal-depth.md` by filename, not "see the discipline"
- `[IL-66]`: verification greps against markdown prose must be whitespace-flexible — hard-wrapped text splits phrases across lines
- `[IL-86]`: the escalation step's renumber (3 → 4) happens inside this change — sweep the whole repo for references to the discipline's step numbers, not just the diff hunks
- `[IL-12]`/`[IL-98]`: the version bump is an explicit task; at ship, re-check the number against `origin/main`, sibling worktree branches, and `docs/shipped-versions.tsv` — the number must be ahead of the tip, not merely unclaimed
- `decisions.md` logging applies only when a pipeline run dir exists; a standalone `/test` run surfaces the finding inline instead and is uncounted by the removal condition — the contract states both degradations rather than assuming a run dir
- `docs/skill-graph.md` is also touched by open records #221, #220, #179 (edge appends). No dependency link, but verify at execution time that the concurrent edits are disjoint appends — re-read the file's live state immediately before editing, never from this record's snapshot

## Decision Rationale

- **Inline `_shared` contract over a `/challenge` component mode:** the debugger already holds the entire causal trace; a Skill round-trip re-derives nothing — the same reasoning `framing-check` uses to stay inline. Breadcrumb-and-defer (record the cause, walk the chain at wrap-up) was rejected for re-cooling the chain and missing standalone `/test` runs.
- **Fire after the fix's repro is green, not before the fix:** keeps the fix minimal and unblocked; the chain is still hot minutes later in the same context.
- **Two v1 sites only:** debugging (freshest chain, clearest event) and reflect's Near-misses lens (covers what debugging misses, reuses existing routing). Review findings and health-sweep findings deferred — speculative and diffuse chains respectively, both risking ritual answers that erode the verdict's signal.
- **Both verdicts log when a run dir exists:** red-team caught that a systemic-only log makes the removal condition uncountable and lets a miscalibrated stop rule feed it false evidence — one `SCANNED` line per terminal verdict is the cheapest countable signal, and it reuses the existing decisions.md mechanism rather than creating a store.
- **Kill condition recorded up front:** the `/challenge` rewrite (6.73.0 era) shows this repo culls ceremony that doesn't pay rent; the removal condition makes that check mechanical instead of vibes-based.


<!-- work-fingerprint: causal-depth:bind-a-causal-depth-why-chain-contract-into-reproduce-first -->