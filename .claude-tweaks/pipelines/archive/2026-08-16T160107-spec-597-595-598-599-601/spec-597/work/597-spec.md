---
record: 597
origin: human
risk: low
size: low
ceremony: standard
grants: []
fingerprint: design-critique-dispatch:design-wrapper-critics-md-track-keyed-curated-critic-roster
surface: backend
---
# 597: design-wrapper critics.md — track-keyed curated critic roster; wire review-animations as a review-time critic

Surface: backend

## Overview

Create `skills/design-wrapper/critics.md` — the single, curated, track-keyed table of project-local design critics that `review` mode dispatches (the dispatch itself is #598; this record owns the roster and its trigger semantics). Adding a critic provider means adding a row here; there is deliberately no per-project manifest — the design rejected #573's open-manifest shape because it reverses `design-craft.md`'s "wired by deliberate choice, not accident" posture and because arbitrary skills' output shapes cannot be normalized at the boundary.

Also moves `review-animations` in `skills/_shared/design-craft.md` from the "deliberately not wired" table to a new "wired — review-time critics" table, with its rationale updated: it was unwired because *no consumer composed build-time context from it*; review mode is a critique consumer, not a build-time one.

**Complexity:** Low
**Estimated tasks:** 3

## Non-Goals

- No dispatch procedure — `critics.md` is a data table plus trigger definitions; the Step 3.8 procedure that reads it lives in `modes/review.md` (#598).
- No change to `design-craft.md`'s relevance map for *writing* dispatches — `emil-design-eng`/`animate`/`animation-vocabulary`/`apple-design` writing-time triggers stay exactly as they are.
- No terminal row content beyond the literal pointer row given below — #601 edits that same row in this same file (it does not create a parallel table).
- `improve-animations`, `find-animation-opportunities`, `prototype`, `pick-ui-library`, `ask-sonner` stay on the not-wired table, unchanged.

## Prerequisites

None for build order — this is a pure new-file + one-table-move unit and can build first. It *names* the `design.critique` lever conceptually (its values and meaning) but does not read it; the schema entry is #595's and the resolver call is #598's. `critics.md` cites both by record number until they land.

## Current State

- `skills/_shared/design-craft.md` — "Relevance map" section has a "Wired" table (`emil-design-eng`, `animate`/`animation-vocabulary`, `apple-design`) and a "Deliberately not wired" table with `review-animations` in it, reason: "Review-time critique of existing motion — no consumer composes build-time context from it." Its closing sentence reads "A new upstream skill appearing there is triaged into one of these two tables — never silently absent." Its "Emil skill resolution" section defines a **per-skill-name** two-path lookup (`{project}/.claude/skills/{name}/SKILL.md`, then `~/.claude/skills/{name}/SKILL.md`) plus the symlink note — generic over any name in the upstream set, which includes `review-animations` (it is an Emil skill from `emilkowalski/skills`, resolved by the same lookup). Its "Gating" section says Emil content is web-track only. Its relevance map defines the **motion signal** verbatim: "does it name motion work (animation, transition, gesture, micro-interaction)? — or `Design-intent: delightful`" — the target of this record's citation.
- `skills/design-wrapper/SKILL.md` — Layer 0 (context signals via `impeccable-plugin.md`'s `gatherSignals()`) exposes `hasDesign`; Layer 0 "degraded" means absent plugin / version mismatch / execution failure → no signals. `Design-intent:` is a record body-metadata line defined in `skills/specify/spec-template.md`. `SKILL.md`'s "Reference sub-files" list enumerates the peer set `critics.md` joins (`command-map.md`, `frontend-detection.md`, `native-routing.md`, `availability.md`, `impeccable-plugin.md`, `impeccable-cli.md`). No test pins design-wrapper's sub-file roster (verified: `grep -rln "native-routing.md" tests/` finds only fixture noise) and no test pins a numeric byte ceiling on `SKILL.md` — but at ~39 KB it is the largest SKILL.md in the repo; additions there are one line each.
- `docs/plugin-structure.md` — the per-skill sub-file table lists design-wrapper's sub-files; a new file needs a row.

## Deliverables

- [ ] New `skills/design-wrapper/critics.md` containing, in order: (a) a purpose paragraph — curated roster read only by `review` mode Step 3.8 (#598); adding a provider = adding a row; no per-project manifest, with the why above; (b) the track-keyed table below, verbatim; (c) a **Trigger signals** section defining exactly three inputs — **motion signal**: cite `skills/_shared/design-craft.md`'s relevance map by section name, never restated; **decisions present**: Layer 0 `hasDesign` (`skills/design-wrapper/SKILL.md` Layer 0 / `impeccable-plugin.md`), falling back to a direct `DESIGN.md` existence check via `_shared/visual-html-output.md`'s three-path lookup when Layer 0 degraded; **lever**: the resolved `design.critique` value (`off | auto | full`, schema owned by #595, read via `bin/resolve-policy.js` in #598) — plus `Design-intent:` cited to `skills/specify/spec-template.md`; (d) a **Resolution** line: every critic name in the table resolves through `design-craft.md`'s Emil skill resolution lookup (per skill name — `review-animations` is an Emil skill and resolves the same way); a name resolving at neither path is absent per that file's degradation posture; (e) a **Native row — unblocking condition** sentence: a native critic row is added only if a native-track craft-principles source ships upstream (an Emil-equivalent for SwiftUI/Compose) or Impeccable's native `critique`/`audit` prove insufficient in dogfooding — never by copying the web rows.

  | Track | Critic | Trigger |
  |---|---|---|
  | `web` | `emil-design-eng` | Lever `full` → every web-track UI diff; `auto` → decisions present, or motion signal, or `Design-intent:` set on the record; `off` → never |
  | `web` | `review-animations` | Motion signal, lever ≠ `off`. Deliberately not forced by `full` — the skill is motion-scoped; without a motion signal there is nothing for it to review |
  | `ios` / `android` / `adaptive` | *none* | Deliberate: Impeccable's `critique`/`audit` already run natively with the platform named (`native-routing.md`); Emil is web-only (`design-craft.md` Gating). No decisions pushback on native until a row exists — a stated gap, not a hole; see the unblocking condition below the table |
  | `terminal` | *pending* | Filled by #601 (edits this row in place) |

- [ ] `skills/_shared/design-craft.md`: (1) remove `review-animations` from the "Deliberately not wired" table; (2) add a second wired table titled **Wired — review-time critics** immediately after the existing writing-time "Wired" table, with two rows — `emil-design-eng` and `review-animations` — whose Trigger column reads "see `skills/design-wrapper/critics.md`" (no trigger restated here); (3) rewrite the closing sentence to: "The map accounts for the whole upstream skill set as pinned in the drift manifest. Every upstream skill appears in at least one wired table (a skill may be wired for both the writing-time and review-time roles) or in the not-wired table — never silently absent. A new upstream skill appearing there is triaged into one of them." `emil-design-eng` therefore appears in both wired tables by design.
- [ ] `skills/design-wrapper/SKILL.md` "Reference sub-files" list: one bullet — `` `critics.md` `` — track-keyed roster of project-local craft critics; read only by `review` mode Step 3.8.
- [ ] `docs/plugin-structure.md`: add `critics.md` to design-wrapper's sub-file row with that same one-line description.

## Acceptance Criteria

1. `test -f skills/design-wrapper/critics.md` succeeds and the file contains a table with a `web` row for `emil-design-eng`, a `web` row for `review-animations`, one row covering `ios` / `android` / `adaptive` with `none`, and a `terminal` row reading `*pending*`.
2. `grep -n "review-animations" skills/_shared/design-craft.md` shows it under the "Wired — review-time critics" heading and **not** in the "Deliberately not wired" table; `grep -c "emil-design-eng" skills/_shared/design-craft.md` ≥ 2 (both wired tables); `grep -n "at least one wired table" skills/_shared/design-craft.md` returns the rewritten closing sentence.
3. `grep -c "critics.md" skills/design-wrapper/SKILL.md docs/plugin-structure.md` returns ≥1 for each file.
4. `critics.md` contains no restatement of the motion-signal definition — `grep -n "animation, transition, gesture" skills/design-wrapper/critics.md` returns nothing; the file cites `design-craft.md`'s relevance map by name instead.
5. `grep -n "unblocking\|added only if" skills/design-wrapper/critics.md` returns the native-row condition sentence.
6. `npm test` passes (conformance suites are repo-wide prose pins).

## Technical Approach

New reference file following the shape of `native-routing.md` (purpose paragraph → table → definitions → delegation). One table move + one table addition + one sentence rewrite in `design-craft.md`. Two one-line list additions.

### Data / API Surface

`critics.md` table columns: `Track` (values from `SKILL.md`'s track-resolution table plus `terminal`), `Critic` (upstream skill name resolvable via `design-craft.md`'s lookup, or `none` / `pending`), `Trigger` (prose referencing only the three named signals).

### Key Files

- `skills/design-wrapper/critics.md` — new
- `skills/_shared/design-craft.md` — table move, review-time wired table, closing sentence
- `skills/design-wrapper/SKILL.md` — one bullet in Reference sub-files
- `docs/plugin-structure.md` — one row edit

### Package Dependencies

None.

## Gotchas

- Do not restate `design-craft.md`'s lookup order or motion-signal definition — cite by section name. Restated copies of that contract drifted before (`[IL-32]`-class problem); one home only.
- The native row must say *why* it is empty and *what would fill it*; an unexplained blank row invites someone to "fix" it by adding Emil there, which `design-craft.md`'s Gating forbids.
- `SKILL.md` additions: one line, no prose. Run `wc -c skills/design-wrapper/SKILL.md` before and after; there is no numeric test ceiling, the constraint is the always-loaded-context budget.
- `docs/skill-graph.md` edges for this new file are owned by #600, not this one — do not add them here.

<!-- work-fingerprint: design-critique-dispatch:design-wrapper-critics-md-track-keyed-curated-critic-roster -->
