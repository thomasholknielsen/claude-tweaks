---
name: claude-tweaks:browse
description: Use when you need browser automation via agent-browser — defines session naming, screenshot/trace paths, and operation vocabulary used by /stories, /visual-review, /review, and /demo. Keywords - browse, browser, agent-browser, screenshot, scrape, automation.
argument-hint: "[<url>|<task description>] [--session <name> ...] [set viewport <wxh>|set device \"<name>\"] [backend=chrome ...] [--quick]"
---
> **Interaction style:** Single decisions → one `AskUserQuestion` call, one option marked Recommended. Multi-item → batch table with recommendations pre-filled, then one `AskUserQuestion` for apply-all/override. Never more than one call per decision. End with `## Next Actions` via `AskUserQuestion`, not a navigation menu.


# Browse — Browser Conventions

Conventions skill for browser automation. Defines session naming, screenshot/trace paths, lifecycle, and the abstract operation vocabulary that `/claude-tweaks:stories`, `/claude-tweaks:visual-review`, `/claude-tweaks:review`, `/claude-tweaks:demo`, and the `qa-agent` all speak. Concrete `agent-browser` syntax lives in `agent-browser-reference.md` in this skill's directory.

```
                             [ /claude-tweaks:browse ] ← utility (no fixed lifecycle position)
                                        ↑
   Used by: /claude-tweaks:stories, /claude-tweaks:visual-review,
            /claude-tweaks:review (visual + qa modes), /claude-tweaks:demo
            (on-demand live look), qa-agent, ad-hoc tasks
```

## When to Use

- `/claude-tweaks:stories` is exploring a site or validating generated stories against the live DOM
- `/claude-tweaks:visual-review` is walking pages or journeys for UI quality findings
- `/claude-tweaks:review` is running its visual or QA modes
- `/claude-tweaks:demo` opens an on-demand live look at a record's resolved entry point ("See it yourself")
- A consumer skill needs to dispatch parallel agents that each drive a browser
- Ad-hoc browser ops — navigate, screenshot, scrape, fill a form, check a deployment

## Requirements

`agent-browser` must be installed. See `_shared/browser-detection.md` for the detect / install / verify procedure, daemon lifecycle (auto-starts on port 4848), and recovery (`agent-browser doctor`).

## Input

`$ARGUMENTS` is freeform — a URL, a task description, or a session-management command. There is no fixed argument schema; the skill translates the request into one or more `agent-browser` operations.

