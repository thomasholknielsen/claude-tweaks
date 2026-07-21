# agent-browser reference

Reference for the `agent-browser` commands used by claude-tweaks skills. The full
agent-browser CLI is broader; this file documents only what consumer skills speak.

## Daemon

The agent-browser daemon is implicit. The first `agent-browser` command auto-starts
it on port 4848. Skills do not manage the daemon. Recovery on crash:
`agent-browser doctor`. Dashboard is a human debug surface at
`http://localhost:4848` — do not poll it programmatically.

## Sessions

Named sessions provide isolation. One session per parallel agent, one per QA story
instance. Session names are kebab-case derived from purpose
(`checkout-flow`, `signup-neg-1`).

| Operation | Command |
|---|---|
| Open a session at a URL | `agent-browser --session <name> open <url>` |
| Close a session | `agent-browser --session <name> close` |
| List active sessions | `agent-browser session list` |

## Operation vocabulary

The translation table consumer skills speak. Use these abstract operation names in
documentation; translate to the concrete command at invocation.

| Operation | Command |
|---|---|
| open | `agent-browser --session <name> open <url>` |
| snapshot (interactive, compact) | `agent-browser --session <name> snapshot -i -c` |
| find by role + name | `agent-browser --session <name> find role <role> --name <name>` |
| find by testid | `agent-browser --session <name> find testid <id>` |
| find by text | `agent-browser --session <name> find text <text> [--exact]` |
| find by label | `agent-browser --session <name> find label <label>` |
| find by placeholder | `agent-browser --session <name> find placeholder <text>` |
| click | `agent-browser --session <name> click <ref>` |
| fill | `agent-browser --session <name> fill <ref> <value>` |
| type | `agent-browser --session <name> type <ref> <text>` |
| screenshot | `agent-browser --session <name> screenshot --filename <path>` |
| annotated screenshot | `agent-browser --session <name> screenshot --annotate --filename <path>` |
| close | `agent-browser --session <name> close` |

## Viewport and device

First-class flags for viewport and device emulation. Cross-platform — no shell-specific workarounds needed.

| Operation | Command |
|---|---|
| Set viewport | `agent-browser --session <name> set viewport <width> <height>` |
| Set device | `agent-browser --session <name> set device "<device-name>"` |

## Batch mode

Run multiple operations in a single process invocation against one session.
Reduces token + latency overhead for multi-step walks.

```
agent-browser batch --session <name> "open <url>" "snapshot -i -c" "screenshot --filename <path>"
```

Anti-pattern: do not batch across sessions. Each `batch` invocation is one session's
lifecycle.

## React introspection (opt-in)

Used by `/stories` source-aware mode (Step 1.5) when the source files are
`.tsx`/`.jsx`. Silent skip on non-React apps.

| Operation | Command |
|---|---|
| React component tree | `agent-browser --session <name> react tree` |
| Inspect component at ref | `agent-browser --session <name> react inspect <ref>` |

## Vitals

Captures Web Vitals (LCP, CLS, INP, TTFB, FCP). Used by `/visual-review` for the
"Performance" finding category.

```
agent-browser --session <name> vitals
```

## Trace (on failure)

Capture a trace before closing a session when a step fails. Output zip file.
Path convention: `traces/<session>/<timestamp>.zip`.

```
agent-browser --session <name> trace save traces/<session>/<timestamp>.zip
```

View a trace: `agent-browser trace view <path>`.

No retention policy — users manage cleanup.

## Auth Vault

Stores credentials encrypted, locally. The LLM never sees passwords.

| Operation | Command |
|---|---|
| Set credentials (one-time, by user) | `agent-browser auth set <vault-name> <username> <password>` |
| Use credentials in a session (login) | `agent-browser --session <name> auth use <vault-name>` |

Stories reference a vault by name via the story-level `auth: { vault: "<name>" }`
field. See `skills/stories/SKILL.md` for the schema.

## Anti-Patterns

No local copy here — `SKILL.md`'s own Anti-Patterns table in this skill's directory is the single source of truth (same "no local copy" principle as the Operation Mapping section above). Read that table directly rather than relying on a second, independently-worded copy in this reference file — a copy here already drifted once (this table covered only CSS selectors where `SKILL.md`'s now covers CSS and XPath both).
