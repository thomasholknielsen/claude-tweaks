---
name: claude-tweaks:version
description: Use when you want to know which version of the claude-tweaks plugin is installed.
argument-hint: "[plain|full] [--min <version>]"
---
> **Interaction style:** Single decisions → one `AskUserQuestion` call, one option marked Recommended. Multi-item → batch table with recommendations pre-filled, then one `AskUserQuestion` for apply-all/override. Never more than one call per decision; resolve each before the next. End with `## Next Actions` via `AskUserQuestion`, not a navigation menu.


# Version — Plugin Version Lookup

Print the installed claude-tweaks plugin version.

Lifecycle: utility — callable from anywhere between `/claude-tweaks:capture` and `/claude-tweaks:wrap-up`.

## When to Use

- You want to confirm the installed plugin version
- Reporting an issue and need the version for context
- Verifying that a marketplace install or update completed
- Checking compatibility before running a feature that landed in a specific version (`--min <version>`)

## Input

`$ARGUMENTS` controls output format:

| Argument | Behavior |
|----------|----------|
| *(none)* | Print the formatted line: `claude-tweaks v{version}` |
| `plain` | Print just the version number (e.g., `4.2.0`) — useful for piping/scripting |
| `full` | Print version + description + repository URL |
| `--min <version>` | Compare the installed version against `<version>` (semver) and report pass/fail — see Step 2.5. Combinable with `plain`/`full`: the format mode still controls the version print, `--min` adds the comparison line after it. |

An `$ARGUMENTS` value that matches none of the above (a typo, an unsupported keyword, wrong casing) is not silently treated as any of the documented modes — state plainly that the argument wasn't recognized, list the supported values from the table above, and stop without printing a version.

## Workflow

### Step 1: Read `plugin.json`

Read `${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json`. The version field is the source of truth. Do NOT hardcode the version anywhere else.

If the file is missing, unreadable, or `CLAUDE_PLUGIN_ROOT` is unset/pointing at a broken or partial install, do not guess or fall back to a hardcoded version — report plainly that the version could not be determined (naming the path attempted) and stop.

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

### Step 2.5: Compare against `--min <version>` (only when the flag is present)

When `$ARGUMENTS` includes `--min <version>`, after printing the Step 2 output, compare the installed `plugin.json` version against `<version>` using standard semver ordering (major, then minor, then patch) and print one additional line:

| Result | Output |
|--------|--------|
| Installed >= required | `OK — v{installed} >= {required}` |
| Installed < required | `FAIL — installed v{installed} is below the required {required}` |

If `<version>` itself isn't a valid semver string, report that plainly (`--min expects a semver value, got "{value}"`) instead of attempting a comparison.

That's the entire skill — no decisions, no findings, no follow-up gates.

## Next Actions

Call `AskUserQuestion` with `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`, and:

- Option 1 — `label`: `"Pipeline status (Recommended)"`, `description`: `"/claude-tweaks:help — full pipeline status and command reference"`
- Option 2 — `label`: `"Release notes"`, `description`: `"CHANGELOG.md — release history for this and prior versions (this repo has no GitHub Releases page)"`

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Hardcoding the version in skill content | The version lives in `plugin.json` — anything else drifts. Always read from the source. |
| Adding decision prompts or finding gates | This is a one-shot read. Don't over-structure it. |
| Bumping the version inside this skill | Versioning is the maintainer's job — see CLAUDE.md "Versioning" section. |
| Padding the output with announcements like "Here's the version!" | The user asked for the version. Print it and stop. |
