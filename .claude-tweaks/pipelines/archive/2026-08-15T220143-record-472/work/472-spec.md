---
record: 472
origin: human
risk: medium
size: medium
ceremony: standard
grants: [build]
fingerprint: needs-definition-label-design:wu1-label-producers
surface: backend
---
# 472: needs:definition — label, taxonomy, and producers

Surface: backend

## Overview

Introduce `needs:definition` as a new, closed-taxonomy label: a presence-only flag `/capture` and `/feedback` stamp at filing time when a record names a genuine open choice with no tradeoff made yet, rather than a single clear ask. This sub-issue lands the label's taxonomy entry, its bootstrap pair, both producer skills' judgment-and-filing mechanics, and the facet parser both producers and every later sub-issue in this decomposition depend on.

**Complexity:** Medium
**Estimated tasks:** 5

## Non-Goals

- No gate, no consumer wiring (`grant-check`, `grant-gate.js`, `/specify` redirect, `/help` visibility) — that's the companion sub-issue covering `needs:definition`'s hard gate, `/specify` redirect, and `/help` visibility.
- No structural heuristic (length/keyword-based trigger) — the judgment is a content call made in the same LLM turn that files the record, not a mechanical check.
- No backstop judgment inside `/specify` for records that never carried the flag (human-filed-directly records are exempt by convention).

## Prerequisites

None — this is the foundational sub-issue in this decomposition; the hard-gate/redirect sub-issue, the `solution:unjustified` rename sub-issue, and the `/backlog attention` sub-issue all depend on it (native sub-issue dependency links, wired after all records in this decomposition exist).

## Current State

- `skills/_shared/work-record.md` — the canonical label taxonomy contract. Its Label taxonomy table currently has no `Definition` row; its permission matrix has a `/capture` row (Adds: `by:capture`, Type only) and no `/feedback` row at all.
- `skills/_shared/label-bootstrap.md` — canonical `LABELS_JSON`; no `needs:definition` entry.
- `skills/capture/SKILL.md` — `## Guessing the Type` (around line 205) already implements the exact UX pattern this reuses: guess by default, ride the existing "Added: '{title}' (Type: {t})" presentation line, overridable via free text in interactive mode, overridable via an explicit flag (`--type=`) in auto/headless mode. `## Input` table (line 26) lists `--type=` as a sibling flag to extend. Backend Selection's `github-issues` branch (`gh issue create` calls around line 140) and `local-files` branch (`createRecord` call around line 163) both build the label/facets set to apply. The trusted+-ceiling born-ready exception (lines 53-113) resolves `bornReady` via a `gh issue list` + git-log node script and must never co-fire with an undecided judgment.
- `skills/feedback/SKILL.md` — Step 1 (Gather, line 79) and Step 5 (Draft, line 141) are where content judgments happen. Step 7 (`## Step 7: Confirm — HARD GATE`, line 206) already renders the full scrubbed draft and requires human confirmation before anything files — this is the existing gate the Definition line rides on. Step 8 (`## Step 8: File`, line 241) currently omits `--label` for anything outside `bug`/`enhancement`, with an explicit rule against applying "the repository's own internal automation taxonomy."
- `bin/lib/issues/record.js` — `parseRecordFacets` already parses `facets.framing` as a presence-only boolean from the `framing:baked` label; `needs:definition` needs the identical treatment for a new `facets.needsDefinition` key.

## Deliverables

- [ ] `_shared/work-record.md`: new `Definition (1)` row in the Label taxonomy table (alongside `Framing (1)`, not a new formal axis); new `/feedback` row in the permission matrix (Adds: `needs:definition` + `bug`/`enhancement` only when `gh label list` confirms it exists; Never: every other internal-taxonomy label); `/capture` row's Adds column gets `needs:definition` appended.
- [ ] `_shared/label-bootstrap.md`: new `["needs:definition", "Undecided idea — must go through /specify's brainstorm redirect before reaching ready"]` entry in canonical `LABELS_JSON`; bump `LABEL_BOOTSTRAP_VERSION`.
- [ ] `bin/lib/issues/record.js`: `parseRecordFacets` returns `facets.needsDefinition: true` when the label is present, `false`/absent otherwise — identical shape to the existing `facets.framing` parsing.
- [ ] `capture/SKILL.md`: presentation line extended to `"Added: '{title}' (Type: {t}, Definition: {needed|clear})"` with an inline rationale clause when `needed`; `--needs-definition`/`--no-needs-definition` flags added to `## Input` and `argument-hint`; conditional `--label needs:definition` on the `github-issues` filing call, parallel `facets.needsDefinition: true` on the `local-files` `createRecord` call; the trusted+-ceiling born-ready block skips entirely (before its `gh issue list`/git-log round-trip) whenever this filing carries `needs:definition`.
- [ ] `feedback/SKILL.md`: one new line in Step 7's rendered draft, `**Definition:** Needed | Clear — {one-line rationale}`; Step 8 gets one more conditional `--label needs:definition`, documented as the single named exception to the "never apply the internal automation taxonomy" rule.

