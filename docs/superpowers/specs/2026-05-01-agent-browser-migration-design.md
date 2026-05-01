# Agent Browser migration design

**Date:** 2026-05-01
**Status:** Approved (brainstorming complete)
**Version target:** claude-tweaks v4.0.0 (breaking)

## Summary

Replace `playwright-cli` with Vercel's `agent-browser` across the plugin, remove Chrome MCP support entirely, and redesign `/stories` around accessibility-tree snapshot refs (semantic locators only). Adopt seven Agent Browser capabilities — `batch`, `set viewport/device`, `screenshot --annotate`, opt-in `react` introspection, `auth` vault, `vitals`, and `trace`-on-failure. Ship as v4.0.0 with a guided regeneration UX for v1 stories.

## Rationale

- **Chrome MCP was second-class today** — no parallelism, no headless, no file control on screenshots (skills/browse/SKILL.md:88-91). Maintaining two backends doubled surface area for half the value.
- **`/stories` already documents CSS-selector brittleness** (skills/stories/SKILL.md:364-375). Agent Browser's snapshot+refs paradigm directly addresses this with semantic locators (role, name, text, testid, label).
- **One breaking version, not two** — combining the backend swap and the schema change into v4.0.0 means users absorb one upgrade, not two.
- **Token efficiency** — Agent Browser claims ~93% context reduction vs traditional CLI tooling. The `/stories` refinement loop is currently capped at one round to avoid runaway tokens (skills/stories/SKILL.md:568); this cap can relax.

## Non-goals

- Cloud providers (Browserbase, Browserless, AgentCore, Kernel, Browser Use) — supported by `agent-browser` but not wired into skills.
- `profiler` — no consumer skill needs it; would require an interpretation layer that doesn't exist.
- Automatic CSS → semantic-locator migration — inference is unreliable; guided regeneration is cleaner.
- Story-file backwards compatibility with v3 — v1 schema is detected and the user is prompted to regenerate.
- Vue/Svelte/Angular framework introspection — `react` is the only first-class framework integration in this iteration.

## Architecture

### `/browse` — conventions skill (not a router)

`/browse` stops being a backend router. It becomes the conventions and operation-vocabulary skill that all browser-touching skills reference.

**Defines:**

- **Session naming:** kebab-case derived from purpose (`checkout-flow`, `signup-neg-1`). One session per parallel agent, one per QA story instance.
- **Screenshot path:** `screenshots/browse/<session>/<NN>_<description>.png` (unchanged).
- **Trace path:** `traces/<session>/<timestamp>.zip` (new — mirrors screenshots convention).
- **Lifecycle:** `agent-browser --session <name> open <url>` → ops → `agent-browser --session <name> close`. Daemon is implicit (auto-started by `agent-browser`); skills don't manage it.
- **Operation vocabulary:** abstract op names (open, snapshot, find, click, type, screenshot, vitals, trace, close, etc.) mapped to concrete `agent-browser` commands. This is the contract consumer skills speak.

**Removed:** detection logic, decision matrix, backend routing, Chrome MCP references.

**Approximate size:** ~120 lines (down from ~262).

### `/stories` — semantic locators only

**v2 schema:**

```yaml
schema_version: 2
stories:
  - id: checkout-happy-path
    description: Complete a purchase from cart to confirmation
    journey: checkout
    auth: { vault: "default-user" }   # optional, references Auth Vault
    steps:
      - action: click
        locator: { role: button, name: "Add to cart" }
      - action: fill
        locator: { testid: "email-input" }
        value: "user@example.com"
      - action: assert_visible
        locator: { text: "Order confirmed", exact: true }
```

**Locator types** — always semantic, never CSS or XPath:

- `{ role, name? }` — ARIA role with optional accessible name
- `{ testid }` — `data-testid` or equivalent
- `{ text, exact? }` — visible text content
- `{ label }` — associated form label
- `{ placeholder }` — input placeholder

**Runtime flow per story:**

1. `agent-browser --session <story-id> open <url>`
2. (If `auth` set) `agent-browser --session <story-id> auth use <vault-name>`
3. `agent-browser --session <story-id> snapshot -i -c` — accessibility tree
4. For each step: `agent-browser --session <story-id> find <locator-spec>` resolves to `@eN`, action runs against ref
5. On step failure: `agent-browser --session <story-id> trace save traces/<story-id>/<timestamp>.zip`, attach to failure report, close session
6. On success: `agent-browser --session <story-id> close`

**v1 detection & regeneration UX:**

When `/stories` reads a YAML lacking `schema_version: 2`:

> v1 stories detected (5 stories, CSS selectors). v4 of claude-tweaks uses semantic locators (role/text/testid). Regenerate?
> 1. Regenerate all (preserves story names, descriptions, intent — re-derives locators from live DOM) **(Recommended)**
> 2. Show me the changes first
> 3. Cancel

Choice 1 invokes the standard `/stories <url>` flow with existing story names/descriptions/`journey` fields passed as scaffolding so the AI preserves intent and only replaces locators. Choice 2 dumps a per-story diff (old CSS → inferred semantic locator) for review before regeneration.

### Daemon, sessions, dashboard

- **Daemon (port 4848) is implicit** — `agent-browser` auto-starts it on first command. Skills do not manage daemon lifecycle. Recovery path on crash: `agent-browser doctor` (documented in reference, not invoked automatically).
- **Sessions persist within a run** — back-to-back `/visual-review` and `/stories` invocations against the same URL can share a session by name. Nothing is implicit; each skill explicitly opens or reuses a session.
- **Dashboard at `http://localhost:4848`** — debug surface for humans. Anti-pattern: don't poll programmatically.
- **Cleanup** — `agent-browser --session <name> close` at the end of each skill's run. Future enhancement (out of scope for v4.0.0): `wrap-up` could call `agent-browser session list` to detect leaked sessions.

