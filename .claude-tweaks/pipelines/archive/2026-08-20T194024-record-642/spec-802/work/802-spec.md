---
record: 802
origin: human
risk: low
size: medium
ceremony: standard
grants: [build, merge]
surface: backend
---
# 802: skill Node snippets assume CLAUDE_PLUGIN_ROOT is exported to Bash

Surface: backend

## Current State

A Bash-launched Node script following a skill-prose snippet died with "Cannot find module 'undefined/bin/lib/issues/record.js'": `CLAUDE_PLUGIN_ROOT` is substituted in hook/skill command strings by the harness, but that substitution does not extend to variables exported for use by an interactive Bash session — the documented `require(process.env.CLAUDE_PLUGIN_ROOT+...)` pattern fails there because `process.env.CLAUDE_PLUGIN_ROOT` is unset in that context.

## Deliverables

- State the canonical root resolution for Bash-launched scripts (the resolved skill base dir, or the repo/worktree copy) wherever skill prose ships a plugin-module-requiring snippet.

## Acceptance Criteria

- [ ] Every skill-prose snippet that `require()`s a plugin module via `process.env.CLAUDE_PLUGIN_ROOT` either states the correct root-resolution convention for a Bash-launched (non-hook) context, or is corrected to use it directly.
- [ ] A skill-prose conformance test (per this repo's `skill-prose-conformance-tests` convention) pins that new snippets follow the corrected pattern.
- [ ] `npm test` passes.

## Technical Approach

Grep skill prose for `process.env.CLAUDE_PLUGIN_ROOT` usage inside snippets meant to be Bash-launched interactively (as opposed to hook/skill command strings where the harness's own substitution applies), and correct or annotate each with the resolution that actually works in that context — likely the skill's own resolved base directory (as printed in "Base directory for this skill" at invocation time) or a repo-relative fallback. Related: #761.

### Key Files

- skill prose files (`plugin/skills/**/*.md`) containing Bash-launched `require(process.env.CLAUDE_PLUGIN_ROOT+...)` snippets
- a conformance test under `tests/` pinning the corrected pattern

## Gotchas

- The harness's substitution of `CLAUDE_PLUGIN_ROOT` into hook/skill command strings is a separate mechanism from an interactive Bash session's environment — don't conflate "the substitution didn't happen" with "the variable doesn't exist"; it exists in one context and not the other, and the fix must state that distinction rather than paper over it.
- Related to #761 — check its scope before starting to avoid overlapping fixes.

## Original request

skill Node snippets assume CLAUDE_PLUGIN_ROOT is exported to Bash

**Related:** #761

Context: /feedback session evaluation (2026-08-17) — a Bash-launched Node script following skill-prose snippets died with "Cannot find module 'undefined/bin/lib/issues/record.js'": CLAUDE_PLUGIN_ROOT is substituted in hook/skill command strings but not exported to interactive Bash, so the documented require(process.env.CLAUDE_PLUGIN_ROOT+...) pattern fails there.

Scope: state the canonical root resolution for Bash-launched scripts (resolved skill base dir, or the repo/worktree copy) wherever skill prose ships a plugin-module-requiring snippet.
