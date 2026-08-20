# Open Items — #637 stage-item CLI

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | review | `stage-item.js`'s exit-3 header comment (and `docs/plugin-structure.md`'s command-reference line) documented exit 3 as "run dir missing or not anchored" only, omitting the staged-file-unwritable case `log-decision.js`'s sibling contract already documents (lens 3c, reproduced by both agents) | fixed | e13356bd |
| 2 | review/hindsight | Skill-worthy pattern: both `bin/log-decision.js` (#686) and `bin/stage-item.js` (#637) diverged from their spec's literal hooks.js-subcommand ask, landing on standalone sibling CLIs, with no durable place recording the criterion | fixed | d16f6f23 — added a bullet to `docs/hooks.md` |
