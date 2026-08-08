# Step 6 — Configuration Updates (CLAUDE.md, rules, ADRs)

Loaded by `/claude-tweaks:wrap-up` Step 6 when that step's fast-lane pre-check did not fire. Both sub-scans live here. Neither writes anything — each collects findings in the `[type] target — change` format for batch approval at the Step 8.6 Review Console or Step 9's batch table.

> **Parallel execution:** Run both sub-scans (CLAUDE.md/rules, decision records) as parallel tool calls — each checks independent sources and collects findings in the `[type] target — change` format.

### 6.1: CLAUDE.md and Rules

**Classify before collecting.** Run each candidate through `skills/_shared/learning-routing.md` first. Only a **D1** outcome belongs here. A candidate resolving to D4 or D5 is *not* a CLAUDE.md rule — hand it to Step 7.10 or 7.11 and do not collect it, or Step 7.10's "not already routed by Steps 6-7.9" scope will skip it permanently.

CLAUDE.md describes **how to work in this codebase** — patterns to follow, commands to run, conventions to respect, mistakes to avoid. Every update must describe something that exists and is actively used, not aspirational improvements.

Check if the work introduced project-wide conventions:
1. New commands or scripts (verify they exist and work)
2. New naming conventions or patterns (observed, not aspirational)
3. New don'ts — anti-patterns discovered during this build that are guardrails for existing patterns, not wishes for missing infrastructure
4. Stack changes (new dependencies actually added)
5. Path-scoped rules for `.claude/rules/`

Before adding to CLAUDE.md, check the size budget — keep it concise. Move detailed content to skills or rules. Route improvement ideas to a new backlog record (no stage label — the unified taxonomy's equivalent of the pre-migration "inbox" destination; per `_shared/work-record.md`), not CLAUDE.md — subject to the same per-item work-record-creation approval as any other new record (`_shared/auto-mode-contract.md`).

**For a new Don't, write the incident account before the rule.** Put the specifics — which build, how it was caught, what it cost — wherever this project keeps that evidence (an incident log if it has one, otherwise the work record or the commit message), then compress to what lands in CLAUDE.md: one sentence of rule, one clause of why. The order is the whole point. Write the rule first and the vivid detail leaks into it clause by clause, and CLAUDE.md is paid for by every session *and* every dispatched subagent, so that leak is charged per agent. Length here is not a style preference.

→ Collect each needed update as: `[claude.md] {section} — {what to add/change}` or `[rule] {path scope} — {convention}`

### 6.2: Decision Records (ADRs)

Capture the *why* behind significant decisions made during this work — distinct from `decisions.md` (the per-run auto-decision audit log) and the spec (which records *what*). Apply the **ADR gate** from `_shared/decision-records.md` (read it for the gate, the location convention, and the template).

1. **Gather decision candidates** from this work's surfaces:
   - Architectural deviations classified in `/build` Common Step 4.5
   - Interface trade-offs flagged `[ADR-candidate]` by `/claude-tweaks:deepen`
   - Tradeoffs accepted during `/review` and reflection insights about approach
2. **Run the ADR gate** on each candidate — write an ADR only when ALL THREE hold: **hard to reverse** AND **surprising without context** AND **the result of a real trade-off**. If any factor is missing, do not propose an ADR (the decision belongs in the spec, a code comment, or nowhere).
3. **Resolve the path before proposing it.** If `doc-convention.adr` is set in `.claude-tweaks/policy.yml`, use the recorded answer and skip detection entirely. Otherwise read `_shared/prior-art-detection.md` and run its procedure for the `adr` genre against `docs/decisions/` and that genre's declared aliases. The result is a resolved path plus one of three outcomes: `plugin`, `project`, or `conflict`.
4. For each decision that passes the gate, propose creating the resolved path, using the ADR skeleton in `_shared/diataxis-genre-templates.md`.

→ Collect each as: `[adr] {resolved-path} — {decision title}`

→ On a `conflict` outcome, additionally collect exactly one row per run: `[adr-convention] docs/decisions/ — {plugin form} vs {found form} ({N} existing)`. This row requires per-item approval and is **not** covered by "Approve all" (see `review-console.md`). Until it is answered, no `[adr]` row from this run may be written — the resolved path depends on the answer.

ADR proposals are routed through the Step 9 batch table / Review Console alongside other configuration updates — never written silently. Most wrap-ups produce **zero** ADRs; that is correct. ADRs are valuable because they are rare.