## Acceptance Criteria

1. `gh label list --search needs:definition` returns the label with the exact description string above, created via the standard bootstrap check-then-create loop (no duplicate `gh label create` on a repo that already has it).
2. `parseRecordFacets(['needs:definition'])` returns an object with `needsDefinition: true`; `parseRecordFacets(['by:capture'])` returns `needsDefinition: false` (or the key absent — match `facets.framing`'s existing absent/false convention exactly, whichever `record.js` already uses for that field).
3. Filing a `/capture` record whose free-text idea names two or more viable directions with no stated tradeoff, in interactive mode with no `--needs-definition`/`--no-needs-definition` override, produces a GitHub issue carrying the `needs:definition` label under `work-backend: github-issues`.
4. Filing the same idea with `--no-needs-definition` passed explicitly produces an issue with no `needs:definition` label, regardless of the judgment call's own default.
5. Filing a `/capture` idea under `autonomy: trusted`+ with a `clean` `producer:capture` trust verdict, where the same-turn judgment reads `needed`, produces an issue carrying `needs:definition` and **not** `ready` — the born-ready block must not fire.
6. `/feedback`'s Step 7 draft, for a learning judged `needs:definition: needed`, renders the `**Definition:**` line before the confirm question; declining that turn's confirmation files nothing (existing Step 7 behavior, unaffected).
7. `/feedback` Step 8 files with `--label needs:definition` when the judgment says `needed`, and applies no other internal-taxonomy label beyond the existing `bug`/`enhancement` confirmed-present check.

## Technical Approach

### Key Files

- `skills/_shared/work-record.md` — Label taxonomy table, permission matrix (`/capture` row edit, new `/feedback` row).
- `skills/_shared/label-bootstrap.md` — `LABELS_JSON`, `LABEL_BOOTSTRAP_VERSION`.
- `bin/lib/issues/record.js` — `parseRecordFacets`.
- `bin/lib/issues/tests/record.test.js` (or the nearest existing facet-parsing test file — read the directory listing before assuming a filename) — new test case for `facets.needsDefinition`.
- `skills/capture/SKILL.md` — `## Input`, `## Guessing the Type` (rename/extend to cover Definition), `## Backend Selection`, the trusted+-ceiling exception block.
- `skills/feedback/SKILL.md` — `## Step 7: Confirm — HARD GATE`, `## Step 8: File`.

## Gotchas

- The judgment is a content call, not a heuristic — resist the temptation to add a line-count or keyword check "just to be safe." That exact shortcut was proposed and explicitly rejected during this design's brainstorming: a structural heuristic both over- and under-fires, and the two-line rationale requirement (surfaced + overridable) only makes sense as an LLM judgment with a stated reason, not a boolean from string matching.
- `capture/SKILL.md`'s born-ready exception (lines 53-113) spends a `gh issue list` + git-log round-trip to resolve `bornReady` — short-circuit that entire block, don't just suppress its output, whenever this filing already carries `needs:definition`. Spending the round-trip on a record that structurally cannot be born-ready is wasted work, not just a display bug.
- `feedback/SKILL.md`'s Step 8 rule against internal-taxonomy labels ("never apply the repository's own internal automation taxonomy (`by:*`, `type:*`, `risk:*`, `ready`, `size:*`)") stays true for every label except this one, deliberately — word the edit as a named exception, not a removal of the rule.
- `facets.framing`'s existing parse in `record.js` is the pattern to copy exactly for `facets.needsDefinition` — read that implementation before writing the new one; don't invent a different absent/false convention for the new key.

## Decision Rationale

See parent record #471 — "Chosen approach" and "Key decisions and why alternatives lost."


<!-- work-fingerprint: needs-definition-label-design:wu1-label-producers -->
