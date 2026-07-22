# claude-tweaks eval harness ("drills") — design

## Background

This design grew out of a broader question: how do we measure claude-tweaks' own efficiency and continuously improve its skills? Several approaches were explored and rejected in sequence:

1. **Live usage telemetry** (a structured event log of pipeline runs, auto-decisions, review outcomes, etc., persisted durably across repos) — rejected because a fixed, uncontrolled real-usage stream conflates task difficulty with skill quality, doesn't isolate "did this specific change to a skill help or hurt," and raised real scale problems (git-branch-backed storage at 100K+ events/couple-months) for a benefit that was never clearly tied to a development decision.
2. **Pointing the plugin's existing self-critique tooling (harness-health, `/code-review`) at itself** — rejected as fundamentally different from what was wanted: a static read of skill *text* judges whether a skill looks well-designed, not whether it behaves well when a real agent follows it.
3. **Live OTel-based cost/token telemetry** — Claude Code has full native OTel support (`claude_code.cost.usage`, `claude_code.token.usage`, `claude_code.skill_activated`, beta trace spans, etc.), but it requires a running OTel Collector as a durable dependency, which is real infrastructure a plugin can't provide or force on.

The reframe that stuck: **quality of code produced vs. resource cost (tokens/cost/tool-calls/wall-clock), measured on a reproducible, controlled workload** — not live production usage. This is a benchmark/eval problem, not a telemetry problem, and it kills both objections above: a scripted single invocation already returns cost/token data directly (no OTel collector needed), and a fixed task set gives a real before/after comparison when a skill file changes.

**Prior art: superpowers' `drill`.** The superpowers plugin (a claude-tweaks dependency) already solved this class of problem for its own skills. `drill` (currently a standalone repo, `obra/drill`, with a spec'd-but-not-yet-executed plan to fold it into `superpowers/evals/`) drives real tmux sessions of Claude Code/Codex/Gemini/OpenCode, pairs each scenario with an **actor** LLM (simulates the user) and a **verifier** LLM (judges the transcript/resulting state against explicit `verify.assertions`), and ships fixtures, setup helpers, and assertion primitives (`tool-called`, `tool-count`). `tests/claude-code/analyze-token-usage.py` additionally proves that direct session-transcript parsing for token/cost (including per-subagent breakdown via `agentId`) is a real, working technique in production use, independent of any OTel setup. Superpowers' own docs also describe an explicit RED-GREEN-REFACTOR discipline for skill authoring (`skills/writing-skills/testing-skills-with-subagents.md`) — TDD applied to prompts.

This design adapts that pattern for claude-tweaks: a Node-native, Claude-Code-only eval harness ("drills") under a new `evals/` directory.

## Goals

