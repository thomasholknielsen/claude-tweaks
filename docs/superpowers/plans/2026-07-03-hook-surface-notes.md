# Hook Surface — Task 1 Decision Record

- Docs consulted: https://code.claude.com/docs/en/hooks, fetched 2026-07-03
- Matcher semantics found (quoted verbatim from the docs):

  On the `matcher` field itself (tool-name only):

  > Each event type matches on a different field:
  >
  > | Event | What the matcher filters |
  > | `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `PermissionDenied` | tool name |

  On the `if` field, which adds content-level filtering on top of `matcher`:

  > For tool events, you can filter more narrowly by setting the [`if` field](#common-fields) on individual hook handlers. `if` uses [permission rule syntax](/en/permissions) to match against the tool name and arguments together, so `"Bash(git *)"` runs when any subcommand of the Bash input matches `git *` and `"Edit(*.ts)"` runs only for TypeScript files.

  On when the `if` check happens relative to spawning (from the "How a hook resolves" walkthrough, using a `matcher: "Bash"` + `if: "Bash(rm *)"` example):

  > If the command had been `npm test`, the `if` check would fail and `block-rm.sh` would never run, avoiding the process spawn overhead. The `if` field is optional; without it, every handler in the matched group runs.

  Example matching a Bash subcommand (from the "How a hook resolves" configuration example):

  ```json
  {
    "hooks": {
      "PreToolUse": [
        {
          "matcher": "Bash",
          "hooks": [
            {
              "type": "command",
              "if": "Bash(rm *)",
              "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/block-rm.sh",
              "args": []
            }
          ]
        }
      ]
    }
  }
  ```

  Interpretation: the `matcher` field alone only matches tool names (e.g. `"Bash"`), never command content. But `if` — a sibling field on each hook handler, using permission-rule syntax like `"Bash(git commit *)"` / `"Bash(git push *)"` — narrows on Bash command content, and this check runs **before** the handler's command is spawned. A non-matching `if` means the process is never spawned at all ("avoiding the process spawn overhead"), so per-fire cost is paid only on actual git-command fires, not on every Bash call.

- Node spawn cost (median of 3): 32ms
  - Raw runs: 0.032s, 0.032s, 0.031s (`time node /tmp/hook-noop.js`, node v20.12.0)

- MATCHER_MODE: content
  - content → matchers can scope to `git commit`/`git push` command content; dispatcher spawns only on git fires.

- **Registration shape for Task 9:** `matcher: "Bash"` PLUS `if: "Bash(git commit *)"` (and a second entry with `if: "Bash(git push *)"`). Do NOT put a content pattern inside the `matcher` field itself — `matcher` matches tool names only; the `if` field (permission-rule syntax) does the content filtering, before the hook process spawns.

**Rationale:** Decision rule per brief: "if content matchers exist → content." hooks.json does support content-scoped gating that prevents spawn on non-match — not via the `matcher` field itself (tool-name only), but via the sibling `if` field using permission-rule syntax (`"Bash(git commit *)"`, `"Bash(git push *)"`), evaluated pre-spawn by Claude Code itself. This satisfies the practical criterion behind `content` mode ("dispatcher spawns only on git fires") even though the registration shape for Task 9 is `matcher: "Bash"` + `if: "Bash(git commit *)"` / `if: "Bash(git push *)"` per handler, not a content-matching `matcher` field. The 32ms spawn cost (well under the 100ms tool-name-mode threshold) is recorded for completeness but is not the deciding factor, since `content` mode was reached first per the decision rule's precedence.
