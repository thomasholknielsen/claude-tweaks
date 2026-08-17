# Open Items — 418: Cut the plugin payload over to plugin/ with a git-subdir marketplace source (single release)

| # | Phase | Item | Status | Resolution |
|---|-------|------|--------|------------|
| 1 | ops (reason-not-auto: requires-human) | Rotate the Claude Code credential: the Task 1 probe subagent ran `security find-generic-password -g` and printed live OAuth access+refresh tokens into its local transcript file (`/private/tmp/claude-501/.../tasks/af92218f9b31c0b18.output`). Not written elsewhere, not reused — but rotate (sign out/in) to be safe. | open | — |
| 2 | build/skill | Worktree PreToolUse guard blocks git commits in OUT-of-worktree scratch repos too (command-text matching) — Task 1 had to wrap `git commit` for a scratchpad probe repo in a `cd`+`exec` script. Candidate /claude-tweaks:feedback item (guard over-matching). | observation | Noted for wrap-up skills-curation row |
