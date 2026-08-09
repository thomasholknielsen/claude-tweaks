---
record: 233
origin: capture
risk: medium
effort: medium
ceremony: standard
grants: []
surface: backend
---
# 233: Shrink CLAUDE.md to ~22 KB and add it to the context-cost ceiling test

Surface: backend

## Current State

CLAUDE.md is 68,492 B and is inherited by every dispatched subagent, not just loaded once per session — at the measured 72–144 agents per `/dispatch` run that is 1.2–2.5M tokens of pure CLAUDE.md per run, a 14:1 inherited-to-instruction ratio. Composition: `## Don'ts` 35,462 B (51.8%, ~90 rules averaging 394 B/rule against the ~150 B rule+clause shape `skills/init/claude-md-template.md:109` prescribes), `## Conventions` 23,492 B (34.3%), the rest ~9.5 KB. ADR-0010 split rules from evidence and landed Don'ts at ~20 KB; the section has since regrown 77% past that accepted landing point. `bin/lib/skill-audit/context-cost.js` enforces a 40 KB ceiling on every `skills/**/*.md` file, but CLAUDE.md itself is out of the test's scope — the file sits 71% over the ceiling it imposes on everything else, with nothing watching. No harness mechanism trims CLAUDE.md for subagents (confirmed: no such hook path exists), so file size is the only lever.

## Deliverables

- Evict the Releasing section to release-time documentation (coordinates with #234, which shrinks it to an invocation plus judgment calls; the eviction target and the automation land together).
- Evict the skill-authoring Conventions (SKILL.md structure, frontmatter conventions, interaction directive, parallel-execution forms, CSC template) to a `docs/skill-authoring.md` loaded when authoring skills — dispatched implementer/reviewer/QA agents never need them.
- Recompress `## Don'ts` to the rule+clause shape: one sentence of rule, one clause of why, `[IL-nn]` tag; the narrative stays in `docs/incident-log.md` where it already lives.
- Add CLAUDE.md to the context-cost ceiling test (`bin/lib/skill-audit/tests/context-cost.test.js` or a sibling) with its own budget (~22 KB target, hard ceiling decided at build) so regrowth fails the suite instead of waiting for the next audit.

## Acceptance Criteria

- CLAUDE.md is at or under the agreed budget, and a test fails when a future edit pushes it over.
- Every evicted convention and rule remains reachable: skill-authoring content lands in one named doc that CLAUDE.md points to; the Releasing content lands where #234's tooling documents it; no rule or convention is deleted outright without an explicit decision.
- Each recompressed Don'ts bullet still names its `[IL-nn]` tag where one existed, and `docs/incident-log.md` is untouched (it is never auto-loaded).
- `npm test` green, including the existing CLAUDE.md-conformance and policy-schema tests that parse sections out of the file (`bin/lib/init/claude-md-conformance.js`, `bin/lib/policy-schema.js` — verify their anchors survive the restructure).
- A dispatched-agent spot check: the sections that remain are the ones an implementer/reviewer subagent actually needs (git discipline, dispatch rules, structural conventions of the code itself).

## Technical Approach

Editorial pass in three commits: (1) evictions with pointer stubs left in place, (2) Don'ts recompression against the incident log as the authority for what each rule may not lose, (3) the ceiling test. Diff review per rule, not per section — the hazard is a clause silently dropped from a rule whose incident can recur. Sequence inside the same worktree as #234 so the Releasing section is only rewritten once.

## Gotchas

- Several tests and modules parse CLAUDE.md's literal structure: `tests/policy-schema.test.js` pairs policy keys to prose, `bin/lib/init/claude-md-conformance.js` byte-compares a section, and two test files hold copies of the interaction-directive literal. Grep for consumers of every section heading before moving it.
- The Don'ts list is cited by `[IL-nn]` from `docs/incident-log.md` and from work-record bodies; recompression must not renumber or drop tags.
- The 394 B/rule average includes a few deliberately long entries whose nuance is the rule (e.g. the shipped-vs-never-shipped renumber split) — compress per-rule with judgment, not mechanically to a byte target.
- CLAUDE.md prose is itself an agent-instruction file: this record's own diff will (correctly) route to a human at any auto-merge gate.
- Eviction reduces what *dispatched agents* inherit only if the evicted content isn't re-imported by something else they load; verify the new homes aren't on any always-read path.

## Original request

Shrink CLAUDE.md to ~22 KB and add it to the context-cost ceiling test

**Related:** none

Context: Session audit 2026-08-08: CLAUDE.md is 68,492 B and inherited by every dispatched agent (72-144 per /dispatch run => 1.2-2.5M tokens/run); Don'ts average 394 B/rule vs the ~150 B shape init/claude-md-template.md prescribes; ADR-0010's landing point regrew 77%.

Scope: Evict the Releasing section and skill-authoring Conventions to on-demand docs (skills/version/, docs/skill-authoring.md); recompress Don'ts to rule+clause; add CLAUDE.md to bin/lib/skill-audit/context-cost.js's ceiling test so regrowth fails the suite.
