---
name: claude-tweaks:browse
description: Use for browser automation via agent-browser — defines session naming, screenshot/trace paths, and operation vocabulary used by /stories, /visual-review, and /review. Keywords - browse, browser, agent-browser, headless, screenshot, scrape, automation.
allowed-tools: Bash
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a Next Actions block (context-specific numbered options with one recommended), not a navigation menu.


# Browse — Browser Conventions

Conventions skill for browser automation. Defines session naming, screenshot/trace paths, lifecycle, and the abstract operation vocabulary that `/claude-tweaks:stories`, `/claude-tweaks:visual-review`, `/claude-tweaks:review`, and the `qa-agent` all speak. Concrete `agent-browser` syntax lives in `agent-browser-reference.md` in this skill's directory.

```
                             [ /claude-tweaks:browse ] ← utility (no fixed lifecycle position)
                                        ↑
   Used by: /claude-tweaks:stories, /claude-tweaks:visual-review,
            /claude-tweaks:review (visual + qa modes), qa-agent, ad-hoc tasks
```

## When to Use

- `/claude-tweaks:stories` is exploring a site or validating generated stories against the live DOM
- `/claude-tweaks:visual-review` is walking pages or journeys for UI quality findings
- `/claude-tweaks:review` is running its visual or QA modes
- A consumer skill needs to dispatch parallel agents that each drive a browser
- Ad-hoc browser ops — navigate, screenshot, scrape, fill a form, check a deployment

## Requirements

`agent-browser` must be installed:

```bash
npm install -g agent-browser
```

The daemon auto-starts on the first `agent-browser` command (port 4848). Skills do not manage daemon lifecycle. Recovery on crash: `agent-browser doctor`.

## Conventions Defined Here

These are the contract every browser-touching skill follows.

### Session naming

Kebab-case, derived from purpose. One session per parallel agent, one per QA story instance. Session names are visible in the dashboard and in trace paths, so make them descriptive.

Examples: `checkout-flow`, `signup-neg-1`, `pricing-page-review`, `qa-cart-empty-state`.

### Screenshot path

```
screenshots/browse/<session>/<NN>_<description>.png
```

`<NN>` is a zero-padded sequence number; `<description>` is a short kebab-case label. Example: `screenshots/browse/checkout-flow/02_payment-error.png`.

Minimum two screenshots per task: one after initial load, one at the final state. Annotated screenshots (numbered overlays matching snapshot refs) follow the same path convention.

### Trace path

```
traces/<session>/<timestamp>.zip
```

Capture a trace before closing a session whenever a step fails. Failure reports must include the trace path. There is no automatic retention policy — users manage cleanup.

### Lifecycle

```
open  →  ops (snapshot, find, click, fill, screenshot, vitals, …)  →  close
```

Daemon is implicit. Always close the session when the task is done — leaked sessions consume resources. On step failure: capture trace, then close.

### Operation vocabulary

Consumer skills speak abstract operation names (open, snapshot, find, click, fill, type, screenshot, vitals, trace, close, …). The translation to concrete `agent-browser` commands lives in `agent-browser-reference.md` in this skill's directory. Read that file before invoking commands you do not have memorized.

## Operation Mapping

Condensed pointer table. Full reference (batch, react, auth vault, vitals, trace, viewport/device flags) lives in `agent-browser-reference.md`.

| Operation | Command |
|---|---|
| open | `agent-browser --session <name> open <url>` |
| snapshot (interactive, compact) | `agent-browser --session <name> snapshot -i -c` |
| find by role + name | `agent-browser --session <name> find role <role> --name <name>` |
| find by testid | `agent-browser --session <name> find testid <id>` |
| click | `agent-browser --session <name> click <ref>` |
| fill | `agent-browser --session <name> fill <ref> <value>` |
| type | `agent-browser --session <name> type <ref> <text>` |
| screenshot | `agent-browser --session <name> screenshot --filename <path>` |
| annotated screenshot | `agent-browser --session <name> screenshot --annotate --filename <path>` |
| vitals | `agent-browser --session <name> vitals` |
| trace save | `agent-browser --session <name> trace save traces/<session>/<timestamp>.zip` |
| close | `agent-browser --session <name> close` |

## Parallel Sessions

Each parallel agent gets its own `--session <unique-name>`. One browser instance per session. Memory cost scales with the number of concurrent sessions, not with the number of commands sent to a session — so reuse a session for sequential ops on the same page, and spin up a fresh session per parallel agent or per QA story instance.

> **Parallel execution:** Dispatch independent browser walks as parallel Task agents — each opens its own session, runs its ops, and returns a per-session result. Assemble results after all agents complete.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Polling the dashboard programmatically | `http://localhost:4848` is a human debug surface — scraping it is brittle and unsupported |
| Storing `@eN` snapshot refs in YAML or persisted artifacts | Refs are session-scoped and regenerate on every snapshot — resolve them at runtime via `find` |
| Batching across sessions | One `agent-browser batch` invocation owns a single session's lifecycle — never mix session names in one batch |
| Using CSS or XPath selectors with `find` | Schema v2 forbids CSS/XPath — use semantic locators only (role, name, text, testid, label, placeholder) |
| Relying on env vars to set viewport size | Replaced by first-class `set viewport <w> <h>` and `set device "<name>"` flags — env-var workarounds are dead |
| Generic session names (`test`, `session1`) | Names show up in dashboards and trace paths — derive from purpose |
| Forgetting to close sessions | Leaked sessions consume memory — always `close` at the end of a run |
| Skipping the trace on failure | Failure reports without a trace path are not actionable — capture before closing |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:stories` | Consumes /browse conventions for session naming, screenshot paths, and the operation vocabulary used to resolve semantic locators at runtime |
| `/claude-tweaks:visual-review` | Drives page and journey walks against /browse's lifecycle; uses annotated screenshots and `vitals` from the operation table |
| `/claude-tweaks:review` | Delegates to /visual-review (visual mode) and qa-agent (QA mode) — both speak /browse's operation vocabulary transitively |
| `qa-agent` (`agents/qa-agent.md`) | Each story instance opens a uniquely named session; uses the auth vault and trace-on-failure conventions defined here |
| `/claude-tweaks:test` | Invokes qa-agent for QA story validation; trace paths from failed stories surface in /test reports |
| `/claude-tweaks:init` | Detects `agent-browser` availability during setup and records the requirement that /browse depends on |
