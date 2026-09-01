# Open Items — github-pr-scan.md -f/-F placeholder bug (#626)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | build | Widened fix beyond the issue's named file: `plugin/skills/demo/entry-paths.md:190` carried the identical `-f owner="{owner}" -f repo="{repo}"` defect pattern (with a comment defending `-f`). AC2 requires the new pin test to pass on "the current (fixed) corpus" across all of `plugin/skills/**/*.md`, so this second occurrence had to be fixed too, and its stale justifying comment rewritten. | fixed | `d766951` |
| 2 | test | `npm test` shows 27 pre-existing failures unrelated to this change (confirmed by a baseline diff: stashed this record's changes, re-ran the full suite, got 29 failures — the same 27 plus the 2 tests this record's own new pin test contributes before the fix lands). Zero tests newly broken by this record. | observation | Baseline vs. fixed-tree failure-name diff attached in `decisions.md`; the 27 are out of scope for #626. |
