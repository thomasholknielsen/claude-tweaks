---
name: claude-tweaks:recon
description: Use when you want a proactive, report-only sweep of a repository that surfaces improvement opportunities and files them as deduplicated GitHub issues. An LLM judges the code; deterministic helpers handle scope rotation, content-hash skip, fingerprinting, dedup, and issue filing. Never edits code. Keywords - recon, sweep, repo audit, technical debt, proactive, github issues, scheduled, routine.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a Next Actions block (context-specific numbered options with one recommended), not a navigation menu.

# Recon — LLM-as-Code-Judge, Proactive Repo Improvement

A recurring watchman doing rounds: reads one directory slice, judges it against the universal criteria catalog, fingerprints each finding, dedups against open GitHub issues, and files the work worth doing. The LLM is the spine. Deterministic helpers handle fingerprint, dedup, and issue-payload projection. It never edits code.

```
              [ /claude-tweaks:recon ] <- utility (no fixed lifecycle position)
                           |  judges the slice; surfaces findings
                           v
findings -> validate-findings -> file GitHub issue (label: recon) -> /claude-tweaks:specify -> /claude-tweaks:build / /claude-tweaks:flow
         +- fuzzy / not-yet -> /claude-tweaks:capture (INBOX)
```

The plugin reacts to changes you make; `/recon` surfaces the changes worth making.

## When to Use

- You want a hands-off pass that keeps technical debt visible without driving each scan yourself.
- You want LLM-judged improvements filed as GitHub issues that drop into `/specify` with near-zero translation.
- You want findings deduplicated against work already tracked — never re-flood the tracker.
- You want to run on demand against a specific area, or let `next-slice` pick the highest-priority area automatically.

Not for: auto-fixing (report-only), CI gating (CI stays reactive), or replacing INBOX/specs (recon owns no backlog — it routes findings into the stores that already exist).

## Input

`$ARGUMENTS` may contain:

- `--area <path>` — manual override: scope the run to one specific area, bypassing `next-slice` rotation. Use for targeted re-inspection.
- `--dry-run` — emit the plan but write nothing (cache untouched, no issues filed). Use for the smoke check.
- `--root <dir>` — scan a project elsewhere (default: current working directory).
- `--budget <n>` — judge up to `n` slices in one run (default: 1). Use with `next-slice` when you want a deeper sweep in a single invocation.

## Workflow

**Step 1 — SCOPE: select the target slice.**

Unless `--area` was provided, call the engine to pick the next slice to judge:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/recon.js" next-slice --root .
```

The command prints `{ id, path, why }` JSON, or `null` if nothing is due. Read the output:
- If `null`: all slices were judged recently and their content is unchanged. Report this to the user and stop.
- If `why: "stale"`: this slice has not been judged in over 30 days regardless of content changes.
- If `why: "hotspot"`: this slice has the highest churn × complexity score among slices with changed content.

When `--area <path>` is provided, skip `next-slice` and use that path directly as the slice (manual override).

Verify the resolved path exists:

```bash
ls "${ROOT:-$PWD}/${AREA}"
```

If the path does not exist, stop and report the error. Set `AREA` and `ROOT` for the rest of the steps.

**Step 2 — GATHER OPEN ISSUES for dedup.**

Collect existing `recon`-labelled issues so the engine can skip/reopen correctly:

```bash
gh issue list --label recon --state all --json number,state,labels,body --limit 500 > /tmp/recon-issues-raw.json
```

Parse each issue body for the fingerprint marker `<!-- recon-fingerprint: recon-XXXXXXXX -->` and build an array of `{ number, state, labels, fingerprint }` objects. Write to `/tmp/recon-open.json`. If `gh` is unavailable or the repo has no recon issues, skip this step and set `ISSUES_FILE=""` — the run dedups against the local cache only.

**Step 3 — READ THE SLICE.**

Read every source file in `${ROOT}/${AREA}`. Use Read and Glob:

```bash
# List all files in the area
find "${ROOT}/${AREA}" -type f | sort
```

Read each file in full. Hold the full content in context — this is the material the judge will apply criteria to.

**Step 4 — CLASSIFY: detect area type + select criteria.**

Call the `classify` command to determine the area's type:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/recon.js" classify --root . --area "<slice-id>"
```

The command prints `{ areaId, types }`. Use the `types` array to select the applicable criteria via `criteriaForArea(types)` from `bin/lib/recon/criteria.js`. Types are additive — a `['frontend', 'library']` area gets universal criteria plus `a11y` and `api-stability`.

