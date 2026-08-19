# Gather Resilience — the shared three-part Step 1 shape

Cited by `grant-check.md` and `failure-check.md` — both fetch a GitHub record via `gh`/MCP as
their Step 1 gather and need the same fallback-and-short-circuit handling around that fetch.
`merge-check.md`'s own Step 1 carries a shorter version of the same `could-not-gather` framing
around a different (local CLI) gather — it cites this file's Could-not-gather section by name
only, not the MCP-path section, since it has no `issue_read` equivalent to fall back to.

Each citing mode's own Step 1 states, inline, the parameters this shape wraps around: the primary
`gh` (or CLI) command, the `issue_read` sub-mode used on the MCP path (when one applies), and the
mode's own Step 3 could-not-gather output lines. This file states the shape those parameters plug
into once, so it is never re-explained per mode.

## The shape

1. **Primary gather command.** The mode's own `gh` (or CLI) call, stated in that mode's own Step 1.

2. **MCP path** (`gh` unavailable, and the calling context has its own resolved MCP transport —
   e.g. a caller like `dispatch/mcp-transport.md`'s contract): use the confirmed `issue_read`
   mapping from `_shared/github-write-transport.md`, in the mode-specific sub-mode the citing
   Step 1 names, in place of the `gh` call above. The rest of that Step 1 consumes the same
   fetched shape regardless of transport.

3. **Could-not-gather** — two short-circuits, identical handling both times. This is the
   `could-not-gather` case, `SKILL.md`'s Error Handling.

   - **Neither available** (no `gh`, no MCP transport resolved): stop here — render Step 3
     directly with the mode's own could-not-gather output lines, naming the gather failure
     verbatim in `RATIONALE` (e.g. "gh unavailable, no MCP transport resolved — could not fetch
     {gather target}"), and skip the rest of the mode's procedure.
   - **Or the fetch itself fails** (the gh or MCP `issue_read` call was attempted but errored —
     network failure, 404, timeout, rate limit, auth expiry): same `could-not-gather` case — stop
     here and render Step 3 directly with the same output lines, naming the fetch failure verbatim
     in `RATIONALE` (e.g. "gh issue view failed: {error message}" or "MCP issue_read call failed:
     {error message}"), and skip the rest of the mode's procedure.

A mode with no MCP-equivalent fallback (`merge-check`) cites part 3 alone — its own gather failure
is a resolution failure, not a fetch-transport failure, so part 2 does not apply to it.
