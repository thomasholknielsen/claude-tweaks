# Multi-Spec Summary Template

Loaded at summary-render time by `/flow`'s consolidated close-out.

After all specs complete (or one fails), present a consolidated summary:

```markdown
## Flow: Multi-Spec Pipeline Complete  {— keep-going if applicable}

| Spec | Build | Test | Review | Polish | Wrap-Up | Outcome |
|------|-------|------|--------|--------|---------|---------|
| {N} | passed | passed | PASS | applied + re-verified | done | Complete |
| {N} | passed | passed | PASS | skipped (no-polish) | done | Complete (no polish) |
| {N} | passed | passed | BLOCKED | — | — | Stopped at review |
| {N} | passed | passed | PASS | re-verify failed | — | Stopped at re-verify |
| {N} | passed | FAILED | — | — | — | Failed (test gate) — continued (keep-going) |
| {N} | — | — | — | — | — | Not run (previous spec failed) |

**Release status:** {one line for the run's single shared branch, from `_shared/pr-first-merge-post-merge.md` Step 4.1, verbatim — same vocabulary as `summary-template.md`'s line; `n/a — not merged in this run (outcome: {armed | pending-review})` when the bundle PR did not merge in this run}
{On either backfill form, `summary-template.md`'s same **Backfill:** line}

### Timing

Rendered verbatim from `node "${CLAUDE_PLUGIN_ROOT}/bin/phase-timing.js" --run "$MULTISPEC_PARENT_DIR" --markdown` (#1928) — never composed by hand; a phase with no event reads `unattributed`. `{Minutes}` is the phase's span, with `(own N)` when nested phases are excluded. When wrap-up's cleanup item 8 has already archived the run directory (`cleanup-procedures.md`), pass `$RUN_ROOT/.claude-tweaks/pipelines/archive/{run-id}/` as `--run` instead — the events and manifest travel with the archive.

| Phase | Minutes | Verify |
|---|---|---|
| {phase} | {minutes} | {mode ×n | — | unattributed} |
| total | {totals.minutes} | {verifyRuns} run(s) ({modes}) |

### Manual Steps Required (all specs)
| # | Spec | What | Where |
|---|------|------|-------|
| 1 | {N} | {description} | {source} |
(or: No manual steps required.)

### Per-Spec Details
(expand each spec's key outputs, failures, and review findings)
```

The header includes `— keep-going` when the run was invoked with that flag. The outcome column distinguishes:
- `Complete` — all gates passed
- `Stopped at {step}` — HARD-GATE failure, remaining specs not run (default mode)
- `Failed ({gate}) — continued (keep-going)` — HARD-GATE failure but pipeline continued to the next spec
- `Not run (previous spec failed)` — only appears in default mode; never under `keep-going`
