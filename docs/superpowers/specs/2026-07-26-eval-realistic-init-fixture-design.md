# Realistic `/init`'d baseline fixture for eval scenarios — design

## Background

The eval harness (`evals/`) runs 5 scenarios against disposable fixture repos. Checking each
scenario's fixture directly surfaces a gap: **none of the five have ever exercised a real
`/claude-tweaks:init` output.**

| Scenario | Current fixture base |
|---|---|
| `review-catches-planted-bugs` | `minimal-node-repo` + planted-bugs patch |
| `code-health-seeded-findings` | `code-health-repo` |
| `simplify-fixes-planted-complexity` | `complexity-repo` |
| `backlog-refine-permission-matrix-compliance` | `base: none` + seeded records |
| `dispatch-local-files-preflight-stop` | `base: none` + seeded record |

`base: none` produces a literal empty repo (`fixtures/git-fixtures.js`'s `freshRepo()`: one empty
`git init` commit, nothing else). The three package.json+src bases have no `CLAUDE.md` either.

For the two `base: none` scenarios specifically, this is more than cosmetic. `/dispatch` and
`/backlog`'s refine mode both gate on a Preflight check that reads:

```bash
grep -q '^work-backend:' CLAUDE.md && echo "OK" || { grep -qE '^backlog-backend:...' CLAUDE.md && echo "MIGRATION_GAP" || echo "GENUINE_LOCAL_FILES"; }
```

A completely missing `CLAUDE.md` file makes both `grep` calls fail, landing on
`GENUINE_LOCAL_FILES` — the same branch as a `CLAUDE.md` that exists but mentions neither key.
So these two scenarios currently test "a project that has never run `/init` at all" — not "a
real project that explicitly chose `work-backend: local-files` via `/init`," which is the
actual, common real-world path (`/init`'s own Step 15 explicitly asks about `work-backend` and
writes it into `CLAUDE.md`). Those are genuinely different situations, and only the rarer one is
covered today.

## Goals

- At least one scenario's fixture reflects what a real, onboarded project's `CLAUDE.md` actually
  looks like — not a hand-guessed approximation, not an empty repo.
- Close this gap across all 5 scenarios, not just the two that happened to surface it.
- No new sandboxing/isolation surface — reuse the harness's existing containment exactly as-is.

## Non-Goals

- **No automated staleness detection.** The generated fixture is a static, checked-in file,
  refreshed manually and only when `/init`'s own template drifts enough to matter — a judgment
  call at that time, matching this harness's existing "manual, occasional" philosophy elsewhere
  (`--no-record`, the GitHub Action, etc.).
- **No per-fixture-base dedicated `/init` runs.** One generation, reused across every fixture
  base — running `/init` separately against each of `code-health-repo`/`complexity-repo`/
  `minimal-node-repo` would be more form-fitting but costs 3-4x more for a benefit no current
  scenario's assertions actually need. Revisit only if a future scenario needs stack-specific
  `CLAUDE.md` content.
- **The bare-repo edge case is retired, not kept alongside.** Explicitly a real coverage
  tradeoff, not an oversight — see "Known limitation" below.

## Architecture

Three pieces:

### 1. `evals/scripts/generate-init-fixture.js` — one-time fixture generator

Reuses the harness's existing pieces directly, no new sandboxing logic:
- `freshRepo`/`seedFiles` (`evals/fixtures/git-fixtures.js`) — builds a disposable repo seeded
  with a minimal base project (the same content `fixtures/minimal-node-repo` already provides).
- `buildPluginSnapshot` (`evals/runner.js`, already exported) — same disposable plugin snapshot
  every real scenario run already gets, so `/init` never sees a real, nameable path into this
  worktree.
- `createActor` (`evals/actor.js`, already exported) — same `canUseTool` sandboxing every
  scenario already gets, plus its existing `answerOverrides` mechanism.

The script invokes the real Agent SDK's `query()` with prompt `/claude-tweaks:init` against that
fixture, under the same `managedSettings.sandbox` config `runner.js` already uses. `answer_overrides`
targets the specific question where `/init` asks about the work-record backend, forcing
`work-backend: local-files` (the value the two Preflight scenarios need to test explicitly) —
every other question `/init` asks takes whatever it recommends, so the result stays
representative of a real run rather than an artificially narrow one.

After the run completes, the script copies `CLAUDE.md` (and any `.claude/rules/*.md` files
`/init` created) out of the disposable fixture repo into a new checked-in location:
`evals/fixtures/init-baseline/` (containing `CLAUDE.md`, and a `rules/` subdirectory if `/init`
produced any).