## Capability integration

| Capability | Consumer skill(s) | Notes |
|---|---|---|
| `batch` | `/visual-review` (journey walks), `/stories` (Step 2 page exploration) | One process invocation per page; reduces token + latency. Anti-pattern: don't batch across sessions. |
| `set viewport/device` | All browser-touching skills | Replaces `PLAYWRIGHT_MCP_VIEWPORT_SIZE` env var. Removes the Windows PowerShell/CMD workaround in `qa-agent.md`. |
| `screenshot --annotate` | `/visual-review` only | Numbered overlays match snapshot refs; visual findings reference elements precisely. |
| `react tree/inspect` | `/stories` source-aware mode (Step 1.5) | Auto-detects React when `.tsx`/`.jsx` source seen. Silent skip on non-React. |
| `auth` (Auth Vault) | `qa-agent`, `/stories` | Story `auth: { vault: "<name>" }` field. Replaces cookie-injection path. LLM never sees credentials. |
| `vitals` | `/visual-review` | New "Performance" finding category; LCP/CLS/INP/TTFB/FCP after each page review. No `/review` perf-gate yet. |
| `trace` (on failure) | `/stories`, `/visual-review` | `trace save` before session close on any step failure. Failure report includes path. No retention policy in v4. |

## Chrome MCP removal

Ten files touched. Removal pattern: drop the Chrome branch, drop the `BROWSER`/`VISION` conditional, collapse two-row tables into single-row, delete files that are now Chrome-only.

| File | Change |
|---|---|
| `skills/browse/chrome-reference.md` | Delete |
| `skills/browse/playwright-reference.md` | Delete (replaced by `agent-browser-reference.md`) |
| `skills/browse/SKILL.md` | Full rewrite per `/browse` redesign |
| `skills/stories/SKILL.md` | Drop Chrome paths; schema v2; v1 detection UX; react opt-in; auth vault |
| `skills/stories/source-analysis.md` | Add react introspection workflow |
| `skills/stories/story-examples.md` | Replace CSS examples with semantic-locator examples |
| `skills/visual-review/SKILL.md` | Drop Chrome paths; add vitals, annotated screenshots, batch walks |
| `skills/visual-review/browser-review.md` | Drop Chrome backend; add vitals/annotate procedures |
| `skills/visual-review/reconnaissance.md` | Drop Chrome refs if present |
| `skills/review/qa-review.md` | Drop Chrome branches; agent-browser commands |
| `skills/init/SKILL.md` | Drop Chrome MCP setup phase; add agent-browser install detection |
| `skills/init/summary-templates.md` | Strip Chrome MCP detection/setup paragraphs |
| `agents/qa-agent.md` | Drop `BROWSER`/`VISION` params; rewrite ops table; integrate auth vault; trace on failure |
| `hooks/hooks.json` | Replace SessionStart fallback message — agent-browser only |
| `README.md` | Single-row requirements table; v3 → v4 migration section; updated keywords list reference |
| `.claude-plugin/plugin.json` | `3.22.0` → `4.0.0`; drop `playwright` keyword, add `agent-browser`, `semantic-locators` |

**Created:** `skills/browse/agent-browser-reference.md` — operation vocabulary plus consumer-relevant advanced features (`batch`, `find`, `snapshot`, `vitals`, `trace`, `auth`, `react`).

## Versioning & rollout

- **Version:** 3.22.0 → **4.0.0** (breaking: story schema, removed backend, tooling requirement change).
- **Commit message** (per CLAUDE.md style): `Migrate browser stack to agent-browser, drop Chrome MCP — v4.0.0`.
- **README v3→v4 migration section:** install `agent-browser`; upgrade existing projects by re-running `/stories <url>` — v1 detection UX handles regeneration.
- **`/help` and artifact lifecycle diagram:** re-sync per CLAUDE.md mandate.
- **Cross-references:** every skill's Relationship table verified bidirectional after edits.
- **Plugin description in `plugin.json`:** unchanged.

## Validation approach

Markdown-only plugin — no automated test suite. Validation gates:

1. End-to-end re-read of every modified skill to catch dangling `playwright` / `chrome` / `playwright-cli` / `claude_in_chrome` references (grep is the gate).
2. Bidirectional Relationship-table audit across all 18 skills.
3. Manual smoke test against a real project: `/browse open <url>`, `/stories <url>`, `/visual-review <url>` (page mode). Confirm annotated screenshots, vitals capture, and trace-on-failure.
4. `/help` and README artifact-lifecycle diagram sync check.
5. v1 → v2 regeneration UX dry-run against a checked-in v1 fixture (create one in this repo's docs for ongoing testing).

## Open items deferred to implementation

- Exact wording of v1 detection prompt — refine during `/stories` edit.
- Exact `agent-browser auth` sub-command syntax (set/use/list) — verify against `agent-browser auth --help` at implementation time; spec assumes `auth set <name>` and `auth use <name>` based on Auth Vault feature description.
- Whether `auth-vault-name` is plugin-wide or story-scoped default — design in detail when editing `qa-agent.md`.
- Trace retention policy — defer until users complain about disk usage.
- `/help` reference card updates — straightforward but enumerated during edit pass.
