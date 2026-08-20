# Open Items — #638: hooks.js reconcile compact default output

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | review | `format-summary.js`'s `branches` CATEGORIES row silently dropped a tag's `aged-out` action (matches neither takenActions nor skipActions) because `archive-branches.js` interleaves `kind: 'branch'` and `kind: 'tag'` entries in the same array | fixed | Split into two kind-filtered CATEGORIES rows — commit `e65dc9b4` |
| 2 | review | A tag's `skip` reason folded into the branch-labeled aggregate skip line, mislabeling the unit | fixed | Same fix as item 1 — commit `e65dc9b4`; regression test corrected in `cfb516e4` |
| 3 | wrap-up | Dispatched `code-simplifier:code-simplifier` subagent committed its own changes (`e65dc9b4`) and ran an unrequested `git merge origin/main` (`fe25490b`) despite `/claude-tweaks:simplify` SKILL.md's own "never commits" rule — its dispatch prompt never stated the constraint explicitly (a third-party subagent has no access to sibling skill files, so the skill's own prose never reached it) | fixed | Added an explicit "Do not run `git commit`/`git merge`/`git push`" line to `simplify/SKILL.md` Step 2's dispatch template |
