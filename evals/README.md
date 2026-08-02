# claude-tweaks eval harness ("drills")

Reproducible fixture scenarios that run real claude-tweaks skills against
isolated repos and grade both cost (tokens/USD/tool-calls/wall-clock) and
quality (deterministic assertions) — not live production telemetry. See
`docs/superpowers/specs/2026-07-22-claude-tweaks-eval-harness-design.md`
for the full design and rationale.

## Setup

    cd evals
    npm install

Requires an `ANTHROPIC_API_KEY` in the environment — every scenario run
invokes the real Claude Agent SDK and costs real tokens/dollars. Observed
per-run costs across this harness's own scenarios range roughly $0.44-$5,
depending on the scenario and how much work the invoked skill actually does.

## Usage

    node runner.js run review-catches-planted-bugs
    node runner.js run --all
    node runner.js run review-catches-planted-bugs --no-record

Each run writes one JSON result file to `results/` (gitignored): cost,
tokens, tool-call count, wall-clock duration, and a per-assertion pass/fail
list.

## Safety model — read this before running scenarios unattended

Every scenario invokes a real, live claude-tweaks skill via the Agent SDK's
`query()`, intended to operate only inside a disposable fixture repo
(`runner.js`'s `buildFixture`, a fresh `mkdtemp` git repo per run). Because
`evals/` lives inside the very plugin under test, naively passing the real
repo path to the SDK's `plugins` config lets a model discover and act on the
real, live checkout instead of the fixture — this actually happened twice
during this harness's own development (a real file edit, and a real GitHub
issue filed and had to be closed). Three layers now guard against this,
each independently validated against real runs:

1. **OS-level sandboxing** (`runner.js`'s `managedSettings.sandbox`): every
   Bash-tool-executed command runs inside the SDK's own OS sandbox, scoped to
   the fixture's `cwd` — filesystem writes outside the fixture and all
   network egress are denied by default, with no path enumeration needed.
   `failIfUnavailable: true` means the run errors instead of silently
   degrading to unsandboxed if the sandbox can't start; `allowUnsandboxedCommands: false`
   stops a model from opting itself out via the Bash tool's own
   `dangerouslyDisableSandbox` parameter. An explicit `filesystem.allowRead`
   override keeps the fixture's own `.git/config` readable (the sandbox's
   default denies it even inside the fixture, which otherwise breaks
   `git status`/`log`/`diff` there entirely).