If `types` is `[]` (unknown area), apply universal criteria only: `architecture-depth`, `simplification`, `review-quality`, `scalability`, `security-logic`, `bad-practice`, `doc-freshness`, `dead-code`, `test-quality`, `resilience`, `observability`, `config-secrets`, `dependency-health`, `input-validation`, `naming-clarity`.

You can verify the catalog at any time:

```bash
node -e "const {criteriaForArea}=require('${CLAUDE_PLUGIN_ROOT}/bin/lib/recon/criteria.js'); console.log(criteriaForArea([]).map(c=>c.id).join(', '))"
```

Load each selected criterion's fragment file (the `fragment` field in the catalog) and embed it in the judge prompt for Step 5. Fragments live under `skills/_shared/` — read each one and include its content so the judge has the calibration text inline.

**Step 5 — JUDGE: apply each criterion holistically.**

**Tools as evidence (optional assists).**

Before or during judging, the judge MAY call the following deterministic tools to ground its findings. Each is optional — skip gracefully if the tool is not installed or the command errors. Tool output is evidence the judge weighs when forming a finding; raw tool output is never filed as a finding itself.

| Tool | Command | Evidence it provides |
|------|---------|----------------------|
| Project lint/typecheck | `npm run lint --if-present` or `npx tsc --noEmit` | Concrete type errors and lint violations in the slice |
| Dead code / unused deps | `npx knip --reporter json` or `npx depcheck` | Unused exports, unreferenced packages |
| Dependency vulnerabilities | `npm audit --json` or `npx osv-scanner --format json .` | Known CVEs in installed packages |
| Dependency cycles | `npx madge --circular --json <slice-path>` | Import cycles in the slice |
| Grep / git log | Standard Bash + git CLI | Code patterns, recent churn, authorship |

A finding confirmed by a tool output is higher-confidence than one based on code reading alone. Include the relevant tool output line as part of the finding's `evidence` field (not as a separate finding).

When a tool is absent or errors, log a single line to stderr and continue — do not abort the judge run.

For each selected criterion, read the code with that criterion as the lens. Apply the criterion holistically — this is a behavioral judgment, not a mechanical check. Evidence grounds the finding; do not file speculative findings.

For `architecture-depth`, `simplification`, and `review-quality`: the criterion fragments were embedded in Step 4. Use them as the calibration text inline before judging each criterion.

After applying all enumerated criteria, run a final "anything else worth flagging?" pass to catch what the checklist missed.

**Step 6 — EMIT FINDINGS as a JSON array.**

For each finding, emit exactly this shape:

```json
{
  "criterion": "<catalog id, e.g. 'simplification'>",
  "areaId": "<directory path relative to root, e.g. 'src/api'>",
  "anchor": "<relfile#NearestNamedSymbol — see anchor rules below>",
  "severity": "<low|medium|high|critical>",
  "confidence": "<high|med|low>",
  "title": "<short summary>",
  "evidence": "<what was observed — cites anchor; no line numbers>",
  "suggestedApproach": "<described fix in prose — NO code>",
  "acceptance": "<acceptance criteria>"
}
```

**Anchor rules (critical for dedup stability):**
- Format: `relative/file/path#NearestNamedSymbol`
- `NearestNamedSymbol` is the name of the nearest enclosing function, class, const, or section header.
- No line numbers. No surrounding prose. No absolute paths.
- Examples: `src/api/user.js#getUser`, `lib/parser.js#Parser`, `bin/recon.js#cmdRun`
- When a finding is module-level (no named symbol), use the file itself: `src/api/user.js#module`

Write the array to `/tmp/recon-findings.json`.

**Step 7 — VERIFY GATE: sanity-check surviving findings before dedup.**

Before fingerprinting and dedup, re-examine each finding the judge emitted and ask three questions:

1. **Is it real?** Does the code actually exhibit the problem, or did the judge misread the structure? If the code is correctly guarded (a timeout IS configured, a check IS present), drop the finding.
2. **Is it actionable?** Is the `suggestedApproach` concrete and executable? A finding like "consider improving error handling" with no specific location or change is not actionable — drop it or refine it until it is.
3. **Does it reproduce?** Given the code read in Step 3, would a developer following the `suggestedApproach` be able to find and fix the issue without additional investigation? If not, the anchor or evidence is too vague — either tighten it or drop the finding.

Drop any finding that fails any of the three questions. Log the drop reason. A smaller set of high-quality findings is always preferable to a larger set with noise. This is the adversarial-verify discipline that the v1 design established — apply it every time.

