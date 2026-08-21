# Step 5: Multi-Persona Red-Team — Dispatch Prompt

Loaded by `/specify` Step 5 at dispatch time. The Template A block below is inlined verbatim into each agent's prompt (per the Subagent Contract — agents only see what's in their prompt; references to sibling files don't reach them). Dispatched once per sub-issue record — never for the parent, which is never built directly.

## Parallel dispatch

**Persona selection by tier** (`ceremony:*` label, stamped on the sub-issue in Step 3 — rationale
was `docs/superpowers/specs/2026-07-20-lifecycle-ceremony-tiering-design.md`, deleted `70849915`): `ceremony:fast-lane` →
dispatch **Skeptical Reviewer only**; `ceremony:standard` (or a sub-issue with no `ceremony:*` label at
all — treat as `standard`, the conservative default) → dispatch all **three** personas below,
unchanged from before.

> **Parallel execution:** Dispatch the selected persona(s) as parallel Task agents (a single agent
> for `fast-lane`, three for `standard`) — each runs independently and returns Template-A findings
> narrowed to ambiguities, gaps, and unstated assumptions. Assemble results after all agents
> complete.
>
> **Contract:** Each agent follows the Subagent Contract — minimal input (a record reference + persona lens question + Template A), one of `DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED` as its first reply line. `[Use: Standard]` (resolve via `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-profile.js" standard`, contract § Model Selection). Read-only — personas never modify the record themselves.
>
> **Persona prompts (inline literally per agent — Mode 3 from `skills/_shared/multi-agent-coordination.md`):**
>
> ```
> Task scope: Read the sub-issue record below as {Implementer | Maintainer | Skeptical Reviewer}, then answer the lens question. Fetch it first — `work-backend: github-issues`: run `gh issue view {subIssueNum} --json body -q .body`; `work-backend: local-files`: Read `{recordPath}` directly. Exactly one applies per dispatch — never pass both a record number and a file path to the same agent.
> Lens question: {persona's lens question — verbatim from the table below}
> Skeptical Reviewer addendum: if your persona above is Skeptical Reviewer and the record body contains a `Blocked by #N: {assumption}` line, additionally judge that trailing assumption text against this narrower check — does it assert a structural fact (a function, symbol, API, file, or exported artifact existing on #N) or a prose/documentation-shape claim (a specific string, wording, or a prediction about what #N's own `## Non-Goals` will or won't scope out)? A prose-shape assumption is fragile — #N's own later scoping decision can legitimately drop that exact wording while still shipping the capability — and must be surfaced as an unstated-assumption finding at that line's location, through the same findings table below. A structural assumption is not a finding under this check. Skip this addendum entirely when your persona above is Implementer or Maintainer, or when the record carries no `Blocked by #N: {assumption}` line.
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
> Return at most 15 rows, highest severity first; if more were found, append a final row reading "+N more" with the count in place of N — never omit this row when findings exceed the cap.
> Do not add narration, headers, or summaries before or after the table.
>
> [Use: Standard] — resolve via `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-profile.js" standard` (contract § Model Selection).
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

**Synthesis path (record #220).** When this run is interactive and `node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-profile.js" frontier --run-dir "$PIPELINE_RUN_DIR"` (`_shared/subagent-output-contract.md`'s Model Selection dispatch procedure) returns `frontier`, dispatch the write-back below as **one** `[Use: Frontier]` singleton Task agent — the main thread hands it every persona's raw findings plus the current record body — and, when this decomposition followed a brainstorm in the same session, the brainstorm's decision summary (the design doc's rationale section, or the parent record's `## Decision Rationale` once Step 4 wrote it), since findings that turn on a design decision the record has not yet absorbed cannot be resolved from the record alone — and the agent returns the fully recomposed body (the same shape steps 1-3 below produce by hand). Any other resolution (non-interactive, stance below `default`, cap exhausted, or a plain non-interactive run with no run directory) means the resolver returns `capable` or degrades — **in that case the write-back stays exactly as documented below, run in the main thread, with no dispatch of any kind.** There is no Capable dispatch of this step; the degraded state is today's existing main-thread behavior, unchanged.

After all dispatched personas return (and, when the synthesis path above did not trigger, in the main thread itself), write findings back into the record body:

1. **Precise-location findings** (persona named a specific sentence, quoted text, or line range) → insert `<!-- ambiguity: {persona} — {finding text}{; suggested: {resolution}} -->` immediately after the flagged sentence. On the same line if short; on the next line if long.
2. **General findings** (no precise location) → accumulate into an `## Open Questions` table appended to the record, with columns `Persona | Finding | Suggested Resolution`. When this batch is empty, omit the section entirely — do not emit an empty header.
3. **Compose-then-write-once** — fold every finding for a given sub-issue into one recomposed body, then write it with a single `gh issue edit {subIssueNum} --body-file` (github-issues) or `writeRecord` call (local-files) — the same discipline every other write in this skill uses. Never make one API call per finding.
4. **Decision-log entry per finding:**
   ```
   STAGED {HH:MM:SS} — Red-team: persona "{persona}" flagged {ambiguity|gap|unstated assumption} at {location}. Written to record as {<!-- ambiguity: --> marker | ## Open Questions row}.
   ```
   Write each entry **after** the record body is updated — if the write-back fails, the decision-log should not lie about what happened.

Red-team runs on every generated sub-issue record regardless of `Surface:` — the lens questions are artefact-agnostic. The user (or Step 6 Self-Review) decides what to do with each finding. There is no mid-flow stop here. Persona count varies by tier (see above); the write-back procedure itself is identical regardless of how many personas ran.
