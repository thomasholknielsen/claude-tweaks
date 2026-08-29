# Framing-check structural isolation — decision: keep inline, encode why

**Date:** 2026-08-29
**Origin record:** #1276 (carries `needs:definition`; routed through brainstorming per `/claude-tweaks:specify`'s redirect)
**Status:** approved in brainstorming session 2026-08-29

## Problem

#1276 asked whether dispatching `framing-check`'s untrusted-content judgment as a Task-agent
call (instead of inline via the `Skill` tool) would provide a meaningfully stronger structural
boundary against prompt injection than the delimiter convention #1041 built — worth the extra
dispatch cost `challenge/SKILL.md`'s inline-invocation rationale was written to avoid.

Since #1276 was filed, the landscape moved: #1275 extracted the delimiters into the two-sided
contract `plugin/skills/_shared/untrusted-record-content.md`, now cited by eight consumer files
across three judging modes (`framing-check`, `ceremony-check` via #1274, `grant-check` via
#1391). The contract's Scope carves Task-agent dispatches out with "they get a fresh context
(`_shared/subagent-output-contract.md`)" — phrasing that reads as if Task dispatch were the
stronger alternative being reserved, which is exactly the re-litigation surface this design
closes.

## Decision

**No structural isolation. Keep `framing-check` inline at all three call sites, and encode the
security rationale durably** so the question is answered in the prose a future auditor reads,
not just in a closed issue.

## Rationale

Evaluated for `framing-check` specifically, per #1276's own scope. Three threat lenses, none of
which a Task-agent boundary improves:

1. **Injection reaching the orchestrator's tools — no gain.** The caller (`/specify`) fetches,
   shapes, and rewrites the record body on every path; the untrusted content is in the
   orchestrator's full-tool-access context regardless of where the *judgment* runs. A Task
   dispatch isolates a copy while the original stays put.
2. **Manipulating the verdict itself — no gain.** The subagent is the same model reading the
   same wrapped content; a fresh context does not make the judgment more persuasion-resistant.
3. **Verdict-channel confusion — marginal at best.** Parsing `^FRAMING: …$` from a subagent's
   report is structurally cleaner than from a shared inline context, but since the body sits in
   the parent's context from its own fetch, "read the verdict only from the callee's rendered
   output" remains a prose discipline either way — the discipline the contract already states.

Against ~zero security gain, the cost is real: `framing-check` runs per record, every run, at
three call sites (`specify/next-mode-shape.md`, `specify/shaping-mode-stamping.md`,
`specify/record-creation-subissues.md`) — a batch or decomposition loop would pay one Task
dispatch per record, plus re-plumbing inline-gathered context (the `## Gotchas` evidence
weighting) into every dispatch prompt.

**Blast radius bounds the residual risk.** A fully hijacked `framing-check` verdict can only
flip `open`/`solution-baked` → the `solution:unjustified` label, which is explicitly non-gating
(#471): records build identically with it on. The one sibling whose verdict carries real
authority is `grant-check` (headless `auto:build`/`auto:merge` grants), and lenses 1–2 apply
there unchanged — the added Scope prose covers it by inheritance; any deeper look there is a
new capture, not this record.

## Deliverables (one work unit)

1. **`plugin/skills/challenge/SKILL.md`** — extend the framing-check mode's inline-invocation
   sentence ("Invoked inline via the `Skill` tool… a subagent would only pay to re-derive it.")
   with the security half of the decision: structural (Task-agent) isolation evaluated and
   declined (#1276) because (a) the caller holds the untrusted body on every path regardless,
   (b) a fresh context is no more persuasion-resistant — same model, same wrapped content, and
   (c) the verdict's blast radius is a non-gating label (#471). Name
   `_shared/untrusted-record-content.md`'s wrap + verdict-source rule as the operative defense.
   Extend the matching Anti-Patterns row ("Dispatching `framing-check` as a Task agent") with
   the one-line version: it isolates nothing — the body is in the caller's context regardless
   (#1276).
2. **`plugin/skills/_shared/untrusted-record-content.md`** — in Scope, after the existing
   "Task-agent dispatches are out of scope" sentence, add one to two sentences: a fresh
   subagent context is not a stronger boundary for these inline judgments — the caller holds
   the fetched content in its own context regardless, and the same model judges the same
   wrapped content there — evaluated and declined for `framing-check` in #1276; the wrap and
   verdict-source rules above are the operative defense for every consumer. Byte budget:
   file is 4,969 B against its 6,144 B pinned cap — the addition must keep it under the cap
   (`tests/untrusted-record-content-conformance.test.js`'s size assertion).
3. **Tests** — pin the new prose per the `skill-prose-conformance-tests` skill's conventions:
   the contract's Scope addition in `tests/untrusted-record-content-conformance.test.js`; the
   `challenge/SKILL.md` sentence in the suite already pinning that file's framing-check wording
   (`tests/specify-next-mode.test.js`). Whitespace-collapsed assertions with controls; go-red
   proven via `git show "${BASE}:${FILE}"` against the merge base, never by reverting the tree.

## Non-Goals

- Any invocation-shape change, at any of the three `framing-check` call sites or any other
  consumer of the contract.
- A broader prompt-injection audit across other untrusted-content call sites (#1276's own
  scoping — separate, larger work).
- Special-casing `grant-check` — covered by inheritance via Deliverable 2; a deeper
  grant-check-specific evaluation would be a new capture.
- Touching `_shared/subagent-output-contract.md` — Task-dispatch content boundaries remain its
  territory.

## Testing

`node --test tests/untrusted-record-content-conformance.test.js tests/specify-next-mode.test.js`
plus full `npm test` (prose conformance suites pin repo-wide).
