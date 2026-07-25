# Eval harness benchmark tracking — design

## Background

The eval harness (`evals/`, see `2026-07-22-claude-tweaks-eval-harness-design.md`) shipped with an explicit v1 non-goal: "No durable cross-session result storage in v1. Results are local and gitignored... This can be revisited if/when the suite runs on a schedule rather than on demand." That document's own "Result handling" section named the natural next step directly: "a durable trend store... is the natural next step, but it's out of scope here."

That gap is now the actual ask: the harness needs to answer "did a recent skill change regress quality or cost?" and "is a skill getting more expensive over time?" — not just "did this one run pass." Today, comparing two runs means manually diffing two gitignored JSON files by hand, and nothing survives between sessions at all.

## Goals

- Every real scenario run's headline numbers (cost, tokens, tool count, pass/fail, per-assertion detail) persist durably, correlated to the exact commit that produced them.
- A human (or a Claude Code session) can look back at a scenario's history and answer "is this getting better, worse, or staying flat" without re-deriving anything from raw result files.
- The same mechanism works identically whether triggered locally by a developer, or by a manually-dispatched GitHub Actions workflow.
- Zero new runtime dependencies, consistent with the harness's existing minimal footprint (`@anthropic-ai/claude-agent-sdk` + `js-yaml`).

## Non-Goals (v1)

