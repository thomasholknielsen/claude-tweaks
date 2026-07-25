---
record: 56
origin: human
risk: medium
effort: medium
ceremony: standard
grants: []
fingerprint: wrap-up-drift-prevention:docs-curation-elevation
surface: backend
---
# 56: Wrap-up: elevate docs curation to its own step (7.7), broaden scope beyond touched-only docs

Surface: backend

## Current State

`/claude-tweaks:wrap-up` Step 6.1 (Documentation, `skills/wrap-up/docs-health-integration.md`) already applies `_shared/criteria-docs-diataxis.md`'s full judgment procedure (genre-drift, depth-mismatch, findability, staleness) plus missing-doc gap detection (D2) — but its scope is narrower than skill curation's Step 7: D1 only judges docs this work's diff *directly touched or created*, and it's batched inside Step 6 alongside CLAUDE.md/rules/ADR scans rather than run as its own dedicated analysis. There's no domain-overlap scan for docs that document the changed subsystem but weren't directly edited — the equivalent of skill curation's "read the top-5 skills ranked by domain overlap, even if untouched."

## Deliverables

1. **New dedicated `wrap-up` Step 7.7** (`skills/wrap-up/SKILL.md`), replacing today's Step 6.1 entirely — same standalone treatment Step 7 (Skill Curation) already gets, not batched with CLAUDE.md/rules/ADRs.
   - **Numbering note:** not 7.5/7.6 — `skills/wrap-up/skill-curation.md` already uses "(7.1)" through "(7.6)" for its own internal sub-procedure shorthand. 7.7 avoids that collision and requires zero renumbering of Step 8/8.5/8.6/9/10.
   - Step 6 shrinks: remove sub-item 6.1 (Documentation) entirely; renumber 6.2 (CLAUDE.md and Rules) → 6.1; renumber 6.3 (Decision Records) → 6.2. Step 6's own intro blockquotes ("Batch collection" and "Parallel execution" — `skills/wrap-up/SKILL.md` around lines 122-124) currently describe "three sub-scans (Documentation, CLAUDE.md and Rules, Decision Records)" — this prose must shrink to describe two sub-scans; it contains no literal "Step 6.1" substring, so a grep for that string alone will not catch it.
   - **Fast-lane behavior, decided explicitly (was ambiguous — resolve this way, don't leave it implicit):** Step 7.7's domain-overlap scan follows skill curation's model — fast-lane **narrows the scan's cap, it does not skip the scan entirely** (mirrors `skill-curation.md`'s "fast-lane narrows breadth, never gates existence" principle, not Step 6's own current fast-lane pre-check which skips the Documentation sub-scan outright). The surviving parts of today's Step 6 fast-lane pre-check (the registry/dependency/schema conditions) move to gate Step 6's now-two-item scan (CLAUDE.md/Rules, Decision Records) only — they no longer gate documentation at all, since documentation now has its own narrower-not-skipped fast-lane behavior.
2. **Broadened independent scan** (`skills/wrap-up/docs-health-integration.md`) — add a domain-overlap ranking on top of the existing D1 touched-docs check: rank existing docs by how much they cover the changed subsystem (reuse `docs/REGISTRY.md`'s Auto-detect patterns as the overlap signal — the same idea as skill curation's directory/pattern scoring), read the top-N domain-overlapping docs even when this work didn't edit them directly. **Explicit fallback**: when `docs/REGISTRY.md` doesn't exist, or exists with no Auto-detect patterns, skip the domain-overlap scan for that run and emit the null-result log line noting why (`"registry absent/empty — domain-overlap scan skipped"`) — do not treat this as an error, and do not fall back to scanning the whole `docs/` tree (that's `/claude-tweaks:docs-health`'s job, not this leaf's).
3. **New `--doc-budget <n>` flag** (`skills/wrap-up/SKILL.md`'s Flags section) — caps the domain-overlap scan's depth, separate from `--skill-budget`. **Default is 3** (pinned explicitly, distinct from `--skill-budget`'s default of 5 — docs tend to be longer to fully read).
4. **Dedicated "Documentation updates" Review Console section** (`skills/wrap-up/review-console.md`) — mirrors the existing "Skill updates" section, separate from "Configuration Updates" (which narrows to CLAUDE.md/rules/ADRs only after this change). Insert it immediately after "Skill updates" and before "Configuration Updates," so the console's section order roughly tracks Step 7 → 7.7 → 7.8 → 6 execution order. Also update `review-console.md`'s "On approval" numbered apply-step list (which currently references specific item-number ranges) to add a distinct numbered step for Documentation updates, splitting it out of whatever range currently covers "docs, CLAUDE.md, rules."
5. **Cardinality update, coordinated with the sibling "journeys wrap-up drift step" leaf**: `skills/wrap-up/review-console.md` and `skills/wrap-up/SKILL.md` currently hardcode the console's section count in prose ("up to seven named batch sections," Queue writes as "an eighth"). Adding both this leaf's "Documentation updates" and the sibling leaf's "Journey updates" pushes this to nine. Whichever of the two sibling leaves lands **second** is responsible for updating these literal counts to match reality at that time — don't have both leaves independently guess a hardcoded target number.
6. Same null-result logging pattern as the sibling "skill curation hardening" leaf: a mandatory summary line even when D1/D2 find nothing.

## Acceptance Criteria

- [ ] `skills/wrap-up/SKILL.md` has a new `## Step 7.7: Documentation Curation` heading, positioned after Step 7 and before Step 8 (adjust if the sibling "journey drift-audit" leaf's own Step 7.8 lands first and this needs to slot before it instead — check the file's actual state before assuming ordering).
- [ ] Step 6 no longer has a "6.1: Documentation" sub-item; its remaining sub-items are renumbered 6.1 (CLAUDE.md and Rules) and 6.2 (Decision Records); its intro blockquotes describe two sub-scans, not three.
- [ ] `skills/wrap-up/docs-health-integration.md`'s header no longer says "Loaded by ... Step 6.1" — says Step 7.7.
- [ ] The domain-overlap scan is documented with an explicit cap, the REGISTRY.md-absent fallback above, and overflow-noted discipline (mirrors skill curation's "note the overflow explicitly... never silently truncate").
- [ ] `--doc-budget <n>` appears in `skills/wrap-up/SKILL.md`'s argument-hint and Flags section, with default `3` stated explicitly (not just "suggest lower than skill curation's").
- [ ] `skills/wrap-up/review-console.md`'s console template renders a "Documentation updates" section distinct from "Configuration Updates," and its "On approval" apply-step list has its own numbered step for it.
- [ ] `CLAUDE.md`'s Structure table (wrap-up's sub-files row) reflects `docs-health-integration.md`'s new step reference.
- [ ] A repo-wide grep for the literal strings `"Step 6.1"`, `"Step 6.2"`, and `"Step 6.3"` (re-run after every touched file's edit, not just once at the end) finds zero remaining references to the old sub-step identities anywhere outside this leaf's own commit history.
- [ ] `npm test` still passes unmodified.

## Technical Approach

### Key Files
- `skills/wrap-up/SKILL.md` — Step 6 renumbering + intro-blockquote text; new Step 7.7 heading; Flags section; Anti-Patterns + Relationship table rows.
- `skills/wrap-up/docs-health-integration.md` — step-reference update; broadened domain-overlap scan + REGISTRY.md-absent fallback; `--doc-budget` handling; null-result logging line.
- `skills/wrap-up/review-console.md` — new "Documentation updates" section + its own apply-step number; narrow "Configuration Updates" to CLAUDE.md/rules/ADRs; the section-count prose fix (coordinate with sibling leaf per Deliverable 5).
- `CLAUDE.md` — Structure table's wrap-up sub-files list entry for `docs-health-integration.md`.

## Gotchas

- **Coordinate with the sibling "journeys wrap-up drift step" leaf** — both leaves add a new section to `skills/wrap-up/review-console.md`'s template, and both would otherwise independently guess the section-count cardinality. Land this leaf first if possible (it has no dependency on the sibling; the sibling leaf is explicitly `Blocked by` this one). Before editing `review-console.md`, `grep` it for the sibling's "Journey updates" header — if present, this means the sibling landed first despite the intended ordering; merge structurally into whatever section order actually exists rather than assuming this leaf's own described insertion point is still accurate.
- This project's own CLAUDE.md warns: a stale cross-reference can recur in a second, non-adjacent location even after the first is fixed — don't trust a single grep-and-done pass; re-run the three-string grep (6.1/6.2/6.3) after each file's edit.
- D2's missing-doc gap detection already refuses a new doc when an adjacent one could absorb the content ("zero existing doc coverage *anywhere*") — don't add a separate "fold into existing doc" check on top of it; that concern is already handled.
- `/claude-tweaks:docs-health`'s own rotation already does whole-library genre-drift/depth-mismatch scanning — don't duplicate that here; this leaf's broadened scan is scoped to *this work's* domain overlap, not a whole-library sweep.
- The Step 9 "Present Consolidated Summary" standalone template (the non-Review-Console path in `skills/wrap-up/SKILL.md`) still folds doc items into one generic "Configuration Updates" table today. This leaf deliberately does **not** split that template the same way — it's a lower-traffic path (Step 8.6 Review Console already covers the console-driven flow) and splitting it is out of scope here; leave Step 9's template as-is unless a future leaf specifically targets it.


<!-- work-fingerprint: wrap-up-drift-prevention:docs-curation-elevation -->
