---
record: 58
origin: human
risk: medium
effort: medium
ceremony: standard
grants: []
fingerprint: wrap-up-drift-prevention:journeys-wrapup-drift-step
surface: backend
---
# 58: Wrap-up: add journey drift-audit step (7.8), building on /review's 3g-cov lens

Surface: backend

## Current State

`/claude-tweaks:wrap-up` has no journey-drift check at all today. Journeys get created/updated once, at build time (`/claude-tweaks:build`'s Common Step 6 invokes `/claude-tweaks:journeys`). If a fix lands during review's own routing, or during a later simplify pass, the journeys build already touched can drift out of sync with the final diff and nothing catches it before the record closes. `/claude-tweaks:journey-health` exists and does file-existence + self-review + coverage checks, but it's explicitly standalone-only — its own Component-Skill Contract states no orchestrator, including `/flow`, invokes it.

**Correction from this leaf's own red-team pass (two independent personas caught this against the live repo, not just the design doc — verify it again before implementing, don't trust this paragraph blindly):** the original version of this leaf assumed `/review`'s lens 3g-cov already computes diff-vs-`files:`-frontmatter overlap and that wrap-up could cheaply "reuse" its output. Both claims are wrong. `skills/review/SKILL.md:372` and `_shared/journey-coverage-check.md` show 3g-cov computes journey-to-**story** coverage (uncovered journey steps, orphaned stories, cross-referenced via each story's `journey:` field) — it never touches `files:` frontmatter against the diff at all, and it's explicitly informational/never-blocking. The actual diff-vs-journey-file-overlap detection lives in `/claude-tweaks:visual-review --mode=recommendation`, delegated from `/review`'s Step 6 (code mode): "it detects UI changes via `git diff` and identifies affected journeys." Grepped `skills/review/SKILL.md` for any `decisions.md`/ledger write tied to Step 6's recommendation output — found none; it lands only in that review run's own ephemeral summary (Step 7). There is no persisted, timestamp/hash-tagged artifact a later, separate wrap-up invocation could read to know "here's what review already found, and here's the commit it was computed against."

## Deliverables

Given the correction above, this leaf drops the "reuse review's output unless the diff moved" optimization entirely — the coverage-overlap computation itself is cheap and deterministic (a diff-vs-frontmatter overlap, no LLM judgment involved), so there is no real cost to always recomputing it fresh at wrap-up time instead of trying to reuse an artifact that doesn't exist.

