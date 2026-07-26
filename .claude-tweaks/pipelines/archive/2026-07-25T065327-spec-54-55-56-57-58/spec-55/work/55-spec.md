---
record: 55
origin: human
risk: low
effort: medium
ceremony: standard
grants: []
fingerprint: wrap-up-drift-prevention:skill-library-shape-analysis
surface: backend
---
# 55: harness-health: add skill-library shape analysis (too-shallow / overlapping / bloated)

Surface: backend

## Current State

`_shared/harness-health-analysis.md`'s 8-dimension check (used by wrap-up Step 7, standalone `/harness-health`, and `/init` Phase 3/6) judges a skill against *the codebase* — pattern accuracy, convention drift, stale examples, template conformance, best-practice fit. Dimension 8 ("Best-practice/harness-performance fit") nominally mentions "no cross-skill overlap, right-sized scope" as criteria, but has no concrete evidence-anchor procedure backing it up — unlike dimension 2's quantified-ratio check or dimension 4's stale-example check, there's no mechanical check for whether a skill is too thin to justify its own file, whether two skills' domains have drifted into overlapping territory, or whether a skill's prose has become bloated/redundant. No existing pass judges skills *against each other* — every check today is one-skill-at-a-time.

## Deliverables

Add a new periodic pass to standalone `/claude-tweaks:harness-health` (`skills/harness-health/SKILL.md`) — comparing skills against each other, not against the codebase, on three dimensions:

