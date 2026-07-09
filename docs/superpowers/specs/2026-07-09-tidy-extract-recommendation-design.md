# Tidy: Design Quality Extract Recommendation — Design

**Status:** Approved
**Author:** Claude (session-driven design), approved by Thomas Holk Nielsen

## Problem

`/claude-tweaks:tidy` Step 5.5 ("Cross-Spec Pattern Detection," `skills/tidy/scan-procedures.md`) scans recent review summaries and wrap-up reflections for recurring findings, and surfaces systemic issues worth addressing at the project level — e.g. the same convention violation appearing in 3+ reviews suggests adding a CLAUDE.md rule; the same file flagged across specs suggests a refactor.

This scan is scoped to the review summary's "Code Review Findings" section, which uses a fixed category taxonomy (Security, Convention, Performance, Error Handling, Architecture, Test Quality). It has zero awareness of the separate "Design Quality (from /claude-tweaks:design review)" section — the Impeccable-sourced findings section added to the review summary template independently, with its own category vocabulary (typography, spacing, color, component, etc.). A UI pattern (a card layout, a button variant, a spacing convention) can be independently reimplemented across three, four, five specs — each one individually flagged in that spec's own Design Quality section — with nothing ever connecting the dots.

Impeccable ships a command purpose-built for exactly this signal: `/impeccable:impeccable extract` (`impeccable/reference/extract.md`) — *"Repeated components: similar UI patterns used 3+ times... only extract things used 3+ times with the same intent."* It's one of the "manual-only" commands (`skills/design/modes/polish.md`'s own docs: `colorize`, `extract`, and `overdrive` are never auto-dispatched — they only ever surface via a recommendation). Nothing currently generates that recommendation.

## Goal

Extend Step 5.5's existing scan to also read the Design Quality section of each review summary, and add one new signal row that recommends `/impeccable:impeccable extract` when the same Design Quality category recurs across 3+ specs.

## Non-Goals

- No new gating logic (e.g. checking `design-integration: enabled` before running this part of the scan). On a project with no Design Quality sections in its review summaries (non-frontend, or design integration never enabled), the new extraction step simply finds nothing — the same "scan what exists" behavior every other row in this table already has. Adding an explicit gate would be redundant special-casing for a case that already self-resolves to zero findings.
- No new threshold. The existing signals already use "3+ specs" as their trigger; this reuses it rather than introducing a config knob. This also happens to match Impeccable's own extract.md guidance ("only extract things used 3+ times") — a coincidental but reassuring alignment, not something engineered to match.
- No change to the `[pattern]` collection format, the Cross-Spec Patterns table rendering, or anything in `skills/tidy/SKILL.md` itself. This is purely a Step 5.5 scan-scope extension plus one new table row in `scan-procedures.md`.
- No attempt to detect "the same UI element" at a finer grain than Impeccable's own `category` field (e.g. no fuzzy-matching component names out of finding messages). Matching by `category` mirrors exactly how the existing "Same finding category in 3+ reviews" row already works for Code Review Findings — reusing an established mechanism, not inventing a new one.

## Changes

### `skills/tidy/scan-procedures.md` — Step 5.5

**"How to scan" (step 3), extended:** Alongside the existing category extraction from Code Review Findings, also read each review summary's "Design Quality" section (present when the spec's `/claude-tweaks:review` Step 6.5 ran and Impeccable returned findings) and extract those findings by their own `category` field — a separate vocabulary from Security/Convention/Performance/Error Handling/Architecture/Test Quality (Impeccable's categories are things like typography, spacing, color, component).

**"What to look for" table, new row:**

| Signal | Example | Recommendation |
|---|---|---|
| Same Design Quality category recurring in 3+ reviews | `"component"` findings in specs 41, 44, 47's Design Quality sections (a card/button/layout pattern reimplemented each time) | Run `/impeccable:impeccable extract` — this pattern is being reimplemented, not reused |

Collected the same way every other row already is: `[pattern] {description} — seen in {spec list} — {recommendation}`.

## Data Flow

```
/claude-tweaks:tidy Step 5.5
  → scan recent review summaries (existing: Code Review Findings section)
  → scan recent review summaries (new: Design Quality section, by category)
  → group findings by category across specs
  → 3+ specs sharing a Design Quality category → [pattern] row recommending /impeccable:impeccable extract
  → surfaces in the tidy report's Cross-Spec Patterns table (existing rendering, unchanged)
```

## Error Handling

| Case | Behavior |
|---|---|
| No Design Quality sections found in any scanned review summary | New extraction step finds nothing; no new `[pattern]` rows; existing Code Review Findings scanning unaffected |
| Fewer than 3 specs share a Design Quality category | No pattern surfaced — matches the existing threshold behavior for every other row |
| A review summary's Design Quality section is present but empty (skipped design wrapper) | Nothing to extract from that spec; other specs still contribute normally |

## Testing

Same nature as the prose-only threads in this series (`animate-frequency-gate`, `design-decisions-log-compliance`): skill markdown content, not executable code. Verification is manual consistency checking during implementation — the new table row's pipe count, the "how to scan" step's added sentence reads coherently alongside the existing one, no other file references this table's exact row set in a way that would need updating.

## Open Items

None — this is a small, single-file, single-mechanism extension with no unresolved forks.