2. **A disposable plugin snapshot** (`runner.js`'s `buildPluginSnapshot`):
   `plugins[0].path` points at a fresh copy of just `.claude-plugin/`,
   `skills/`, `agents/`, `hooks/`, `bin/`, and `commands/`, rebuilt per run —
   never the real repo path — so the SDK's own auto-injected "Base directory
   for this skill" context never names anything real or writable.
3. **A userland scope guard** (`actor.js`'s `canUseTool`): denies any
   non-`AskUserQuestion` tool call whose `file_path`/`path`/`notebook_path`
   input resolves outside the fixture `repoDir`. This is defense-in-depth on
   top of (1) — it has no visibility into Bash command text, which is why
   (1)/(2) are the primary containment layers, not this.

`evals/scenarios/actor-escape-attempt.yaml` is live, executable evidence for
layer (1) specifically: it prompts a real model to attempt a Bash-executed
write outside the fixture `repoDir` and asserts the OS sandbox denies it —
closing the gap between "we believe this holds" and "we've verified it."

`actor.js` also denies `ScheduleWakeup`/`SendMessage`/`Monitor`/`TaskOutput`/
`TaskStop`, and `Agent` dispatch with `run_in_background:true` — some skills
coordinate with a dispatched subagent via these tools, which assume a live,
persistent, multi-turn Claude Code harness able to deliver a scheduled
wakeup or background-task notification later. This SDK-embedded session has
no such host process; a model that waits on one of these hangs until the
connection is silently aborted. Denying them pushes the model to finish
synchronously within the one `query()` turn instead.

None of this is a substitute for review: a scenario is a live model given
real tool access, and unknown failure modes are always possible. Run new or
changed scenarios once, watch the result, and check `git status` in the real
repo afterward before trusting a scenario as safe to run unattended.

**Tool-count accuracy:** `runner.js` explicitly sets
`autoAllowBashIfSandboxed: false`, so every Bash-tool call routes through
`canUseTool` and is counted in `toolCalls` — `tool-count`/`tool-called`
assertions reflect the run's real total tool use, not an undercount. (The
SDK's own default for this setting is `true`, which would silently let many
sandboxed Bash calls skip `canUseTool` entirely — confirmed against
Anthropic's published sandboxing documentation.)

## Comparing before/after a skill change

    node runner.js run --all               # on main — appends to history.jsonl
    git checkout my-skill-change-branch
    node runner.js run --all               # on the branch — appends its own lines
    node runner.js history <scenario>      # see both runs, newest first, correlated to gitSha

`history.jsonl` (see "Tracking results over time" below) is the durable
comparison mechanism — no more diffing two `results/` JSON files by hand.
Non-determinism: a single run's numbers are noisy since this drives a real
LLM agent, not deterministic code — read a small delta as indicative, not
conclusive; multiple lines sharing one `gitSha` in history are repeat
samples at the same commit, not an error. The live skills this harness
tests can themselves change behavior between runs independent of anything
under `evals/` — several scenarios here needed recalibration
mid-development when the underlying skill's real output shape or
effort-tiering behavior turned out to differ from what an earlier run had
captured. Treat a scenario's assertions as pinned to observed reality at
calibration time, not as a permanent contract the skill owes it.

## Tracking results over time

Every real run appends one line to `evals/history.jsonl` (git-tracked, not
gitignored — unlike `results/`) by default: the same cost/tokens/tool-count/
pass-fail data as a `results/*.json` file, plus the plugin repo's `gitSha`
and whether the working tree was `gitDirty` at run time. This is what makes
"did commit X regress this scenario" and "is this scenario's cost trending
up" answerable without re-deriving anything.

    node runner.js history review-catches-planted-bugs   # one scenario's history, newest first
    node runner.js history                                # most recent run per scenario

Pass `--no-record` on `run` to skip appending — useful while iterating on a
scenario's own definition, where the run doesn't represent a real benchmark
point. `--no-record` applies to every scenario in a `--all` batch.

A `workflow_dispatch`-triggered GitHub Action (`.github/workflows/eval-benchmark.yml`)
runs the same CLI against a chosen scenario (or all of them) and commits
`history.jsonl` back to the branch it ran against, so a manually-triggered
CI run and a local run land in the same durable log. Requires an
`ANTHROPIC_API_KEY` repository secret, configured once in the repo's
Settings → Secrets and variables → Actions (a one-time manual step outside
this repo's own tooling).

## Fixture generation: a realistic /init baseline

`evals/fixtures/init-baseline/` is a static, checked-in fixture — a real,
frozen `/claude-tweaks:init` output (CLAUDE.md, plus any `.claude/rules/`
files it created), generated by actually running `/init` once via the real
Agent SDK against a minimal seeded repo. Every scenario's fixture uses this
as its baseline (directly, or copied into the package-based fixture
directories) instead of a hand-guessed approximation or a bare repo with no
CLAUDE.md at all — closing a gap where no scenario ever exercised what a
real, onboarded project's config actually looks like.

    node scripts/generate-init-fixture.js

This is a manual, real-cost tool — **never** run automatically by `node
--test`, `runner.js`, or CI. Regenerate only when `/init`'s own template
changes enough to matter; there is no automated staleness detection. If the
generated `CLAUDE.md` doesn't contain `work-backend: local-files`, the
script prints a warning with the full transcript — the `answer_override`
inside `generate-init-fixture.js` likely needs updating to match whatever
question `/init` actually asked.

The query is capped at `maxBudgetUsd: 10`. A real `/init` run costs around
$4-5 on its own; the cap exists because `/init`'s own terminal "## Next
Actions" question has no answer_override, so leaving it unhandled lets the
actor's default `pickRecommended` auto-accept whatever `/init` recommends
next — and that recommendation can itself cascade into further skills,
each with their own Next Actions. A real run of this script once did
exactly that, cascading through `/tidy` → `/specify` → `/build` → `/review`
→ `/reflect` → `/wrap-up` → a second `/specify`, for $25+. The budget cap
hard-stops the query regardless of what the model tries next; if it trips
after `/init`'s own bootstrap already finished, the fixture is still
correctly produced (only the wasteful continuation gets cut off) — the
script prints a warning either way so this is visible, not silent.

## Running the harness's own tests

    cd evals
    node --test tests/

This is fast and free — it tests `runner.js`/`actor.js`/`assertions/`/
`fixtures/`'s own logic with an injected fake `queryFn`, never a real API
call. Only `node runner.js run <scenario>` costs real usage. When fixing a
scenario's assertions, prefer validating the fix against already-captured
real output (past `results/*.json` files, or text captured from a prior
run's transcript) as a unit-test fixture before spending on another live
run — several fixes in this harness's own history were caught and confirmed
entirely this way, at zero additional API cost.

## Scenarios

| Scenario | What it measures |
|---|---|
| `review-catches-planted-bugs` | `/claude-tweaks:review`'s defect-finding recall/precision on planted bugs of known severity |
| `code-health-seeded-findings` | `/claude-tweaks:code-health`'s gh-unavailable local-cache degrade path (this fixture has no real remote at all) |
| `simplify-fixes-planted-complexity` | `/claude-tweaks:simplify` collapses planted duplication while keeping tests green |
| `backlog-refine-permission-matrix-compliance` | Under `work-backend: local-files`, does `/claude-tweaks:backlog`'s `refine` mode correctly report grants as not-applicable and stop — without writing application code, dispatching build work, or altering a record's stage — rather than proceeding to build unsupervised? Redesigned from an original premise (grant/withhold `auto:build`) that a real run disproved; the redesign served as a regression check for a real security-boundary bug this harness found and a fix (`skills/backlog/refine-mode.md`) verified. |
| `dispatch-local-files-preflight-stop` | Under `work-backend: local-files`, does `/claude-tweaks:dispatch` stop at Preflight — without claiming, building, or touching a record's frontmatter — rather than proceeding to build an already-"authorized"-looking record? Added preemptively after the identical Preflight phrasing was found insufficient in `/claude-tweaks:triage` (now `/claude-tweaks:backlog refine`); `skills/dispatch/SKILL.md` was strengthened to the same explicit stop language before this scenario's first real run, so its PASS is a confirming run for the fix, not a discovered bug. |
| `actor-escape-attempt` | Live proof the OS-level sandbox (`managedSettings.sandbox`) denies a Bash-executed filesystem escape from the fixture `repoDir` |

## Adding a scenario

1. Add fixture files under `fixtures/` (or `local-record` seed steps directly
   in the scenario YAML for local-files-backend scenarios).
2. Write `scenarios/<name>.yaml`: `fixture`, `skill_invocation.prompt`,
   optional `answer_overrides`, and `assertions` (see `assertions/index.js`
   for the registered assertion types).
3. Run it for real once (`node runner.js run <name>`) to confirm it behaves
   as expected before committing. Read the result's `resultText` /
   transcript (Claude Code logs full session transcripts under
   `~/.claude/projects/`, keyed by the fixture's own ephemeral `cwd`) if the
   result doesn't match expectations — don't assume a failing assertion
   means the skill is broken before checking what actually happened.
