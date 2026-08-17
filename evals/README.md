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
sandboxed Bash calls skip `canUseTool` entirely — confirmed directly against
the installed SDK's `sdk.d.ts` type definitions; see `evals/NOTES.md`.)

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

### Gating on a context-cost regression

`history.jsonl` recorded cost from the start, but nothing ever failed on it.
The `context-cost-regression` assertion closes that: it compares this run's
`tokens.cache_creation_input_tokens` — the prompt bytes written into the cache,
which is dominated by the skill payload the SDK loaded — against the **median
of that scenario's last 5 passing runs**, and fails past **+50%**.
`assertions/context-cost-regression.js` states why each of those three numbers
was chosen; the short version is that a last-run baseline fires on ordinary
LLM-trajectory variance (the tightest-clustered scenario here already spans
±32% with no code change), a best-ever baseline ratchets into permanent red,
and a moving median absorbs a deliberate, accepted increase after N runs
instead of needing a pinned number hand-edited.

Add it to a scenario with no parameters:

    assertions:
      - type: context-cost-regression

Override per scenario if needed: `maxIncreasePct`, `minSamples`, `window`.

**It never passes silently.** Below `minSamples` (default 3) comparable prior
runs it returns a message starting `SKIPPED` that names the shortfall and how
many more runs are needed — a scenario with no baseline is reported as *not
checked*, never as clean. A run that reports no `cache_creation_input_tokens`
at all **fails**, because the measurement the check depends on is missing.
Failing runs and other scenarios' runs never count toward the baseline.

