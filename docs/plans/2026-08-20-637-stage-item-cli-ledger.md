# Open Items — #637 stage-item CLI

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | review | `stage-item.js`'s exit-3 header comment (and `docs/plugin-structure.md`'s command-reference line) documented exit 3 as "run dir missing or not anchored" only, omitting the staged-file-unwritable case `log-decision.js`'s sibling contract already documents (lens 3c, reproduced by both agents) | fixed | e13356bd |
| 2 | review/hindsight | Skill-worthy pattern: both `bin/log-decision.js` (#686) and `bin/stage-item.js` (#637) diverged from their spec's literal hooks.js-subcommand ask, landing on standalone sibling CLIs, with no durable place recording the criterion | fixed | d16f6f23 — added a bullet to `docs/hooks.md` |
| 3 | wrap-up/ops | Residue sweep (`--scope blast-radius`) surfaced `origin/worktree-record-548` as a merged-not-deleted branch — a different record's leftover, not this run's; surfaced only because `git branch --merged HEAD` sees #548's already-merged commits transitively via this run's own origin/main catch-up merges (reason-not-auto: belongs to a different record, out of #637's scope) | accepted | Not #637's own blast radius — no action taken here |
| 4 | wrap-up/ops | Residue sweep surfaced `.claude-tweaks/pipelines/2026-08-20T044329-record-631` as an unarchived `status: clean` run dir — record #631's own leftover, not this run's (reason-not-auto: belongs to a different record, out of #637's scope) | accepted | Not #637's own blast radius — no action taken here |
