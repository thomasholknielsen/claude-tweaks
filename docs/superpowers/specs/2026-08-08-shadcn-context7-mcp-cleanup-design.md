# shadcn/context7 MCP cleanup — design

**Date:** 2026-08-08
**Status:** Approved (brainstorm approach B)

## Problem

Two user-level global MCP entries in `~/.claude.json` are dead weight:

- `shadcn` → `https://www.shadcn.io/api/mcp` (HTTP) — **fails to connect** (HTTP 404; the
  endpoint returns an HTML error page). Note the domain: `shadcn.io` is a third-party site,
  not the official `ui.shadcn.com`. This entry is unrelated to the plugin's shadcn support —
  claude-tweaks never references `shadcn.io` anywhere; `/init` Step 13 wires the *official*
  stdio MCP (`npx shadcn@latest mcp`) into a project's `.mcp.json`, a different server.
- `context7` → `https://mcp.context7.com/mcp` (HTTP, with API key) — connects fine, but the
  user has stopped using it. It injects MCP instructions plus two deferred tools into every
  session.

Inside the plugin, context7 has exactly one functional citation: the `/research` deps-fallback
sentence in `skills/research/source-registry.md` (line 48), pinned by a test regex in
`tests/research/skill-md.test.js` (line 281) whose alternation
`(?:context7|public\s+documentation)` would keep passing after the prose stops naming
context7 — a removed term should not survive inside a test's alternation.

## Decision (approach B — excision + name the mechanism)

1. **Global MCP config (user scope, not repo content).** Remove both entries:
   `claude mcp remove shadcn -s user` and `claude mcp remove context7 -s user`; verify with
   `claude mcp list` that both rows are gone and the remaining servers (playwright, claude.ai
   connectors) still connect. Reversible. Removal discards the stored context7 API key — if
   context7 ever returns, the key is re-obtained from its dashboard.

2. **Plugin edit — `skills/research/source-registry.md`.** The deps-fallback sentence
   becomes: "fall back to the dependency's public documentation (via WebFetch) and record the
   verdict at **medium** confidence, noting the fallback in its provenance." WebFetch is named
   because context7 was the named mechanism before; with it gone, the fallback would otherwise
   name no mechanism at all. The following sentence ("docs describe intent, installed source
   describes behavior") stands unchanged.

3. **Test tightening — `tests/research/skill-md.test.js`.** Narrow the alternation to
   `public\s+documentation` so the regex can no longer be satisfied by a term the prose no
   longer contains. Verify by inversion per the suite's own convention (`[IL-105]`):
   temporarily negate the prose, confirm the assertion fails, restore.

## Deliberately untouched

- All shadcn support: `/init` Step 13 (official stdio MCP wiring, CLI bootstrap, skill
  install), the `/help` reference-card row, the `/stories` component-library prose. None of it
  involves the dead shadcn.io endpoint, and nothing in the audit suggests it is broken.
- Historical artifacts (plan docs, specs, pipeline run dirs) keep their context7/shadcn
  mentions per convention.

## Release

Patch bump with the full version pre-check (fetch origin, sibling worktree branches, local
`main`, unexecuted plans under `docs/superpowers/plans/`), CHANGELOG entry +
`docs/shipped-versions.tsv` line in the same commit as the bump, marketplace mirror update —
both repo pushes as one action per CLAUDE.md's Releasing section. `npm test` green centrally
before the bump.

## Error handling

- `claude mcp remove` reports the entry missing at user scope → re-read `claude mcp list` /
  `~/.claude.json` to find the actual scope rather than assuming.
- Research suite fails after the regex tightening → the inversion check distinguishes a
  too-tight regex from a prose mismatch.

## Testing

- `node --test tests/research/` for the touched suite; full `npm test` centrally before
  release.
- Inversion check on the tightened assertion (negate prose → expect red → restore).

## Out of scope

- Teaching the changelog-coverage walk about merge-inverted WIP commits (the baseline 6.64.3
  red found during this session was fixed and pushed separately as `55b966eb`).
- Any change to `/init` Step 13's shadcn wiring (would be its own drift-check record).
