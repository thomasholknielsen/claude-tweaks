---
name: claude-tweaks:version
description: Use when you want to know which version of the claude-tweaks plugin is installed.
argument-hint: "[plain|full]"
---
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.


# Version — Plugin Version Lookup

Print the installed claude-tweaks plugin version. Utility skill — no lifecycle position.

```
/claude-tweaks:capture → ... → /claude-tweaks:wrap-up
                  [ /claude-tweaks:version ] (utility, called from anywhere)
                                ^^^^ YOU ARE HERE ^^^^
```

## When to Use

- You want to confirm the installed plugin version
- Reporting an issue and need the version for context
- Verifying that a marketplace install or update completed
- Checking compatibility before running a feature that landed in a specific version

## Input

`$ARGUMENTS` controls output format:

| Argument | Behavior |
|----------|----------|
| *(none)* | Print the formatted line: `claude-tweaks v{version}` |
| `plain` | Print just the version number (e.g., `4.2.0`) — useful for piping/scripting |
| `full` | Print version + description + repository URL |

## Workflow

### Step 1: Read `plugin.json`

Read `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`. The version field is the source of truth. Do NOT hardcode the version anywhere else.

### Step 2: Format and print

| Mode | Output |
|------|--------|
| Default | `claude-tweaks v{version}` |
| `plain` | `{version}` |
| `full` | Three lines: `claude-tweaks v{version}`, then `{description}`, then `{repository}` |

Example `full` output (all three values come from `plugin.json` at render time — never hardcode them in this skill):

```
claude-tweaks v4.7.0
A structured workflow system for Claude Code — from idea capture through build, review, and wrap-up. Includes browser automation and QA pipeline.
https://github.com/thomasholknielsen/claude-tweaks
```

(The `{version}` / `{description}` / `{repository}` placeholders above are illustrative — actual output substitutes the live values from `plugin.json`.)

That's the entire skill — no decisions, no findings, no follow-up gates.

## Next Actions

Call `AskUserQuestion` with `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`, and:

- Option 1 — `label`: `"Pipeline status (Recommended)"`, `description`: `"/claude-tweaks:help — full pipeline status and command reference"`
- Option 2 — `label`: `"Release notes"`, `description`: `"https://github.com/thomasholknielsen/claude-tweaks/releases — release notes for this and prior versions"`

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Hardcoding the version in skill content | The version lives in `plugin.json` — anything else drifts. Always read from the source. |
| Adding decision prompts or finding gates | This is a one-shot read. Don't over-structure it. |
| Bumping the version inside this skill | Versioning is the maintainer's job — see CLAUDE.md "Versioning" section. |
| Padding the output with announcements like "Here's the version!" | The user asked for the version. Print it and stop. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:help` | /help shows the full reference card; /version is the minimal "just the version" complement |
| `/claude-tweaks:init` | /init may print the version during bootstrap; /version is its standalone equivalent |
| `_shared/auto-mode-contract.md` | `/version` is a pure read — no decisions, no staged actions, no auto-mode interaction. Listed for completeness; the contract does not modify behavior. |
