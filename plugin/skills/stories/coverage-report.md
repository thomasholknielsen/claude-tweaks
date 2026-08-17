# Journey Coverage Report

Detailed report template and decision flow for Step 6 of `/claude-tweaks:stories` when JOURNEY_MAP is non-empty. This file is lazy-loaded — only read it when journey files exist and you need to produce coverage analysis, list orphaned stories, or apply journey-link suggestions.

## Computing coverage

Run the computation in `_shared/journey-coverage-check.md` (shared with `/claude-tweaks:review`'s `3g-cov` lens and `/claude-tweaks:journey-health`'s coverage scan; that file also documents the skip condition and parallel-execution note). Format its three result sets into this skill's own output shapes below rather than recomputing coverage or orphan-detection independently.

## Journey Coverage Table

Present the journey-to-story coverage analysis, built from the shared computation's per-journey story counts and uncovered-step results:

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

List the stories the shared computation identified as orphaned (no `journey:` field, or a `journey:` value referencing a non-existent journey file):

```
### Orphaned Stories

| Story ID | File | URL | Suggested Journey |
|----------|------|-----|-------------------|
| {id} | {yaml file} | {url} | {journey name} / -- (negative, no journey needed) / {name} (create new) |
```

Suggested-journey rules — applied on top of the shared computation's "orphaned stories with a URL match" / "orphaned stories with no match" result sets:

- For **negative stories** (IDs starting with `neg-`), suggest "-- (negative, no journey needed)" unless the negative story tests a specific journey's red flag.
- For **non-negative orphans the shared computation matched to a journey step URL**, suggest that matching journey name.
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

**Hard gate.** Check the response you are about to send: does it already contain the `### Suggested Journey Links` table above as literal rendered markdown, with a row for every suggestion? If not, render it now, in this response, before the tool call — "Apply all" with no table above it leaves the user approving an unnamed set of story-to-journey links.
