# Stories — Journey Ingest (Step 1.1)

Loaded by `/claude-tweaks:stories` Step 1.1 **only when** `docs/journeys/*.md` exists. If no journey files are present, SKILL.md skips this step entirely and proceeds to Step 1.5.

Reading journey files bootstraps story design with known flows, personas, and source files. Journey data prevents redundant discovery — pages already documented in journeys are enriched (selectors, assertions) rather than rediscovered from scratch.

> **Parallel execution:** Use parallel tool calls aggressively — all Glob and Read operations across journey files are independent and should run concurrently.

## Discover Journeys

1. Use the Glob tool to find all files matching `docs/journeys/*.md`.
2. If JOURNEY_FILTER is set, filter to only the matching journey file (`docs/journeys/{JOURNEY_FILTER}.md`). If the file does not exist, log: "Journey '{JOURNEY_FILTER}' not found in docs/journeys/. Proceeding with full discovery." and skip the rest of this step.

## Parse Journey Files

For each journey file, read and extract:

- **Journey name:** derived from the filename (e.g., `profile-settings.md` → `profile-settings`)
- **Files:** from the YAML frontmatter `files:` array — the source files implementing this journey
- **Persona:** from the `**Persona:**` field
- **Goal:** from the `**Goal:**` field
- **Entry point:** from the `**Entry point:**` field (URL or trigger)
- **Success state:** from the `**Success state:**` field
- **Steps:** parse each numbered step section to extract:
  - Step name
  - URL (from `**URL:**` field)
  - Action (from `**Action:**` field)
  - "Should feel" (from `**Should feel:**` field)
  - "Should understand" (from `**Should understand:**` field)
  - Red flags (from `**Red flags:**` field)

## Build Journey Map

Assemble findings into a JOURNEY_MAP:

```
JOURNEY_MAP = {
  journey_name: {
    persona: string
    goal: string
    entry_point: string
    success_state: string
    files: string[]
    steps: [{ name, url, action, should_feel, should_understand, red_flags }]
    step_urls: string[]   // all unique URLs extracted from steps
  }
}
```

Also build a JOURNEY_URL_INDEX — a reverse map from URL to journey name(s), so Step 2 can quickly look up whether a visited page belongs to a journey.

Log: "Journey ingest: found {N} journey(s) covering {M} unique URLs."

## Cross-reference with Existing Stories (update mode only)

When update mode is active (Step 1 found existing YAML files):

1. This matching step is the same computation as the shared procedure's "Orphaned stories with a URL match" result set — run it via `_shared/journey-coverage-check.md` rather than re-deriving the URL match here. For each existing story its computation matches (a story without a `journey:` field whose URL matches a journey step URL), add to JOURNEY_LINK_SUGGESTIONS: `{ storyId, storyFile, storyUrl, suggestedJourney }`.
2. These suggestions are resolved in Step 6 (Report) per the auto/interactive flow in `coverage-report.md` — auto mode auto-applies all suggestions (the `journey:` field is a reversible single-line YAML addition); interactive mode presents them as a separate batch decision.