| Pattern | Example | Behavior |
|---------|---------|----------|
| *(none)* | — | List active sessions (`agent-browser session list`) if any are open; otherwise show session conventions and exit |
| `<URL>` | `https://example.com` | Open a default session at the URL and snapshot |
| `<task description>` | `walk the checkout flow on https://example.com` | Plan and execute multi-step ops to satisfy the task |
| `--session <name> open <URL>` | `--session checkout-flow open https://example.com` | Open a named session |
| `--session <name> click <ref>` | `--session checkout-flow click @e12` | Operate within a named session (ref resolved via a prior `find`, e.g. `find role button --name Pay`) |
| `set viewport <wxh>` | `set viewport 1280x800` | Adjust viewport for the active session |
| `set device "<name>"` | `set device "iPhone 14"` | Emulate a device profile |
| `backend=chrome <URL or task>` | `backend=chrome https://app.example.com/settings` | Routes through the native `mcp__claude-in-chrome__*` tools (user's live authenticated Chrome session) instead of `agent-browser`. Human-invoked only. |
| `--quick` | `https://example.com --quick` | Human-invoked ad-hoc mode: relaxes the minimum-two-screenshot and mandatory-trace-on-failure conventions for this invocation only (see Conventions Defined Here). Never used by `/stories`, `/visual-review`, `/review`, `qa-agent`, `/flow`, or a Routine. |

See `agent-browser-reference.md` in this skill's directory for the full operation vocabulary (snapshot, find, fill, type, vitals, trace, batch, react, auth vault, viewport/device flags).

`backend=chrome` is a narrow escape hatch, not a second backend: it covers navigate, read page, click, type/fill, and screenshot only — no vitals, trace, react introspection, or auth vault (the session is already authenticated, so the vault has no job). It is never auto-selected and must never be used by `/stories`, `/visual-review`, `/review`, `qa-agent`, `/flow`, or a Routine — those stay `agent-browser`-only, per `CLAUDE.md`'s `Don'ts`.

## Workflow

For direct invocation (bare URL or task description, not a knowledge-dependency read by a parent skill):

1. Confirm `agent-browser` is installed (see Requirements) — run the detect/verify step from `_shared/browser-detection.md` if not already confirmed this session.
2. Resolve a session name — reuse `--session <name>` if given, otherwise derive a kebab-case name from the task (see Session naming below).
3. Translate the request into ops: `open` the URL, `snapshot`, then `find`/`click`/`fill`/`type` as needed to satisfy a task description. For a bare URL, `open` + `snapshot` is sufficient.
4. Screenshot per the Screenshot path convention (minimum two: initial load, final state) — unless `--quick` is set, see Conventions Defined Here.
5. On any step failure: capture a trace, include its path in the failure report, then close the session.
6. Close the session when the task is done.

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

Minimum two screenshots per task: one after initial load, one at the final state. Annotated screenshots (numbered overlays matching snapshot refs) follow the same path convention. `--quick` (human-invoked, direct ad-hoc use only) relaxes this minimum — see Input.

### Trace path

```
traces/<session>/<timestamp>.zip
```

Capture a trace before closing a session whenever a step fails. Failure reports must include the trace path. There is no automatic retention policy — users manage cleanup. `--quick` (human-invoked, direct ad-hoc use only) waives mandatory trace-on-failure for the current invocation — see Input. `/stories`, `/visual-review`, `/review`, `qa-agent`, `/flow`, and Routines never set `--quick`; the full evidentiary discipline stays mandatory for those consumers regardless of how they invoke browser ops.

### Lifecycle

```
open  →  ops (snapshot, find, click, fill, screenshot, vitals, …)  →  close
```

Daemon is implicit. Always close the session when the task is done — leaked sessions consume resources. On step failure: capture trace, then close. List sessions with `agent-browser session list` if you suspect leaks.

### Operation vocabulary

Consumer skills speak abstract operation names (open, snapshot, find, click, fill, type, screenshot, vitals, trace, close, batch, react, auth vault, viewport/device flags, …). No local copy of the concrete mappings lives here — `agent-browser-reference.md` in this skill's directory is the single source of truth for every operation-to-command translation. Read that file directly before invoking commands you do not have memorized; a copy here would drift the moment the reference file's CLI syntax changes.

## Parallel Sessions

Each parallel agent gets its own `--session <unique-name>`. One browser instance per session. Memory cost scales with the number of concurrent sessions, not with the number of commands sent to a session — so reuse a session for sequential ops on the same page, and spin up a fresh session per parallel agent or per QA story instance.

> **Parallel execution:** Dispatch independent browser walks as parallel Task agents — each opens its own session, runs its ops, and returns a per-session result. Assemble results after all agents complete.
>
> **Contract:** Each agent follows `_shared/subagent-output-contract.md` — minimal input, status line first, output template inlined verbatim. Model tier: Standard (Sonnet) — browser-walk agents do multi-step navigation and structured observation, which exceeds Fast-tier mechanical extraction. Upgrade to Capable (Opus) only if the walk requires synthesis of subjective UX judgment.
>
> **Output template (each agent must follow exactly):**
>
> Use Template A when the walk reports issues / findings:
>
> ```markdown
> OUTPUT FORMAT (required):
> Return ONLY a markdown table, no preamble:
>
> | Severity | Path:Line | Finding | Evidence |
> |---|---|---|---|
> | critical | src/auth.ts:42 | Missing token expiry check | uses `<` not `<=` |
> | medium | src/api.ts:180 | Unhandled rejection | line 184: `await fetch(...)` no try/catch |
>
> Severity scale: critical / high / medium / low / info
> If no findings: return literal text "No findings."
> Return at most 15 rows, highest severity first; if more were found, append a final row reading "+N more" with the count in place of N — never omit this row when findings exceed the cap.
> Do not add narration, headers, or summaries before or after the table.
> ```
>
> Use Template B when the walk reports navigation locations / references:
>
> ```markdown
> OUTPUT FORMAT (required):
> Return ONLY bullet lines, one per match:
>
> - {path}:{line} — {one-line context}
>
> If no matches: return literal text "No matches."
> Do not add narration or grouping headers.
> ```
>
> Each agent's first reply line must be one of `DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED`, then the chosen template.

## Next Actions

Call `AskUserQuestion`:

- `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`
- Option 1 — `label`: `"Visual review (Recommended)"`, `description`: `"/claude-tweaks:visual-review {url} — run a structured visual review against the page or journey just driven"`
- Option 2 — `label`: `"Generate stories"`, `description`: `"/claude-tweaks:stories — generate or refresh QA story YAML files from the live DOM"`
- Option 3 — `label`: `"Full review"`, `description`: `"/claude-tweaks:review {spec} full — full review pipeline including code, visual, and QA passes"`
- Option 4 — `label`: `"Capture idea"`, `description`: `"/claude-tweaks:capture \"{idea}\" — save an idea surfaced while exploring the browser"`

## Component-Skill Contract

`/claude-tweaks:browse` is a conventions skill — it documents the operation vocabulary for `agent-browser` and is consumed transitively by `/claude-tweaks:stories`, `/claude-tweaks:visual-review`, `/claude-tweaks:review`, `/claude-tweaks:demo`, and the registered `qa-agent`. Those callers either inline the relevant operation text directly in their own dispatch prompts (parallel-session pattern) or call `agent-browser` commands by name; they do not "invoke" /browse as a workflow step. As a result, the `## Next Actions` block renders only when a user invokes `/browse` directly — when a parent skill is using these conventions as a knowledge dependency, no parent handoff exists to defer to and no Next Actions render in the parent's context. Detection: there is no `PIPELINE_RUN_DIR` signal because /browse never runs as a pipeline stage.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|-------------|
| Polling the dashboard programmatically | `http://localhost:4848` is a human debug surface — scraping it is brittle and unsupported |
| Storing `@eN` snapshot refs in YAML or persisted artifacts | Refs are session-scoped and regenerate on every snapshot — resolve them at runtime via `find` |
| Batching across sessions | One `agent-browser batch` invocation owns a single session's lifecycle — never mix session names in one batch |
| Using CSS or XPath selectors with `find` | Schema v2 forbids CSS/XPath — use semantic locators only (role, name, text, testid, label, placeholder) |
| Generic session names (`test`, `session1`) | Names show up in dashboards and trace paths — derive from purpose |
| Forgetting to close sessions | Leaked sessions consume memory — always `close` at the end of a run |
| Skipping the trace on failure | Failure reports without a trace path are not actionable — capture before closing |
| A consumer skill routes through `backend=chrome` | Breaks portability to hosted Routines — `agent-browser` is the only backend that works headless; this flag is human-invoked only |
| A consumer skill (`/stories`, `/visual-review`, `/review`, `qa-agent`, `/flow`, a Routine) sets `--quick` | Weakens the evidentiary discipline those flows depend on — `--quick` is for direct, human-invoked ad-hoc checks only |
| Skipping `set viewport`/`set device` and relying on env vars | Use the first-class `set viewport`/`set device` commands — env-var workarounds are not supported |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:stories` | Consumes /browse conventions for session naming, screenshot paths, and the operation vocabulary used to resolve semantic locators at runtime |
| `/claude-tweaks:visual-review` | Drives page, journey, and discover walks against `/browse`'s lifecycle; uses annotated screenshots and `vitals` from the operation table. `/visual-review` is the review procedure; `/browse` is the conventions reference for session naming, screenshot paths, trace paths, and the operation vocabulary. |
| `/claude-tweaks:review` | Delegates to /visual-review (visual mode) and qa-agent (QA mode) — both speak /browse's operation vocabulary transitively |
| `qa-agent` (`agents/qa-agent.md`) | Each story instance opens a uniquely named session; uses the auth vault and trace-on-failure conventions defined here |
| `/claude-tweaks:test` | Invokes qa-agent for QA story validation; trace paths from failed stories surface in /test reports |
| `/claude-tweaks:init` | Detects `agent-browser` availability during setup and records the requirement that /browse depends on |
| `/claude-tweaks:research` | Both utility skills (no fixed lifecycle position). `/browse` is interactive browser automation; `/research` is autonomous multi-source web research. |
| `/claude-tweaks:flow` | `/flow` invokes `/review` in full mode by default, which transitively drives `/visual-review` and `/browse` for the browser portion. Browser availability detected at `/flow` startup determines whether visual review runs. |
| `/claude-tweaks:help` | `/help` lists `/browse` in the utility skills table and surfaces availability when scanning for browser-dependent recommendations. |
| `/claude-tweaks:demo` | `/demo`'s "See it yourself" option (Step 2) opens an on-demand `agent-browser` session at a record's resolved entry point, following /browse's session-naming and lifecycle conventions directly — not a workflow-step invocation, the same relationship `/visual-review` has with `/browse`. |
