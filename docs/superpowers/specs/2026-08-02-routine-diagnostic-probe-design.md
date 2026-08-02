# Reusable Cloud Environment Diagnostic Probe

## Context

Verifying that something actually works in a Claude Code cloud Routine sandbox (no `gh` CLI, GitHub MCP tools only, or any other environment-specific capability question) currently means hand-constructing a one-off `RemoteTrigger` call from scratch in chat, every time. This surfaced twice in one session: once while trying to verify the `dispatch`/`tidy` gh-CLI/MCP bridge design (`docs/superpowers/specs/2026-08-02-dispatch-tidy-mcp-bridge-design.md`), and it will surface again for that same effort's Slice 2 (tidy's PR-scan bridge), with a different set of checks. Nothing in this plugin makes that repeatable today — confirmed by a direct search of every skill file for "diagnostic"/"smoke-test": no existing mechanism covers this.

Investigation while attempting to hand-build one surfaced facts worth capturing here so they aren't rediscovered the same way next time:

- `RemoteTrigger` has no delete action — routine removal always requires the claude.ai/code/routines web UI (`skills/routine/SKILL.md`'s own Anti-Patterns table).
- Every real, working routine in this account's `memenu-app` project attaches one specific MCP connector in `mcp_connections`: `{"connector_uuid": "bf7c680d-5fdc-5ef4-b4a0-abadb619bf0a", "name": "Claude_Code_Remote", "transport_type": "http", "url": "https://api.anthropic.com/v1/code/mcp/meta"}`. This is almost certainly what exposes GitHub MCP tools inside the sandbox — nothing in this plugin's own docs mentions it; it was found only by listing existing routines directly.
- `memenu-app`'s account already has a disabled, manually-fired trigger, `memenu-app-env-smoke-test`, doing a general read-only environment health check — a real precedent for exactly this pattern, just not reusable, parameterized, or living in this repo.
- `/claude-tweaks:routine` already solves environment resolution (cache → project-local records → account-wide list-and-filter → guided-creation fallback) for its own templated-routine use case. That logic should be reused by reference, not duplicated.

## Decision

A new shared procedure, `skills/_shared/routine-diagnostic-probe.md` — no new top-level skill/command. Any skill or plan that needs to verify something in a target project's cloud sandbox references this file inline, the same way `_shared/github-write-transport.md` or `_shared/issue-claims.md` already work.

**One reusable, deterministically-named slot per project**, not a fresh trigger per diagnostic: `{repo-slug}-diagnostic-probe` (derived the same way `/claude-tweaks:routine` derives `PREFIXED_NAME`). `RemoteTrigger {action: "list"}`, filtered to that name — found → update its prompt in place, keep `enabled: false`; not found → create it, resolving `environment_id` by reference to `/claude-tweaks:routine`'s existing CREATE Step 4 procedure rather than restating that logic here. This directly avoids the alternative (a fresh trigger per diagnostic, accumulating clutter with no delete API to clean it up).

**Required `job_config` shape**, every field confirmed against real working routines this session, not guessed:
- `session_context.model`: `claude-sonnet-5` (default; caller may override).
- `session_context.sources[].git_repository.url`: the target project's repo.
- `session_context.allowed_tools`: minimal by default (`Bash, Read, Grep, Glob`) — the caller's own prompt states if it needs more (e.g. `Write`/`Edit` for a diagnostic that writes files).
- Top-level `mcp_connections`: must include the `Claude_Code_Remote` connector documented above. Omitting it would likely produce a sandbox with no GitHub MCP tools at all, silently invalidating whatever the diagnostic was trying to check.

**Thin passthrough, not a structured check-list system.** The caller supplies the full diagnostic prompt text — checks vary too much (GitHub MCP primitives, environment health, plugin invocability) to templatize meaningfully. The only thing this procedure standardizes beyond the trigger mechanics is one boilerplate reporting paragraph every caller's prompt should include verbatim: *"Report one PASS/FAIL line per check. For any MCP tool call, name the exact tool and parameters used. On failure, quote the exact error message verbatim — do not paraphrase."*

**Firing and waiting:** `RemoteTrigger {action: "run", trigger_id}` fires immediately regardless of `enabled`/schedule state (confirmed — `memenu-app-env-smoke-test` is `enabled: false` and is manually fired). No polling mechanism exists for this; the caller waits a real interval, then reads the result via the console URL or `{action: "get", trigger_id}`. This is inherently a real-wall-clock, human/agent-patience step — the procedure documents this plainly rather than implying it can be automated away.

**Cleanup:** none needed beyond leaving the slot `enabled: false` (its normal resting state) after reading results. No delete call exists or is required.

**Accepted limitation:** two callers firing different diagnostics at the same project's slot concurrently race on last-write-wins for the prompt. This is the same self-correcting, low-stakes race posture this codebase already accepts elsewhere (e.g. `/claude-tweaks:backlog refine`'s label race) — not worth a lock for an occasional manual diagnostic.

## Open item

Whether a manual-only trigger (`enabled: false`, fired solely via `{action: "run"}`) can be created without also supplying a `run_once_at`/`cron_expression` — the API's documented "Required Fields" list says exactly one of those two is required at creation time, but the existing `memenu-app-env-smoke-test` precedent shows no visible schedule field in its current state. Verify the exact create-body construction against live behavior at implementation time rather than guessing — consistent with this whole session's established discipline of confirming API/tool behavior live rather than assuming it from documentation.

## Alternatives considered

- **Extend `/claude-tweaks:routine`'s existing command with a new diagnostic mode**, reusing its Step 4 environment-resolution code path directly with zero duplication risk (same file). Rejected: `/claude-tweaks:routine`'s whole documented purpose is instantiating versioned, per-skill templates; stretching it to also handle ad hoc one-off diagnostics blurs that scope for a smaller benefit than it looks — referencing (not duplicating) Step 4 from a separate file gets the same zero-drift outcome without growing an already-complex skill's responsibilities.
- **A structured check-list system** (callers declare `{type: "mcp-tool-call", tool: "..."}` entries, the procedure assembles the prompt from a library of fragments). Rejected as premature machinery for two known use cases (this session's GitHub-MCP check, and tidy's Slice 2 PR-scan check) whose actual checks don't overlap enough to share fragments yet.
