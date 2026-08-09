---
name: demo-skill
description: Fixture agent-instruction file for merge-check eval coverage. Not a real skill.
---

# Demo Skill

A small agent-instruction file used only to plant merge-check calibration diffs — see
`helpers/format.md` for the output formatting convention this skill follows.

## Retry Behavior

If the underlying operation fails, retry at most 2 times before giving up and reporting the
failure to the caller.

## Cache Behavior

Each run's cache is independent per agent — nothing written to it is visible to any other run.
