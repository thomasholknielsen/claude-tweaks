# Task 0 findings: ExitWorktree PreToolUse payload shape (empirical premise check)

Captured with throwaway `PreToolUse` hooks (matchers `ExitWorktree` and `EnterWorktree`) via `claude -p --settings /tmp/exitworktree-capture-373/hook-settings.json`, run headlessly from a scratch git repo at `/tmp/exitworktree-capture-373` (git-init'd, one seed commit) as cwd. The scratch repo has no `.claude/`, so the nested session loaded no plugins/project hooks — only the capture hooks from `--settings`. Full raw capture: `/tmp/exitworktree-capture-373/capture.jsonl` (ExitWorktree) and `/tmp/exitworktree-capture-373/enter.jsonl` (EnterWorktree) — scratch, not committed.

One scenario was run: the nested session committed the scratch repo's seed file, called `EnterWorktree` with `name: "capture-test"`, then immediately called `ExitWorktree` with `action: "remove"`.

## Pinned answers

**(a) Does the `ExitWorktree` PreToolUse `tool_input` carry an explicit worktree path?**
**No — and this is structural, not just an artifact of this one call.** `ToolSearch`'s loaded schema for `ExitWorktree` (`select:EnterWorktree,ExitWorktree`, checked directly, not inferred from the capture) declares only two parameters: `action` (`"keep"|"remove"`, required) and `discard_changes` (optional bool). There is no `path` field in the schema at all — the tool operates purely on "the worktree this session's EnterWorktree entered," tracked as session state, never passed as a tool argument. The captured payload matches: `tool_input` is exactly `{"action":"remove"}`.

**(b) What `cwd` does the hook payload carry at exit time — inside the worktree, or already outside?**
**Inside the worktree being exited.** The captured `PreToolUse` fires *before* the exit takes effect: `cwd` is `/private/tmp/exitworktree-capture-373/.claude/worktrees/capture-test` — the worktree's own path, not the original repo root. (Contrast with the `EnterWorktree` capture in the same run, whose `cwd` is `/private/tmp/exitworktree-capture-373` — the pre-entry original directory, also captured *before* that tool's effect takes place, consistent with PreToolUse semantics throughout.) Consequence for the gate design: since `tool_input` carries no path (per (a)), the gate's only source for "which worktree is being torn down" is this pre-exit `cwd` — its own containing worktree, resolved via `git rev-parse --show-toplevel` against that cwd — not a post-exit cwd, which was never observed and structurally isn't available at PreToolUse time anyway (the tool hasn't run yet).

**(c) Can a headless `claude -p` run drive EnterWorktree/ExitWorktree at all?**
**Yes, both are available and fully functional headlessly** — this run completed create → exit(remove) successfully end to end via `claude -p ... --settings ... --max-turns 12`, no interactive prompt required. Both tools are **deferred** in headless mode exactly as in interactive mode: the nested session had to call `ToolSearch({query: "select:EnterWorktree,ExitWorktree", max_results: 2})` before either name became callable — confirmed by grepping the session transcript, which shows exactly one `ToolSearch` call with that query preceding the `EnterWorktree`/`ExitWorktree` tool_use entries. A hook or harness design that assumes these tools are always-present (no deferred-load step) in headless mode would be wrong; one that assumes they're unavailable headlessly would also be wrong. They're present, but gated behind the same deferred-tool discovery step as interactively.

## Raw payload lines (verbatim from capture.jsonl / enter.jsonl)

`ExitWorktree` PreToolUse (`capture.jsonl`):

```json
{"session_id":"25b8fe55-2121-497d-9a63-5661287f5548","transcript_path":"/Users/thomasholknielsen/.claude-accounts/memenu/projects/-private-tmp-exitworktree-capture-373--claude-worktrees-capture-test/25b8fe55-2121-497d-9a63-5661287f5548.jsonl","cwd":"/private/tmp/exitworktree-capture-373/.claude/worktrees/capture-test","prompt_id":"e6d8dcec-2a40-476a-93d7-bc36011ddba9","permission_mode":"auto","effort":{"level":"high"},"hook_event_name":"PreToolUse","tool_name":"ExitWorktree","tool_input":{"action":"remove"},"tool_use_id":"toolu_01DNvJRcDmBYzZrMWagsYZn2"}
```

`EnterWorktree` PreToolUse (`enter.jsonl`), for contrast — pre-entry `cwd` is the original repo root, not the worktree:

```json
{"session_id":"25b8fe55-2121-497d-9a63-5661287f5548","transcript_path":"/Users/thomasholknielsen/.claude-accounts/memenu/projects/-private-tmp-exitworktree-capture-373/25b8fe55-2121-497d-9a63-5661287f5548.jsonl","cwd":"/private/tmp/exitworktree-capture-373","prompt_id":"e6d8dcec-2a40-476a-93d7-bc36011ddba9","permission_mode":"auto","effort":{"level":"high"},"hook_event_name":"PreToolUse","tool_name":"EnterWorktree","tool_input":{"name":"capture-test"},"tool_use_id":"toolu_01KrNWkFuVdGGKeNC4s8TwyF"}
```

## Implication for later tasks

The spec's cwd-fallback design is not just pre-authorized fallback — it is the *only* viable design given (a): `ExitWorktree`'s `tool_input` schema has no path field, so a gate keyed on this hook must resolve its teardown target as "the worktree containing the PreToolUse `cwd`" (`git rev-parse --show-toplevel` against that cwd), per (b) always still the worktree-in-teardown at the moment the hook fires, never the post-teardown original directory. (c) confirms the gate design doesn't need a headless-unavailability branch: both tools are real, callable, and hook-observable in headless `claude -p` sessions, gated only behind the same `ToolSearch` deferred-load step used everywhere else — a fixture/test harness driving this gate headlessly must account for that load step (or pre-resolve the tools) exactly as any other deferred-tool test would.
