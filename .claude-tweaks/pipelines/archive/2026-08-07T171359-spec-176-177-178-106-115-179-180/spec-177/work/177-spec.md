---
record: 177
origin: human
risk: medium
effort: medium
ceremony: standard
grants: []
fingerprint: research-verification-phase:research-verify-source-registry-parallel-dispatch-and-verdic
blocked-by: [176]
surface: backend
---
# 177: research verify: source registry, parallel dispatch, and verdict shape

Surface: backend
Parent: #175
Blocked by #176: verify-mode.md must exist for the registry stub to reference

## Overview

Deliver the source registry that answers the questions `verify` mode's consequence filter selects, plus the parallel dispatch that runs them and the verdict shape they return.

The registry is keyed by **what a source can falsify**, not by which tool it uses — three entries all mechanically run `grep` and are separate because they answer different question types. A question routes to *every* source that could falsify it; multiple sources per question is the default case, not an exception. Confidence is carried per-source rather than per-report, which is what stops a grep-verified fact from lending its credibility to a blog post sitting in the same result list.

**Complexity:** Medium
**Estimated tasks:** 6

## Non-Goals

- The mode grammar, input resolution, and the consequence filter — sibling leaf, must land first.
- The brief write-back and the `falsified` vocabulary — separate leaf.
- Building a `sibling-repos` source. Cross-repo access is inconsistent enough that it would ship half-working, and `[IL-85]` forbids adding a path without stating when it goes.
- Changing how `docs-health` runs its own command-block execution sweep — this leaf reuses the technique, it does not refactor the original.

## Current State

- `skills/research/verify-mode.md` — created by the sibling leaf; this leaf adds the registry reference and the dispatch procedure.
- `skills/_shared/subagent-output-contract.md` — the four-value status line (`DONE`/`DONE_WITH_CONCERNS`/`NEEDS_CONTEXT`/`BLOCKED`), Templates A/B/C, model tiers, and the minimal-input rule.
- `skills/docs-health/judge-procedure.md:46` — the existing execute-every-command-block mandate and its bounded-output technique (`cmd > /tmp/dh-$$.out 2>&1; echo "exit=$?"`, inspect `tail -20`).
- `docs/incident-log.md` — the `history` source's primary target.
- `.claude-tweaks/pipelines/*/events.jsonl` and `decisions.md` — the `telemetry` source's targets.
- `tools/upstream-drift/` and the `upstream-drift` skill — the `deps` source's existing tooling.
- CLAUDE.md's Parallel execution directives table — Form B is the applicable form.

## Deliverables

- [ ] A new `skills/research/source-registry.md` listing every source with, for each: what it can falsify, its confidence tier, and its concrete read mechanism.
- [ ] The `runtime` source, reusing `docs-health/judge-procedure.md:46`'s bounded-output technique verbatim rather than inventing a second one.
- [ ] The `human` source documented as a **terminator** — routing there means stop researching and ask, so no agent is dispatched for it.
- [ ] Routing rules: a question goes to every source that could falsify it; multiple sources per question is the normal case.
- [ ] Form B parallel dispatch, one agent per question×source pair, with Template A inlined verbatim in the dispatch prompt per the Subagent Contract.
- [ ] The verdict shape: outcome, provenance, per-source confidence, and the sha the check ran against.
- [ ] `tests/research/` coverage for the registry's structural shape.

## Acceptance Criteria

1. `skills/research/source-registry.md` exists and every entry names what it falsifies, a confidence tier, and a read mechanism — no entry names only a tool.
2. The `runtime` entry cites `docs-health/judge-procedure.md`'s bounded-output form; grepping `source-registry.md` for `exit=` returns at least one line.
3. The `human` entry states it dispatches no agent and terminates research for that question.
4. `source-registry.md` states that a question routes to every source that could falsify it, and that multiple sources per question is the default.
5. The dispatch section inlines a literal Template A block from `_shared/subagent-output-contract.md` — not a reference to it (`references won't reach the agent`).
6. The dispatch section states the agents are read-only and therefore carry no git access.
7. The verdict shape includes the checked-against sha, and `source-registry.md` states confidence is per-source, not per-report.
8. The `deps` entry records that `node_modules` reads are structurally denied in this project and that it falls back to context7/public docs at reduced confidence.
9. The registry contains an entry for each of: `runtime`, `codebase`, `repo-prose`, `tests`, `history`, `telemetry`, `deps`, `web`, `human`. A missing entry fails this criterion; an additional well-formed entry does not.
10. `node --test tests/research/` passes.

## Technical Approach

The registry is a separate sub-file from `verify-mode.md` because it is the unit that grows: adding a source is a registry edit, and the mode procedure should not be re-read to make one.

Per-source confidence is a field on each verdict rather than a document-level disclaimer, because a single run mixes `file:line` evidence with web evidence and a flat list renders them identically.

### Data / API Surface

Verdict shape written back by each dispatched agent:

```
outcome:    verified | falsified | unverified
source:     runtime | codebase | repo-prose | tests | history | telemetry | deps | web | human
confidence: high | medium
provenance: {file:line, command + exit status, URL, or record ref}
checked-at: {sha}
```

### Key Files

- `skills/research/source-registry.md` — new: registry table, routing rules, dispatch procedure, verdict shape
- `skills/research/verify-mode.md` — modify: stub referencing the registry
- `tests/research/skill-md.test.js` — modify: registry structural assertions

## Gotchas

- Inline Template A verbatim in the dispatch prompt. A reference to `_shared/subagent-output-contract.md` does not reach the agent — agents only see what's in their prompt.
- Check the host file's size budget before inlining a large block, and extract to a sub-file the caller inlines *from* rather than planning to extract later (`[IL-72]`).
- `Related` to #117 ("Stamp health-sweep issues with the commit they were verified against") — the same sha-stamping mechanism applied to a different producer. If #117 lands a shared helper first, use it rather than duplicating (`[IL-32]`).
- The `deps` source's degradation is project-specific and real: `node_modules` reads are structurally denied here even after a grant attempt. Record it as a documented fallback with its reduced confidence tier, not as deferred work.
- Absence must be reported, not omitted — `history`/`telemetry` returning nothing is the finding "no precedent exists". A silently-absent result is indistinguishable from a failed lookup, and silence cannot be found by keyword search (`[IL-15]`).
- Do not give the dispatched agents git access. They are read-only by construction, which removes the shared-index race rather than narrowing it (`[IL-51]`).


<!-- work-fingerprint: research-verification-phase:research-verify-source-registry-parallel-dispatch-and-verdic -->
