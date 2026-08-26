# Code Health — CI Integration (Regression, Risk Gating, Fingerprint Churn)

Lazy-loaded from `SKILL.md`'s CI Integration section — read this only when a caller actually wants to wire `/code-health` state into CI, a pre-push hook, or a periodic validation step. Nothing in the main Workflow (Steps 1-10) depends on this file.

## Regression and Risk Gating

Use `status [--fail-on regressed|risk-high]` to integrate code-health state into CI or pre-push hooks.

```bash
# Exit 1 if any regressed entries exist in the cache (a closed issue re-opened)
node "${CLAUDE_PLUGIN_ROOT}/bin/code-health.js" status --fail-on regressed

# Exit 1 if any open risk-high entries exist in the cache
node "${CLAUDE_PLUGIN_ROOT}/bin/code-health.js" status --fail-on risk-high
```

Exit-code behavior:
- `--fail-on regressed` — exits `1` when one or more cache entries have `status: "regressed"`; exits `0` otherwise.
- `--fail-on risk-high` — exits `1` when one or more open cache entries have `risk: "high"`; exits `0` otherwise.
- Without `--fail-on`, `status` always exits `0` and prints a summary table.

Run both checks independently in CI if you want to gate on either condition.

## Fingerprint Churn

Use `churn-report [--fail-on-high-churn <r>]` to detect runs where the fingerprint set changed dramatically — a signal that criteria, anchoring rules, or code structure shifted in a way that may invalidate historical dedup.

```bash
# Print a churn report across all consecutive run pairs
node "${CLAUDE_PLUGIN_ROOT}/bin/code-health.js" churn-report

# Exit 1 when appeared + disappeared / union ratio exceeds 0.5 (50 %)
node "${CLAUDE_PLUGIN_ROOT}/bin/code-health.js" churn-report --fail-on-high-churn 0.5
```

Exit-code behavior:
- `--fail-on-high-churn <r>` — exits `1` if any consecutive run pair's `(appeared + disappeared) / union` ratio exceeds `r`; exits `0` otherwise. The first run has no prior and never triggers failure.
- Without the flag, `churn-report` always exits `0` and prints the ratio.

Use in post-run validation or a weekly cron step to catch accidental anchor or criteria regressions before they pollute the dedup cache.
