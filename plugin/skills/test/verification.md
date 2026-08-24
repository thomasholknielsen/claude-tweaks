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
node "${CLAUDE_PLUGIN_ROOT}/bin/verify.js" --log-dir "$(git rev-parse --git-dir)/claude-tweaks-verify" --cmd types="tsc --noEmit" --cmd lint="eslint ." --cmd tests="npm test"
```

Substitute the project's own commands from Step 1, one `--cmd <name>=<command>` per resolved check, and omit any stage the project doesn't have (`--cmd tests="npm test"` alone is valid — in this repo it is the whole set). The reserved names `types`, `lint`, and `tests` get the ordering policy: `types` and `lint` run concurrently, `tests` starts only after every supplied one of them exits 0, and a stage-1 failure reports `tests` as `skipped: fail-fast`. Any other name runs serially after the known stages under the same fail-fast. The `--log-dir` shape above anchors logs in the checkout's own git dir — per-worktree unique, so a concurrent session's run can never clobber it; leave `--log-dir` off to get a fresh directory under the OS tmpdir instead.

`--cmd` values are opaque strings executed by the child shell. If a compound value (e.g. `--cmd tests="a && b"`) trips a worktree session's command text-shape guard (see `_shared/scratch-worktree.md`'s "## 7. Shell constraint"), split it into two `--cmd` checks instead.

### Reading the result

The runner's stdout is already bounded — one table row per check plus at most one ≤100-line failing region per failed check, never raw check output — and it exits 0 iff every non-skipped check passed. It writes `{log-dir}/report.json`: per-check `{command, exitCode, durationMs, logPath, summary, failingRegion}` (plus `counts` where a test summary parses; a skipped check carries `{skipped: "fail-fast"}` in place of an exit code), and top-level `pass`, `startedAt`, `durationMs`, `sha`, and `dirty`. The recorded `exitCode` is the check command's own — judge each check by it, never by grep side effects. Each check's full output is in its own `{log-dir}/{name}.log` for a recovery read of last resort; read the failing region the runner already extracted, never `cat` the log.

### Skip-if-recent (for /flow pipelines)

When running inside a `/claude-tweaks:flow` pipeline and the previous step already ran verification successfully (indicated by `VERIFICATION_PASSED=true` in the pipeline context), check the accompanying `VERIFICATION_SHA` (set by `build/SKILL.md` Common Step 5) against the current `git rev-parse HEAD`:

- **Match** — `skip this procedure entirely` and note: "Verification skipped — passed in previous pipeline step." This prevents redundant type check + lint + test runs when `/flow` chains build → test.
- **Mismatch, or `VERIFICATION_SHA` absent** — the tree changed since build's verification (or the signal predates this stamp) — **do not skip**; run the full procedure below and note why: "Verification re-run — tree changed since build's pass ({old-sha} → {current-sha})." Fail-open: a missing or stale stamp is never a reason to trust a skip, only a matching one is.

**Note:** Skipping verification does not skip QA. When `/claude-tweaks:test` receives `VERIFICATION_PASSED=true` and QA stories exist, it skips this procedure but still runs QA story validation separately.

### Pre-existing failures (multi-spec batches)

In a multi-spec `/flow` run, `flow/multi-spec.md`'s pre-flight verify sweep runs this procedure once against the unmodified base, before spec 1's build begins, and records any failures to the parent run directory's ledger (phase `test`, status `open`). Before diagnosing a verification failure for an individual spec, check that ledger for an existing entry describing the same failure — if found, cite it (`Pre-existing — see ledger #{N}, batch pre-flight sweep`) instead of independently re-deriving the same root cause. Only diagnose failures not already covered by the sweep.

## Step 2.5: Verification pass stamp

When the runner exits 0 for the full resolved check set (the full procedure, regardless of which skill called it — a targeted or partial run must not stamp), record the pass before reporting:

```bash
git rev-parse HEAD > "$(git rev-parse --git-dir)/claude-tweaks-verify-pass"
```

One plain command, worktree-guard-safe; the stamp lives in the checkout's own git dir (per-worktree, never tracked, never shared across sessions). `/claude-tweaks:review` Step 1.5's standalone test gate compares it to the current `HEAD` — a matching sha means no commits landed since the last full verification pass, replacing the commit-archaeology that check previously required.

Rules:

- Write it **only** when the runner exits 0 for the full resolved check set. A targeted or partial run (types-only, lint-only, a scoped test path) must not stamp, and a failing run must never stamp.
- The stamp asserts verification only — QA story outcomes are tracked separately (the QA ledger), and consumers that care about QA consult that as they already do.
- Consumers treat a missing, unreadable, or mismatched stamp as "no recent pass" and re-run — fail-open, mirroring the `VERIFICATION_SHA` mismatch rule in Skip-if-recent above. A stale stamp is never a reason to trust a skip.

## Step 3: Report

Present results in a consistent format:

```markdown
## Verification Results

| Check | Status | Duration | Details |
|-------|--------|----------|---------|
| Type check | {pass/fail} | {Xs} | {error count if failed} |
| Lint | {pass/fail} | {Xs} | {warning/error count} |
| Tests | {pass/fail} | {Xs} | {passed}/{total}, {failed count} failures |
```

Source the table from report.json: Status from each check's exitCode (or skipped), Duration from durationMs, Details from summary/counts. Capture VERIFICATION_SHA from report.json's sha — with the dirty caveat: dirty: true means "verified this tree, which is not exactly commit sha".

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
