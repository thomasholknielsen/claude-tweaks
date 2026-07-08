# Browser automation backend policy — Design

## Problem

Claude in Chrome went GA in Claude Code (v2.1.198, 2026-07-02) and ships a
bundled, aggressively-worded skill that nudges Claude toward invoking
`mcp__claude-in-chrome__*` tools directly, independent of any plugin logic.
Nothing in claude-tweaks calls those tools today, but nothing stops a
future edit from reaching for them either — there is no documented rule,
and the plugin's own history already shows this exact temptation once: a
dual-backend `/browse` (Playwright CLI + Chrome MCP, with a resolution
table and a `--chrome` restart flag) shipped in v3.0 (2026-02) and was
deliberately collapsed to a single `agent-browser` backend on 2026-05-01
(`3dc4937`) because auto-detection/fallback cost more to maintain than it
returned.

That decision is still correct, for a reason that's gotten stronger since
May: claude-tweaks skills increasingly run as scheduled cloud Routines
(`code-health`, `harness-health`, via `RemoteTrigger`), and Claude in
Chrome has no headless or cloud-execution mode — it requires a connected
desktop Chrome extension, which doesn't exist in a Routine sandbox. Any
future browser-touching skill that depended on it would be broken on
hosted execution by construction, not just fragile.

There is one real capability gap in staying single-backend: `agent-browser`
has no access to the user's already-authenticated live browser session.
Some ad-hoc, human-invoked tasks (pairing against a real logged-in account
with no test credentials) genuinely benefit from that. The gap is worth
closing narrowly, without reintroducing the abstraction that was just
removed.

## Solution

### CLAUDE.md guardrail

Add one line to the root `CLAUDE.md` `Don'ts` section:

> Don't call `mcp__claude-in-chrome__*` tools directly in plugin skills —
> `/browse` and its consumers (`/stories`, `/visual-review`, `qa-agent`,
> `/flow`) use `agent-browser` exclusively, since it's the only backend
> that works in both interactive sessions and hosted Routines
> (claude-in-chrome has no headless/cloud mode). Exception: `/browse
> backend=chrome`, human-invoked only, never from auto mode or a Routine.

This is deliberately short — a rule, a why, an exception — not an incident
narrative, to keep `CLAUDE.md` from accumulating bloat.

### `/browse backend=chrome` escape hatch

One new row in `skills/browse/SKILL.md`'s `$ARGUMENTS` pattern table:

| Pattern | Example | Behavior |
|---|---|---|
| `backend=chrome <URL or task>` | `backend=chrome https://app.example.com/settings` | Routes through `mcp__claude-in-chrome__*` (user's live authenticated session) instead of `agent-browser`. Human-invoked only. |

Scope, kept intentionally narrow:

- **Operations covered:** navigate, read page, click, type/fill,
  screenshot. Nothing else.
- **Not carried over:** vitals, trace, react introspection, auth vault —
  these are `agent-browser`/QA-pipeline-specific and don't apply to an
  already-authenticated ad-hoc session.
- **Hard rule:** never auto-selected; never used by `/stories`,
  `/visual-review`, `/review`, `qa-agent`, `/flow`, or a Routine — all of
  those stay `agent-browser`-only, per the `CLAUDE.md` line above.

One new row in the Anti-Patterns table:

| Pattern | Why It Fails |
|---|---|
| A consumer skill routes through `backend=chrome` | Breaks portability to hosted Routines — `agent-browser` is the only backend that works headless; this flag is human-invoked only |

## Out of scope (YAGNI)

- Rebuilding the dual-backend resolution table / auto-detection that was
  removed in `3dc4937` — the escape hatch is one explicit flag, not a
  fallback chain.
- Changing Claude Code's own settings (permission mode for
  `mcp__claude-in-chrome__*`, `disableBundledSkills`) — that's user-level
  Claude Code configuration, not plugin content, and orthogonal to this
  design.
- Mapping every `agent-browser` operation (vitals, trace, react
  introspection, auth vault) onto Chrome-MCP equivalents.
- Wiring the separate `playwright` MCP server in as a third backend — no
  demonstrated need surfaced during brainstorming; it would bypass every
  `/browse` convention (session naming, semantic-locator-only rule,
  trace-on-failure) the same way a direct Chrome-MCP call would.

## Key decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Backend for pipeline skills | `agent-browser` only (unchanged) — sole reason: portability to hosted Routines |
| Guardrail form | Short `CLAUDE.md` `Don'ts` bullet (rule + why + exception), not a long incident narrative |
| Chrome escape hatch scope | Human-invoked only via `/browse backend=chrome`; navigate/read/click/type/screenshot only |
| Chrome escape hatch reach | Never auto-selected; never used by any consumer skill or a Routine |

## Testing / verification approach

Both changes are skill-content/documentation edits — no `bin/lib/` logic
is added or changed, so `node --test` coverage is unaffected. Verification
is:

1. Self-review read-through (placeholder scan, internal consistency,
   scope, ambiguity — per the brainstorming spec-review checklist).
2. Confirm the new `CLAUDE.md` line doesn't duplicate or contradict the
   existing `agent-browser (optional)` line in the Dependencies table.
3. Confirm `skills/browse/SKILL.md`'s `Input`, `Anti-Patterns`, and
   `Relationship to Other Skills` tables stay internally consistent after
   the edit (no orphaned reference to a `backend=chrome` concept anywhere
   else in the skill that isn't updated to match).
4. Run `npm test` to confirm no regression (baseline: 630/631 passing,
   one pre-existing unrelated flaky timing failure in
   `tests/statusline.test.js`).
