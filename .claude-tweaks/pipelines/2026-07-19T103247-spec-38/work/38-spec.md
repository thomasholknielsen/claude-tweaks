---
record: 38
origin: human
risk: medium
effort: medium
grants: []
surface: backend
---
Surface: backend

## Current State

Root-caused directly against the actual source, not the code comment `pre-tool-use.js:104` pointed at (verified rather than assumed, per this project's own discipline about checking claims against literal files):

`bin/hooks.js`'s `close-run` subcommand supports an explicit `--run <path>` override before falling back to `resolveRunDir`:

```js
if (cmd === 'close-run') {
  const flagIdx = argv.indexOf('--run');
  const runDir = flagIdx !== -1 && argv[flagIdx + 1] ? argv[flagIdx + 1] : ctxLib.resolveRunDir(process.cwd(), process.env);
  ...
```

`record-worktree` has **no equivalent flag at all** — it calls `resolveRunDir(process.cwd(), process.env)` unconditionally:

```js
if (cmd === 'record-worktree') {
  const runDir = ctxLib.resolveRunDir(process.cwd(), process.env);
  ...
```

`resolveRunDir` (`bin/lib/hooks/context.js`) checks `env.PIPELINE_RUN_DIR` first, then falls back to `listRunDirs(cwd)[0]` — the lexically-newest ISO-timestamp-prefixed, non-`clean`-status directory under `.claude-tweaks/pipelines/`. The `env.PIPELINE_RUN_DIR` branch is structurally unreliable for this call site: `skills/build/worktree-setup.md`'s own documented invocation, Step 4.5, is `node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" record-worktree "$WORKTREE"` — no `PIPELINE_RUN_DIR=` prefix — and even if an earlier step in the same skill exported it, the Bash tool's own documented contract is that shell state (including exports) does not persist between separate tool-call invocations, only cwd does. So this call site *always* falls through to the "newest non-terminal run" heuristic in practice.

That heuristic is exactly the vulnerability: any stale non-terminal run left behind by an interrupted/incomplete wrap-up (never called `close-run`) stays eligible indefinitely, and a *later, unrelated* session's `record-worktree` call can resolve to it instead of its own run, overwriting `run-state.json` with the wrong worktree/session data — precisely what happened to record #19's run dir (overwritten with record #36's worktree data two days later).

**Confirmed this is not just historical:** auditing this session's own live run directories (per this record's own Deliverables) found `.claude-tweaks/pipelines/2026-07-19T072204-review-backlog-standalone/` sitting `status: interrupted` — a real, currently-eligible stale-run candidate for exactly this fallback. Closed it during this shaping pass (`close-run --run` on that path) as a one-off cleanup; the underlying mechanism that let it accumulate risk is what this record fixes.

## Deliverables

- Add `--run <path>` flag support to `record-worktree`, mirroring `close-run`'s existing pattern exactly (`bin/hooks.js`):
  ```js
  if (cmd === 'record-worktree') {
    const flagIdx = argv.indexOf('--run');
    const explicitRun = flagIdx !== -1 && argv[flagIdx + 1] ? argv[flagIdx + 1] : null;
    const worktreeArg = explicitRun ? argv[flagIdx + 2] : argv[3];
    const runDir = explicitRun || ctxLib.resolveRunDir(process.cwd(), process.env);
    ...
  ```
  (Adjust argv indexing so `--run <path>` can appear before or after the worktree-path positional argument — match whichever ordering keeps the change minimal against the existing `argv[3]` read.)
- Update `skills/build/worktree-setup.md` Step 4.5's invocation to resolve `$RUN_DIR` explicitly first (the standard `_shared/pipeline-run-dir.md` resolution snippet) and pass it via `--run "$RUN_DIR"`, eliminating this call site's dependence on the fallback resolver entirely:
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/bin/hooks.js" record-worktree --run "$RUN_DIR" "$WORKTREE"
  ```
- Keep the fallback (`resolveRunDir` with no `--run`) working unchanged for any other current or future caller that doesn't yet pass an explicit run dir — this is additive, not a breaking change to the CLI surface.

## Acceptance Criteria

- `record-worktree --run <path> <worktree>` writes `run-state.json` to exactly `<path>`, never to `resolveRunDir`'s fallback pick, even when a lexically-newer non-terminal run dir exists in the same project.
- A regression test in `tests/hooks-dispatcher.test.js` (alongside the existing `record-worktree`/`close-run` tests, using the same `tmpProject()`/`runHook()` helpers) reproduces this exact scenario: create two run dirs — an older one already `active` (simulating a stale, never-closed run) and a newer one for "this" run — call `record-worktree --run <newer-path> <worktree>`, and assert the older run dir's `run-state.json` is untouched while the newer one correctly received the worktree assignment. Without the fix (calling `record-worktree` the old way, no `--run`), the newer-by-timestamp dir would happen to still win in this particular ordering — construct the fixture so the OLDER dir is what `resolveRunDir`'s fallback would incorrectly pick (e.g. via `status: interrupted` timing or directory listing order) to prove the explicit flag is what makes the outcome deterministic, not an accident of naming.
- `skills/build/worktree-setup.md` Step 4.5's own invocation snippet now includes `--run "$RUN_DIR"` — verified by reading the updated file, not just the code change.
- Existing `record-worktree`/`close-run` tests in `tests/hooks-dispatcher.test.js` continue passing unchanged (the fallback path this record doesn't touch).
- No other currently-live non-terminal run directory in this repo shows cross-contaminated `worktree`/`sessionId` data at the time this record is built (spot-check `.claude-tweaks/pipelines/*/run-state.json` for any non-`clean` status whose `worktree` path doesn't correspond to a currently-existing worktree) — this record's own shaping pass already found and closed one such case (`review-backlog-standalone`), so this check should find nothing new baseline.

## Technical Approach

### Key Files

- `bin/hooks.js` — `record-worktree` subcommand handler (add `--run` flag parsing, mirroring `close-run`'s existing pattern in the same file).
- `skills/build/worktree-setup.md` — Step 4.5's invocation snippet.
- `tests/hooks-dispatcher.test.js` — new regression test, reusing `tmpProject()`/`runHook()`.

## Gotchas

- Don't touch `resolveRunDir` itself or its "newest non-terminal run" fallback logic — that heuristic is still the correct behavior for every OTHER caller that has no better signal (hook-event dispatch via `main()`'s own `resolveRunDir` call, `close-run` when invoked without `--run`). This fix is scoped to giving `record-worktree` an explicit override, not replacing the fallback mechanism project-wide.
- The regression test must actually construct a scenario where the fallback would pick WRONG — a naive two-dir fixture where the newer dir also happens to be what `resolveRunDir` would pick anyway proves nothing. Match `close-run`'s own existing test patterns in the same file for the two-session/ownership-check style of fixture construction.
- This record's own audit (closing the live `review-backlog-standalone` stale run) was a one-off manual cleanup during shaping, not a systematic sweep — a broader "audit all stale non-terminal runs across all projects using this plugin" is out of scope here; this record only fixes the mechanism going forward for this repo's own future runs.

## Original request

Hook fallback resolution wrote a later record's worktree state into an older, never-closed run directory

Origin: wrap-up reflection insight, discovered while wrapping up record #19

## Current State
While belatedly wrapping up record #19 (merged 2026-07-15, wrap-up never completed), its pipeline run directory's `run-state.json` was found containing data that cannot be correct:

```json
{
  "status": "interrupted",
  "lastEvent": "pre-compact",
  "updatedAt": "2026-07-17T08:45:41.357Z",
  "worktree": "/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/docs-health-skill-36",
  "sessionId": "7492eb41-bb60-40a4-a575-7f265be8302b"
}
```

Record #19's own build finished 2026-07-15 in worktree `docs-health-skill-36` is an unrelated, later record (#36) — that worktree still exists and is actively in use for different work. The `updatedAt` timestamp (2026-07-17, i.e. two days after #19's own build) confirms this file was overwritten well after #19's actual work concluded.

`bin/lib/hooks/pre-tool-use.js:104`'s own comment documents the mechanism this likely traces to: "the fallback resolver in bin/hooks.js always picks the newest non-terminal run" when resolving the active run for a hook event. Because #19's wrap-up never called `close-run` (the previous wrap-up attempt was interrupted mid-cleanup — see the two `contract-violation` events in its `events.jsonl`), its run directory stayed eligible for that fallback indefinitely, and some later, unrelated session's hook activity appears to have resolved to it and overwritten its `run-state.json` with the wrong run's data.

## Deliverables
Root-cause the exact write path in `bin/hooks.js`'s `record-worktree` subcommand (or wherever `run-state.json` gets written) that allowed a hook event for one run to write into a different, stale, non-terminal run's directory. Fix so a hook operation can only ever write to the run directory it genuinely owns -- never fall back to writing into an unrelated stale run's state file, even when that stale run was never marked terminal.

## Acceptance Criteria
- [ ] Root cause identified and documented (which write path, which resolution step)
- [ ] Fix applied so run-state.json writes are scoped to the owning run only
- [ ] A regression test reproducing this exact scenario (one stale non-terminal run + one later unrelated run) added to the hooks test suite
- [ ] Existing stale non-terminal run directories audited for similar cross-contamination (not just #19's)
