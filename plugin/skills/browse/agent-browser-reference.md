# agent-browser reference

Reference for the `agent-browser` commands used by claude-tweaks skills. The full
agent-browser CLI is broader; this file documents only what consumer skills speak.

## Authority: the CLI's own docs outrank this file

agent-browser ships version-matched self-documentation: `agent-browser skills get core`
(add `--full` for the complete command reference; `agent-browser skills list` shows
specialized guides). This file is a convenience pin of the subset claude-tweaks speaks,
verified against agent-browser 0.27.0. **On any command error, or before using a command
or flag this file does not list, consult the self-docs — never guess flags from memory.**
When the self-docs and this file disagree, the self-docs win; note the drift so it can be
filed upstream against this plugin.

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
| Close every session | `agent-browser close --all` |
| List active sessions | `agent-browser session list` |

`close --all` is the residue sweep: run it when a skill starts a multi-session run
(idempotent — a no-op when nothing is open) so sessions leaked by an interrupted
earlier run cannot accumulate.

## Operation vocabulary

The translation table consumer skills speak. Use these abstract operation names in
documentation; translate to the concrete command at invocation.

Two command families act on elements:

- **Ref-based** — `snapshot -i -c` returns the accessibility tree with `@eN` refs;
  act on a ref (`click @e3`). Refs are session-scoped and regenerate on every
  snapshot — never store them.
- **Locator-based** — `find <locator> <value> <action> [text]` locates semantically
  and performs the action in one command. **The action argument is mandatory in this
  plugin's usage: a bare `find` with no action defaults to clicking the element**
  (verified v0.27.0), so an "is it there?" probe phrased as `find` mutates the page.
  For pure existence/assertion checks, use `snapshot` and inspect the tree, or
  `is visible <sel>` / `wait --text <text>` — never an action-less `find`.

| Operation | Command |
|---|---|
| open | `agent-browser --session <name> open <url>` |
| snapshot (interactive, compact) | `agent-browser --session <name> snapshot -i -c` |
| act by role + name | `agent-browser --session <name> find role <role> <action> --name "<name>"` |
| act by testid | `agent-browser --session <name> find testid <id> <action>` |
| act by text | `agent-browser --session <name> find text "<text>" <action> [--exact]` |
| act by label | `agent-browser --session <name> find label "<label>" <action>` |
| act by placeholder | `agent-browser --session <name> find placeholder "<text>" <action>` |
| fill via locator | `agent-browser --session <name> find label "<label>" fill "<value>"` |
| click ref | `agent-browser --session <name> click <ref>` |
| fill ref | `agent-browser --session <name> fill <ref> "<value>"` |
| type ref | `agent-browser --session <name> type <ref> "<text>"` |
| assert visible | `agent-browser --session <name> is visible <sel>` |
| wait for text | `agent-browser --session <name> wait --text "<text>"` |
| wait for URL | `agent-browser --session <name> wait --url "<glob>"` |
| screenshot | `agent-browser --session <name> screenshot <path>` |
| annotated screenshot | `agent-browser --session <name> screenshot --annotate <path>` |
| close | `agent-browser --session <name> close` |

The screenshot path is a positional argument — there is no `--filename` flag.
`--annotate` overlays numbered `[N]` labels matching `@eN` snapshot refs and prints
a legend.

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
agent-browser --session <name> batch "open <url>" "snapshot -i -c" "screenshot <path>"
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

## Trace (start early, save on failure)

Tracing is record-then-stop: a trace can only be saved for the interval after
`trace start` ran, so a validation or QA session that wants failure traces starts
recording immediately after `open` — there is no way to capture a trace
retroactively once a step has already failed.

```
agent-browser --session <name> trace start
# ... steps ...
agent-browser --session <name> trace stop traces/<session>/<timestamp>.zip   # on failure, BEFORE close
```

Path convention: `traces/<session>/<timestamp>.zip`. On success, just `close` —
recording ends with the session (`trace stop` without a path saves to a temp
directory, which is residue, not a discard). The output is a Chrome DevTools
trace: open it via Chrome DevTools → Performance → Load profile (there is no
`trace view` subcommand).

`traces/` is tooling residue, not project content — it belongs in `.gitignore`,
and users manage retention/cleanup.

## Auth Vault

Stores credentials encrypted, locally. The LLM never sees passwords.

| Operation | Command |
|---|---|
| Save credentials (one-time, by user) | `agent-browser auth save <vault-name> --url <login-url> --username <user> --password <pass>` |
| Log a session in from the vault | `agent-browser --session <name> auth login <vault-name>` |
| List saved vaults | `agent-browser auth list` |

`auth save` also accepts `--password-stdin` so the password never lands in shell
history. `auth login` navigates to the saved login URL, waits for the form fields,
and submits — run it after `open` and before the first interactive step.

Stories reference a vault by name via the story-level `auth: { vault: "<name>" }`
field. See `skills/stories/SKILL.md` for the schema.

## Anti-Patterns

No local copy here — `SKILL.md`'s own Anti-Patterns table in this skill's directory is the single source of truth (same "no local copy" principle as the Operation Mapping section above). Read that table directly rather than relying on a second, independently-worded copy in this reference file — a copy here already drifted once (this table covered only CSS selectors where `SKILL.md`'s now covers CSS and XPath both).
