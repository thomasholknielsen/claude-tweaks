# Full Mode

Knowledge-capture procedures for full mode (invoked by `/claude-tweaks:wrap-up` Phase 1, or standalone with no mode keyword).

Full mode is a superset of hindsight — see `hindsight-mode.md` for the shared baseline (the Approach lens below covers the same five evaluations).

## Step 2: Run Lenses — Full Mode (4 lenses + tradeoff review)

Runs all four reflection lenses plus a tradeoff review.

| Lens | Question | Surfaces |
|------|----------|----------|
| **1. Surprises** | "What surprised us?" — Unexpected constraints, library behavior, shape changes | Don'ts, skill updates |
| **2. Approach** | "What would we do differently?" — Better patterns discovered midway, over/under-engineering. Same evaluations as hindsight mode (Approach, Structure, Consolidation, Convention, Skills) — see `hindsight-mode.md`. | Skill updates, conventions, spec adjustments |
| **3. Near-misses** | "What broke or almost broke?" — Unexpected test failures, type errors, cross-platform ripples | Don'ts, testing patterns, gotchas |
| **4. Fresh start** | "If we started fresh?" — Would we choose the same approach? What would v2 look like? | Architectural alternatives; route via _shared/learning-routing.md |

### Near-misses Chain Walk

Before routing (Step 3), walk each Near-misses finding through `_shared/causal-depth.md`'s why-chain: the near-miss is the input, the chain asks "why was this possible?" up to 3 times, and the resulting `CAUSAL: terminal | systemic` verdict travels with the finding into Step 3's routing — a `systemic` verdict is itself insight-worthy alongside the near-miss it came from, not a separate item.

### Seed from Review Learnings (pipeline context)

When invoked by `/wrap-up`, check the `/claude-tweaks:review` summary for the **Key Learnings** section. Use these as starting points for the four lenses rather than re-deriving from scratch. If the review summary has no Key Learnings section (it may not always be rendered), say so explicitly and fall back to deriving the four lenses from scratch — don't silently skip the seed step with no signal that it was unavailable.

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

**Hard gate.** Check the response you are about to send: does it already contain the `### Reflection Insights` table as literal rendered markdown, with a row for every insight? If not, this is not "the table was presented earlier" or "the user can infer the list from context" — render it now, in this response, before the tool call. `AskUserQuestion` cannot carry the table itself (`docs/skill-authoring.md`'s Multi-item decisions convention), so a response with the tool call but no table above it has shown the user "Apply all" with nothing to apply it to.

**Routing guide.** Classify every insight through the ordered procedure in
`skills/_shared/learning-routing.md` — that file is the single source of truth
for destinations and their precedence. Do not restate its table here.

Two of its outcomes are newer than this skill's previous behavior and deserve
naming explicitly:

- **D4 (memory)** — the insight is about the user, or is an environment fact
  with no owning artifact. Written per the contract's memory write procedure,
  staged for approval, never auto-applied. **Approving this insights batch
  (even "Apply all") only approves routing the insight to D4 — it is not
  approval to write the memory file.** The write always waits for its own
  separate, per-item approval (`wrap-up/memory-curation.md` stages it;
  `wrap-up/review-console.md`'s Memory updates section takes the `M#` decision)
  — never perform the write as part of applying this batch's result.
- **D5 (upstream)** — the insight is about a claude-tweaks skill or contract and
  would hold in any project using the plugin. Routed to
  `/claude-tweaks:feedback`.

The contract is first-match-wins: one insight yields one destination. An insight
that genuinely serves two audiences is two insights, stated separately.

**Writing a Don't: narrative first, then compress.** When an insight routes to CLAUDE.md's Don'ts, write the incident account *first* — the specific build, how it was caught, what it cost — wherever this project keeps that evidence (an incident log if it has one, otherwise the work record or the commit message). Only then compress it to the rule that lands in CLAUDE.md: one sentence of rule, one clause of why. Doing it in this order matters. Write the rule first and you pad it — the incident is vivid, every detail feels load-bearing, and the justification gets smuggled into the always-loaded file a clause at a time. Giving the evidence a home where it is allowed to be long removes the pressure to do that. A Don't that needs three sentences of background to be believed is a compressed rule plus an account that belongs somewhere else, not a long rule.

**Recommendation rules:**
- **Implement now** — the strong default. If an insight leads to a concrete change (update CLAUDE.md, update a skill, add a rule), make the change. A D4 memory outcome is staged via wrap-up's Memory curation row instead of applied inline — **but only when this run will actually reach wrap-up.** Standalone `/claude-tweaks:reflect`'s Next Actions (`reflect/SKILL.md:183`) only *offer* `/claude-tweaks:wrap-up`, they never require it, so a run that ends here leaves a `staged/` file no Review Console will ever open — a lesson with no consumer. When this is a standalone run and the user does not continue to `/claude-tweaks:wrap-up`, present the D4 proposal inline instead, for the same per-item approval, then write it directly per the contract's "Memory write procedure (D4)" on approval — the same resolution `skills/ledger/resolve-gate.md` applies to a standalone ledger item ("no Review Console will ever read a staged file, so create the record directly instead"). Never leave a D4 proposal staged with no consumer.
- **Defer** (new work record, `parked`) — the insight leads to a known improvement but it's bigger and not relevant to the current work. Compose the body with a `Trigger:` line, origin, context, then create it directly via the unified record contract (`_shared/work-record.md`) — `gh issue create` (`work-backend: github-issues`) or `local-store.js`'s `writeRecord` (`work-backend: local-files`).
- **Capture** — the insight is complex or uncertain and needs brainstorming/exploration before it can be acted on. Routes to `/claude-tweaks:capture`, which files it as a fresh backlog work record.
- **Don't capture** — only for insights that are genuinely not actionable (one-off observations, context-specific facts, things already documented elsewhere). Must state why.

If any insight is "Implement now", handle it after the user approves the batch table, before returning control to the parent or presenting Next Actions — **except a D4 outcome**, whose write is gated separately as described above; do not write a memory file at this point.

> **Always present the batch table in interactive mode**, even when every insight routes to "Implement now." Interactive mode means *ask the user* — the confirmation is the contract, not a formality. Skipping it (because the routing looks uniform or obvious) would be contract drift: auto-apply behavior belongs in auto mode, governed by the `Reflect insight routing` row of `_shared/auto-mode-contract.md`'s silences table.