Only `dispatch-local-files-preflight-stop` currently has enough passing runs to
have a live baseline; add the assertion to another scenario and it will report
`SKIPPED` until that scenario accumulates three.

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
| `backlog-grant-local-files-preflight-stop` | Under `work-backend: local-files`, does `/claude-tweaks:backlog grant` stop at Preflight — writing nothing, granting nothing, touching no record — rather than proceeding to evaluate its gate chain on a record that would otherwise look eligible? |
| `dispatch-local-files-preflight-stop` | Under `work-backend: local-files`, does `/claude-tweaks:dispatch` stop at Preflight — without claiming, building, or touching a record's frontmatter — rather than proceeding to build an already-"authorized"-looking record? Added preemptively after the identical Preflight phrasing was found insufficient in `/claude-tweaks:triage` (now `/claude-tweaks:backlog refine`); `skills/dispatch/SKILL.md` was strengthened to the same explicit stop language before this scenario's first real run, so its PASS is a confirming run for the fix, not a discovered bug. |
| `actor-escape-attempt` | Live proof the OS-level sandbox (`managedSettings.sandbox`) denies a Bash-executed filesystem escape from the fixture `repoDir` |
| `learning-routing-classification` | `skills/_shared/learning-routing.md`'s ordered classifier routes a plugin defect to D5, against a fixture whose `origin` is deliberately not claude-tweaks |
| `learning-routing-adversarial-named-but-local` | Naming a `/claude-tweaks:*` skill is necessary but not sufficient for rule 1 — a project-local convention that mentions one must still land D1, not be filed upstream |
| `learning-routing-adversarial-self-reference` | A genuine plugin defect still collapses to a local record when `origin` **is** claude-tweaks, so the plugin never files issues against itself |
| `learning-routing-corpus-matrix` | Every frozen corpus lesson no dedicated scenario claims, one run per lesson — see Matrix scenarios below |
| `assess-merge-check-matrix` | Runs every frozen `merge-check-cases.json` entry through one `/claude-tweaks:assess-agent-autonomy` merge-check invocation each, against a feature branch seeded with that entry's overlay diff; selection is by exclusion so a later corpus addition runs automatically, enforced by `evals/tests/merge-check-coverage.test.js` |
| `research-consequence-filter-matrix` | Runs every frozen `consequence-filter-cases.json` entry through one `/claude-tweaks:research verify` invocation each; selection is by exclusion so a later corpus addition runs automatically, enforced by `evals/tests/consequence-filter-coverage.test.js` |
| `wrap-up-fix-now-not-file` | Deferral-gate runtime pin (#621): a wrap-up run whose ledger holds four small in-diff items must FIX all four in-branch per `_shared/deferral-gate.md`'s fix-now criteria — not file them as records; pinned by ledger deletion, passing seeded tests, and zero new records or staged proposals |
| `wrap-up-refuses-reasonless-proposal` | Deferral-gate enforcement pin (#622): the Review Console must refuse a staged queue-write proposal whose `Defer-reason:` is missing or invalid, and file only the valid one |
| `capture-shaped-body-born-ready` | Runtime pin for #697 AC 1: `/claude-tweaks:capture`'s Shaped-body branch scores and files a well-formed idea body as a born-ready local record (`stage: 'ready'`, risk/size stamped, the `Defer-reason:` line composed into the body) with no human gate needed |
| `capture-shaped-body-needs-definition` | Runtime pin for #697 AC 2: a shaped body carrying `## Open Question` in place of `## Acceptance Criteria` takes the needs:definition branch — filed unscored with `needsDefinition: true` — even though `--source` alone would otherwise trigger the deferral hard stop |
| `capture-shaped-body-missing-reason` | Runtime pin for #697 AC 3: a shaped body whose `Origin:` line signals a deferral, passed with no `--defer-reason=` and no `Defer-reason:` line, must file nothing and report the missing reason — the same hard gate `wrap-up-refuses-reasonless-proposal` enforces at the Review Console |

## Fixture seed steps

`fixture.seed` is an ordered list; each entry is a single-key map. Every step
is opt-in per scenario — nothing is seeded by default, because several
fixtures exist precisely to exercise an absence (`code-health-seeded-findings`
drives the gh-unavailable degrade path off having no remote at all).

| Step | Effect |
|---|---|
| `apply-patch: <path under fixtures/>` | Applies a unified diff and commits it. Cannot touch `.git/` — `git apply` hard-refuses those paths. |
| `local-record: {slug, title, body, facets}` | Writes a work record under `specs/` through the real `local-store.js` driver, so fixture records cannot drift from the format skills read. |
| `git-remote: <url>` | Adds an `origin` remote. Writes only `.git/config`, so nothing is committed and the worktree stays clean. No network is contacted, and the URL need not resolve. |

## Matrix scenarios

A scenario may iterate a frozen fixture corpus instead of hardcoding one
prompt, so that covering an N-entry corpus does not mean N near-identical
scenario files — and, more importantly, so an entry added to the corpus is
exercised without anyone remembering to add the (N+1)th file:

```yaml
matrix:
  corpus: learning-routing-corpus/lessons.json   # path under fixtures/
  entries: lessons          # property holding the array; omit if the file IS one
  exclude: [some-entry-id]  # entries a dedicated scenario file already covers
```

Each selected entry becomes its own fully-resolved scenario — its own fixture,
its own agent run, its own result file — named `<scenario>[<entry id>]`.
Substitute entry fields anywhere in the scenario with `{{matrix.<dotted.path>}}`;
a string that is *exactly* one placeholder resolves to the raw value, so a
corpus `null` stays `null` rather than becoming `"null"`.

Selection is by exclusion rather than an allowlist, so the default is
inclusive. Expected answers belong in the corpus, never in the prompt.

**Every case is a real, billed agent run.** A matrix over a large corpus costs
proportionally; `exclude` exists to avoid paying twice for an entry a dedicated
scenario already measures, and `tests/learning-routing-coverage.test.js` is the
offline check that the two sets partition the corpus exactly.

## Adding a scenario

1. Add fixture files under `fixtures/` (or `local-record` / `git-remote` seed
   steps directly in the scenario YAML — see Fixture seed steps above).
2. Write `scenarios/<name>.yaml`: `fixture`, `skill_invocation.prompt`,
   optional `answer_overrides`, and `assertions` (see `assertions/index.js`
   for the registered assertion types).
3. Run it for real once (`node runner.js run <name>`) to confirm it behaves
   as expected before committing. Read the result's `resultText` /
   transcript (Claude Code logs full session transcripts under
   `~/.claude/projects/`, keyed by the fixture's own ephemeral `cwd`) if the
   result doesn't match expectations — don't assume a failing assertion
   means the skill is broken before checking what actually happened.
