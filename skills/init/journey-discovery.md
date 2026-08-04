# Init Phase 8: Journey Discovery — the offer and its three options

Loaded by `/claude-tweaks:init` Phase 8 only when this project has user-facing surfaces and Phase 8
is in scope. One lazy-load unit: the `AskUserQuestion` offer plus the procedure behind each of its
three answers.

**Call `AskUserQuestion`:**

- `question`: `"This project has user-facing features but no documented user journeys. User journeys help /review test the app against experiential expectations. Would you like to discover and document journeys?"`, `header`: `"Journey discovery"`, `multiSelect`: `false`
- Option 1 — `label`: `"Codebase-only (Recommended)"`, `description`: `"Scan codebase for routes and user flows, create journey files."`
- Option 2 — `label`: `"Hybrid (codebase + browser)"`, `description`: `"Scan codebase AND walk the app in a browser for richer 'should feel' details."`
- Option 3 — `label`: `"Skip"`, `description`: `"I'll add journeys later."`

### Option 1: Codebase-only discovery

Use Phase 2 findings to identify routes/pages, infer personas (user roles, auth flows, public vs. authenticated), and group routes into goal-oriented journey skeletons. Write skeleton files to `docs/journeys/` (use `journey-template.md` from the `/claude-tweaks:journeys` skill directory) — each one stamped `**Status:** Skeleton — inferred from code, not yet browser-tested`. Skeletons document the intended flows but "should feel" fields are weaker until browser-tested.

**Capture enrichment as backlog work records** for each skeleton journey:

```markdown
### Browser-test journey: {name}
Skeleton journey inferred from code — "should feel" and "red flags" need browser validation.
Routes covered: {list}. Persona: {persona}. Dev URL: {if known}.
Run `/claude-tweaks:review journey:{name}` to enrich with experiential details.
```

### Option 2: Hybrid discovery (codebase + browser)

Delegate to `/claude-tweaks:visual-review discover` — runs the full 6-phase discovery process (codebase scan → journey candidates → browser walkthrough → write files → coverage report → handoff). Ask the user for the dev server URL before invoking.

### Option 3: Skip

Note that the user skipped journey discovery. Suggest running `/claude-tweaks:visual-review discover` later when they're ready.
