# Journey Self-Review Criteria

Shared checklist for judging whether a journey file (`docs/journeys/{name}.md`) still holds together — used at *write time* by `/claude-tweaks:journeys` Step 3.5 (right after creating or updating a journey), at *audit time* by `/claude-tweaks:journey-health`'s light tier (periodically, for journeys nobody has touched recently), and at *wrap-up time* by `/claude-tweaks:wrap-up`'s Journeys curation row (`journey-curation.md`, for journeys the just-completed work's diff touches). All three consumers apply the same four checks; each layers its own response mechanism on top, documented in that consumer's own workflow.

## The four checks

1. **Persona check** — is the persona named and consistent across steps? "User" is a placeholder; replace with the actual role (`new visitor`, `paid subscriber`, `admin`).
2. **Step shape** — does each step have an action, a result, and either a page URL or a verbatim UI signal? Steps that just describe the page ("On the dashboard...") with no action don't belong.
3. **Origin coverage** — every `files:` entry should be reachable through the documented steps. If a changed file isn't visited by any step, either add the missing step or drop the file from `files:`.
4. **Outcome clarity** — what does success look like for this journey? If the journey ends in ambiguity ("user is logged in" without where they land), tighten it.

## Structural validity (checked first, all three consumers)

A journey file is structurally invalid when it's missing required frontmatter, missing the `## Steps` heading, or has no steps at all. All three consumers treat this as a harder failure than the four content checks above, escalating it more strongly than an ordinary check violation — see each consumer's own workflow for its exact response.
