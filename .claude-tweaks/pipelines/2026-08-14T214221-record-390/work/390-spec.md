---
record: 390
origin: capture
risk: low
size: medium
ceremony: fast-lane
grants: [build, merge]
surface: backend
---
# 390: Prune docs/superpowers archive — second ADR-0007 application

Surface: backend

## Current State

`docs/superpowers/plans/` (73 files) + `docs/superpowers/specs/` (41 files) total ~59.5k lines / 3.7MB — 93% of `docs/` by line count. The 2026-08-14 bloat audit found 101 of 114 files have zero inbound references from anywhere in the repo; only 8 are cited from runtime surfaces (skills or `bin/`). ADR-0007 (accepted 2026-07-26) authorizes periodic bulk pruning with git history as the durable record; one prior prune (93→73 plans, 64→41 specs) already ran but left two dangling references in shipped code. `skills/wrap-up/cleanup-procedures.md:11` still calls the archive "permanent", contradicting the ADR.

## Deliverables

- `git rm` every `docs/superpowers/{plans,specs}/` file except: the 8 runtime-cited files (specs: `2026-07-20-lifecycle-ceremony-tiering-design.md`, `2026-08-03-mechanical-vs-substantive-merge-judgment-design.md`, `2026-07-30-durable-state-git-native-write-design.md`, `2026-08-03-visualize-record-graph-design.md`; plans: `2026-08-02-dispatch-mcp-bridge.md`, `2026-08-07-supervised-trust-table.md`, `2026-08-02-actor-scope-guard.md`) plus anything last-touched within ~1 week or backing an active/interrupted pipeline run (ADR-0007's exclusions).
- Delete `docs/superpowers/plans/2026-07-20-fix-review-findings-data.json` (155KB machine dump; its only reference is a never-opened path string in `bin/lib/docs-health/tests/scope.test.js` — update that fixture string).
- Fix the two dangling refs left by the prior prune: `bin/lib/routine-template-parser.js:76` (cites deleted `2026-07-05-routine-improvements.md`) and `bin/lib/skill-audit/tests/fixtures/review-SKILL-pre-2b.md:175` (cites deleted `2026-07-15-cross-spec-promise-tracking-design.md`). The fixture is a frozen historical snapshot — the right fix may be "leave frozen, note why"; decide at build time.
- Correct `skills/wrap-up/cleanup-procedures.md:11`'s "permanent historical archive" claim to match ADR-0007's retention policy.

## Acceptance Criteria

- After the prune, a repo-wide grep for `docs/superpowers/` across `skills/ bin/ tests/ docs/*.md agents/ README.md CLAUDE.md` yields no reference to a deleted file — the ADR-mandated cross-check, run with visible output, not asserted.
- Every keep-list file still exists and its inbound references resolve.
- `npm test` passes (the `scope.test.js` fixture path updated or confirmed inert).
- `cleanup-procedures.md` no longer claims permanence; its retention language cites ADR-0007.

## Technical Approach

Derive the delete list mechanically: all files under `docs/superpowers/{plans,specs}/`, minus the keep-list, minus `git log --since="1 week ago"` survivors, minus anything referenced from a non-terminal run under `.claude-tweaks/pipelines/`. Match the full `docs/superpowers/` prefix only — `docs/plans/` is a distinct live directory (documented trap, `skills/docs-health/SKILL.md:259`). Single commit; git history is the archive.

## Gotchas

- The previous prune broke two references despite the ADR mandating a grep — compose the delete list, run the cross-check, and only then `git rm`.
- `CHANGELOG.md` and `docs/skill-graph.md` cite pruned files historically; the audit judged those mentions non-load-bearing, but include them in the grep scope and judge each hit rather than pre-filtering.
- Never touch `docs/decisions/` — ADR-0007 explicitly excludes ADRs.

## Original request

Prune docs/superpowers archive — second ADR-0007 application

**Related:** #363

Context: Bloat audit (2026-08-14): 101 of 114 archive files have zero inbound references (~57k lines / 3.4MB); ADR-0007 authorizes periodic bulk prune and one prior prune already ran.

Scope: git rm all but ~8 runtime-cited + last-week files; run the ADR-mandated pre-delete grep; fix the 2 already-dangling refs (bin/lib/routine-template-parser.js:76, skill-audit test fixture) and wrap-up/cleanup-procedures.md:11's stale "permanent archive" claim.