New dedicated `wrap-up` **Step 7.8** (`skills/wrap-up/SKILL.md`), with its own sub-file `skills/wrap-up/journey-curation.md` (new — mirrors `docs-health-integration.md`'s shape):

1. **Always compute fresh** — journeys whose `files:` frontmatter overlaps the current full diff (`git diff --name-only` against this work's base ref), independent of whether `/review`'s Step 6 already ran a related check for a different purpose (recommending a visual walk, not this).
2. Apply the same four-check self-review plus structural-validity check `/claude-tweaks:journeys` (its own Step 3.5) and `/claude-tweaks:journey-health` (its own Step 2) already share (`_shared/journey-self-review.md`), applied **inline** — never a nested skill call, matching this project's established reuse convention (the same pattern `docs-health-integration.md` already uses for `criteria-docs-diataxis.md`, and skill curation uses for `harness-health-analysis.md`). This also always runs fresh — no reuse mechanism, same reasoning as item 1.
3. **Missing-journey gap detection** — did this work's diff introduce a new persona-facing flow with no journey `files:` entry covering it at all? Mirrors D2's missing-doc gap detection (the sibling "docs curation elevation" leaf) structurally: a high bar (zero coverage anywhere, not just an untouched journey), scoped to the whole diff, independent of what build's own `/journeys` Step 1 already concluded — a wrap-up-time safety net for drift introduced after build's own journey check ran (or for a project where the sibling "journeys build-time recalibration" leaf hasn't landed yet).
4. Same null-result logging pattern as the sibling leaves in this decomposition — a mandatory summary line every run, even when nothing is found. Format (matching the sibling "skill curation hardening" leaf's pattern): `AUTO {time} — Step 7.8 journey curation summary: {N} journeys checked ({names}), self-review: {pass/fail per journey}, gap detection: {found/not found}. Result: {...}`.
5. Dedicated "Journey updates" section in `skills/wrap-up/review-console.md`.

No `--journey-budget` flag — journey scope-selection is a direct computation (files: frontmatter overlap against the current diff), not a fuzzy ranked scan over a whole library the way skill/doc domain-overlap is.

## Acceptance Criteria

- [ ] `skills/wrap-up/SKILL.md` has a new `## Step 7.8: Journey Curation` heading. Confirm the sibling "docs curation elevation" leaf's actual landed heading text before hardcoding "after Step 7.7" — if it landed under a different number or shape, position this step consistently with whatever actually exists, not the number assumed at decomposition time.
- [ ] `journey-curation.md` documents the diff-vs-`files:`-frontmatter overlap computation as new, always-fresh logic — it must NOT cite `/review`'s 3g-cov lens as a source of reusable output (see the Current State correction above).
- [ ] The self-review and gap-detection checks both apply `_shared/journey-self-review.md`'s four checks + structural-validity check inline — no new nested `Skill()` call to `/claude-tweaks:journeys` or `/claude-tweaks:journey-health`.
- [ ] `skills/wrap-up/review-console.md`'s console template renders a "Journey updates" section distinct from "Documentation updates" and "Skill updates."
- [ ] **Cardinality update, coordinated with the sibling leaf**: `skills/wrap-up/review-console.md` and `skills/wrap-up/SKILL.md` currently hardcode the console's section count in prose ("up to seven named batch sections," Queue writes as "an eighth"). Adding both "Documentation updates" (sibling leaf) and "Journey updates" (this leaf) pushes this to nine. Whichever of the two sibling leaves lands **second** is responsible for updating these literal counts to match reality at that time — do not have both leaves independently guess a hardcoded target number, since that's exactly the "restating a list's cardinality as a literal number" drift this project's own CLAUDE.md warns against.
- [ ] `CLAUDE.md`'s Structure table (wrap-up's sub-files row) lists `journey-curation.md` as a new sub-file with a one-line description of Step 7.8's procedure.
- [ ] `npm test` still passes unmodified.

## Technical Approach

### Key Files
- `skills/wrap-up/SKILL.md` — new Step 7.8 heading; Anti-Patterns + Relationship table rows.
- `skills/wrap-up/journey-curation.md` (new file) — full Step 7.8 procedure.
- `skills/wrap-up/review-console.md` — new "Journey updates" section (**shared edit target with the sibling "docs curation elevation" leaf** — see Gotchas), and the section-count prose fix.
- `CLAUDE.md` — Structure table's wrap-up sub-files list.

Read `_shared/journey-self-review.md` for the four-check procedure to inline. Do **not** read `skills/review/step3-routing.md`'s 3g-cov section expecting reusable output — confirmed during this leaf's own red-team pass that it computes something unrelated (journey-to-story coverage, not diff overlap).

## Gotchas

- **Blocked by the sibling "docs curation elevation" leaf** (both touch `skills/wrap-up/review-console.md`'s console template). Build this leaf *after* that one lands, incorporating its already-updated console template rather than both independently racing to add a section to the same file. If tooling doesn't wire this as a native dependency link, treat it as a hard sequencing note regardless — do not start this leaf's `review-console.md` edit before confirming (via a fresh read of the file) whether the sibling's section already landed.
- Don't reintroduce a "reuse review's output" optimization without first adding a genuine persisted artifact for it to reuse (a `decisions.md` entry, a ledger entry, or similar) written by `/review`'s Step 6 itself — that would be a change to `skills/review/SKILL.md`, which is explicitly NOT a Key File for this leaf. If a future session wants that optimization, it needs its own leaf that touches `/review`.
- Don't invoke `/claude-tweaks:journey-health` as a nested skill call for the self-review checks — this project's established convention (already followed by docs curation, skill curation) is to inline the shared criteria fragment directly, never a nested `Skill()` call to a sibling health skill.
- The sibling "journeys build-time recalibration" leaf (fixing `/journeys`' own Step 1 applicability check) is related but independent — this leaf's missing-journey gap detection is a wrap-up-time safety net regardless of whether that fix has landed yet; it's just temporarily more redundant with an unfixed Step 1 until it does. No hard dependency either direction.
- The auto-decision-log line format in Deliverable 4 is illustrative, not literal — confirm the exact schema/tag question the sibling "skill curation hardening" leaf resolves (see its own Gotchas) before finalizing this leaf's own log line, so the two don't diverge on how a null-result scan is tagged.


<!-- work-fingerprint: wrap-up-drift-prevention:journeys-wrapup-drift-step -->
