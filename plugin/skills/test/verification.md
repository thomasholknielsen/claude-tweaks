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

Run all checks. Order matters — fail fast:

> **Parallel execution:** Use parallel tool calls aggressively — type checking and linting are independent and should run concurrently as parallel Bash calls. Run tests after both pass (tests are slower and type/lint failures often cause test failures too).

1. Type checking (fastest feedback)
2. Linting
3. Tests (unit + integration)

### Capture, never stream

**Never let a check's raw output land in context** — this applies to every check, not just tests. Redirect each command to a log file, then report its exit code plus a bounded summary read back from that file. Measured in this repo, one `npm test` run is ~386 KB / ~8,950 lines (~96,000 tokens); what this step actually needs from it — did it pass, and if not what failed — fits in well under 1 KB.

Write logs to the checkout's own git dir — per-worktree unique and stable across Bash calls, so a later recovery read finds the same file and a concurrent session's run can never clobber it (fixed `/tmp/verify-*.log` names collide across parallel sessions and misattribute another run's failures). Run every check in this exact shape:

```bash
LOG="$(git rev-parse --git-dir)/claude-tweaks-verify-test.log"
npm test > "$LOG" 2>&1; echo "exit=$?"; tail -30 "$LOG"; grep -E '^not ok|^# (tests|pass|fail)' "$LOG"
```

(In the rare non-git directory, fall back to `/tmp/verify-{check}-{project-dirname}.log` — the collision risk returns but only where no git dir exists to anchor to.)

Three rules make this shape correct:

- `echo "exit=$?"` must be the **next** command after the check — any command in between clobbers `$?`. The `exit=` line is the only authoritative pass/fail signal.
- The trailing `grep` exiting 1 because it matched nothing is **expected, and is not a check failure** — a clean `node --test` run has zero `not ok` lines. Judge the check by `exit=`, never by the grep's own status.
- Use a distinct `$LOG` path per check (`…/claude-tweaks-verify-typecheck.log`, `…/claude-tweaks-verify-lint.log`, `…/claude-tweaks-verify-test.log` — all under the same `$(git rev-parse --git-dir)` anchor). The type check and lint run concurrently per the parallel-execution directive above, and would otherwise overwrite each other's output.

Substitute the project's own commands from Step 1. Type check and lint are adequately summarized by `tail -20 "$LOG"` alone. Test runners need a count line as well:

- `node --test` — add `grep -E '^not ok|^# (tests|pass|fail)' "$LOG"` after the `tail`, as above.
- jest / vitest / pytest — `tail -30 "$LOG"` alone already captures their trailing summary block.

### On a non-zero exit: read only the failing region

Only when `exit=` is non-zero, go back to the log — and read the **failing region**, never the whole file. Cap every recovery read:

```bash
grep -n -A 20 '^not ok' "$LOG" | head -100                 # node --test
grep -n -B 2 -A 20 -E 'FAIL|Error:' "$LOG" | head -100     # other runners
```

`node --test` emits its TAP diagnostic block *after* the `not ok` line, so a bare `grep '^not ok'` returns each failure's title with none of its cause — always pair it with trailing context (`-A`), as above. If 100 capped lines still don't explain the failure, widen once with a narrower pattern (`head -200`); never `cat` the log.

### Skip-if-recent (for /flow pipelines)

When running inside a `/claude-tweaks:flow` pipeline and the previous step already ran verification successfully (indicated by `VERIFICATION_PASSED=true` in the pipeline context), check the accompanying `VERIFICATION_SHA` (set by `build/SKILL.md` Common Step 5) against the current `git rev-parse HEAD`:

- **Match** — `skip this procedure entirely` and note: "Verification skipped — passed in previous pipeline step." This prevents redundant type check + lint + test runs when `/flow` chains build → test.
- **Mismatch, or `VERIFICATION_SHA` absent** — the tree changed since build's verification (or the signal predates this stamp) — **do not skip**; run the full procedure below and note why: "Verification re-run — tree changed since build's pass ({old-sha} → {current-sha})." Fail-open: a missing or stale stamp is never a reason to trust a skip, only a matching one is.

**Note:** Skipping verification does not skip QA. When `/claude-tweaks:test` receives `VERIFICATION_PASSED=true` and QA stories exist, it skips this procedure but still runs QA story validation separately.

### Pre-existing failures (multi-spec batches)

In a multi-spec `/flow` run, `flow/multi-spec.md`'s pre-flight verify sweep runs this procedure once against the unmodified base, before spec 1's build begins, and records any failures to the parent run directory's ledger (phase `test`, status `open`). Before diagnosing a verification failure for an individual spec, check that ledger for an existing entry describing the same failure — if found, cite it (`Pre-existing — see ledger #{N}, batch pre-flight sweep`) instead of independently re-deriving the same root cause. Only diagnose failures not already covered by the sweep.

## Step 2.5: Verification pass stamp

When **all three checks pass** (types + lint + tests — the full procedure, regardless of which skill called it), record the pass before reporting:

```bash
git rev-parse HEAD > "$(git rev-parse --git-dir)/claude-tweaks-verify-pass"
```

One plain command, worktree-guard-safe; the stamp lives in the checkout's own git dir (per-worktree, never tracked, never shared across sessions). `/claude-tweaks:review` Step 1.5's standalone test gate compares it to the current `HEAD` — a matching sha means no commits landed since the last full verification pass, replacing the commit-archaeology that check previously required.

Rules:

- Write it **only** on a full three-check pass. A targeted or partial run (types-only, lint-only, a scoped test path) must not stamp, and a failing run must never stamp.
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

### On failure

```markdown
### Failures

#### {Check name}
{error output — the capped recovery read from Step 2's "On a non-zero exit" procedure, not the raw log}
```

The failure detail here comes from Step 2's bounded recovery read. Do not re-run the check without redirection to produce it, and do not paste the raw log — Step 2's capture rule governs what enters context; this section only governs how it is presented.

### Gate behavior

The calling skill determines what happens on failure:

- **`/build`** — fix failures and re-run verification
- **`/test`** — report results. Optionally offer to fix (see `/test` Step 3).
