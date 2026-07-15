# Full Mode

Knowledge-capture procedures for full mode (invoked by `/claude-tweaks:wrap-up` Step 3, or standalone with no mode keyword).

Full mode is a superset of hindsight — see `hindsight-mode.md` for the shared baseline (the Approach lens below covers the same five evaluations).

## Step 2: Run Lenses — Full Mode (4 lenses + tradeoff review)

Runs all four reflection lenses plus a tradeoff review.

| Lens | Question | Surfaces |
|------|----------|----------|
| **1. Surprises** | "What surprised us?" — Unexpected constraints, library behavior, shape changes | Don'ts, skill updates |
| **2. Approach** | "What would we do differently?" — Better patterns discovered midway, over/under-engineering. Same evaluations as hindsight mode (Approach, Structure, Consolidation, Convention, Skills) — see `hindsight-mode.md`. | Skill updates, conventions, spec adjustments |
| **3. Near-misses** | "What broke or almost broke?" — Unexpected test failures, type errors, cross-platform ripples | Don'ts, testing patterns, gotchas |
| **4. Fresh start** | "If we started fresh?" — Would we choose the same approach? What would v2 look like? | Architectural alternatives, memory files |

### Seed from Review Learnings (pipeline context)

When invoked by `/wrap-up`, check the `/claude-tweaks:review` summary for the **Key Learnings** section. Use these as starting points for the four lenses rather than re-deriving from scratch.

### Tradeoff Review

Check the `/claude-tweaks:review` summary for the **Tradeoffs Accepted** section. For each accepted tradeoff, assess whether it represents:

- A **project-wide pattern** worth documenting (e.g., "we always choose X over Y because Z") -> route to CLAUDE.md or a skill
- A **one-off decision** specific to this work -> no action needed
- A **known limitation** others should be aware of -> route to Don'ts or memory

## Step 3: Route Findings — Full Mode

### Auto mode (policy-driven routing)

Auto-mode routing is shared across every mode — see the auto-routing table in SKILL.md Step 3. Every auto-resolution writes an entry per `_shared/auto-decision-log.md` (the canonical entry schema lives there).

### Interactive mode (batch user routing)

Collect all insights from the four lenses and the tradeoff review into a single table:

```
### Reflection Insights

| # | Insight | Recommended Destination |
|---|---------|------------------------|
| 1 | {description} | Implement now -> CLAUDE.md Don'ts |
| 2 | {description} | Implement now -> Skill: {name} |
| 3 | {description} | Defer — bigger, not relevant now |
| 4 | {description} | Capture — needs brainstorming |
```

The table renders as markdown, as above. Immediately below it, call `AskUserQuestion` with:

- `question`: `"How do you want to handle these insights?"`, `header`: `"Insights"`, `multiSelect`: `false`
- Option 1 — `label`: `"Apply all (Recommended)"`, `description`: `"Apply all recommendations"`
- Option 2 — `label`: `"Override specific items"`, `description`: `"tell me which #s to change"`

**Routing guide:**

| Finding Type | Suggested Destination |
|-------------|-----------|
| "Never do X because Y" (X exists in codebase) | CLAUDE.md Don'ts |
| "When building Z, always do W" | Existing skill update |
| "This reusable pattern emerged" | New skill candidate |
| "Remaining specs should use X instead" | Spec amendments |
| "A fundamentally better approach exists" | Skill update + Memory file |
| "We chose X over Y because Z" (from review tradeoffs) | CLAUDE.md Convention or Memory file (if it's a recurring decision) |
| "We should add X" (X doesn't exist yet) | Backlog work record — improvement work, not a convention |

**Recommendation rules:**
- **Implement now** — the strong default. If an insight leads to a concrete change (update CLAUDE.md, update a skill, add a rule, update memory), make the change.
- **Defer** (new work record, `parked`) — the insight leads to a known improvement but it's bigger and not relevant to the current work. Compose the body with a `Trigger:` line, origin, context, then create it directly via the unified record contract (`_shared/work-record.md`) — `gh issue create` (`work-backend: github-issues`) or `local-store.js`'s `writeRecord` (`work-backend: local-files`).
- **Capture** — the insight is complex or uncertain and needs brainstorming/exploration before it can be acted on. Routes to `/claude-tweaks:capture`, which files it as a fresh backlog work record.
- **Don't capture** — only for insights that are genuinely not actionable (one-off observations, context-specific facts, things already documented elsewhere). Must state why.

If any insight is "Implement now", handle it after the user approves the batch table, before returning control to the parent or presenting Next Actions.

> **Always present the batch table in interactive mode**, even when every insight routes to "Implement now." Interactive mode means *ask the user* — the confirmation is the contract, not a formality. Skipping it (because the routing looks uniform or obvious) would be contract drift: auto-apply behavior belongs in auto mode, governed by the `Reflect insight routing` row of `_shared/auto-mode-contract.md`'s silences table.
