# Journey Coverage Report

Detailed report template and decision flow for Step 6 of `/claude-tweaks:stories` when JOURNEY_MAP is non-empty. This file is lazy-loaded — only read it when journey files exist and you need to produce coverage analysis, list orphaned stories, or apply journey-link suggestions.

## Journey Coverage Table

Present the journey-to-story coverage analysis:

```
### Journey Coverage

| Journey | Persona | Stories | Steps Covered | Status |
|---------|---------|---------|---------------|--------|
| {name} | {persona} | {N} | {covered}/{total} | Full / Partial / No stories |
```

Status values:
- **Full** — every journey step URL has at least one story covering it
- **Partial** — some steps are covered; list uncovered step numbers
- **No stories** — no stories reference this journey

## Orphaned Stories

List all stories that have no `journey:` field:

```
### Orphaned Stories

| Story ID | File | URL | Suggested Journey |
|----------|------|-----|-------------------|
| {id} | {yaml file} | {url} | {journey name} / -- (negative, no journey needed) / {name} (create new) |
```

Suggested-journey rules:

- For **negative stories** (IDs starting with `neg-`), suggest "-- (negative, no journey needed)" unless the negative story tests a specific journey's red flag.
- For **non-negative orphans whose URL matches a journey step URL**, suggest the matching journey name.
- For **orphans with no URL match**, suggest "(create new)" if the flow is substantial enough to warrant a journey file.

## Journey Link Suggestions (update mode only)

If JOURNEY_LINK_SUGGESTIONS is non-empty (from Step 1.1):

**Auto mode:** auto-apply all suggestions (mechanical URL-to-journey mapping). The journey field is reversible (a single-line YAML field). Log:

```
AUTO {time} — Step 6: applied {N} journey link suggestions to existing stories. Files: {list}.
```

**Interactive mode:** present as a separate batch decision (in a separate message from the coverage table — one decision per message):

```
### Suggested Journey Links

Existing stories without a `journey:` field that match journey step URLs:

| # | Story ID | File | URL | Suggested Journey | Action |
|---|----------|------|-----|-------------------|--------|
| 1 | {id} | {file} | {url} | {journey} | Add `journey: {name}` |
```

The table renders as markdown, as above. Immediately below it, call `AskUserQuestion` with:

- `question`: `"How do you want to handle these journey link suggestions?"`, `header`: `"Journey links"`, `multiSelect`: `false`
- Option 1 — `label`: `"Apply all (Recommended)"`, `description`: `"Add the suggested journey: field to every listed story"`
- Option 2 — `label`: `"Override specific items"`, `description`: `"Tell me which #s to skip"`
- Option 3 — `label`: `"Skip all"`, `description`: `"I'll link journeys manually"`