This is a manual, real-cost maintenance script — **never** invoked by `node --test`, `runner.js`,
or any automated path. Documented in `evals/README.md` alongside the harness's other real-cost
commands (`node runner.js run <scenario>`), with the same cost-awareness framing.

### 2. Applying the generated fixture to the three existing package-based bases

`fixtures/code-health-repo/`, `fixtures/complexity-repo/`, and `fixtures/minimal-node-repo/` each
gain a copy of the generated `CLAUDE.md` (+ `rules/`, if present) added directly into their
checked-in directory, alongside their existing `package.json`/`src`/`test` content. No scenario
YAML changes needed for these three — `buildFixture`'s existing `seedFiles(dir, files, ...)` call
already copies a base directory's full file tree, so the added `CLAUDE.md` rides along
automatically once it's sitting in the base directory.

### 3. Replacing the bare-repo premise in the two Preflight scenarios

`dispatch-local-files-preflight-stop.yaml` and `backlog-refine-permission-matrix-compliance.yaml`
change `fixture.base: none` to `fixture.base: init-baseline` (the new fixture from step 1). Their
existing `fixture.seed` `local-record` steps are unchanged — they still layer the seeded
work-record on top, exactly as today.

Both scenarios' descriptive YAML comments get rewritten to describe the new premise accurately:
no longer "the fixture has no CLAUDE.md at all... resolves to `GENUINE_LOCAL_FILES`" — now "the
fixture has a realistic `/init`'d `CLAUDE.md` with `work-backend: local-files` explicitly set...
resolves to the normal `OK` stop-path, the same one a genuinely onboarded project takes."

## Known limitation

Retiring the bare-repo fixture removes the harness's only direct regression coverage of the
Preflight's `GENUINE_LOCAL_FILES`-via-missing-`CLAUDE.md` branch specifically — someone invoking
`/dispatch` or `/backlog`'s refine mode before ever running `/init` at all. This is a narrower,
defensive-only edge case (not the primary real-world path a real user takes), and the tradeoff
was made knowingly in favor of simplicity — one fixture per Preflight scenario, not two. If this
code path regresses in the future with no test to catch it, that is the direct cost of this
choice.

## Verification

- Run `node evals/scripts/generate-init-fixture.js` once, confirm it produces a real,
  non-placeholder `CLAUDE.md` under `evals/fixtures/init-baseline/` containing an explicit
  `work-backend: local-files` line (grep-checkable).
- Run each of the 5 scenarios for real once (`node runner.js run <scenario>`) to confirm they
  still pass against their updated fixtures — same bar every other harness feature has been held
  to. The two Preflight scenarios in particular must still report the same `PASS` outcome as
  before (their assertions are unchanged; only the fixture premise changed).
- `node --test tests/` must still pass — no unit test currently asserts on any specific fixture
  base's file contents, so this is a low-risk check, not a load-bearing one for this change.

## Cost

One real, one-time `/init` invocation to generate `init-baseline` (cost unknown until run — likely
comparable to or higher than the harness's other observed per-scenario costs, since `/init` does
real project analysis). Five real confirming runs (one per scenario) to verify nothing broke.
Zero added cost per scenario run afterward — the fixture is static from then on.

## Key decisions (recap)

| Decision | Choice | Why |
|---|---|---|
| Scope | All 5 scenarios, not just the 2 Preflight ones | None of the 5 exercised real `/init` output; narrowing to 2 would leave the other 3 with the same unrepresentative-fixture gap |
| Fixture source | Run `/init` for real, once | Authentic — exactly what a real user gets; a hand-authored approximation risks the same drift-from-reality problem this design exists to fix |
| Answering `/init`'s questions | Reuse the harness's existing `answerOverrides` mechanism | Already built, already used by every other scenario — no new machinery needed |
| Context isolation between generation and evaluation | Free, by construction | Fixture generation is its own one-time `query()` call, entirely separate from any scenario run; every scenario run is already a fresh `query()` call with no session reuse |
| Bare-repo edge case (dispatch/backlog) | Retired, not kept alongside | Simplicity over completeness — explicitly a known, accepted coverage gap, not an oversight |
| Fixture reuse across bases | One generated fixture, copied into all bases | Cheaper (one real `/init` run, not 3-5); stack-specific fidelity not needed by any current scenario's assertions |
