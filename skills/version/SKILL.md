---
name: claude-tweaks:version
description: Use when you want to know which version of the claude-tweaks plugin is installed.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a Next Actions block (context-specific numbered options with one recommended), not a navigation menu.


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

Example `full` output (substitute the live values from `plugin.json` at render time — the literal version below is illustrative only):

```
claude-tweaks v{version}
A Claude Code plugin with structured development lifecycle skills.
https://github.com/thomasholknielsen/claude-tweaks
```

That's the entire skill — no decisions, no findings, no follow-up gates.

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

### Next Actions

1. `/claude-tweaks:help` — full pipeline status and command reference **(Recommended when version was the only thing you needed)**
2. `https://github.com/thomasholknielsen/claude-tweaks/releases` — release notes for this and prior versions