The verify gate is a judgment step, not a mechanical check. It cannot be automated. Do not skip it even under time pressure.

**Step 8 — VALIDATE, FINGERPRINT, DEDUP.**

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/recon.js" validate-findings /tmp/recon-findings.json \
  --root "${ROOT:-$PWD}" \
  ${ISSUES_FILE:+--issues "$ISSUES_FILE"} \
  ${DRY_RUN:+--dry-run} \
  > /tmp/recon-payloads.json
```

Read `/tmp/recon-payloads.json`. The command:
- Validates each finding (drops malformed ones with a logged reason on stderr).
- Fingerprints via `criterion + areaId + normalizeAnchor(anchor)`.
- Deduplicates against open `recon` issues and the local cache.
- Writes the updated cache (unless `--dry-run`).
- Emits gh-ready payloads on stdout as a JSON array.

**Step 9 — FILE / REOPEN ISSUES.**

For each payload in `/tmp/recon-payloads.json`, call `gh issue create`. The engine is emit-only; filing is always done by the skill:

```bash
gh issue create \
  --title "<payload.title>" \
  --body "<payload.body>" \
  --label recon \
  --label "recon:<severity>" \
  --label "recon:<criterion>"
```

For `reopen` decisions (a finding matching a closed non-`wontfix` issue has reappeared), reopen the issue and comment:

```bash
gh issue reopen <issue_number>
gh issue comment <issue_number> --body "Regressed: this finding reappeared. Run: ${RUN_ID}"
```

In `--dry-run` mode, print the payloads and the `gh` commands that would run, but do not call `gh`.

**Step 9.5 — Record the content-hash.**

After filing all surviving findings, the slice's content-hash is recorded automatically. When `validate-findings` completes a real (non-`--dry-run`) run, the engine persists the content-hash for the judged slice via the cursor's `lastHash` field. No manual shell command is needed — this step confirms the mechanism is active. The next `next-slice` call will see `lastHash` in the cursor and skip the slice unless its source files have changed since the last run.

**Step 10 — SUMMARIZE.**

Report: how many findings were emitted, how many survived dedup, how many issues were filed / skipped / remembered. List any new issue URLs. In interactive mode, present findings as a batch table and let the user route each to: file issue / INBOX (`/capture`) / `/specify` directly / dismiss.

## Routine Configuration

`/recon` is designed to run unattended on a schedule via a Claude Code Routine (`/schedule`). Design for small predictable sips: one slice per run so a scheduled run is cheap and a skipped run is harmless.

```
Name:       recon-daily
Schedule:   daily at 03:00 (off-peak)
Prompt:     /claude-tweaks:recon
K-budget:   1–3 slices per run (--budget flag on next-slice; default 1)
Token cap:  align with per-run budget
```

**Headless run flow:** SCOPE(`next-slice`) → CLASSIFY → JUDGE → `validate-findings` → file issues. Triage happens later in GitHub — the Routine does not wait for interactive input. Omit `--area` in the Routine prompt to let `next-slice` pick the highest-priority slice automatically.

A skipped run (e.g., `next-slice` returns `null` because all slices are fresh) is harmless — rotation resumes from the same position on the next window.

> **Billing note:** Routines run inside the subscription; verify automation-credit specifics against the live account.

## Regression and Critical Gating

Use `status [--fail-on regressed|critical]` to integrate recon state into CI or pre-push hooks.

```bash
# Exit 1 if any regressed entries exist in the cache (a closed issue re-opened)
node "${CLAUDE_PLUGIN_ROOT}/bin/recon.js" status --fail-on regressed

# Exit 1 if any open critical-severity entries exist in the cache
node "${CLAUDE_PLUGIN_ROOT}/bin/recon.js" status --fail-on critical
```

Exit-code behavior:
- `--fail-on regressed` — exits `1` when one or more cache entries have `status: "regressed"`; exits `0` otherwise.
- `--fail-on critical` — exits `1` when one or more open cache entries have `severity: "critical"`; exits `0` otherwise.
- Without `--fail-on`, `status` always exits `0` and prints a summary table.

Run both checks independently in CI if you want to gate on either condition.

## Fingerprint Churn

Use `churn-report [--fail-on-high-churn <r>]` to detect runs where the fingerprint set changed dramatically — a signal that criteria, anchoring rules, or code structure shifted in a way that may invalidate historical dedup.

```bash
# Print a churn report across all consecutive run pairs
node "${CLAUDE_PLUGIN_ROOT}/bin/recon.js" churn-report

