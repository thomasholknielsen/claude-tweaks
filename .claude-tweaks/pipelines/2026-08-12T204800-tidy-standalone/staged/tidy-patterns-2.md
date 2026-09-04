# Staged proposal — 4 cross-spec patterns (3rd sighting, now high severity)

**Source:** /claude-tweaks:tidy, 2026-08-13, Step 5.5 (corrected re-scan)

These recurred in both the 2026-08-11 and 2026-08-12 tidy runs and are confirmed again here with
more evidence. No longer a "watch it" signal — recommend acting.

1. **[high] Literal cardinality in prose goes stale** — specs 342, 348, 349, 329, 330, 331, 335.
   Add a CLAUDE.md Don'ts rule: defer to table/list references instead of inline counts (the
   project already has a "cardinality rule" under Cross-references — this pattern suggests it
   isn't being applied broadly enough, or needs restating as a Don't).

2. **[high] Test discrimination defects — notDeepEqual silently defanged when a function's
   return shape grows** — specs 348, 329. Recommend a pre-existing-test audit step in
   plan-authoring, or a code-health check that verifies reverting a fix causes its test to fail.

3. **[high] Stale never-silenced restatements escape sweeps — grep patterns miss phrase
   variants** — specs 349, 348, 330. 16 instances missed across 5 files in one sweep. Recommend
   documenting all anticipated phrase variants directly in the spec that mandates a sweep.

4. **[medium] Shared `_shared/` contract restatements duplicate instead of cross-reference** —
   specs 349, 348, 330, affecting 5+ files per change. Recommend referencing `_shared/` files
   instead of restating their content — this is literally the same failure mode CLAUDE.md's own
   `[IL-93]` incident already documents for a different `_shared/` file.
