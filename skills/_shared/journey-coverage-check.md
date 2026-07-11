# Journey Coverage Check

Shared procedure for computing coverage between journey files (`docs/journeys/*.md`) and story YAML files — used inline by `/claude-tweaks:review`'s `3g-cov` lens (informational, runs whenever `/review` runs and both journeys and stories exist) and periodically by `/claude-tweaks:journey-health`'s decoupled coverage scan. Both consumers apply the same computation below; each formats its own output per its own workflow.

> **Parallel execution:** Use parallel tool calls aggressively — all Read operations on journey files and story YAML files are independent and should run concurrently.

**Skip this procedure when** no journey files exist in `docs/journeys/` or no story YAML files exist in the stories directory.

## Computation

1. Read all journey files from `docs/journeys/*.md`. Parse each for: journey name, step URLs, `files:` frontmatter.
2. Read all story YAML files from `stories/*.yaml` (or the configured stories directory). Collect the `journey:` field from each story.
3. Cross-reference:
   - For each journey, find stories with `journey: {journey-name}`. Count stories and check which journey step URLs are covered.
   - Identify **orphaned stories** — stories with no `journey:` field, or whose `journey:` value references a non-existent journey file.
   - For orphaned stories, check their URL against journey step URLs to suggest potential links.

## Output

Produces three result sets a caller formats into its own output shape:
- **Uncovered journey steps** — one entry per journey with any gap: the journey name and its uncovered step numbers.
- **Orphaned stories with a URL match** — the story id, its file, and the journey it likely belongs to.
- **Orphaned stories with no match** — informational count only (negative stories or standalone flows; not a finding).