# Exit 1 when appeared + disappeared / union ratio exceeds 0.5 (50 %)
node "${CLAUDE_PLUGIN_ROOT}/bin/recon.js" churn-report --fail-on-high-churn 0.5
```

Exit-code behavior:
- `--fail-on-high-churn <r>` — exits `1` if any consecutive run pair's `(appeared + disappeared) / union` ratio exceeds `r`; exits `0` otherwise. The first run has no prior and never triggers failure.
- Without the flag, `churn-report` always exits `0` and prints the ratio.

Use in post-run validation or a weekly cron step to catch accidental anchor or criteria regressions before they pollute the dedup cache.

## Next Actions

1. `/claude-tweaks:specify <issue-url-or-title>` — promote a filed recon issue into an agent-sized spec. **(Recommended when high-severity issues were filed.)**
2. `/claude-tweaks:capture <finding>` — park a fuzzy or below-threshold finding in INBOX for later triage.
3. `/claude-tweaks:recon --area <other-path>` — re-run on a different directory slice.
4. `/claude-tweaks:tidy` — fold the new issues into a backlog-hygiene pass alongside INBOX and deferred items.

## Component-Skill Contract

When `$PIPELINE_RUN_DIR` is set, `/claude-tweaks:recon` is running inside a pipeline (invoked by `/claude-tweaks:flow` or another pipeline orchestrator). In that case omit the `## Next Actions` block — the parent owns the handoff.

Direct invocation may pass `--source <parent-skill>` as an explicit fallback when ambiguity exists (rare; `$PIPELINE_RUN_DIR` is the primary signal). Standalone (no `$PIPELINE_RUN_DIR`) is the common case and renders Next Actions as usual.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Editing code to "just fix" a finding during a recon run | Recon is report-only. Fixing belongs to `/build` / `/flow` after a finding is promoted to a spec via `/specify`. |
| Filing every finding regardless of severity or confidence | Floods the tracker. Below-threshold or low-confidence findings are remembered in the cache, not filed. |
| Re-filing a finding that already has an open issue | Duplicates the tracker. Always run `validate-findings` with `--issues` before filing. |
| Hashing the prose description instead of the anchor | The dedup contract requires a stable structural anchor (`relfile#NearestSymbol`), not a content hash. Prose changes every run. |
| Emitting a line number in the anchor | Line numbers move when code is edited, breaking dedup. The anchor format is `file#Symbol` — no `:12`, no `:12:3`. |
| Calling the network from `recon.js` or `criteria.js` | The engine is emit-only and unit-testable. The skill hands payloads to `gh`; the engine never does. |
| Treating the cache as durable state | The cache is a rebuildable optimization. GitHub issue state is the source of truth for cross-run memory. |
| Filing a finding with `confidence: 'low'` for a noisy criterion | Noisy criteria (`security-logic`, `config-secrets`, `input-validation`, `resilience`) require `confidence: 'high'` to file. The confidence floor is enforced by the skill judgment, not the engine — the engine validates the shape, not the policy. |
| Skipping the verify gate before filing | Files plausible-but-wrong findings. Every surviving finding must pass all three verify questions — real, actionable, reproducible — before reaching dedup. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:specify` | Recon findings are pre-specs — a filed `recon` issue body is `/specify`-shaped (Current State / Deliverables / Acceptance Criteria), so `/specify` consumes it with near-zero translation. |
| `/claude-tweaks:capture` | Fuzzy or below-threshold findings route to INBOX via `/capture` instead of inflating the tracker. |
| `/claude-tweaks:tidy` | `/tidy` audits the backlog (INBOX, deferred, specs); recon-filed issues are another input it folds into a hygiene pass. |
| `/claude-tweaks:flow` | `/flow --from-recon` pulls the `recon`-labelled issues this skill files and runs them as a multi-spec batch (derive specs via `/specify` -> build/test/review/polish/wrap-up). |
| `/claude-tweaks:review` | `/review` judges diffs reactively; `/recon` judges latent code proactively. Both reuse the same criteria fragments from `skills/_shared/`. |
| `/claude-tweaks:deepen` | `/deepen` applies the architecture-depth criterion reactively to code you are changing; `/recon` applies it proactively on a schedule. Both read `criteria-architecture-depth.md`. |
| `/claude-tweaks:simplify` | `/simplify` applies the simplification criterion reactively; `/recon` applies it proactively. Both read `criteria-simplification.md`. |
