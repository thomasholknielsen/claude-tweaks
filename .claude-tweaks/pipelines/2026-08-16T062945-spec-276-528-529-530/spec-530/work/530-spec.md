---
record: 530
origin: human
risk: low
size: low
ceremony: fast-lane
grants: []
fingerprint: 2026-08-16-routine-prompt-indirection-design:routine-indirection-docs-skill-graph-edges-help-plugin-struc
blocked-by: [276, 529]
surface: backend
---
# 530: Routine indirection docs — skill-graph edges, help, plugin-structure, negative sweep

Surface: backend

## Overview

Close the documentation and cross-reference surfaces for the routine-prompt-indirection change: skill-graph edges for the new `routine-kickoff` skill, /help's skill listing and diagrams, `docs/plugin-structure.md`'s directory table, the rewrite of `skills/routine/SKILL.md`'s now-obsolete anti-pattern rows, and a repo-wide negative sweep for retired vocabulary. This runs last so every surface documents the final, merged state — and it verifies that state rather than trusting this record's own description of it.

**Complexity:** Low
**Estimated tasks:** 5

## Non-Goals

- No behavior changes to any skill, template, or test — documentation surfaces only.
- No README artifact-lifecycle diagram change (routines are not part of the artifact lifecycle diagram; verify via the sweep rather than assuming, and touch it only if the sweep proves it references the preamble).

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #528 | routine-kickoff wrapper skill | must be merged to the integration branch before starting |
| #529 | Routine template kernel migration | must be merged to the integration branch before starting |

**Step 0 (hard pre-check):** confirm both prerequisites are closed AND their changes are present on the integration branch (`skills/routine-kickoff/SKILL.md` exists; no `prompt:` field in any `skills/*/routine-template.yml`). If either check fails, stop and report — do not document a state that hasn't shipped. (Native blocked-by links exist on this record; this body-text restatement is for the executor, who can't see native links in the body.)

## Current State

Everything below is the expected state — **verify each claim against the merged tree at execution time; where they disagree, the tree wins:**

- `docs/skill-graph.md` — `## routine` section lists per-consumer edges; every relationship is stated once, here only (CLAUDE.md Cross-references rule).
- /help's skill listing: `skills/help/reference-card.md` (workflow diagrams must list all skills — CLAUDE.md rule).
- `docs/plugin-structure.md` — full directory tree + per-skill sub-file table.
- `skills/routine/SKILL.md` — anti-patterns table includes the "preamble edit fanned out to all six templates with zero bumps" row (stale twice over: mechanism removed by #529, and the template count is wrong — count `skills/*/routine-template.yml` at execution time rather than trusting any number written here).
- CLAUDE.md `## Cloud parity` cites "the routine prompt preamble's self-heal fallback (#260)" — after #529 the self-heal lives in the *kernel*; update the phrase, keep the `[IL-117]` citation intact.

## Deliverables

- [ ] `docs/skill-graph.md`: a `## routine-kickoff` section. Before writing any edge, read the merged `skills/routine-kickoff/SKILL.md` and `_shared/routine-template-schema.md` and derive the edges from what they actually say (expected: invoked by every routine kernel as assembled by `/routine`; invokes each routine-backed skill's kickoff; runs `bin/hooks.js reconcile` — but the merged text is authoritative). Update the `## routine` section's existing edges where they name the preamble.
- [ ] /help (`skills/help/reference-card.md` and any workflow diagram enumerating skills): add `routine-kickoff`, marked machine-invoked.
- [ ] `docs/plugin-structure.md`: add the `skills/routine-kickoff/` row and `tests/routine-kickoff.test.js`.
- [ ] `skills/routine/SKILL.md`: rewrite the zero-bumps anti-pattern row to the surviving hazard (kernel edit without a `kernel_version` bump; template-field edit without a `template_version` bump — both review-discipline, per #529's schema prose), and fix any preamble-era phrasing elsewhere in the file.
- [ ] Negative sweep. Token list: seed with "standard prompt preamble", "prompt preamble", `template.prompt`, and "prompt` field" (template context), then **derive the rest from the merged create-and-update.md/fleet.md at execution time** — e.g. whether `RESOLVED_PROMPT` was renamed or survives as the assembly variable decides whether it is a retired token at all; if the merged files can't be located or their vocabulary is ambiguous, stop and report rather than sweeping a guessed list. Sweep with `find . -type f \( -name "*.md" -o -name "*.js" -o -name "*.yml" \) | xargs grep` from the repo root (NOT bare recursive grep — .gitignore masking), explicitly excluding: `.git/`, `node_modules/`, `.claude-tweaks/pipelines/` (archived run dirs are historical records), `docs/incident-log.md` and `docs/donts.md` historical citations (exempt by path/purpose, never reworded). This covers `hooks/`, `evals/`, `tools/`, and `scripts/` by construction rather than by enumeration. One positive control per token before trusting any zero.

## Acceptance Criteria

1. `docs/skill-graph.md` has a `routine-kickoff` section whose edges were verified against the merged implementation, and no edge referring to the removed preamble mechanism; each edge stated once (no reciprocal restatement inside any SKILL.md).
2. /help's listing includes `routine-kickoff`; `npm test` green.
3. Sweep evidence posted to this sub-issue via `gh issue comment`: per token, the exact command, hit count before, hit count after (0, or each survivor justified by the stated path exemptions).
4. `skills/routine/SKILL.md` anti-patterns table names `kernel_version` in the rewritten row.
5. Step 0's pre-check output (both prerequisite confirmations) included in the same closing comment.

## Technical Approach

Docs-only pass; the one judgment call is edge wording in skill-graph (relationships stated once — do not add a routine-kickoff mention into each health skill's own section; the `routine-kickoff` section owns the edge).

### Key Files

- `docs/skill-graph.md` — new section + edge updates
- `skills/help/reference-card.md` — listing/diagram
- `docs/plugin-structure.md` — directory table rows
- `skills/routine/SKILL.md` — anti-pattern rewrite
- `CLAUDE.md` — Cloud parity phrase update (keep it one line; rule + why)

## Gotchas

- Sweep derivation: grep every retired token, not the headline word — leaf-only files get silently missed. If any tombstone text is left behind, state its marker scope explicitly (a same-line `grep -v` filter fails on adjacent-line tombstones).
- Recursive grep honors `.gitignore` — use `find`+`xargs grep` and pair every zero with a positive control.
- CLAUDE.md edits stay short (rule + brief why) — don't restate mechanism.

## Decision Rationale

See parent #524.


<!-- work-fingerprint: 2026-08-16-routine-prompt-indirection-design:routine-indirection-docs-skill-graph-edges-help-plugin-struc -->
