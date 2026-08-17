---
record: 564
origin: human
risk: low
size: low
ceremony: fast-lane
grants: []
surface: backend
---
# 564: help reference-card: pin argument columns to each skill's argument-hint frontmatter

Surface: backend

## Current State

`skills/help/reference-card.md`'s per-skill "Takes" column is meant to be a verbatim copy of that skill's `argument-hint` frontmatter (modulo the `\|` escaping markdown tables require for literal pipe characters), but nothing enforces that. `tests/argument-hint-input.test.js` only checks each skill's own `argument-hint` against its own `## Input` section — it never looks at the reference card at all.

During #513, the reference card's backlog-lens row drifted from `skills/backlog/SKILL.md`'s `argument-hint`, and a fully green 3600+-test suite never caught it — only a whole-branch reviewer did (that instance has since been fixed).

Diffing every row against its skill's live `argument-hint` (2026-08-16) surfaced 8 more drifted rows the same way, none of them intentional abbreviations — each is missing or has extra grammar relative to the actual frontmatter:

| Skill | Reference-card row has | Actual `argument-hint` |
|---|---|---|
| `flow` | extra `\|<spec>[,spec...]` alternative | flow accepts `#N` refs only (design docs are rejected — see its own `description`) |
| `capture` | missing `[--needs-definition\|--no-needs-definition]` | present |
| `build` | extra `\|<spec>` alternative | not present |
| `stories` | extra `[migrate]` | not present |
| `wrap-up` | missing `[--doc-budget <n>]` | present |
| `routine` | missing `\|<fleet on>` alternative and `[--branch <name>]` | present |
| `design-wrapper` | missing `\|explore` alternative, `[<surface-topic>]`, `[--description <text>]`, `[--scope <identity\|layout>]` | present |
| `feedback` | missing `[--queue] [--pre-confirmed]` | present |

(`assess-agent-autonomy`'s row also uses `#<n>` where the actual hint uses `#{n}` — cosmetic placeholder-notation drift, folded into the same fix pass below rather than called out as a ninth row.)

## Deliverables

1. Fix all 8 (+1 cosmetic) drifted rows in `skills/help/reference-card.md` so each skill's "Takes" column is byte-identical to its `argument-hint` frontmatter value, modulo un-escaping `\|` back to `|`.
2. Add a new test, `tests/reference-card-argument-hint.test.js` (sibling to `tests/argument-hint-input.test.js`, not an extension of it — the two check different things: existing file checks hint-vs-Input within one skill's own file, this one checks card-vs-hint across two files), asserting: for every reference-card table row whose command backtick resolves to a skill directory under `skills/` (skip rows like `/superpowers:brainstorming` that have no local `SKILL.md`), the row's "Takes" column, with `\|` unescaped to `|`, equals that skill's `argument-hint` frontmatter value byte-for-byte — unless the skill name appears in an explicit `ALLOWLIST` array at the top of the test file (empty today; the mechanism exists for a future row that legitimately needs to diverge, per the design decision below).

## Acceptance Criteria

- `npm test` is green, including the new test.
- The new test fails if any one of the 8 fixed rows is reverted in isolation (spot-check at least 2 before considering this done — e.g. temporarily revert `flow`'s row and confirm the new test fails, then re-fix it).
- The new test has zero allowlist entries at merge time (no row in the corpus needs one after this pass).
- Reference-card row diffing repeated after the fix (same method as the Current State table above) shows zero drift across all rows with a local `SKILL.md`.

## Technical Approach

**Design decision made here** (this record was filed with the pinning rule as an open blocker — "exact-copy vs per-row subset"): **exact-copy**, not per-row subset with a broad allowlist. Evidence: diffing all 24 reference-card rows that map to a local skill against their live `argument-hint` today shows 15 already byte-identical and 8 drifted from accidental staleness (skills whose `argument-hint` grew or shrank without the card being updated) — zero rows show a deliberate, intentional abbreviation pattern. Per-row-subset would have under-constrained the check exactly where it needs to bite; the allowlist mechanism stays in the test for the future, but starts empty.

- Parse `skills/help/reference-card.md`'s tables: for each row, extract the skill name from the first cell's backtick command (`` `/claude-tweaks:{name}` `` or `` `/superpowers:{name}` ``) and the "Takes" column text.
- Skip rows whose resolved name has no `skills/{name}/SKILL.md` in this repo (e.g. `/superpowers:brainstorming`).
- Reuse `extractArgumentHint()` from `tests/argument-hint-input.test.js` (export it, or duplicate the ~10-line function — prefer exporting since duplicating a frontmatter parser is exactly the kind of drift this record exists to prevent) to read each skill's frontmatter value.
- Compare: `takesColumn.replace(/\\\|/g, '|') === argumentHint`, skip via `ALLOWLIST.includes(name)`.

## Gotchas

- Some reference-card rows cover multiple skills sharing one row is not a pattern seen in the corpus today — every row is one skill, one command backtick; don't build for a case that doesn't exist.
- `assess-agent-autonomy`'s `#<n>` vs `#{n}` difference is real textual drift (not the kind of placeholder-notation flexibility `argument-hint-input.test.js`'s `isPlaceholderKey` allows for *matching against prose* — this new test does byte comparison, not substring/placeholder-aware matching), so it must be fixed as a normal row edit, not carved out via the allowlist.
- Do not touch `tests/argument-hint-input.test.js` itself beyond exporting `extractArgumentHint` (if that's the reuse path chosen) — its own two tests and their scope are out of bounds for this record.

## Original request

help reference-card: pin argument columns to each skill's argument-hint frontmatter

## Overview

During #513, `skills/help/reference-card.md`'s backlog lens list drifted from `skills/backlog/SKILL.md`'s `argument-hint` and a fully green 3600+-test suite never noticed — the drift was caught only by a whole-branch reviewer. The card's argument columns and each skill's frontmatter are two hand-maintained copies of the same vocabulary.

## Suggested shape

Extend `tests/argument-hint-input.test.js` (or a sibling) to assert each reference-card row's bracket-list is consistent with the named skill's `argument-hint` — with an explicit allowlist for rows that intentionally abbreviate.

Blocker at filing time: a design decision on the pinning rule (exact-copy vs per-row subset) — which is why this is a record rather than an in-run fix.

**Origin:** ledger resolve gate, run 2026-08-16T010024-spec-513-514-515-516 (item 2, #513's final review recommendation), auto-routed per ledgerRouteRemainder and approved at the consolidated Review Console.

**Files:** skills/help/reference-card.md, tests/argument-hint-input.test.js