- Run claude-tweaks skills against reproducible, isolated fixture scenarios and grade both **cost** (tokens, USD, tool-call count, wall-clock) and **quality** (assertions against the resulting repo/work-record state) per run.
- Give a concrete before/after comparison mechanism: run the suite on `main`, make a change to a skill, run it again, diff the two result sets.
- Reuse existing claude-tweaks infrastructure wherever it already does the job (the hook dispatcher's per-tool-call firing, `events.jsonl`, `decisions.md`) rather than re-instrumenting from scratch.
- Keep the harness's own dependency footprint isolated from the shipped plugin (which has zero runtime npm deps today).

## Non-Goals (v1)

- **No live production telemetry.** This harness runs deliberately, on demand or on a schedule the maintainer chooses — not continuously in real usage. The scale/retention problems that killed the live-telemetry approach don't apply here because run volume is inherently small (dozens to low hundreds of runs, not 100K+ events).
- **No OTel/collector dependency.** Cost and token data come directly from the Agent SDK's query result, per-invocation.
- **No live GitHub sandbox in v1.** All first-cut scenarios use claude-tweaks' `work-backend: local-files`, which exercises the same stage-lifecycle/auto-mode-contract/permission-matrix logic without needing a disposable GitHub repo. A second wave can add GitHub-sandbox scenarios once the harness itself is proven.
- **No CI integration in v1.** Mirrors drill's own explicit non-goal for the same reason: expensive multi-step scenarios aren't suited to blocking PR checks without a tiered fast/slow split, which is future work, not this design.
- **No durable cross-session result storage in v1.** Results are local and gitignored. The immediate use case (before/after diffing across a code change) only needs two result sets to exist locally at once — it doesn't need a durable trend store the way live telemetry would have. This can be revisited if/when the suite runs on a schedule rather than on demand.
- **No multi-run averaging / statistical confidence in v1.** Single-run results are accepted as noisy; this is a known limitation (see below), not solved here.

## Architecture

### Why a Node-native runner, not a dependency on drill

Drill's generality (four CLI backends, an LLM actor *and* verifier for every scenario, tmux-driven interaction) solves problems claude-tweaks doesn't have. claude-tweaks only ever targets Claude Code, and most of what needs checking is deterministic (was the right label applied, did `npm test` pass, did `decisions.md` get the right entry) rather than judgment-based. Building a lightweight harness in this repo's existing stack (Node, CommonJS, `node --test`) avoids taking on a Python/uv toolchain purely for evals, and avoids paying for an LLM verifier on checks that a plain assertion script can already grade exactly.

### Why the Agent SDK, not headless CLI or tmux

claude-tweaks skills call `AskUserQuestion` constantly (decision menus, batch tables, Next Actions, HARD-GATEs). Headless CLI mode (`claude -p`) has no documented, reliable behavior for `AskUserQuestion` — it's explicitly called out in Claude Code's own docs as limited ("there's no user to respond"), with no guaranteed error/hang/default behavior. Drill works around the equivalent problem by driving a real tmux session with an actor injecting keystrokes.

The Claude Agent SDK exposes a cleaner, documented, stable (v2.1.207+) mechanism instead: a `canUseTool` callback that fires before every tool call, including `AskUserQuestion`, and can return a scripted answer via `updatedInput: { questions, answers }`. This needs no pseudo-terminal. The SDK also supports loading a local plugin directory (`options.plugins` / `CLAUDE_CODE_PLUGIN_DIR`) and returns `total_cost_usd` and a token breakdown directly in the query result — no transcript parsing or OTel collector needed for headline cost numbers.

**Default actor policy:** auto-select whichever `AskUserQuestion` option is labeled `(Recommended)` — every claude-tweaks `AskUserQuestion` call already marks one option this way by convention (see this repo's own frontmatter conventions), so this costs nothing extra (no second LLM call) and is deterministic. A scenario's `answer_overrides` can target a specific question (matched by a substring of its text) to exercise a non-default path when the scenario needs to (e.g. testing what happens when the user picks "Override specific items" instead of "Apply all recommended").

**Implementation note (confirm at build time):** the exact npm package name/version for the Agent SDK, and whether it requires `"type": "module"` (ESM) in `evals/package.json` — this repo's existing code is CommonJS throughout, so if the SDK is ESM-only, `evals/` will need its own module boundary. This doesn't change the design, just needs verifying during implementation.

### Repo layout

Self-contained under `evals/`, matching drill's own self-containment (`cd evals && uv sync`) rather than adding a dependency to the plugin's top-level `package.json` (which currently ships zero runtime deps):

```
evals/
  package.json          — its own toolchain; two dependencies: the Agent SDK (runner) and
                          js-yaml (scenario parsing)
  README.md             — setup/usage (mirrors drill's own evals/README.md)
  runner.js             — Agent SDK query() wrapper: loads the local plugin, wires the actor,
                          executes one scenario, collects cost/tokens/tool-calls, runs assertions
  actor.js              — canUseTool callback: default auto-pick "(Recommended)"; per-scenario
                          answer_overrides
  assertions/           — deterministic assertion library (one file per assertion type):
                          file-exists.js, test-passes.js, decisions-log-has.js, tool-called.js,
                          tool-count.js, commit-count.js, findings-include.js,
                          findings-exclude-false-positive.js
                          (label-present.js etc. added in the later GitHub-sandbox wave)
  fixtures/             — setup helpers, extending tests/helpers/git-fixtures.js's
                          mkdtemp+git-init+seed-commit pattern: seeded local-files work-records,
                          planted-bug patches, seeded code-health findings
  scenarios/            — one YAML file per scenario (see format below)
  results/              — gitignored; per-run output (cost, tokens, tool-call count,
                          per-assertion pass/fail), the input to before/after diffing
```

Scenario definitions use YAML (via a small `js-yaml` devDependency inside `evals/`) for consistency with drill's own scenario format and better authoring ergonomics (multi-line prompts, comments) than JSON.

### Scenario format

```yaml
name: review-catches-planted-bugs
description: >
  Does /claude-tweaks:review find planted defects of known severity
  without false-positiving on clean code nearby?
fixture:
  base: minimal-node-repo            # references fixtures/minimal-node-repo/
  seed:
    - apply-patch: planted-bugs.patch  # diff containing N known bugs of known severity
skill_invocation:
  prompt: "/claude-tweaks:review"
  work_backend: local-files
answer_overrides:                    # optional; falls back to auto-pick "(Recommended)"
  - match: "review-effort"
    answer: "medium"
assertions:
  - type: findings-include
    severity: critical
    file: src/auth.js
    line_range: [40, 48]
    description: "SQL injection via string concatenation"
  - type: findings-include
    severity: high
    file: src/utils.js
    line_range: [12, 15]
  - type: findings-exclude-false-positive
    files: [src/clean-module.js]
  - type: tool-count
    max: 40
```

`runner.js` resolves `fixture.base` to a fresh isolated temp repo (via the `fixtures/` helpers), applies any `seed` steps, invokes the Agent SDK with `skill_invocation.prompt`, answers `AskUserQuestion` calls per `actor.js`'s policy (default + `answer_overrides`), then runs every entry in `assertions` against the resulting repo state and the SDK's returned cost/token/tool-call data. Output is one JSON result file per run under `results/`.

**Usage** (mirroring drill's own `uv run drill run <scenario> -b claude` invocation shape):

```bash
cd evals && npm install
node runner.js run review-catches-planted-bugs
node runner.js run --all          # every scenario in scenarios/
```

### Cost/quality capture

- **Cost/tokens:** directly from the Agent SDK query result (`total_cost_usd`, per-model token breakdown) — no manual transcript math, no OTel collector.
- **Tool-call count ("jumps"):** from the SDK's verbose/session tool-call data (or session message enumeration if the SDK exposes it directly — confirm exact mechanism at implementation time).
- **Bonus, free signal:** fixture runs still trigger claude-tweaks' own real hooks, so `events.jsonl` (commits, contract-violations) and `decisions.md` (AUTO/STAGED/KEPT-PROMPT entries) are produced for free in the fixture repo and available to assertions (`decisions-log-has`) without any extra instrumentation.

## First-cut scenarios

Ordered cheapest/most-isolated first; full-lifecycle scenarios (the actual headline cost-vs-quality metric) come after the harness itself is proven on narrower scenarios, since they're the most expensive to run and hardest to debug when something's wrong with the harness rather than the skill.

1. **`review-catches-planted-bugs`** (detailed above) — direct analogue of drill's own `code-review-catches-planted-bugs.yaml`. Measures `/claude-tweaks:review`'s actual defect-finding judgment: recall (are planted bugs found) and precision (no false positives on clean code).
2. **`code-health-seeded-findings`** — a fixture with K known finding types (e.g. an oversized file, a duplicated pattern). Assert the findings are surfaced on first run, and that a second run against the *same* repo state dedups via fingerprinting rather than re-filing — this exercises the actual churn/dedup mechanism, not just detection.
3. **`simplify-fixes-planted-complexity`** — a fixture with deliberately over-complicated code (dead code, duplicated logic, an unnecessary abstraction layer). Assert the planted issues are addressed and the test suite still passes afterward (behavior-preserving).
4. **`triage-permission-matrix-compliance`** — a local-files backlog with records seeded across states (unshaped, ready-unscored, already-granted). Assert grants/withholdings match the documented permission matrix (e.g. an unshaped record gets flagged back, not granted).
5. **(second wave, stretch) `mini-lifecycle-cost-quality`** — capture → triage → dispatch → build → test → review → wrap-up on a small, deliberately narrow seeded feature request, on `work-backend: local-files`. This is the actual full cost-vs-quality scorecard the original question was about (total tokens/cost/tool-calls/wall-clock for one complete unit of work, weighed against test-pass + review-findings + no-scope-creep outcomes) — deferred to a second wave specifically because it's the most expensive scenario to run repeatedly and the hardest to debug if the harness itself has a bug, so scenarios 1-4 should be solid first.

## Result handling (v1)

Each run writes one JSON file to `evals/results/` (gitignored) per scenario per invocation: cost, tokens, tool-call count, wall-clock duration, and a per-assertion pass/fail list. Comparing two runs (e.g. `main` vs. a branch with a skill change) is a matter of running the suite twice and diffing the two result sets — no durable cross-session store is needed for this in v1, since the harness runs deliberately rather than continuously. If the suite later moves to a recurring schedule, a durable trend store (following the same hot/cold, many-small-files-then-compact pattern already used by `_shared/health-state.md` and `/tidy`'s archival compaction) is the natural next step, but it's out of scope here.

## Known limitations / deferred work

- **Non-determinism.** A single scenario run can vary (different tool-call count, occasionally a different quality outcome) since this drives a real LLM agent, not deterministic code. A single run's number is noisy. Options for later: run each scenario N times and report a range, or reuse `/claude-tweaks:review`'s own "2 independent runs, keep what agrees" reproduction-pairs technique. Not solved in v1 — single-run results should be read as indicative, not conclusive, especially for a small delta.
- **Representativeness drift.** A fixed scenario set can quietly stop reflecting real usage as claude-tweaks' skill surface evolves. This harness complements real usage feedback; it doesn't replace it.
- **GitHub-sandbox scenarios** (real `gh` interaction: label bootstrap, issue timeline, rate-limit behavior) are deferred to a second wave, once local-files scenarios prove the harness works.
- **CI integration** is deferred, mirroring drill's own explicit non-goal, pending a tiered fast/slow model.

## Key decisions (recap)

| Decision | Choice | Why |
|---|---|---|
| Harness dependency | Node-native, inspired by drill, not a dependency on drill/Python | Single-backend (Claude Code only); most assertions are deterministic, not judgment-based; keeps stack consistent with existing `node --test` tooling |
| Interactivity mechanism | Agent SDK `canUseTool` callback | Documented, stable; headless CLI's `AskUserQuestion` behavior is undocumented/unreliable; avoids tmux |
| Default actor policy | Auto-pick the `(Recommended)` option | Free (no second LLM call), deterministic, matches this repo's own `AskUserQuestion` convention |
| Work-record backend for v1 scenarios | `local-files` | Avoids GitHub sandbox repo lifecycle management before the harness is proven; already exercises the same stage/permission-matrix logic |
| Scenario format | YAML via a small `js-yaml` devDependency | Authoring ergonomics (multi-line prompts, comments); consistency with drill's own format |
| Dependency scoping | `evals/` gets its own `package.json` | Keeps the top-level plugin's "zero runtime npm deps" claim true; matches drill's own self-containment |
| Result storage | Local, gitignored, no durable cross-session store in v1 | Eval runs are deliberate, not continuous; before/after diffing only needs two local result sets at once |
| Scenario sequencing | Single-skill scenarios (1-4) before full-lifecycle (5) | Cheaper, faster feedback, easier to debug the harness itself before attempting the expensive headline scenario |
