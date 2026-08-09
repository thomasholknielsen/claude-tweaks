---
name: demo-skill
description: Fixture agent-instruction file for merge-check eval coverage. Not a real skill.
---

# Demo Skill

A small agent-instruction file used only to plant merge-check calibration diffs.

## Formatting

See `helpers/format.md` for the output formatting convention this skill follows. See also
`docs/old-guide.md` for background on why the convention was chosen.

## Retry Behavior

If the underlying operation fails, retry at most 2 times before giving up and reporting the
failure to the caller.

## Consistency Check

Prefer running the consistency check before merging any change to this skill.

## Cache Behavior

Each run's cache is independent per agent — nothing written to it is visible to any other run.
