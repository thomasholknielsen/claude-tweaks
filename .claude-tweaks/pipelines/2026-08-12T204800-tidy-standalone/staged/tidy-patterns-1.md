# Staged proposal — 4 cross-spec patterns

**Source:** /claude-tweaks:tidy, 2026-08-12, Step 5.5

1. **Stale enumeration/cardinality prose** — seen in specs 342, 348, 329, 330, 331, 335.
   Recommend a CLAUDE.md rule: use reference descriptions instead of inline counts for lists
   (matches the project's own existing "cardinality rule" under Cross-references).

2. **Test discrimination defects / silently defanged tests** — seen in specs 348, 329.
   Recommend a code-health check: verify reverting the fix causes the new test to fail.

3. **Comment/vocabulary accuracy drift** — seen in specs 339 (x3), 324, 341. Consider
   `/impeccable:impeccable extract` for a comment-sweep checklist, or a lighter CLAUDE.md note.

4. **Restated conventions instead of `_shared/` references** — seen in specs 349, 348, 330.
   `policy-schema.md` in particular is a responsibility magnet (43 changes in 4 weeks) — consider
   a CI lint validating its capability-count claims against actual code.
