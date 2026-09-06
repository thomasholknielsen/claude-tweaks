# Shared Verification Procedure

Canonical verification procedure used by `/claude-tweaks:build` (Common Step 5), `/claude-tweaks:test` (Step 1), `/claude-tweaks:deepen` (Step 5), and `/claude-tweaks:simplify`. This file is the single source of truth — all four skills reference it instead of duplicating the logic.

## Step 1: Resolve Commands

Read CLAUDE.md for the project's specific verification commands. Look for:

- Type check command (e.g., `pnpm typecheck`, `tsc --noEmit`, `mypy`)
- Lint command (e.g., `eslint .`, `ruff check`, `golangci-lint run`)
- Test command (e.g., `pytest`, `jest`, `go test ./...`)
- Any project-specific test scripts or configurations

If CLAUDE.md doesn't document verification commands, scan `package.json` scripts, `Makefile`, `pyproject.toml`, `Cargo.toml`, or equivalent for the project's stack.

## Step 2: Execute

Run every resolved check through the deterministic runner — one plain command at the invocation level (no `;`, `&&`, or pipe chains):

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/verify.js" --cmd types="tsc --noEmit" --cmd lint="eslint ." --cmd tests="npm test"
```

Substitute the project's own commands from Step 1, one `--cmd <name>=<command>` per resolved check, and omit any stage the project doesn't have (`--cmd tests="npm test"` alone is valid — in this repo it is the whole set). The reserved names `types`, `lint`, and `tests` get the ordering policy: `types` and `lint` run concurrently, `tests` starts only after every supplied one of them exits 0, and a stage-1 failure reports `tests` as `skipped: fail-fast`. Any other name runs serially after the known stages under the same fail-fast. The runner resolves its own paths (#1921): inside a git checkout, logs land under `{git-dir}/claude-tweaks-verify/` and the suite-count stamp at `{git-dir}/claude-tweaks-test-count.json` — the checkout's own git dir (`git rev-parse --git-dir`), per-worktree unique, so a concurrent session's run can never clobber it; outside a checkout it falls back to a fresh directory under the OS tmpdir with no count stamp. `--log-dir` and `--count-stamp` still override when passed explicitly. This is why the invocation above is one plain command with no `$(...)` substitutions — the worktree Bash-shape guard (`_shared/scratch-worktree.md` §7) refuses two of them in one command. `--git-dir` on a run redirects logs and the count stamp only — it never writes the pass stamp.

**Foreground rule.** Run the runner in the foreground of the calling agent — never with `run_in_background`, and never start a second attempt while one is running (`[IL-108]`'s family: #1904's first call stalled waiting on a background verify child's notification that never arrived). A run that needs to outlive the agent's turn is a sign the check set is wrong, not a reason to background it.

**A targeted run never stamps.** A deliberately partial `--cmd` set (types only, a scoped test path) must pass `--no-stamp` — the runner cannot tell a partial set from the full one (it trusts that the caller's `--cmd` flags ARE the complete set), so a partial run without `--no-stamp` would leave an incorrectly-labelled `scope: "full"` stamp.

`--cmd` values are opaque strings executed by the child shell. If a compound value (e.g. `--cmd tests="a && b"`) trips a worktree session's command text-shape guard (see `_shared/scratch-worktree.md`'s "## 7. Shell constraint"), split it into two `--cmd` checks instead.

### Reading the result

The runner's stdout is already bounded — one table row per check plus at most one ≤100-line failing region per failed check, never raw check output — and it exits 0 iff every non-skipped check passed. It writes `{log-dir}/report.json`: per-check `{command, exitCode, durationMs, logPath, summary, failingRegion}` (plus `counts` where a test summary parses; a skipped check carries `{skipped: "fail-fast"}` in place of an exit code), and top-level `pass`, `startedAt`, `durationMs`, `sha`, and `dirty` (plus `testCountRegression` — see below — when one fired). The recorded `exitCode` is the check command's own — judge each check by it, never by grep side effects. Each check's full output is in its own `{log-dir}/{name}.log` for a recovery read of last resort; read the failing region the runner already extracted, never `cat` the log.

### Suite-count regression caveat (#881)

When a count stamp is in play (passed explicitly, or the in-checkout default), the runner compares the `tests` check's own parsed count (`counts.tests`) against the count persisted at that path by the previous run, and rewrites the stamp with this run's count regardless of outcome. A **drop** — this run's count strictly lower than the previous one — never fails the run (the `tests` check's `exitCode` alone still decides pass/fail); it surfaces as a `CAVEAT:` line in the runner's stdout, distinct from the pass/fail table, and as a `testCountRegression: {previousTests, currentTests, droppedBy}` field on `report.json`. Present that line verbatim in Step 3's report when it fires — a quieter suite reads identical to a clean pass otherwise (IL-84: an enumerated glob silently excluded a whole test directory while `npm test` still exited 0). A steady or higher count, or no previous stamp (first run — bootstrap), produces no caveat. A legitimate test removal also drops the count; the caveat flags it for a human to judge, not to block on.

### Skip-if-recent (for /flow pipelines)

When running inside a `/claude-tweaks:flow` pipeline and the previous step already ran verification successfully (indicated by `VERIFICATION_PASSED=true` in the pipeline context), check the accompanying `VERIFICATION_SHA` (set by `build/SKILL.md` Common Step 5) against the current `git rev-parse HEAD`:

- **Match** — `skip this procedure entirely` and note: "Verification skipped — passed in previous pipeline step." This prevents redundant type check + lint + test runs when `/flow` chains build → test.
- **Mismatch** (`VERIFICATION_SHA` present but different from `HEAD`) — the tree changed since build's verification — **do not skip**; run the full procedure below and note why: "Verification re-run — tree changed since build's pass ({old-sha} → {current-sha})."
- **Signal absent** (`VERIFICATION_PASSED` unset, or `VERIFICATION_SHA` missing — the second call of a dispatched group, whose conversation never saw the first call's signal) — read the runner's own artifact instead (#1921), one plain command:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/verify.js" --stamp-status
```

  It prints one JSON object — `{present, sha, head, dirty, scope, fullSha, match, verifiedHead, reportPath, legacy}` — and exits 0 in every case (status is data, not failure). `verifiedHead: true` (a clean HEAD covered by a full pass — `match: true` — or by a passing scoped run whose `fullSha` is still an ancestor of HEAD) → skip with the note `Verification skipped — runner stamp {sha} ({scope}) verifies HEAD; report: {reportPath}` and log an `AUTO` decision per `_shared/auto-decision-log.md` (`--step "Skip-if-recent (runner stamp)"`). Any other state → consult the scoping table below: with a declaration and a usable anchor the re-verify sites run scoped; otherwise run the full procedure and note why (`Verification re-run — runner stamp {absent | {sha} ≠ HEAD {head} | dirty tree | scope {scope}}`). The conversation signal keeps precedence when present; the stamp is the path for a caller that has none. Fail-open: a missing or stale stamp is never a reason to trust a skip, only a matching one is.

