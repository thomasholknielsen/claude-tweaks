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

For skill-worthy patterns: if yes, **be prescriptive** — name the target skill and section for an update, or a proposed name and one-line scope for a new skill. Vague "this might be skill-worthy" notes don't survive `/wrap-up`'s analysis; a named target does. Use the phase from Step 4's routing table (`review/hindsight` when invoked by /review, `wrap-up` when invoked by /wrap-up, `reflect` when standalone). Tag the entry body with `[skill: existing-skill-name]` for findings that target a specific skill, or `[skill: NEW - {suggested-name}]` for patterns that don't fit any existing skill (hyphen, not em-dash, for tooling friendliness). `/wrap-up` Step 7 picks these up by scanning ledger entry bodies for the `[skill: …]` tag — phase doesn't have to be `*/skill` for the entry to be skill-routed.

## Step 3: Route Findings — Hindsight Mode

### Auto mode (policy-driven routing)

Auto-mode routing is shared across both modes — see the auto-routing table in SKILL.md Step 3. Every auto-resolution writes an entry per `_shared/auto-decision-log.md` (the canonical entry schema lives there).

### Interactive mode (batch user routing)

Present all findings as a batch:

```
### Implementation Hindsight

| # | Finding | Recommended |
|---|---------|-------------|
| 1 | {description} | Change now |
| 2 | {description} | Change now |
| 3 | {description} | Defer — bigger scope, not relevant now |
| 4 | {description} | Capture to INBOX — needs exploration |

1. Apply all recommendations **(Recommended)**
2. Override specific items (tell me which #s to change)
```

**Recommendation rules:**
- **Change now** — the strong default. If the improvement is clear, make the change. Most hindsight findings are small enough to fix in a few minutes.
- **Defer** (DEFERRED.md) — the improvement is understood but it's bigger and not relevant to the current work. Include origin, files, trigger.
- **Capture to INBOX** — the finding is complex or uncertain and needs brainstorming/exploration before it can be acted on.
- **Accept as-is** — only when the current approach is genuinely better, or the finding is a false positive. Not a valid option for genuine improvements.

If any findings are **"Change now"**, make the changes, then re-run `/claude-tweaks:test` (or verification if standalone) and resume.

If no findings, state "No changes needed — approach is sound" and proceed.
