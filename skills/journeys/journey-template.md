# Journey File Template

Loaded by `/claude-tweaks:journeys` Step 2 when creating a new journey file. Lazy-loaded — read this only when actually writing a new journey; existing journey edits (Step 3) work against the file's existing structure.

## File location

`docs/journeys/{journey-name}.md` — kebab-case, descriptive of the user goal.

## Template

```markdown
---
files:
  - {path/to/key-source-file.ts}
  - {path/to/another-file.ts}
---

# {Journey Name}

**Persona:** {Who is this user? Be specific — not "user" but "first-time visitor with no account" or "developer setting up local environment"}
**Goal:** {What are they trying to accomplish?}
**Entry point:** {Where do they start? URL or trigger}
**Success state:** {What does "done" look like? What should they feel at the end?}

## Steps

### 1. {Step name} — {Page or action}
- **URL:** {path}
- **Action:** {What the user does}
- **Should feel:** {The emotional/experiential quality — "fast and effortless", "guided but not forced", "like an accomplishment"}
- **Should understand:** {What the user should know after this step}
- **Red flags:** {What would make this step fail experientially — not just functionally}

### 2. {Next step}
...

## Origin
- Created during build of {spec number or design doc}
- Steps {N-M} built in this session
- Related specs: {list}
```

## Key Principles

- **"Should feel" is the most important field.** It's what visual review tests against. Be specific — "low commitment" not "good."
- **`files:` enables regression detection.** List the key source files that implement this journey's functionality — components, API routes, pages, services. `/review` uses this to detect when a future build changes files that an existing journey depends on. Don't list every file — just the ones whose changes would affect the journey's behavior.
- **One journey per goal**, not per feature. A journey may span features from multiple specs.
- **Include the entry point and success state.** These bookend the journey and define what "complete" means.
- **Personas are specific people**, not roles. "Developer who just joined the team and is setting up for the first time" not "developer."
