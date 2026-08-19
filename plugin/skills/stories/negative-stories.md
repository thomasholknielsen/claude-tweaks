# Stories — Negative Story Generation (Step 3)

Loaded by `/claude-tweaks:stories` Step 3 **only when** `NEGATIVE=true` (the default). When `negative=false` was passed — or the Target Environment Guard (SKILL.md Step 2) disabled negatives for this run — SKILL.md skips this file entirely.

## Per-page generation rules

For each page discovered during exploration that has interactive elements, generate failure-path stories:

**Form validation negatives** (for pages with forms):
- Submit every discovered form with all required fields empty.
- Enter injection test strings into text inputs: `<script>alert(1)</script>`, `'; DROP TABLE users; --`, `" onmouseover="alert(1)"`.
- Enter extremely long strings (500+ characters) into text fields.
- Submit forms with invalid formats (e.g. `notanemail` in email fields, `abc` in numeric fields).

**Navigation negatives:**
- Navigate to non-existent URLs derived from the site's URL pattern (e.g. `{URL}/this-page-does-not-exist-404`).
- Verify the site shows a proper 404 or error page, not a blank screen or crash.

**Interaction negatives:**
- Click disabled buttons (if any were discovered) and verify nothing changes.
- Attempt to interact with elements behind modals or overlays.

**Auth negatives** (if auth-gated pages were discovered):
- Access auth-required URLs without being logged in.
- Verify redirect to login or an appropriate access-denied message.

**Search negatives** (if search functionality exists):
- Search with empty query.
- Search with special characters and injection strings.
- Search with extremely long query strings.

## Conventions

- IDs prefixed with `neg-` (e.g. `neg-empty-form-submit`, `neg-404-handling`, `neg-search-injection`).
- Tagged with `negative` in addition to other relevant tags (e.g. `[negative, form]`, `[negative, error-handling]`).
- Priority: `medium` by default. Security-related negatives (injection, XSS) get `priority: high`.
- Verify assertions describe the EXPECTED graceful behavior (error message shown, form not submitted, redirect occurs, page doesn't crash).
- If no negative scenarios are applicable for a page (purely static, no forms, no auth), skip negative generation for that page.

## Target-environment constraint

Negative stories submit injection payloads and walk failure paths against a real running app. They are only generated when the Target Environment Guard (SKILL.md Step 2) resolved to a local target, or the user explicitly acknowledged a non-local one — never silently against a shared or remote environment. The acknowledgment is recorded in the written file's `target_env` block; `/test qa` re-checks it at execution time.
