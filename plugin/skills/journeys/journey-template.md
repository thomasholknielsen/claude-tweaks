# Journey File Template

Loaded by `/claude-tweaks:journeys` Step 2 when creating a new journey file. Lazy-loaded — read this only when actually writing a new journey; existing journey edits (Step 3) work against the file's existing structure.

## File location

`docs/journeys/{journey-name}.md` — kebab-case, descriptive of the user goal.

## Template

The literal journey template lives in `skills/_shared/diataxis-genre-templates.md`'s Journey section — read that file for the current skeleton (including the `files:` frontmatter field referenced in Key Principles below). This file owns the file-location convention and key principles; the template body is shared with `/claude-tweaks:init`'s missing-doc scaffolding and `/claude-tweaks:wrap-up`'s missing-doc detection, so it lives in one place rather than three.

## Key Principles

- **"Should feel" is the most important field.** It's what visual review tests against. Be specific — "low commitment" not "good."
- **`files:` enables regression detection.** List the key source files that implement this journey's functionality — components, API routes, pages, services. `/review` uses this to detect when a future build changes files that an existing journey depends on. Don't list every file — just the ones whose changes would affect the journey's behavior.
- **One journey per goal**, not per feature. A journey may span features from multiple specs.
- **Include the entry point and success state.** These bookend the journey and define what "complete" means.
- **Personas are specific people**, not roles. "Developer who just joined the team and is setting up for the first time" not "developer."
- **Record a persona handoff in the step's Action text.** The template has one top-level `**Persona:**` field, not a per-step persona field — when a journey crosses to a second actor mid-flow (e.g. shopper → support agent), name that actor explicitly at the start of the step's Action ("**Support agent** escalates the ticket to billing") rather than leaving the handoff implicit. This is what Step 3.6's `multi-persona` diagram signal scans for — an unnamed handoff won't be detected.
