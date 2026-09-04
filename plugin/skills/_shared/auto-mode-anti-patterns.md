# Auto-Mode Contract — Anti-Patterns

Extracted from `auto-mode-contract.md` so that file stays under its own budget. These are the failure modes that contract prevents. If you (the model) catch yourself about to do one of them under `auto`, stop.

| Anti-pattern | Why it's wrong |
|---|---|
| Inserting a "Pipeline reality check" or "I want to surface a concern before we proceed" mid-pipeline | The user said `auto`. Concerns belong in the ledger or final summary, not as blocking prompts. |
| Offering "three paths forward" when the skill prescribes one | If the skill defines a default, take it. If not, that's a skill bug — fix the skill. |
| Treating `auto` as authorization to bulk-resolve the ledger | The resolve gate Phase 2 is non-negotiable. Per-item input always. |
| Filing work records autonomously because a finding "obviously belongs there" | Each record needs user approval. "Obvious" is the model's judgment, not the user's. This still holds by default — the `autonomy` ceiling's `trusted`/`unattended` bookkeeping capabilities (see `_shared/autonomy-ceiling.md`) are a separate, explicit, project-level opt-in with their own floor and audit trail, not a model deciding something is "obvious" on its own. |
| Adding more model-side reality-checks "to be safe" | The contract is the safety. Model-added prompts under `auto` are contract violations. |
| Stopping the pipeline because of context-window concerns the user didn't raise | Pre-emptive stops violate `auto`. Loud failure at gates only. |
| Re-asking a question the user already answered with `auto` or in the Config Manifesto | If the user answered upstream, don't ask again per skill. |
| Skipping the auto-decision log entry | Silent automation without an audit trail is forbidden. Always log. |
| Auto-applying severity:medium or severity:high findings | Severity ceiling exists for a reason. MED and HIGH need user judgment. |
| Honoring pipeline config from a different date's pipeline file | Pipeline configs are per-invocation. Always read the one matching the current pipeline date stamp. |
| Forwarding the Config Manifesto's full answer set into every subagent prompt | Subagents work on their own scope. Pass only policies that affect their decisions. |
