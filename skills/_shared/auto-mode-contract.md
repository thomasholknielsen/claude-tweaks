# Auto-Mode Contract

Single source of truth for what `auto` means across the claude-tweaks pipeline. Every skill that accepts `auto` (currently `/flow`, `/build`, and any future skill that adds it) MUST reference this file rather than redefining the semantics inline.

## Why this exists

Before this contract, `auto` was defined per-skill with overlapping but inconsistent scope. Result: `/flow auto` silenced two specific prompts but left the model free to insert its own caution prompts mid-pipeline ("this plan is large, want me to decompose?", "this will dispatch many subagents, are you sure?"). That defeats the purpose — users invoke `auto` precisely to avoid those interruptions.

This contract makes the semantics explicit on both sides: what `auto` covers, and — equally important — what it does NOT cover. The "does not" list is enforceable: if the user said `auto`, the model must NOT insert prompts the contract doesn't authorize, and must NOT layer on its own reality-checks.

## Mechanism

`auto` can be set three ways. Each is a one-shot or session-level intent flag that propagates to all downstream skills:

| Form | Scope | Example |
|------|-------|---------|
| Per-invocation argument | Single pipeline run | `/claude-tweaks:flow 42 auto` |
| Project-level CLAUDE.md setting | Default for the project | `auto-mode: default-on` in CLAUDE.md |
| Conversation-level (future) | Until disabled | `/auto on` … `/auto off` |

Skills check for `auto` in their argument list AND in CLAUDE.md, with the argument winning if both are set. When `auto` is active, every prompt-decision below is resolved per the table without user input.

## What `auto` silences

| Prompt / decision | Default behavior | Behavior under `auto` |
|---|---|---|
| Pre-flight merge-check (Step 2.5) | Offer rebase vs continue | Continue and add `ops` ledger entry |
| Scope/shape-check warnings | Offer decompose / proceed / cancel | Proceed and add `ops` ledger entry |
| Path-selection prompts mid-pipeline ("decompose / hybrid / proceed") | Ask user | Proceed with the documented default for that step |
| Mid-pipeline reality-checks inserted by the model | Free-form prompt | **NOT ALLOWED** — see "Anti-Patterns" below |
| Subagent dispatch count concerns ("this will fire N subagents") | Free-form prompt | **NOT ALLOWED** — see "Anti-Patterns" below |
| Context-window risk warnings ("you may hit limits") | Free-form prompt | **NOT ALLOWED** — see "Anti-Patterns" below |
| Cost / wall-clock estimates raised as a stop-the-pipeline question | Free-form prompt | **NOT ALLOWED** — surface as a single-line note in the Next Actions block, not a blocking question |
| "Are you sure?" before risky-but-authorized operations | Confirmation prompt | Proceed silently if the operation is within the skill's documented scope |

## What `auto` does NOT silence

`auto` is not a global "skip everything" flag. The following are **policy gates**, not UX preferences, and require explicit user input regardless of `auto` state:

| Item | Why mandatory |
|------|---------------|
| Ledger resolve gate (every open item must be resolved) | Items represent un-finished work — silently dropping them is the bug `auto` is *not* allowed to introduce |
| `specs/INBOX.md` writes | Each entry needs explicit user approval — INBOX is the user's queue, not the model's |
| `specs/DEFERRED.md` writes | Same — deferral is a user decision |
| Hard validation failures (uncommitted changes, missing prereqs, malformed input) | These are correctness gates. Bypassing them produces broken pipelines |
| Final pipeline failure cards | A failure is information the user needs — don't suppress it |
| Code modifications outside the skill's documented scope | If a skill is asked to do X and would modify Y to make X work, that's a scope expansion the user must authorize |
| Resolution of merge conflicts in worktree finishing | Conflict resolution requires intent the model cannot infer |

## Anti-Patterns

These are the failure modes this contract is designed to prevent. If you (the model) catch yourself about to do one of them under `auto`, stop.

| Anti-pattern | Why it's wrong |
|---|---|
| Inserting a "Pipeline reality check" or "I want to surface a concern before we proceed" mid-pipeline | The user said `auto`. They've already accepted the pipeline's default behavior. Concerns belong in the ledger or the final summary, not as blocking prompts. |
| Offering "three paths forward" when the skill prescribes one | If the skill defines a default for the situation, take it. If the skill does NOT define a default, that's a skill bug — fix the skill, don't paper over it with a prompt. |
| Treating `auto` as authorization to bulk-resolve the ledger | `auto` does not silence the resolve gate. Per-item input is mandatory. |
| Writing to INBOX/DEFERRED autonomously because a finding "obviously belongs there" | Each entry needs user approval. "Obvious" is the model's judgment, not the user's. |
| Adding more model-side reality-checks "to be safe" | The contract is the safety. Model-added prompts under `auto` are contract violations. |
| Stopping the pipeline because of context-window concerns the user didn't raise | Surface context risk in the failure card if the pipeline actually fails. Pre-emptive stops violate `auto`. |
| Re-asking a question the user already answered with `auto` | If the user wrote `auto`, they answered. Don't make them repeat it per skill. |

## Skill integration checklist

When a skill adds or modifies behavior under `auto`:

1. Read this contract. Do not redefine `auto` inline.
2. List your skill's prompts in two columns: silenced-by-auto vs requires-user-input. Verify each is consistent with the tables above. If a prompt doesn't fit either column cleanly, the prompt is probably the bug.
3. Reference this file from your skill: `See \`_shared/auto-mode-contract.md\` for the full silenced/not-silenced taxonomy and anti-patterns.`
4. Add a self-test: under `auto`, can the skill complete its happy path with zero user input AND without violating any "does not silence" item? If not, document the exception with a justification.

## Failure-mode contract

`auto` shifts the failure mode from "ask the user" to "fail loud at the gate." Skills under `auto`:

- Must reach a gate or a successful completion without prompting (except for the mandatory items above).
- Must surface failures via the ledger and the failure card, not via mid-pipeline questions.
- Must NOT swallow failures to "keep things automatic" — silent failure is worse than loud failure.

The user's contract under `auto` is: "I trust the pipeline; if it can't proceed, stop and tell me why — don't ask me to make decisions you should be making."