- **No automatic/scheduled runs.** Every run — local or via the Action — is manually triggered. Nothing runs on every push or PR; this is not a CI quality gate.
- **No dashboard/digest integration.** Surfacing trend data inside an existing claude-tweaks dashboard skill (e.g. `/tidy`'s rolling digest) is explicitly deferred — filed as [issue #59](https://github.com/thomasholknielsen/claude-tweaks/issues/59) — until the harness has real usage history and it's clear what a dashboard view should actually show. `/tidy`'s own digest is GitHub PR/issue/work-record hygiene, not plugin quality benchmarks, and isn't an obvious fit regardless.
- **No `compare`/delta command.** A dedicated "diff two points in history" command is deferred until real usage reveals what comparison actually matters — the raw `history.jsonl` plus the `history` viewer (below) are enough to eyeball a trend for now.
- **No multi-run statistical confidence.** A single run is still noisy (real LLM, not deterministic code) — this design makes repeat samples at the same commit *visible* (they naturally land as separate history lines with the same `gitSha`) but does not compute an aggregate pass rate or confidence interval from them.

## Architecture

Three pieces, all inside the existing `evals/` self-contained project:

1. **`evals/history.jsonl`** — the durable, git-tracked record. Append-only; one JSON object per line, one line per completed real run (not per scenario file, not per fixture — per actual invocation of `runScenarioWith`).
2. **`runner.js` changes** — a `--no-record` flag (default: record) on the `run` subcommand. After a real run completes and its result object is built, append one line to `history.jsonl` unless suppressed.
3. **`node runner.js history [scenario]`** — reads `history.jsonl` and prints a plain table. This is the one new piece of "viewer" logic, and it is reused everywhere: called directly by a human locally, and called identically by the GitHub Action to populate its run summary. There is exactly one implementation of "how to read history," never two.

### `history.jsonl` entry schema

Reuses the exact `result` object `runner.js` already builds for every run (unchanged from what's already written to `evals/results/*.json`), plus two new fields:

```json
{
  "scenario": "dispatch-local-files-preflight-stop",
  "startedAt": "2026-07-24T17:43:43.715Z",
  "durationMs": 221399,
  "costUsd": 0.508275,
  "tokens": { "input_tokens": 12, "output_tokens": 4426, "...": "..." },
  "toolCallCount": 1,
  "assertions": [{ "type": "commit-count", "pass": true, "message": "..." }],
  "allPassed": true,
  "gitSha": "8e8aba0b...",
  "gitDirty": false
}
```

- **`gitSha`** — the plugin repo's `HEAD` (via `git -C {PLUGIN_ROOT} rev-parse HEAD`) at run time, *not* the disposable fixture repo's sha. Since the scenario YAML files themselves are committed in the same repo, `gitSha` pins both "what skill code was tested" and "what the scenario's own assertions expected" as one value — no separate scenario-version field is needed.
- **`gitDirty`** — `git -C {PLUGIN_ROOT} status --porcelain` non-empty at run time. Without this, a run against uncommitted local changes would silently get attributed to the last real commit, corrupting the trend. Recorded, not blocking — a dirty run still gets logged, just flagged.

One line per real run, appended, never rewritten or deduplicated. Multiple lines sharing one `gitSha` are expected (re-running the same commit) and are the raw material a future statistical/aggregate view (explicitly out of scope above) would consume.

### `--no-record` flag

Record-by-default, not opt-in: `node runner.js run <scenario>` appends to history automatically; `node runner.js run <scenario> --no-record` suppresses it. Chosen over an opt-in `--record` flag because the two failure modes aren't symmetric — forgetting `--no-record` during scenario-authoring iteration just leaves a few extra, harmless (same-`gitSha`-groupable) lines in history; forgetting `--record` on a run that actually mattered means losing real, already-paid-for data permanently. `node runner.js run --all` respects the same flag across every scenario in the batch.

### `history` command output

```
node runner.js history dispatch-local-files-preflight-stop

scenario: dispatch-local-files-preflight-stop
date                  sha       cost      tools  pass
2026-07-24T17:43:43Z  8e8aba0   $0.508    1      PASS
2026-07-23T14:20:00Z  a1b2c3d   $0.612    3      FAIL (commit-count)
```

Newest-first. A failing row names the failed assertion type(s) inline, so a regression is diagnosable from the table alone — no need to open raw JSONL. `node runner.js history` with no scenario argument prints only the single most recent entry *per* scenario across all five — a fast "where do things stand right now" snapshot.

### GitHub Action (`workflow_dispatch`)

A new `.github/workflows/eval-benchmark.yml`, manually triggered only (`workflow_dispatch`, no `push`/`pull_request` trigger — this is not a CI gate). Input: a `scenario` choice (each of the 5 scenario names, plus `all`), defaulting to `all`. Steps: checkout, Node setup, `npm install` inside `evals/`, `ANTHROPIC_API_KEY` from a repository secret (configured once, manually, outside this design's scope — same "manual step, external to the codebase" pattern this project already uses elsewhere), run the selected scenario(s) via the same `runner.js run` entry point a human uses locally, then commit `evals/history.jsonl` back to the branch the workflow ran against (`github-actions[bot]` identity, standard pattern) and push. Finally, pipe `node runner.js history` (all-scenarios snapshot) into `$GITHUB_STEP_SUMMARY` so the result is visible directly on the workflow run page without cloning anything.

Because the Action calls the exact same `runner.js run`/`history` entry points a local invocation does, there is no second implementation to keep in sync — the Action is a thin trigger + credential + commit-back wrapper around the same CLI.

## Verification

New unit tests only — no real API spend, following this harness's own established pattern of validating logic against a fake `queryFn` (`evals/tests/`) before spending on a live run:

- `--no-record` actually suppresses the append; its absence records by default.
- The exact `history.jsonl` line shape, including `gitSha`/`gitDirty`, using an injectable git-sha resolver (not a real `git` subprocess call) so tests stay hermetic and fast — mirrors how `queryFn` is already injected for the SDK call.
- `history` command table rendering (newest-first ordering, failing-assertion inline display, no-arg per-scenario snapshot mode) against a fixed, checked-in fixture `history.jsonl`.

One real confirming run at the end (a single scenario, real API cost) to prove the append actually happens end-to-end against the live SDK path — same bar every other harness feature has been held to.

## Error handling

- **Git-sha resolution failure** (not a git repo, `git` unavailable) — write `gitSha: null`, do not crash the run. The benchmark result itself matters more than its provenance tag.
- **Concurrent writes** — runs are sequential today, even under `--all` (one scenario awaited at a time), and a single JSON-line `fs.appendFileSync` call is well under the OS's atomic-write size on POSIX systems. Not hardening further (no file locking) given the stated "manual, occasional" usage pattern makes genuinely concurrent writers rare.
- **Action commit-back race** (main moved between the Action's checkout and its push) — not specially handled; a rare failure on a manually-triggered, low-frequency workflow is acceptable to just re-run, rather than adding retry/rebase logic for an edge case this usage pattern makes unlikely.

## Known limitations / deferred work

- **Dashboard/digest surfacing** — deferred, filed as issue #59 (see Non-Goals).
- **`compare`/delta command** — deferred until real usage shows what comparison view is actually wanted.
- **Multi-run statistical confidence** — same limitation the original harness design already accepted; this design makes repeat-at-one-sha samples visible in history but doesn't aggregate them.
- **`history.jsonl` growth** — unbounded append-only log; at a few hundred bytes per line and a "manual, occasional" cadence this won't matter for a very long time, and any future compaction can reuse the hot/cold pattern `_shared/health-state.md` already established elsewhere in this codebase — not needed now.

## Key decisions (recap)

| Decision | Choice | Why |
|---|---|---|
| Storage mechanism | Git-committed `evals/history.jsonl`, append-only | No new infra/dependency; naturally pins each result to the exact commit that produced it; works identically for local and CI-triggered runs |
| Entry schema | Reuse the existing `result` object verbatim, plus `gitSha`/`gitDirty` | One schema, not two; the harness already builds this shape for every run |
| Record default | Opt-out (`--no-record` to suppress), not opt-in | Losing a real benchmark run's data (already paid for) is worse than a few harmless extra lines from iteration |
| Viewer | One `history` command, reused by both local CLI use and the GitHub Action's step summary | Single implementation of "how to read history" |
| Dashboard integration | Explicitly deferred (issue #59) | No usage history yet to know what a dashboard view should show; no existing skill is an obvious fit |
| Trigger model | Manual only — local CLI or manually-dispatched Action; never automatic on push/PR | Matches the stated "manual, occasional" usage pattern; this is a benchmark tool, not a CI gate |
