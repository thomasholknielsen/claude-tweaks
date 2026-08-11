# Step 1 — Check Plugin Dependencies (detailed procedure)

*Core Bootstrap step — order-dependent, so later steps may assume earlier ones completed; runs unconditionally and idempotently, acting only on missing state. Gated by `version-check.md` in this directory.*

### Required: Superpowers

Provides `/superpowers:brainstorming`, `/superpowers:writing-plans`, `/superpowers:subagent-driven-development`, `/superpowers:executing-plans`, `/superpowers:using-git-worktrees`, `/superpowers:finishing-a-development-branch`, `/superpowers:dispatching-parallel-agents`, and `/superpowers:systematic-debugging` — the set claude-tweaks skills invoke; see this project's own CLAUDE.md Dependencies row for the authoritative list.

Detect: use the Glob tool to search for `*superpowers*` under the user's `~/.claude/plugins/` directory.

If missing, install:
```bash
/plugin install superpowers@claude-plugins-official
```

### Required: Code Simplifier

Provides the `code-simplifier` subagent (`subagent_type="code-simplifier:code-simplifier"` in the Task tool) used by `/claude-tweaks:build` and `/claude-tweaks:review`.

Detect: check the Task tool's agent type list for `code-simplifier:code-simplifier`, or use the Glob tool to search for `*code-simplifier*` under the user's `~/.claude/plugins/` directory.

If missing, install:
```bash
/plugin install code-simplifier@claude-plugins-official
```
