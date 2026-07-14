# Step 5: Multi-Persona Red-Team — Dispatch Prompt

Loaded by `/specify` Step 5 at dispatch time. The Template A block below is inlined verbatim into each agent's prompt (per the Subagent Contract — agents only see what's in their prompt; references to sibling files don't reach them). Dispatched once per leaf record — never for the parent, which is never built directly.

## Parallel dispatch

> **Parallel execution:** Dispatch the three personas as parallel Task agents — each runs independently and returns Template-A findings narrowed to ambiguities, gaps, and unstated assumptions. Assemble results after all agents complete.
>
> **Contract:** Each agent follows the Subagent Contract — minimal input (a record reference + persona lens question + Template A), one of `DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED` as its first reply line. Tier: **Standard** (Sonnet). Read-only — personas never modify the record themselves.
>
> **Persona prompts (inline literally per agent — Mode 3 from `skills/_shared/multi-agent-coordination.md`):**
>
> ```
> Task scope: Read the leaf record below as {Implementer | Maintainer | Skeptical Reviewer}, then answer the lens question. Fetch it first — `work-backend: github-issues`: run `gh issue view {leafNum} --json body -q .body`; `work-backend: local-files`: Read `{recordPath}` directly. Exactly one applies per dispatch — never pass both a record number and a file path to the same agent.
> Lens question: {persona's lens question — verbatim from the table below}
> Constraint: Surface only ambiguities, gaps, and unstated assumptions. Not stylistic feedback. Not approval/rejection. Focus on the 3-5 most load-bearing items, not exhaustive enumeration. Read-only — do not modify the record.
>
> Status line (required): First line of your reply must be one of: DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED.
>
> OUTPUT FORMAT (required):
> Return ONLY a markdown table after the status line, no preamble:
>
> | Severity | Path:Line | Finding | Evidence | Suggested resolution |
> |---|---|---|---|---|
> | medium | body:42 | "store retry state somewhere" leaves the surface undefined | the record mentions retry behavior in 3 places without naming a storage backend | name the table or in-memory structure |
>
> Severity scale: critical / high / medium / low / info
> Path:Line is a line offset within the record body, OR literal "general" if no precise location.
> Suggested resolution is optional — leave the cell empty if the persona has no constructive fix.
> If no findings: return literal text "No findings."
> Do not add narration, headers, or summaries before or after the table.
>
> [Use: Standard model.]
> ```
>
> **The three personas (lens questions verbatim):**
>
> | Persona | Lens question |
> |---|---|
> | Implementer | Could I build exactly what this asks for without asking a question? |
> | Maintainer | In 6 months, can someone changing related code know what they can/can't break? |
> | Skeptical Reviewer | What unstated assumption is doing the load-bearing work here? |

## Write-back procedure

After all three agents return, write findings back into the record body:

1. **Precise-location findings** (persona named a specific sentence, quoted text, or line range) → insert `<!-- ambiguity: {persona} — {finding text}{; suggested: {resolution}} -->` immediately after the flagged sentence. On the same line if short; on the next line if long.
2. **General findings** (no precise location) → accumulate into an `## Open Questions` table appended to the record, with columns `Persona | Finding | Suggested Resolution`. When this batch is empty, omit the section entirely — do not emit an empty header.
3. **Compose-then-write-once** — fold every finding for a given leaf into one recomposed body, then write it with a single `gh issue edit {leafNum} --body-file` (github-issues) or `writeRecord` call (local-files) — the same discipline every other write in this skill uses. Never make one API call per finding.
4. **Decision-log entry per finding:**
   ```
   STAGED {HH:MM:SS} — Red-team: persona "{persona}" flagged {ambiguity|gap|unstated assumption} at {location}. Written to record as {<!-- ambiguity: --> marker | ## Open Questions row}.
   ```
   Write each entry **after** the record body is updated — if the write-back fails, the decision-log should not lie about what happened.

Red-team runs on every generated leaf record regardless of `surface:` — the lens questions are artefact-agnostic. The user (or Step 6 Self-Review) decides what to do with each finding. There is no mid-flow stop here.
