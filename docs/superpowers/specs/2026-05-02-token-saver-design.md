# Token Saver — Design

**Status:** Draft
**Target version:** claude-tweaks v4.2.0
**Date:** 2026-05-02

## Background

Audit of two community plugins, [governor](https://github.com/0xhimanshu/governor) and [caveman](https://github.com/JuliusBrussee/caveman), surfaced patterns for reducing Claude Code token consumption. Of those patterns, the highest-leverage one for claude-tweaks is governor's `PostToolUse[Bash]` output filter — it blocks 96.8% of noisy `pytest -vv` output in their benchmarks while preserving failure signals. Caveman's bash-filtering equivalent does not exist; caveman's value is output-style compression (rejected here as incompatible with claude-tweaks' professional aesthetic).

This design adds three components to claude-tweaks:

1. A **bash output filter** (port of governor's logic) — harness-level hook, no skill changes required.
2. A **statusline** showing session token savings plus other workflow-relevant signals — fixed segment set, self-sufficient, no external dependency on community statusline tools.
3. A **subagent terse-output contract** — content edits to skills with parallel dispatch sites, instructing dispatched agents to return findings in structured templates instead of prose.

Plus dependency checks (Node + git CLI) at setup with consent-gated auto-install.

## Goals

- Reduce token consumption from heavy bash output (test runs, build outputs, browser snapshots) without behavior changes to skills.
- Provide visibility into token savings via a built-in statusline.
- Reduce token consumption from parallel-dispatched subagents by standardizing their output format.
- Cross-platform: macOS and Windows are the gated targets. Linux is best-effort (deps detection covers apt/dnf/pacman) but not part of v4.2 acceptance gates.
- Keep claude-tweaks self-sufficient — no required external statusline plugins.

## Non-goals

- Output-style compression (caveman dialect) — incompatible with claude-tweaks aesthetic.
- Generic widget framework competing with ccstatusline — fixed segment set only.
- Cost tracking, themes, Powerline, Nerd Fonts — out of scope.
- Per-user statusline configuration TUI — defer until requested.
- Memory-file compression (governor's `/compress`) — separate scope, defer.

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│ Layer 1 — Hooks (harness-level, automatic)                     │
│                                                                │
│  SessionStart hook                                             │
│    └─ deps.js: Node + git CLI detection (replaces existing     │
│       agent-browser one-liner; absorbs that check)             │
│                                                                │
│  PostToolUse[Bash] hook                                        │
│    ├─ filter-bash-output.js (~300 lines, port of governor)     │
│    ├─ Threshold + noisy-command logic                          │
│    ├─ summarize_output: failure regex + head/tail slicing      │
│    ├─ Always-saved raw log → ~/.claude-tweaks/logs/bash-{ts}.log│
│    └─ Telemetry append → ~/.claude-tweaks/logs/filter.jsonl    │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ Layer 2 — Statusline (binary invoked by Claude Code)           │
│                                                                │
│  bin/claude-tweaks-statusline.js (~200 lines)                  │
│    ├─ Reads stdin JSON from Claude Code                        │
│    ├─ Reads filter.jsonl, usage.json cache, git, ledger, specs │
│    └─ Emits 9-segment line with semantic ANSI colors           │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ Layer 3 — Skill content (subagent terse-output contract)       │
│                                                                │
│  skills/_shared/subagent-output-contract.md (SSOT)             │
│    ├─ Template A — review-style (markdown table)               │
│    ├─ Template B — search-style (bullet lines)                 │
│    └─ Template C — scout-style (yes/no + evidence, ≤200 tok)   │
│                                                                │
│  Inline reminders in 7 skills with parallel dispatch:          │
│  /review, /visual-review, /reflect, /journeys, /stories,       │
│  /test, /build                                                 │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ Layer 4 — Documentation                                        │
│                                                                │
│  README.md, CLAUDE.md, /claude-tweaks:help reference card      │
└────────────────────────────────────────────────────────────────┘
```

## Component A — Bash output filter

### Trigger

`PostToolUse[Bash]` hook fires after every `Bash` tool call.

### File

`bin/filter-bash-output.js` (~300 lines, port of governor's `summarize_output` + `hook_post_tool` from `governor.py`).

### Constants (matching governor verbatim)

```
TOOL_FILTER_THRESHOLD = 16,000 chars
SUMMARY_HEAD_LINES    = 30
SUMMARY_TAIL_LINES    = 40
NOISY_COMMAND_RE      = /\b(test|pytest|vitest|jest|mocha|rspec|cargo\s+test|
                          go\s+test|npm\s+test|pnpm\s+test|yarn\s+test|build|
                          tsc|eslint|ruff|mypy|grep|rg|find|ls|cat|tail|docker|
                          kubectl|journalctl|playwright)\b/i
                          ↑ added "playwright" for claude-tweaks
FAILURE_RE            = /(error|failed|failure|exception|traceback|panic|
                          assert|expected|received|FAIL|FAILED|✕|×|file:line:col)/i
```

### Decision logic

```
filter only if raw_chars >= 16,000 AND one of:
  (noisy_command AND failed)
  (noisy_command AND raw_chars >= 32,000)
  (raw_chars >= 64,000)
otherwise → passthrough
```

### Summarization

When the filter fires:

1. Always write raw stdout+stderr to `~/.claude-tweaks/logs/bash-{ts}.log`.
2. Detect failure lines (regex over stdout+stderr) — keep up to 80, display first 60.
3. Head 30 lines + `... clipped N lines ...` + tail 40 lines for stdout.
4. Same head/tail for stderr.
5. Prepend command, exit code, failure-line count.
6. Append `[full output: ~/.claude-tweaks/logs/bash-{ts}.log]`.
7. Return summary via `additionalContext` in hook response JSON.

### Telemetry write (always)

```jsonc
// ~/.claude-tweaks/logs/filter.jsonl
{"ts": 1730568234, "session_id": "...", "command": "npm test",
 "raw_tokens": 4200, "summary_tokens": 380, "blocked": 3820,
 "exit_code": 1, "filtered": true}
```

When `filtered: false`, `summary_tokens === raw_tokens` and `blocked === 0`.

### Token estimation

Use `chars / 4` (governor's approach — fast, no tokenizer dep).

### Log retention

- Raw bash logs: rotate per-session, keep last 50 files.
- `filter.jsonl`: append-only, no rotation. Statusline reads tail.

### Failure modes

- Hook script error → return passthrough. Never crash a bash call.
- Disk full → log to stderr, return passthrough.
- JSONL append fails → log to stderr, continue (telemetry is best-effort).
- Malformed input on stdin → exit 0, no error to user.

## Component B — Statusline

### Trigger

Claude Code invokes `statusLine.command` from `settings.json` on every prompt with statusline JSON on stdin.

### File

`bin/claude-tweaks-statusline.js` (~200 lines).

### Output

Single line, ASCII only, two-space separator, semantic ANSI 8-color (red/yellow/green) with `NO_COLOR` respect.

```
sonnet 4.6  ctx: 18%  eff: high  main●  sess: 42% (3h)  week: 71% (4d)  saved: ↓2.4k  spec: 0042  ledger: 3 open
```

### Segments (9 fixed)

| # | Segment | Example | Source | Hide condition |
|---|---|---|---|---|
| 1 | Model | `sonnet 4.6` | stdin JSON | never |
| 2 | Context % | `ctx: 18%` | stdin JSON | never |
| 3 | Thinking effort | `eff: high` | stdin JSON | unset/"default" |
| 4 | Git branch + dirty | `main●` | `git symbolic-ref HEAD` + `git status --porcelain` | not in repo |
| 5 | Session usage | `sess: 42% (3h)` | cache.session | cache miss / API err |
| 6 | Weekly usage | `week: 71% (4d)` | cache.weekly | cache miss / API err |
| 7 | Token savings | `saved: ↓2.4k` | filter.jsonl since session start | 0 events |
| 8 | Active spec | `spec: 0042` | scan `INBOX/` for most-recent spec | none active |
| 9 | Open ledger | `ledger: 3 open` | parse open ledger file | empty/absent |

### Reset countdown formatting (segments 5, 6)

Time-until-reset auto-scales: `45m` → `3h` → `4d`. Drops parenthetical when `<1h` to keep short.

### Color thresholds

| Color | When | Segments |
|---|---|---|
| Red | ≥90% threshold or critical | ctx, sess, week, ledger ≥10 |
| Yellow | ≥75% threshold or warning | ctx, sess, week, ledger ≥3, dirty branch marker |
| Green | Positive state | saved (when >0) |
| Default | Neutral info | model, eff, spec, healthy thresholds, clean branch |

`NO_COLOR=1` (or any non-empty value) → emit plain text. Universal env var, no claude-tweaks-specific override needed.

### Usage cache

`~/.claude-tweaks/cache/usage.json`:

```jsonc
{
  "session": { "pct": 42, "reset_at": 1730580000 },
  "weekly":  { "pct": 71, "reset_at": 1730851200 },
  "fetched_at": 1730568234
}
```

Refresh strategy:

- `SessionStart` hook: refresh asynchronously.
- Statusline render: if `now - fetched_at > 60s`, fire async refresh and return current values this tick. If cache empty entirely, hide segments.
- API error: keep stale cache; hide segments after `>30min` stale.

Auth: read `~/.claude.json` for credentials. If absent, hide both usage segments silently.

### Performance budget

- Render in <100ms.
- Tail-only reads of `filter.jsonl` (last 1KB).
- No synchronous network calls.
- Git shell-out: 2 commands, <20ms typical.

### Failure modes

- Script error → empty string. Statusline disappears, doesn't crash Claude Code.
- API auth missing → usage segments hidden silently.
- JSONL malformed → skip bad lines, continue parsing.
- Spec/ledger absent → those segments hide.

## Component C — Subagent terse-output contract

### Single source of truth

`skills/_shared/subagent-output-contract.md` — referenced from every parallel-dispatch site, similar pattern to `skills/test/verification.md`.

### Three task-type templates

**Template A — Review-style** (returns findings):

```
OUTPUT FORMAT (required):
Return ONLY a markdown table, no preamble:

| Severity | Path:Line | Finding | Evidence |
|---|---|---|---|
| critical | src/auth.ts:42 | Missing token expiry check | uses `<` not `<=` |

Severity: critical / high / medium / low / info
If no findings: return literal text "No findings."
Do not add narration, headers, or summaries.
```

**Template B — Search-style** (returns locations):

```
OUTPUT FORMAT (required):
Return ONLY bullet lines, one per match:

- {path}:{line} — {one-line context}

If no matches: return literal text "No matches."
Do not add narration or grouping headers.
```

**Template C — Scout-style** (returns yes/no + evidence):

```
OUTPUT FORMAT (required):
First line: "yes" or "no"
Second line onward: up to 3 bullet lines of evidence (path:line — context).
Maximum 200 tokens total.
```

### Inline reminders in skill files

Each Form A/B/C blockquote in skill files gets one new line:

```
> **Parallel execution:** Dispatch {scope} as parallel Task agents — each runs independently and returns {output format}. Assemble results after all agents complete.
> **Output contract:** Each agent must follow Template {A|B|C} from `skills/_shared/subagent-output-contract.md`. Reject and re-prompt on format violations.
```

### Hard enforcement

The dispatching skill includes the literal template in the agent's prompt. Agents only see what's in their prompt — they can't read sibling files. Pattern:

```
Task({
  description: "Review accessibility of dashboard page",
  prompt: `<task description>

OUTPUT FORMAT (required):
Return ONLY a markdown table, no preamble:
| Severity | Path:Line | Finding | Evidence |
...`,
})
```

### Re-prompt on violation

When an agent returns malformed output, the dispatcher re-prompts:

```
"Your output didn't match the required format. Re-emit using only this format:
{template repeated}
Do not add explanation."
```

Cap at one retry. If still malformed, accept what you got and move on.

### Skills affected

| Skill | Dispatch sites | Template |
|---|---|---|
| `/review` | parallel review angles | A |
| `/visual-review` | per-page review agents | A |
| `/reflect` | per-lens reflection | A |
| `/journeys` | per-journey extraction | B |
| `/stories` | per-flow story-generation | B |
| `/test` | parallel verification | C |
| `/build` | search subagents (when used) | B |

### Anti-patterns to call out in the contract file

- Don't pad templates with optional sections "if relevant" — agents include them.
- Don't use "be concise" / "summarize" — too soft.
- Don't ask for both narration AND a table — agents pick narration.
- Don't omit severity scale — agents invent their own.

## Setup & dependency handling

### Dependencies

| Dep | Why | If missing |
|---|---|---|
| Node | bash filter, statusline | print install instructions, disable both features |
| Git CLI | git branch segment | print install instructions, hide that segment only |

### Auto-install with consent

`/claude-tweaks:init` and `SessionStart` deps check use this flow:

```
For each missing dep:
  Detect platform → detect package manager
  ├─ Manager detected, no version-manager conflict:
  │   Prompt: "Install {dep} via {manager}? (y/N)"
  │   If yes: run install command (no sudo from us)
  │   If no: print manual instructions, continue
  ├─ Version manager detected (nvm/fnm in PATH):
  │   Print: "Node managed by nvm/fnm — install via your manager"
  └─ No manager detected:
      Print platform-appropriate install instructions
```

### Supported package managers

| Platform | Detect | Install command |
|---|---|---|
| macOS | `brew --version` | `brew install {dep}` |
| Windows | `winget --version` | `winget install OpenJS.NodeJS` / `winget install Git.Git` |
| Windows | `scoop --version` | `scoop install nodejs` / `scoop install git` |
| Linux (Debian/Ubuntu) | `apt --version` | `sudo apt install {dep}` (printed, not run) |
| Linux (Fedora) | `dnf --version` | `sudo dnf install {dep}` (printed, not run) |
| Linux (Arch) | `pacman --version` | `sudo pacman -S {dep}` (printed, not run) |

### Safety rails

- No silent installs — always prompt for consent.
- No sudo elevation from us.
- No bypassing version managers — detect and defer.
- No installing the package manager itself.

### Statusline wiring in `/claude-tweaks:init`

```
1. Detect Node + git
2. Read existing settings.json statusLine.command:
   - None → offer to set ours: "Configure claude-tweaks statusline? (Y/n)"
   - Different command → print our command, suggest manual composition
   - Already ours → no-op
3. If user accepts → write settings.json with backup
```

### Settings.json command (cross-platform)

```jsonc
{
  "statusLine": {
    "type": "command",
    "command": "node ~/.claude/plugins/claude-tweaks/bin/claude-tweaks-statusline.js"
  }
}
```

`~` works on Windows in Claude Code v2.1.47+. Older Windows: `/claude-tweaks:init` writes `%USERPROFILE%`-expanded path.

## File layout

### Repo additions

```
claude-tweaks/
├── .claude-plugin/plugin.json           (version 4.1.0 → 4.2.0)
├── hooks/hooks.json                     (extended: PostToolUse[Bash], updated SessionStart)
├── bin/                                 NEW
│   ├── claude-tweaks-statusline.js      (~200 lines)
│   ├── filter-bash-output.js            (~300 lines)
│   └── lib/
│       ├── paths.js                     (cross-platform path resolution)
│       ├── jsonl.js                     (append + tail-read helpers)
│       ├── color.js                     (ANSI helpers + NO_COLOR detection)
│       └── deps.js                      (Node + git detection, package-mgr probing)
├── skills/_shared/                      NEW
│   └── subagent-output-contract.md      (Templates A/B/C, anti-patterns)
├── skills/init/SKILL.md                 (extended: deps + statusline setup)
├── skills/help/SKILL.md                 (extended: filter + statusline mention)
├── skills/{review,visual-review,reflect,journeys,stories,test,build}/SKILL.md
│                                        (Form A/B/C reminders + Template literals)
├── tests/                               NEW
│   ├── filter-bash-output.test.js
│   └── statusline.test.js
├── README.md                            (filter + statusline + deps sections)
└── CLAUDE.md                            (extended Don'ts)
```

### Runtime state (user's home)

```
~/.claude-tweaks/                        created on first hook fire
├── logs/
│   ├── bash-{ts}.log                    raw bash output, last 50 kept
│   └── filter.jsonl                     append-only telemetry
└── cache/
    └── usage.json                       refreshed every 60s
```

Cross-platform: `os.homedir() + path.join('.claude-tweaks', ...)`.

### Updated hooks.json

```jsonc
{
  "hooks": {
    "SessionStart": [
      { "hooks": [{ "type": "command", "command": "node ~/.claude/plugins/claude-tweaks/bin/lib/deps.js" }] }
    ],
    "PostToolUse": [
      { "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "node ~/.claude/plugins/claude-tweaks/bin/filter-bash-output.js" }] }
    ]
  }
}
```

`deps.js` replaces the existing agent-browser one-liner and absorbs that check.

## Data flow

### Bash filter

```
1. User triggers Bash(npm test) via skill
2. Bash executes; stdout/stderr/exit_code captured
3. Claude Code fires PostToolUse[Bash] hook
4. Hook command: node bin/filter-bash-output.js (with payload on stdin)
5. Filter runs decision logic
6. Always writes raw → ~/.claude-tweaks/logs/bash-{ts}.log
7. Always appends event → ~/.claude-tweaks/logs/filter.jsonl
8. If filter triggered: returns { hookSpecificOutput: { additionalContext: <summary> } }
   Otherwise: returns {} (passthrough)
9. Claude sees either summary or raw output
```

### Statusline

```
1. Claude Code prepares to render UI
2. Spawns settings.json statusLine.command
3. Sends statusline JSON on stdin
4. Script reads sources for each segment, hides segments without data
5. Joined with two-space separator, ANSI colors applied per thresholds
6. Output written to stdout, < 100ms total
7. If usage cache stale, fork async refresh (don't block)
```

## Testing

### Layer 1 — Filter unit tests (`tests/filter-bash-output.test.js`)

| Test | Input | Expected |
|---|---|---|
| Below threshold | 8KB stdout, exit 0, `git status` | passthrough |
| Below threshold + failure | 8KB stdout, exit 1, `git status` | passthrough (size dominates) |
| Noisy + failure | 17KB pytest output, exit 1 | filter triggers, summary contains failure lines |
| Noisy + huge | 50KB jest output, exit 0 | filter triggers (≥32KB rule) |
| Generic huge | 70KB curl output, exit 0 | filter triggers (≥64KB rule) |
| Stderr preservation | 5KB stdout + 8KB stderr, exit 1 | stderr in summary head/tail |
| Failure regex | mock pytest with FAIL/AssertionError | failure lines first in summary |
| Raw log written | any filtered call | log file exists at expected path |
| Telemetry written | any call | event appended to filter.jsonl |
| Malformed input | invalid JSON on stdin | exit 0, no error |

Use Node's built-in `node --test` runner.

### Layer 2 — Statusline unit tests (`tests/statusline.test.js`)

| Test | Input | Expected |
|---|---|---|
| Empty cache, no skills, no specs | minimal stdin | `sonnet 4.6  ctx: X%` only |
| Full population | populated stdin + cache + filter.jsonl + spec + ledger | all 9 segments |
| Auto-hide | no git, no usage cache | git/sess/week absent, no dangling separators |
| `NO_COLOR` respected | env `NO_COLOR=1` | no ANSI codes |
| Color thresholds | ctx 92% in stdin | red ANSI on context |
| Stale cache | fetched_at > 30min ago | usage segments hidden |
| Performance | full population | render <100ms |

### Layer 3 — Subagent contract integration

Hard to unit-test (requires actual model behavior). Integration tests:

1. Run `/review` against a small known-bad code snippet, verify dispatched agents return tables matching Template A.
2. If agent returns malformed output, verify dispatcher re-prompts and accepts second response.
3. Manual review of resulting diff sizes vs. baseline (pre-contract) on the same prompt.

### Layer 4 — Manual smoke tests

Run with `claude --plugin-dir .`:

1. Start a session; verify SessionStart deps check fires.
2. Run heavy `npm test` — verify filter triggers, log file exists, telemetry appended.
3. Verify statusline renders all expected segments.
4. Trigger `/claude-tweaks:init` on a fresh project — verify dep prompts and statusline wiring.
5. Set `NO_COLOR=1`, restart, verify plain-text statusline.

## Rollout

**Single ship: v4.2.0** — bash filter + statusline + subagent contract together.

- Risk: medium. Larger surface, harder to attribute regressions.
- Mitigations: comprehensive test coverage in all four layers before merge; manual smoke test on macOS and Windows; tag clean commit before merge for fast revert.
- Backout: revert merge commit. User runtime state under `~/.claude-tweaks/` stays but becomes inert.

## Acceptance criteria for v4.2.0

- All Layer 1, 2, and 3 tests pass on macOS and Windows.
- Manual smoke test passes on both platforms.
- `NO_COLOR=1` produces plain output.
- `/claude-tweaks:init` successfully wires statusline + handles dep prompts on a fresh project.
- All 7 skills updated with inline reminders + templates.
- `skills/_shared/subagent-output-contract.md` exists and is bidirectionally cross-referenced.
- Manual integration test on `/review` confirms ≥30% reduction in subagent output size on the same prompt.
- No regressions in lifecycle end-to-end (capture → wrap-up).
- README and CLAUDE.md updated.

## Documentation updates

| File | Update |
|---|---|
| `README.md` | "Token-saving features" section: bash filter, statusline (with example), prerequisites, setup walkthrough |
| `CLAUDE.md` | Add to Don'ts: "Don't write to `~/.claude-tweaks/` from skill content — runtime state owned by harness layer" |
| `/claude-tweaks:help` reference card | Mention statusline + filter, point to `~/.claude-tweaks/logs/` for raw output |
| Plugin marketplace description | Highlight token savings as v4.2 feature |

## Cross-platform sanity

| Concern | Resolution |
|---|---|
| Path separator | `path.join`, `os.homedir()` |
| Shell quoting in hook commands | Direct `node script.js`, no shell pipelines |
| `~` in settings.json | Works on Claude Code v2.1.47+; older Windows gets `%USERPROFILE%` expansion in setup |
| Line endings in logs | `\n` (Node default) |
| Symlinks | Not used |
| Permissions | All files in user home; no sudo from us |

## Out of scope (explicit)

- Output-style compression (caveman dialect).
- Per-segment configuration / TUI / themes.
- Cost tracking, MCP monitoring, prayer times, niche segments.
- Memory-file compression (`/compress` for CLAUDE.md).
- Bypass slash command for filter — always-saved log path is the escape hatch.
- Multi-line statuslines.
- Lifecycle phase segment (cut to avoid extra hook).
- Standalone `/saver-stats` command — statusline replaces it.
- Generic widget framework (ccstatusline territory).
