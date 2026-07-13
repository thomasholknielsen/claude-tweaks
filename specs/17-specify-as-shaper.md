---
tier: 1
status: not-started
progress: 0
blocked-by: [14]
surface: backend
---

# 17: /specify as the shaper — records in, records out

## Overview

`/specify` stops writing spec files and becomes the **shaper** of work records. Input: a record reference (`#N` / local id) or a topic (polymorphic brainstorm entry unchanged). Output: the record itself enriched in place to spec shape — or, for a decomposed design, a **parent record** whose body is the design summary (problem, chosen approach, key decisions, why alternatives lost) plus **leaf sub-issues**, each spec-shaped and agent-sized, linked with native blocked-by dependencies. Leaves get `ready` (+ `risk:*`/`effort:*` when unstamped); parents never do. `parked` is removed on promotion. The brainstorm design-doc file is still consumed (deleted) after decomposition — its narrative moves into the parent body.

The red-team, self-review, sizing guidelines, `groupByFileOverlap` implicit-dependency detection, and granularity contract all survive — they now operate on record bodies instead of files.

**Complexity:** High
**Estimated tasks:** 8

## Non-Goals

- No materialization (build-time concern — spec 20).
- No grants: `/specify` never touches `auto:*` (permission matrix).
- No INDEX.md replacement dashboard (spec 21 owns queries; INDEX.md dies at migration, not here — this spec simply stops writing it).
- Local-files driver: same shaping, records are files via `local-store.js`; no sub-issue API — `parent:`/`blocked-by:` frontmatter instead.

## Current State

- `skills/specify/SKILL.md` — resolve-the-input cases 1–5 (issue ref fetch + `recon-*` extraction; path; topic; brainstorm dispatch; backlog ref); Steps 1–9 (landscape, decompose, write `specs/NN-*.md` per `spec-template.md`, INDEX update, red-team via `red-team.md`, self-review, delete design doc, delete backlog entry, summary+commit); Next Actions recommends `/flow {N}`.
- `skills/specify/spec-template.md` — 10-field frontmatter + body sections; "Frontmatter reference (canonical spec)".
- `skills/specify/design-pre-steps.md` — frontend detection + design-intent (kept; `surface`/`design-intent` become `Surface:`/`Design-intent:` body-metadata lines — see the committed representation in Deliverables).
- `bin/lib/issues/grouping.js` — reused as-is.

## Deliverables

- [ ] Rewrite input resolution: case 1 (record ref) fetches via `gh issue view` / `local-store.js` and enters **shaping mode** (no `recon-*` extraction — the record IS the target); topic cases unchanged through brainstorm, then enter **decomposition mode** against the produced design doc.
- [ ] Shaping mode (single record): edit the body into spec shape (Current State / Deliverables / Acceptance Criteria / Technical Approach / Gotchas), preserve the human's original text under an `## Original request` section, stamp `risk:*`/`effort:*` if absent, remove `parked` if present, add `ready`.
- [ ] Decomposition mode (design doc): create parent record (Type `feature`; body = design summary; never `ready`), then leaf records via `recordPayload` each with `work-fingerprint` (deterministic `{design-doc-slug}:{unit-slug}` for resume-by-query idempotency); each leaf's Type defaults to the parent's, overridden per leaf when the unit is clearly another kind (a defect-fix unit → `bug`); linking per the project's `work-links` key — `native`: sub-issue endpoints + blocked-by API; `body-text`: `Blocked by #N` body lines + a parent task-list (readers use `record.js`'s `parseDependencies`); stamp `ready` + scoring on each leaf; delete the design doc (Step 7 semantics, incl. `phase-N` marker behavior, unchanged).
- [ ] Sizing/decomposition heuristics, implicit-dependency detection (`groupByFileOverlap` over leaf key-files + open in-flight records), red-team (`red-team.md`, findings written into record bodies), and self-review all retargeted to record bodies.
- [ ] Facet metadata representation (**committed here, consumed by spec 20**): `Surface:` and `Design-intent:` are body-metadata lines in a short metadata block at the top of every leaf body — never labels. Spec 20's materialization lifts exactly these lines into the materialized header; this is the single wire format for both drivers.
- [ ] Rewrite `spec-template.md` as the **record body template**: body sections unchanged; frontmatter section replaced by a "facets" reference (Type + labels + parent/dependencies) pointing at `_shared/work-record.md`; keep the "No Placeholders" section.
- [ ] Local-files branch for every step above (frontmatter facets instead of labels/sub-issues; `allocateId`).
- [ ] Write-path resilience (github driver): a `gh issue create`/`edit` failure mid-decomposition writes the affected leaf as a `local-store.js` record with `unsynced: true` (fingerprint preserved) and continues — `/tidy`'s Sync finding reconciles later; the fingerprint keeps an eventual re-run from duplicating the synced leaf.
- [ ] Update Next Actions (`/flow #N…`), Anti-Patterns, Relationship table, and the Granularity Contract section (two tiers: design doc → ready leaf records).
- [ ] Retire Step 8 (backlog-entry deletion) — nothing to delete; a captured record was shaped in place.

## Acceptance Criteria

1. `grep -n "recon-issue\|recon-fingerprint\|recon-was-parked\|code-health-effort" skills/specify/SKILL.md` returns 0 matches.
2. `grep -n "specs/NN\|specs/{N}\|INDEX.md" skills/specify/SKILL.md` returns 0 matches outside a single legacy/migration note.
3. The SKILL.md documents both modes with the parent/leaf rules stated literally: parent body = design summary; only leaves get `ready`; tasks never become records (checklist inside bodies).
4. Decomposition idempotency documented: leaf creation queries `work-fingerprint` before create; a partial prior run resumes without duplicates.
5. `spec-template.md` contains no YAML frontmatter block for specs; its facet reference points at `_shared/work-record.md`.
6. Shaping mode preserves the original request text verbatim under `## Original request` (stated as a rule with the section name literal).
7. The permission boundary is restated: `/specify` adds `ready`/scoring, removes `parked`, never touches `auto:*`/`bot:*`.

## Technical Approach

Body edits via `gh issue edit {n} --body-file` (compose locally, write once per step — never incremental API edits mid-composition). Linking branches on `work-links` (probed once by `/init`, spec 22 — never re-probed mid-flow). Fingerprint resume queries use `gh issue list --state all --json number,body --limit 200` plus a local marker grep — the REST list endpoint, deliberately not the eventually-consistent search index — and re-check immediately before each individual create, so a crash-and-resume can't double-create a leaf that landed milliseconds before the crash.

## Gotchas

- **65KB body cap** — a leaf exceeding ~50KB is a decomposition smell; split it (mirrors the historical 16–20KB spec norm).
- Design-doc deletion must remain conditional on full decomposition (`phase-N` partial keeps the doc + markers — table already in SKILL.md; preserve it).
- Red-team agents receive record numbers + `gh` read instructions, not file paths (subagent input discipline).
- The `/flow` hand-off contract changes shape in spec 20 — Next Actions here must emit `#N` references; coordinate wording with spec 20's input parsing.
- Issue body edit history is the only versioning — compose-then-write-once keeps it readable.

## Key Files

- `skills/specify/SKILL.md`, `skills/specify/spec-template.md`, `skills/specify/red-team.md`, `skills/specify/design-pre-steps.md`
- `bin/lib/issues/record.js`, `bin/lib/issues/local-store.js`, `bin/lib/issues/grouping.js` (consumers, unchanged)
