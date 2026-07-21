# Hindsight Mode

Action-gate procedures for hindsight mode (invoked by `/claude-tweaks:review` Step 4, or standalone with the `hindsight` keyword).

## Step 2: Run Lenses — Hindsight Mode (5 evaluations)

This is an **action gate** — findings lead to changes, not just observations.

> **"Given everything we've found, should we change something before shipping this?"**

| # | Evaluation | Question |
|---|-----------|----------|
| 1 | **Approach correctness** | Did we solve the right problem, or optimize for the wrong thing? |
| 2 | **Structural debt** | Did we introduce patterns we'll regret? Premature abstractions, wrong boundaries? |
| 3 | **Missing consolidation** | Opportunities to merge, deduplicate, or simplify that are obvious now? |
| 4 | **Convention drift** | Did we accidentally diverge from established project patterns? |
| 5 | **Skill-worthy patterns** | Did the work establish or extend a reusable pattern that should be documented in a project skill? |

For **structural debt** (evaluation 2): when the debt is module-level — a shallow abstraction, a leaky interface, a pass-through wrapper, or a wrong boundary that a depth refactor would address — recommend `/claude-tweaks:deepen` as the follow-up rather than trying to resolve module restructuring inline. Line-level cleanup still routes to `/claude-tweaks:simplify`; reserve the /deepen recommendation for genuine interface/depth issues.

For skill-worthy patterns: if yes, **be prescriptive** — name the target skill and section for an update, or a proposed name and one-line scope for a new skill. Vague "this might be skill-worthy" notes don't survive `/wrap-up`'s analysis; a named target does. Use the phase from Step 4's routing table (`review/hindsight` when invoked by /review, `wrap-up` when invoked by /wrap-up, `reflect` when standalone). Tag the entry body with `[skill: existing-skill-name]` for findings that target a specific skill, or `[skill: NEW - {suggested-name}]` for patterns that don't fit any existing skill (hyphen, not em-dash, for tooling friendliness). `/wrap-up` Step 7 picks these up by scanning ledger entry bodies for the `[skill: …]` tag — phase doesn't have to be `*/skill` for the entry to be skill-routed.

## Step 3: Route Findings — Hindsight Mode

### Auto mode (policy-driven routing)

Auto-mode routing is shared across every mode — see the auto-routing table in SKILL.md Step 3. Every auto-resolution writes an entry per `_shared/auto-decision-log.md` (the canonical entry schema lives there).

### Interactive mode (batch user routing)

Present all findings as a batch:

```
### Implementation Hindsight

| # | Finding | Recommended |
|---|---------|-------------|
| 1 | {description} | Change now |
| 2 | {description} | Change now |
| 3 | {description} | Defer — bigger scope, not relevant now |
| 4 | {description} | Capture — needs exploration |
```

The table renders as markdown, as above. Same `AskUserQuestion` mechanics as full mode (see `full-mode.md`'s Interactive mode section) — substitute "findings" for "insights" in the question text and header (`question`: `"How do you want to handle these findings?"`, `header`: `"Findings"`); the two options are identical.

**Recommendation rules:**
- **Change now** — the strong default. If the improvement is clear, make the change. Most hindsight findings are small enough to fix in a few minutes.
- **Defer** (new work record, `parked`) — the improvement is understood but it's bigger and not relevant to the current work. Compose the body with a `Trigger:` line, origin, and files, then create it directly via the unified record contract (`_shared/work-record.md`) — `gh issue create` (`work-backend: github-issues`) or `local-store.js`'s `writeRecord` (`work-backend: local-files`).
- **Capture** — the finding is complex or uncertain and needs brainstorming/exploration before it can be acted on. Routes to `/claude-tweaks:capture`, which files it as a fresh backlog work record.
- **Accept as-is** — only when the current approach is genuinely better, or the finding is a false positive. Not a valid option for genuine improvements.

If any findings are **"Change now"**, make the changes, then re-run `/claude-tweaks:test` (or verification if standalone) and resume.

If no findings, state "No changes needed — approach is sound" and proceed.