**Note:** Skipping verification does not skip QA. When `/claude-tweaks:test` skips this procedure — by conversation signal or by a matching runner stamp — and QA stories exist, it still runs QA story validation separately.

### Re-verify scoping (#1923)

The runner owns execution and scope (`verify.js --scope`, #1922); this table owns *when* a site asks for scope. Every site below cites this table — none restates it.

| Site | Mode |
|------|------|
| Build Common Step 5 (`/claude-tweaks:build`) | always full |
| Second call's auto-inserted `test` (`/claude-tweaks:flow`) | scoped against `fullSha` |
| Polish re-verify (`/claude-tweaks:test skip-qa`, `/claude-tweaks:flow`) | scoped |
| Review-fix re-verify (`/claude-tweaks:review` Step 3 Routing) | scoped |
| Multi-spec spec-N `test` step (`/claude-tweaks:flow` multi-spec) | scoped (`none` on a bookkeeping-only delta) |
| Standalone `/claude-tweaks:test` | full |
| `/claude-tweaks:review` Step 1.5 standalone auto-trigger | scoped when it passes `--source review`, else full |
| `/claude-tweaks:test affected` | the shared changed-file set (`verify.js --changed-files`) |

**Scoped invocation.** A "scoped" site runs Step 2's command with the declaration and the integration branch added — one plain command (shown for a declaration whose `checks.tests` is a single command string; when it maps suites, replace `--cmd tests=` with one `--cmd {suite}=` per declared suite):

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/verify.js" --scope .claude-tweaks/verify-scope.json --integration-branch {ref} --cmd types="tsc --noEmit" --cmd lint="eslint ." --cmd tests="npm test"
```

`{ref}` resolves via `_shared/integration-branch.md`'s ladder (the runner has no `origin/HEAD` fallback and exits 2 without it when no usable stamp anchor exists). The `--cmd` set is the same full set Step 1 resolved — pass every declared suite (`--cmd api=…`, `--cmd web=…` when the declaration maps suites) and then **no** `--cmd tests=` — `tests` is not a declared suite in that case and an undeclared name is a usage error (exit 2); the runner filters it to what the selected mode needs and refuses a set missing a required check (exit 2 naming it). No declaration file → the runner reports `Scope: full — no declaration at …` and the run is today's full run; a stamp whose anchor is no longer an ancestor of HEAD (rebase, force-push) → the runner forces `full` — the same fail-closed posture unmatched paths get. A scoped stamp is never a full pass (`--stamp-status`'s `match` stays `false`), but it does verify HEAD: Skip-if-recent and `/claude-tweaks:review` Step 1.5 read `verifiedHead`, so a passing scoped run is never re-triggered by the next gate.

**Standalone is always full.** A site is scoped-eligible only when `$PIPELINE_RUN_DIR` is set (or a parent passed `--source {parent}`, the fallback signal for a caller with no run dir — `/claude-tweaks:flow` sets the run dir and never passes `--source`); with neither signal the invocation is standalone — a human asked for the suite and gets the suite; never pass `--scope` there.

**Report and log.** Step 3 logs one `AUTO` decision per `_shared/auto-decision-log.md`: `AUTO {time} — Verification scoped: {mode} — {n} changed file(s) since {base-short}: {path → rule, …}; suites: {list|none}. Reversibility: high.` (the `{path → rule}` pairs come straight from `report.json`'s `scope.matched` — each entry's `rule` is the index of the declaration rule that matched, rendered as that rule's `match` glob, or `null` rendered as `unmatched (fail-closed)`). `matched` is empty whenever no file was classified — a full run forced by an absent declaration or a stale anchor, or a delta of zero files — render `n/a (full run)` / `n/a (no changes)` rather than an empty list.

### Pre-existing failures (multi-spec batches)

In a multi-spec `/flow` run, `flow/multi-spec.md`'s pre-flight verify sweep runs this procedure once against the unmodified base, before spec 1's build begins, and records any failures to the parent run directory's ledger (phase `test`, status `open`). Before diagnosing a verification failure for an individual spec, check that ledger for an existing entry describing the same failure — if found, cite it (`Pre-existing — see ledger #{N}, batch pre-flight sweep`) instead of independently re-deriving the same root cause. Only diagnose failures not already covered by the sweep.

### Isolating pre-existing failures by file, not by keyword grep

A failure count that falls within a documented baseline range (e.g. "239-241 fail on this host")
is not, by itself, proof that none of those failures are new. Confirm it by extracting each
failing test's **source file path** — node's test runner prints one in the stack trace
(`at TestContext.<anonymous> (path/to/file.test.js:N)`) — and checking that none of those paths
are files this build's diff changes or adds, never by grepping the failure summary text for a
component-name or path-fragment substring. A test's assertion message has no obligation to
mention the file or component it protects: a real CI-visible regression from record #1579
(`dispatch/SKILL.md` exceeding the 40 KB per-invocation ceiling) surfaced in local output as
`no SKILL.md exceeds the 40 KB per-invocation ceiling` with an actual array entry
`['dispatch 41.4 KB']` — a keyword grep for `dispatch-SKILL` (a plausible-looking but wrong
guess at the failure's own vocabulary) found zero hits and let the regression through a run that
otherwise reported `TEST_PASSED=true`, undetected until the hosted CI check caught it
independently. Diff the **set of failing file paths** against a baseline run's own set (or,
absent a baseline run, against this build's own changed/added test files) — a substring search
over free-text failure messages is not a substitute.

## Step 2.5: Verification pass stamp

The runner stamps; agents never do (#1921). When `verify.js` exits 0 for the full resolved check set — every `--cmd` check ran, none was fail-fast skipped — it writes `{git-dir}/claude-tweaks-verify-pass.json` itself: `{sha, dirty, scope: "full", fullSha, base: null, changedFiles: [], suitesRun, flakyRetried: [], reportPath, at}`, bound to the `report.json` it summarizes, plus (for this release only — removal condition in `_shared/policy-deprecations.md`) the legacy bare-SHA twin `{git-dir}/claude-tweaks-verify-pass`. Under `--scope` the same fields carry the run's own mode, base, and changed set; only a `full` run sets `scope: "full"`, `base: null`, and rewrites the legacy twin. The stamp lives in the checkout's own git dir (per-worktree, never tracked, never shared across sessions).

Rules:

- No agent-side write exists — do not run `git rev-parse HEAD` into either stamp file. A failing run, a fail-fast skip, or a `--no-stamp` run leaves both files untouched (#1784: an agent-written stamp once recorded a `pass: false` run as a pass).
- A targeted or partial run passes `--no-stamp` (Step 2 above) and therefore never stamps.
- The stamp asserts verification only — QA story outcomes are tracked separately (the QA ledger), and consumers that care about QA consult that as they already do.
- Consumers read it only through `verify.js --stamp-status` (Skip-if-recent above; `/claude-tweaks:review` Step 1.5) and treat `present: false`, `verifiedHead: false`, or a dirty tree as "no recent pass" and re-run — fail-open. A stale stamp is never a reason to trust a skip.

## Step 3: Report

Present results in a consistent format:

Under a scoped run (the table above), render the runner's `Scope:` line — and any `still-verified:` line — verbatim as the first line(s) above this table.

```markdown
## Verification Results

| Check | Status | Duration | Details |
|-------|--------|----------|---------|
| Type check | {pass/fail} | {Xs} | {error count if failed} |
| Lint | {pass/fail} | {Xs} | {warning/error count} |
| Tests | {pass/fail} | {Xs} | {passed}/{total}, {failed count} failures |
```

Source the table from report.json: Status from each check's exitCode (or skipped), Duration from durationMs, Details from summary/counts. Capture VERIFICATION_SHA from report.json's sha — with the dirty caveat: dirty: true means "verified this tree, which is not exactly commit sha". When report.json carries `testCountRegression`, render its `CAVEAT:` line (see "Suite-count regression caveat" above) as its own paragraph directly under the table — never folded into the Tests row, since it is not a pass/fail signal.

### On failure

```markdown
### Failures

#### {Check name}
{the failingRegion the runner extracted (its stdout, or report.json's failingRegion field) — not the raw log}
```

The failure detail here comes from the runner's bounded extraction. Do not re-run the check outside the runner to produce it, and do not paste the raw log — the runner's bounding governs what enters context; this section only governs how it is presented.

### Flake adjudication (tests check only)

Run-to-run failure-count variance on byte-identical code often tracks machine load (sibling agents/sessions running concurrently) rather than a regression. Before reporting a `tests` check failure, re-run each failed file in isolation once:

```bash
node --test path/to/file.test.js
```

Report the isolated re-run's outcome separately — never collapsed into the original run's bare pass/fail statement:

- **Isolated re-run passes** — report as **flake** (machine load), not a regression.
- **Isolated re-run still fails** — report as a **regression**.

Only the `tests` check needs this — `types`/`lint` failures are deterministic, not load-sensitive, so there is nothing to re-run in isolation. Check the ledger first: "Pre-existing failures" above covers the distinct case of a failure already tracked before this spec's own changes, and only failures it does not cover get diagnosed and flake-adjudicated here.

### Gate behavior

The calling skill determines what happens on failure:

- **`/build`** — fix failures and re-run verification
- **`/test`** — report results. Optionally offer to fix (see `/test` Step 3).
