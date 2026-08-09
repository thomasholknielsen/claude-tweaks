---
record: 261
origin: human
risk: low
effort: low
ceremony: standard
grants: []
fingerprint: routine-plugin-delivery:prose
blocked-by: [259, 260]
surface: infra
---
# 261: Cloud-parity prose corrections: the Setup script field does not cover Routines

Surface: infra

## Overview

Sweep the prose that claims pasting the Setup script into a cloud environment covers scheduled Routines — measured false 2026-08-09, and reproduced: three separate containers that morning (the 07:08 scheduled firing, a 07:57 re-fire, a 09:46 manual run) all started with the field populated and zero plugin effects — and record the incident durably: a new `docs/incident-log.md` entry plus one compressed Don't in `CLAUDE.md`. The field remains required for interactive cloud sessions (where it is confirmed working, per [IL-113]); what changes is the claim that it alone guarantees Routine firings.

The canonical corrected sentence (adapt per site, keep the three factual clauses): *"The Setup script field is confirmed effective for interactive cloud sessions; it was measured not reaching scheduled Routine sandboxes (2026-08-09, reproduced across three fresh containers, scope of affected sandbox types unknown — treat further incidents as appends, not replacements); the routine preamble's self-heal-to-execution fallback (#260) — not this field — is what guarantees a routine firing executes its skill."*

**Complexity:** Low
**Estimated tasks:** 4

## Non-Goals

- No mechanism changes (#259 and #260 own those).
- No removal of the Setup-script paste instruction itself — it stays required for interactive sessions.
- No invocation-string swaps (#259 owns every site where the field line's text is stated).

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #259 | Canonical cloud-setup Setup-script line | open — blocks this leaf; both edit the same step-14 file, and this leaf's limitation sentence attaches around whatever wording #259 lands |
| #260 | Routine preamble: self-heal to an executed skill | open — blocks this leaf; the corrected sentence asserts #260's mechanism as the guarantee, which must exist before prose claims it |

## Current State

- `skills/init/bootstrap/step-14-cloud-routine-parity.md` — the "declare **and** paste the Setup script" paragraph presents the paste as the complete fix, citing the interactive-session measurement behind [IL-113]; the `## Cloud parity` CLAUDE.md-section template it generates says the same ("the Setup script below is what actually installs it").
- `CLAUDE.md` — this repo's own Cloud parity section carries the claim in its **intro paragraph** ("the Setup script below is what actually installs it") *and* colors the bullets beneath; both the paragraph and the Setup-script bullet are in scope.
- `docs/incident-log.md` — IL numbers allocated per the Don'ts convention (entry first, then the compressed rule; next free number claimed at ship time, re-checked against `origin/main` immediately before push).
- No test pins step-14's embedded templates or CLAUDE.md's Cloud-parity text (verified by repo-wide search at decomposition time) — these are prose-only edits with no sync-surface suite to update.

## Deliverables

- [ ] Step 14's Setup-script paragraph gains the canonical corrected sentence (adapted).
- [ ] The generated `## Cloud parity` section template in step 14 carries the same correction, compactly.
- [ ] This repo's own `CLAUDE.md` Cloud parity **paragraph and Setup-script bullet** carry the same correction.
- [ ] New incident-log entry recording the measurement chain **and the two-cause structure explicitly**: (cause 1, delivery) the field's effects were absent from three fresh Routine containers on 2026-08-09 while the field was populated — root failure, addressed by #259's evidence-leaving line; (cause 2, invocability) the Skill catalog freezes at session start, so even a successful mid-run install cannot make the skill invocable — independent barrier, addressed by #260's manual-execution fallback. Each cause is independently sufficient to make a firing a no-op; the "guarantee" in the corrected sentence rests on #260 closing cause 2 regardless of cause 1's state.
- [ ] One Don't in `CLAUDE.md` compressed from the entry (rule + one why-clause + IL tag, per the Don'ts convention).

## Acceptance Criteria

1. Reading the full Cloud-parity sections in both files (step-14's template and this repo's CLAUDE.md) plus step-14's Setup-script paragraph finds no remaining **unqualified** claim that the Setup script makes Routine sandboxes work — the corrected text states the measured scope (interactive: works; Routine: measured not reaching, scope unknown) rather than a universal negative. Read the sections whole; do not keyword-grep (a reworded restatement survives any single grep — IL-17/IL-93).
2. The incident-log entry names the concrete evidence (date, three containers, populated field, empty caches, working in-session run) and states the two causes and which leaf closes which.
3. The new Don't fits the established shape: one rule, one why clause, `[IL-nn]` tag; the entry exists before the rule is written.

## Technical Approach

Correction, not deletion: each site keeps its paste instruction and gains the limitation sentence. The incident-log entry is written first, the Don't compressed from it after — the convention exists because writing the rule first pads it. The canonical sentence above is the single wording source (the design doc that drafted it is deleted at decomposition close); adapt tone per site but keep all three factual clauses.

### Key Files

- `skills/init/bootstrap/step-14-cloud-routine-parity.md` — Setup-script paragraph + generated CLAUDE.md-section template
- `CLAUDE.md` — Cloud parity paragraph + Setup-script bullet + one new Don't
- `docs/incident-log.md` — new entry

## Gotchas

- IL-93: the claim being retired was true when written and recurs reworded — read the whole Cloud parity sections in both files rather than trusting a keyword sweep (IL-17). No automated check exists for this class; AC 1's read-the-sections-whole instruction is the compensating control.
- Allocate the IL number at ship time and re-check it against `origin/main` immediately before push; renumber yours if taken (Don'ts convention).
- Keep the Don't short — CLAUDE.md is paid for per dispatched agent (conciseness convention).
- Blocked by #259 (same step-14 file — build sequentially; the limitation sentence must attach around #259's landed wording) and by #260 (the corrected sentence asserts its mechanism as the guarantee — do not ship prose promising a fallback that is not yet in the templates).

<!-- work-fingerprint: routine-plugin-delivery:prose -->

