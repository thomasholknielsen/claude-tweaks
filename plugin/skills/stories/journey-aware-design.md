# Stories — Journey-Aware Story Design (Step 3)

Loaded by `/claude-tweaks:stories` Step 3 **only when** JOURNEY_MAP is non-empty (Step 1.1 found journeys). When no journeys exist, SKILL.md skips this file entirely.

Use journey data to inform story design for pages with journey context:

**a. Map journey steps to stories.** Each journey becomes a candidate for one or more stories. Prefer creating one story per journey that walks the full flow (entry point → success state) rather than one story per step — journeys are meant to be walked end-to-end. For journeys with many steps (6+), split into logical segments (e.g., "signup flow" and "first-project flow" from a longer onboarding journey).

**b. Set the `journey:` field.** Stories derived from a journey MUST include `journey: {journey-name}` in the YAML output. This field references `docs/journeys/{journey-name}.md` and enables coverage tracking and filtered test execution.

**c. Inherit source files.** When a story has `journey:` set, its `source_files` starts with the journey's `files:` frontmatter array, extended by component-level files from source analysis (Step 1.5) and URL-to-Source-File Mapping (Step 2). De-duplicate the merged list.

**d. Use journey step descriptions for assertions.** Transform journey step expectations into concrete verify assertions:
- `should_feel: "fast and effortless"` → verify assertions about page responsiveness, absence of loading spinners after action, minimal click count
- `should_understand: "their profile is saved"` → verify assertions for success feedback (toast, status message, redirect to expected page)
- `red_flags: "form clears on error"` → verify that form state is preserved after validation error

**e. Preserve journey step ordering.** Story steps should follow the journey step order. If a journey has steps 1 through N, the generated story should walk them in that sequence.

**f. Still generate negative stories.** Journey-aware pages still get negative story generation (when NEGATIVE=true). The journey's `red_flags` field provides additional negative scenarios beyond the standard form validation / 404 / auth negatives.

**When a page has NO journey context** (its URL does not appear in JOURNEY_URL_INDEX), generate stories from DOM exploration + source analysis only — the same behavior as before journey integration.
