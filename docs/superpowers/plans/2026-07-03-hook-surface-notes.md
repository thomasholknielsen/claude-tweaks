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

## Task 9 Smoke Test Results

**hooks/hooks.json** registers all six events through the dispatcher (`node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" <event>`). SessionStart/SessionEnd/PreCompact/SubagentStop each get one unmatchered entry. PreToolUse and PostToolUse each get TWO entries — `matcher: "Bash"` paired with `if: "Bash(git commit *)"` on one, `if: "Bash(git push *)"` on the other — per the `content` MATCHER_MODE decision above. SessionStart's prior standalone deps-check invocation (`bin/lib/deps.js`) is gone; `session-start.js`'s `run()` now calls `deps.collect()` itself, so the dispatcher-routed registration preserves the old behavior.

### Step 2 — JSON validity + six-event simulation

| Check | Result |
|---|---|
| `node -e "JSON.parse(...)"` | PASS — `valid json` |
| `session-start` via echo-pipe | PASS — exit 0 |
| `session-end` via echo-pipe | PASS — exit 0 |
| `pre-compact` via echo-pipe | PASS — exit 0 |
| `pre-tool-use` via echo-pipe | PASS — exit 0 |
| `post-tool-use` via echo-pipe | PASS — exit 0 |
| `subagent-stop` via echo-pipe | PASS — exit 0 |

### Step 3 — smoke test (adapted: no interactive session available)

Scratch repo built per the brief: `mktemp -d`, `git init`, fabricated `.claude-tweaks/pipelines/2026-07-03T120000-spec-99/run-state.json` = `{"status":"interrupted"}`.

| Check | Method | Result |
|---|---|---|
| (b3) A1 stale-run detection end-to-end | `echo '{"cwd":"$SCRATCH"}' \| node bin/hooks.js session-start` | PASS — stdout is valid JSON; `additionalContext` includes `claude-tweaks: unfinished pipeline run(s) detected ... 2026-07-03T120000-spec-99 (status: interrupted)` |
| (c3) E1 no-worktree-assigned → allow | `pre-tool-use` with a `git commit` payload, cwd=$SCRATCH, before any `record-worktree` call | PASS — no `permissionDecision` in output, exit 0 |
| (c3) E1 deny on mismatched worktree | `record-worktree` + `git commit` payload into `pre-tool-use` | See finding below — literal brief path failed; real path passed |
| (c3) E1 `close-run` lifts the deny | `close-run` (no `--run`, cwd=$SCRATCH) then re-pipe the same `git commit` payload | PASS — run-state.json `status` → `"clean"`; re-piped `pre-tool-use` produced no deny (exit 0, empty decision) because the now-terminal run is excluded from `listRunDirs` |
| (d) One headless live check | `claude -p 'Reply with exactly OK' --plugin-dir "...claude-tweaks"` from $SCRATCH, 120s timeout | PASS — printed `OK`, exit 0. Post-run inspection: `run-state.json` → `{"status":"interrupted","lastEvent":"session-end", ...}`; `events.jsonl` gained one `session-end` entry (`reason: "other"`, real `sessionId`) confirming `session-end.js` fired and executed correctly inside a real Claude Code session |

**Finding — brief's literal `/somewhere/else` path never triggers deny:** Following the brief's Step 3(d) verbatim (`node bin/hooks.js record-worktree /somewhere/else`, which does not exist on disk) and then piping a `git commit` PreToolUse payload produced **no deny** (empty output, exit 0). Root cause: `pre-tool-use.js`'s `run()` computes `assigned = safeReal(ctx.runState.worktree)` via `fs.realpathSync`, which throws (returns `null` via `safeReal`'s catch) for a non-existent path, and the function bails immediately on `if (!assigned) return {};` — before ever comparing against the commit's actual target. This is consistent with the module's documented "ambiguity → allow" philosophy (see its header comment) but the specific sub-case ("assigned worktree path itself doesn't resolve") isn't called out in that comment, and it means a corrective `record-worktree` call given a typo'd/deleted path silently no-ops the whole discipline check rather than denying or erroring loudly. **Not fixed** — flagging as a real behavior to confirm is intentional (in practice `record-worktree` is always called by `/superpowers:using-git-worktrees`-style flows with a real, just-created worktree path, so the gap is unlikely to bite in normal use, but it's worth a deliberate call rather than silent fail-open). To validate the actual deny mechanism, re-ran with a second real `mktemp -d` directory as the assigned worktree instead of the literal example path — this produced the expected `permissionDecision: "deny"` with the correct corrective reason text, and logged a `wd-deny` event to `events.jsonl` (`expected`/`actual` real paths, truncated command). `close-run` afterward correctly lifted it (see table above).

### Checks deferred to a human (require an interactive session)

- (a) Startup banner shows the A1 stale-run context visually in an interactive session (headless `-p` mode doesn't render a startup banner; A1 was instead verified directly via dispatcher invocation, see table above).
- (b) `/hooks` (or the session debug view) lists all six registrations. Structural correctness of `hooks/hooks.json` was validated (Step 2) and each event's module was exercised directly via the dispatcher, but the in-session `/hooks` listing itself was not visually inspected.

### Full test suite

`npm test` — 370/370 passing after the `hooks/hooks.json` change (no existing hook tests reference the old `bin/lib/deps.js`-direct SessionStart registration, so no test updates were needed).
