# Journey Self-Review Criteria

Shared checklist for judging whether a journey file (`docs/journeys/{name}.md`) still holds together — used at *write time* by `/claude-tweaks:journeys` Step 3.5 (right after creating or updating a journey) and at *audit time* by `/claude-tweaks:journey-health`'s light tier (periodically, for journeys nobody has touched recently). Both consumers apply the same four checks; each layers its own response on top (`/journeys` fixes inline or stages/blocks; `journey-health` files a GitHub issue).

## The four checks

1. **Persona check** — is the persona named and consistent across steps? "User" is a placeholder; replace with the actual role (`new visitor`, `paid subscriber`, `admin`).
2. **Step shape** — does each step have an action, a result, and either a page URL or a verbatim UI signal? Steps that just describe the page ("On the dashboard...") with no action don't belong.
3. **Origin coverage** — every `files:` entry should be reachable through the documented steps. If a changed file isn't visited by any step, either add the missing step or drop the file from `files:`.
4. **Outcome clarity** — what does success look like for this journey? If the journey ends in ambiguity ("user is logged in" without where they land), tighten it.

## Structural validity (checked first, both consumers)

A journey file is structurally invalid when it's missing required frontmatter, missing the `## Steps` heading, or has no steps at all. Both consumers treat this as a harder failure than the four content checks above — `/journeys` BLOCKs on it (Step 3.5); `journey-health` files it as a `category: drift, section: self-review` finding with `confidence: high` regardless of anything else.