1. **Too shallow** — a skill whose actual guidance is thin enough that it should collapse into a sibling. **This is a leverage judgment, not a line-count judgment** — this project's own `/claude-tweaks:deepen` model (`skills/deepen/depth-analysis.md`) explicitly rejects line-ratio as the depth signal ("leverage, not line ratio"); this dimension must mirror that, not contradict it. The anchor is: does the skill's actual guidance amount to less than what a well-scoped section in an existing sibling skill would need to say to cover the same trigger conditions? Line count may be cited as supporting color, never as the deciding signal.
2. **Overlapping** — two skills whose domains (frontmatter `description` / "When to Use") have drifted into covering genuinely the same territory — a merge candidate. Explicitly **not** two skills that are intentionally adjacent and cross-referenced (e.g. `/deepen` vs `/simplify`, both invoked in similar contexts but deliberately distinct) — before flagging, check whether the two skills' own Relationship-to-Other-Skills tables already document them as complementary/distinct; if so, that's evidence against overlap, not for it.
3. **Bloated** — a skill whose prose has grown redundant/verbose relative to what it needs to say (mirrors `/claude-tweaks:simplify`'s mission, applied to skill prose instead of code). Unlike the two dimensions above, this is legitimately a **single-skill** judgment, not a pairwise comparison — reuses the existing narrative-density heuristic (`harness-health-analysis.md` Step 1 check 7, words-per-bullet-line) as one input signal alongside direct redundancy-within-the-same-file checks (repeated guidance stated more than once, sections that could merge). Document it as single-skill explicitly, so a future reader doesn't expect it to need a comparison partner the way dimensions 1-2 do.

**Candidate-narrowing (required — do not scan all pairs):** with ~30+ skills in this project alone, exhaustive pairwise comparison is infeasible per firing. Use a cheap pre-filter before committing to which skill(s) get fully read: compare frontmatter `description`/"When to Use" text similarity (keyword overlap) across all skills first (cheap — descriptions only, not full bodies), and only fully read the pair(s) whose similarity clears a threshold. This pass is its own rotation slot with its own due-ness cursor (a fixed pseudo-target id, e.g. `kind: library-shape`, on an interval — not tied to a single skill's own staleness/churn the way the existing rotation triggers are, since this dimension has no single natural target).

**Dedup/fingerprint convention for two-skill findings (required — the existing single-target fingerprint doesn't cover this):** for an "overlapping" or "too shallow → collapse into X" finding naming two skills, canonicalize by sorting both skill names alphabetically and joining them as the `target` value (e.g. `docs-health+journey-health`), so the same pair is never independently fingerprinted twice regardless of which skill the check started from. A "bloated" finding keeps the existing single-skill `target` convention (its own skill name) — it names only one skill.

This is a new rotation slot in harness-health's existing SELECT → JUDGE → VERIFY GATE → FINGERPRINT/DEDUP → FILE pipeline (same shape the sibling health skills already use) — not every firing. Findings file the same way other harness-health findings do: `by:harness-health`, report-only (never edits), human decides via the existing interactive/auto filing gate.

## Acceptance Criteria

- [ ] `skills/harness-health/SKILL.md` documents the new periodic pass with its own SELECT logic (the description-similarity pre-filter + fixed pseudo-target cursor described above) — not a bare "reads 2+ full skill files" with no selection mechanism.
- [ ] Dimension 1 ("too shallow")'s documented anchor explicitly cites leverage/coverage-equivalence, not line count, and explicitly cross-references `skills/deepen/depth-analysis.md`'s "leverage, not line ratio" framing so the two models don't silently diverge.
- [ ] Dimension 2 ("overlapping")'s documented check includes the Relationship-table cross-check (adjacent-but-distinct skills are evidence against overlap) before flagging.
- [ ] Dimension 3 ("bloated") is explicitly documented as single-skill, not pairwise — reusing the existing narrative-density heuristic plus a same-file redundancy check.
- [ ] The two-skill fingerprint canonicalization rule (sorted-pair `target`) is documented for dimensions 1 and 2's cross-skill findings.
- [ ] Findings file with the existing `by:harness-health` label family and the standard scoring/ready shape every other harness-health finding uses.
- [ ] `_shared/harness-health-analysis.md` Dimension 8's existing "no cross-skill overlap, right-sized scope" language gets a one-line pointer noting the mechanical check for this now lives in this new periodic pass, so the two descriptions of "overlap checking" don't drift apart.
- [ ] `npm test` still passes unmodified.

## Technical Approach

### Key Files
- `skills/harness-health/SKILL.md` — add the new rotation slot / target kind and its own SELECT/JUDGE procedure for the three dimensions.
- `skills/_shared/harness-health-analysis.md` — one-line pointer added to Dimension 8, per the acceptance criterion above.
- Possibly a new small reference sub-file if the three-dimension procedure grows large enough to warrant lazy-loading (follow this project's own "don't put detailed reference content inline when it'd make SKILL.md unwieldy" convention) — judge this during implementation, not upfront.

Read `skills/deepen/depth-analysis.md` (the leverage/depth model — the anchor for dimension 1) and `skills/simplify/SKILL.md` (the bloat/redundancy model for code — the anchor for dimension 3) before drafting.

## Gotchas

- Don't port this same three-dimension analysis to `/claude-tweaks:docs-health` or `/claude-tweaks:journey-health` — both already have an equivalent whole-library shape check in their own existing rotations (docs-health's genre-drift/depth-mismatch scan; journey-health's file-existence/self-review/coverage scan). This leaf is skill-library-specific.
- This is report-only, like every other harness-health finding — resist any temptation to have this pass auto-apply a merge/split/simplify, even for a high-confidence finding. Structural changes to skill files are exactly the kind of "restructural" classification this project's conventions already gate on human review.
- Whether "full skill file" for dimensions 1-3 means SKILL.md only or SKILL.md + its lazy-loaded sub-files is a real, undecided question this leaf's own red-team pass raised — several skills (per CLAUDE.md's "Skills with sub-files" table) keep SKILL.md lean by design, pushing real guidance into sub-files. A dimension-1 "too shallow" verdict based on SKILL.md alone could misjudge a skill whose actual depth lives in its sub-files. Decide explicitly during implementation and document the choice — don't leave it implicit.


<!-- work-fingerprint: wrap-up-drift-prevention:skill-library-shape-analysis -->
