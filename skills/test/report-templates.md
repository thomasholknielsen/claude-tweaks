# Test — Step 2 Report Templates

Loaded by `/claude-tweaks:test` Step 2 when rendering results. The SKILL.md keeps a compact lookup table; this file owns the verbose per-mode templates.

> **Propagation rule:** `PASS_WITH_CAVEATS` sets `TEST_PASSED=true` — downstream gates (/review, /wrap-up) treat it identically to a clean pass. Caveats are carried as `observation` status ledger entries, visible in review findings but never blocking.

PASS_WITH_CAVEATS counts as passed for the `TEST_PASSED` gate — caveats are informational, not blocking. Timing, recovered-selector summaries, and the finding/observation ledger writes (phase `test/qa`) are all documented canonically in `qa-reporting.md` Phase 5.5 — defer to that section rather than restating here.

On overall pass (including PASSED WITH OBSERVATIONS), set `TEST_PASSED=true` in pipeline context.

## Standard mode result

```
All checks passed. Set TEST_PASSED=true.
```

## QA mode result

```
## QA Validation Results

{Full QA report from qa-reporting.md — its own header already carries the Stories/Findings/Observations summary; do not restate those counts or tables here, only the embed}

Set TEST_PASSED=true (if all passed or passed with observations).
```

### Actions Performed (QA)

{Only show when QA auto-recovered selectors or applied fixes. Omit when purely observational.}

| Action | Detail | Ref |
|--------|--------|-----|
| Ledger fix | Auto-recovered selector (test/qa) — `{story file}` | — |

## All mode result

```
## Verification Results

{standard verification table}
```

Then render the QA Validation Results section exactly as in "QA mode result" above.

## Pipeline result (VERIFICATION_PASSED + no stories)

```
Verification: passed in build. QA: no stories found.
Set TEST_PASSED=true.
```

## Pipeline result (VERIFICATION_PASSED + stories)

```
Verification: passed in build.

## QA Validation Results

{Full QA report from qa-reporting.md — its own header already carries the Stories/Findings/Observations summary; do not restate those counts or tables here, only the embed}

Set TEST_PASSED=true (if all passed or passed with observations).
```
