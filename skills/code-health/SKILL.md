---
name: claude-tweaks:code-health
description: Use when you want a proactive, report-only sweep of a repository that surfaces improvement opportunities and files them as deduplicated GitHub issues. An LLM judges the code; deterministic helpers handle scope rotation, content-hash skip, fingerprinting, dedup, and issue filing. Never edits code. Keywords - code-health, sweep, repo audit, technical debt, proactive, github issues, scheduled, routine.
---
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.

# Code-Health — LLM-as-Code-Judge, Proactive Repo Improvement

A recurring health check doing rounds: reads one directory slice, judges it against the universal criteria catalog, fingerprints each finding, dedups against open GitHub issues, and files the work worth doing. The LLM is the spine. Deterministic helpers handle fingerprint, dedup, and issue-payload projection. It never edits code.

```
              [ /claude-tweaks:code-health ] <- utility (no fixed lifecycle position)
                           |  judges the slice; surfaces findings
                           v
findings -> validate-findings -> file GitHub issue (by:code-health, ready) -> /claude-tweaks:specify -> /claude-tweaks:build / /claude-tweaks:flow
         +- fuzzy / not-yet -> /claude-tweaks:capture (backlog)
```

The plugin reacts to changes you make; `/code-health` surfaces the changes worth making.

## When to Use

- You want a hands-off pass that keeps technical debt visible without driving each scan yourself.
- You want LLM-judged improvements filed as GitHub issues that drop into `/specify` with near-zero translation.
- You want findings deduplicated against work already tracked — never re-flood the tracker.
- You want to run on demand against a specific area, or let `next-slice` pick the highest-priority area automatically.

Not for: auto-fixing (report-only), CI gating (CI stays reactive), or replacing `/capture`/`/specify` (code-health owns no backlog — it routes findings into the stores that already exist).

## Input

`$ARGUMENTS` may contain:

- `--area <path>` — manual override: scope the run to one specific area, bypassing `next-slice` rotation. Use for targeted re-inspection.
- `--dry-run` — emit the plan but write nothing (cache untouched, no issues filed). Use for the smoke check.
- `--root <dir>` — scan a project elsewhere (default: current working directory).
- `--budget <n>` — judge up to `n` slices in one run (default: 1). Use with `next-slice` when you want a deeper sweep in a single invocation.
- `--min-risk <level>` — minimum computed risk tier (severity × likelihood) that gets filed as a GitHub issue (default: `high`; one of `low|medium|high`). Findings below this are held in the local cache as `remembered` — not dropped, not filed — until they escalate or a deliberately deeper sweep lowers the bar. Pass `--min-risk medium` (or `low`) for an intentional deep-dive that surfaces more than the default high-risk-only trickle.

## Workflow

**Step 1 — SCOPE: select the target slice.**

Unless `--area` was provided, call the engine to pick the next slice to judge:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/code-health.js" next-slice --root .
```

The command prints `{ id, path, why }` JSON, or `null` if nothing is due. Read the output:
- If `null`: all slices were judged recently and their content is unchanged. Report this to the user and stop.
- If `why: "stale"`: this slice has not been judged in over 30 days regardless of content changes.
- If `why: "hotspot"`: this slice has the highest churn × complexity score among slices with changed content.

**Multi-slice runs (`--budget > 1`):** `next-slice` returns a JSON **array** of up to `n` slices instead of a single object when `--budget` is passed. Treat each array entry as its own full sweep: run Steps 2–9 in their entirety for slice 1 (including its own `validate-findings --slice <id> --run-id <id>` call), then repeat the full Steps 2–9 for slice 2, and so on. Never collect findings from multiple slices into one shared `validate-findings` call — each slice needs its own `--slice` value so its cursor persists independently. A run that judges 3 slices makes 3 separate `validate-findings` invocations, not 1.

When `--area <path>` is provided, skip `next-slice` and use that path directly as the slice (manual override).

Verify the resolved path exists:

```bash
ls "${ROOT:-$PWD}/${AREA}"
```

If the path does not exist, stop and report the error. Set `AREA` and `ROOT` for the rest of the steps.

**Step 2 — GATHER OPEN ISSUES for dedup.**

Collect existing `by:code-health`-labelled issues so the engine can skip/reopen/suppress correctly:

```bash
gh issue list --label by:code-health --state all --json number,state,labels,body --limit 500 > /tmp/code-health-issues-raw.json
```

Parse each issue body for its fingerprint marker and build an array of `{ number, state, labels, fingerprint }` objects. Fingerprint extraction reads the dual-marker form via `extractFingerprint` (`bin/lib/issues/record.js`): the current `<!-- work-fingerprint: codehealth-XXXXXXXX -->` marker, falling back to the legacy `<!-- code-health-fingerprint: codehealth-XXXXXXXX -->` marker still present on issues filed before this skill moved onto the unified work record (`skills/_shared/work-record.md`). Write to `/tmp/code-health-open.json`. If `gh` is unavailable or the repo has no `by:code-health` issues, skip this step and set `ISSUES_FILE=""` — the run dedups against the local cache only.

A matched issue carrying the `wontfix` label is a standing suppression decision, not a skip or reopen: `validate-findings` (Step 8) suppresses re-filing entirely and persists `status: 'wontfix'` to the local cache, so the decision survives even on a later run where `gh` is unavailable and this issue index can't be rebuilt.

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
node "${CLAUDE_PLUGIN_ROOT}/bin/code-health.js" classify --root . --area "<slice-id>"
```

The command prints `{ areaId, types }`. Use the `types` array to select the applicable criteria via `criteriaForArea(types)` from `bin/lib/code-health/criteria.js`. Types are additive — a `['frontend', 'library']` area gets universal criteria plus `a11y` and `api-stability`.

If `types` is `[]` (unknown area), apply universal criteria only: `architecture-depth`, `simplification`, `review-quality`, `scalability`, `security-logic`, `bad-practice`, `doc-freshness`, `dead-code`, `test-quality`, `resilience`, `observability`, `config-secrets`, `dependency-health`, `input-validation`, `naming-clarity`.

You can verify the catalog at any time:

```bash
node -e "const {criteriaForArea}=require('${CLAUDE_PLUGIN_ROOT}/bin/lib/code-health/criteria.js'); console.log(criteriaForArea([]).map(c=>c.id).join(', '))"
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
  "relatedAnchors": "<optional array of relfile#NearestNamedSymbol strings — sibling occurrences of the same root cause; omit if there's only one occurrence>",
  "severity": "<low|medium|high>",
  "confidence": "<high|medium|low>",
  "likelihood": "<low|medium|high>",
  "effort": "<low|medium|high>",
  "title": "<short summary>",
  "evidence": "<what was observed — cites anchor; no line numbers>",
  "suggestedApproach": "<described fix in prose — NO code>",
  "acceptance": "<acceptance criteria>"
}
```

**Some criterion fragments (e.g. `criteria-review-quality.md`, `criteria-security-logic.md`) reference a `critical` or `info` tier inherited from `/claude-tweaks:review`'s broader 5-tier scale.** Code-health's own schema accepts only `low|medium|high` for `severity` — never emit `critical` or `info`. When a fragment's calibration language points toward `critical`, map it to `severity: high` (code-health has no higher tier); treat anything a fragment would call `info` as not worth filing at all rather than as a `low` finding.

**Severity, likelihood, and effort are three separate, simpler judgments — do not conflate them:**

- **`severity`** — impact *if* the pattern manifests. Unchanged meaning from before.
- **`likelihood`** — how probable this is to actually matter in practice. One holistic judgment folding together whichever of these three factors actually apply to the finding at hand:
  - **Exposure** — is this on a hot/frequently-executed path and user-facing, or a rarely-touched internal script / dead corner?
  - **Blast radius** — does this affect one call site, or a shared/foundational module many things depend on?
  - **Exploitability** — for security-relevant criteria specifically: can external input actually reach and trigger this, or is it a theoretical concern with no real attack surface? Non-security criteria simply have no exploitability consideration to weigh.
- **`effort`** — the cost/complexity of the finding's own `suggestedApproach`. A one-line parameter addition is `low`; a bundled fix across several sibling occurrences is `medium`; a structural change (new abstraction, cross-file rework) is `high`.

**Bundling rule (recurring root causes):** when the same criterion and the same suggested fix recur at multiple call sites within the slice being judged, file **one** finding, not one per call site. Pick the clearest/most representative occurrence as the primary `anchor`; list every other occurrence in `relatedAnchors`; make `evidence` enumerate all occurrences; make `acceptance` require all of them fixed, not just the primary. Only bundle occurrences that share both the criterion AND the fix — do not bundle unrelated findings under one anchor just because they're nearby in the same file or directory.

**Anchor rules (critical for dedup stability):**
- Format: `relative/file/path#NearestNamedSymbol`
- `NearestNamedSymbol` is the name of the nearest enclosing function, class, const, or section header.
- No line numbers. No surrounding prose. No absolute paths.
- Examples: `src/api/user.js#getUser`, `lib/parser.js#Parser`, `bin/code-health.js#cmdRun`
- When a finding is module-level (no named symbol), use the file itself: `src/api/user.js#module`

Write the array to `/tmp/code-health-findings.json`.

**Step 7 — VERIFY GATE: sanity-check surviving findings before dedup.**

Before fingerprinting and dedup, re-examine each finding the judge emitted and ask five questions:

1. **Is it real?** Does the code actually exhibit the problem, or did the judge misread the structure? If the code is correctly guarded (a timeout IS configured, a check IS present), drop the finding.
2. **Is it actionable?** Is the `suggestedApproach` concrete and executable? A finding like "consider improving error handling" with no specific location or change is not actionable — drop it or refine it until it is.
3. **Does it reproduce?** Given the code read in Step 3, would a developer following the `suggestedApproach` be able to find and fix the issue without additional investigation? If not, the anchor or evidence is too vague — either tighten it or drop the finding.
4. **Is `likelihood` justified by the evidence?** The finding's `evidence` should support the claimed exposure/blast-radius/exploitability — not just assert a likelihood tier without grounding it in what was actually observed in the code.
5. **Is `effort` consistent with `suggestedApproach`?** A `suggestedApproach` that reads as a one-line change should not carry `effort: high`, and vice versa.

Drop any finding that fails any of the five questions. Log the drop reason. A smaller set of high-quality findings is always preferable to a larger set with noise. This is the adversarial-verify discipline that the v1 design established — apply it every time.

The verify gate is a judgment step, not a mechanical check. It cannot be automated. Do not skip it even under time pressure.

**Step 8 — VALIDATE, FINGERPRINT, DEDUP.**

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/code-health.js" validate-findings /tmp/code-health-findings.json \
  --root "${ROOT:-$PWD}" \
  --slice "${SLICE_ID}" \
  --run-id "${RUN_ID}" \
  ${ISSUES_FILE:+--issues "$ISSUES_FILE"} \
  ${MIN_RISK:+--min-risk "$MIN_RISK"} \
  ${DRY_RUN:+--dry-run} \
  > /tmp/code-health-payloads.json
```

`SLICE_ID` is the `id` field from the `next-slice` output in Step 1 (or the `--area` value when using manual override). `RUN_ID` is the run identifier for this sweep (ISO timestamp or any stable string unique per run).

Read `/tmp/code-health-payloads.json`. The command:
- Validates each finding (drops malformed ones with a logged reason on stderr).
- Fingerprints via `criterion + areaId + normalizeAnchor(anchor)`.
- Deduplicates against open `by:code-health` issues and the local cache — including honoring a `wontfix`-labelled match as a standing suppression (see Step 2).
- Writes the updated cache and records the run-log + slice cursor (unless `--dry-run`).
- Emits gh-ready payloads on stdout as a JSON array.

**Step 9 — FILE / REOPEN ISSUES.**

Every code-health record files onto the unified work record (`skills/_shared/work-record.md`): origin `by:code-health`; `finding.risk` maps to the `risk:{value}` label; `finding.effort` maps to the `effort:{value}` label; Type is always `task`. Every filed finding is **born-`ready`** — code-health findings are agent-sized and spec-shaped by construction (Current State / Deliverables / Acceptance Criteria, verified by the Step 7 gate), so they file with the `ready` label already applied and appear directly in the authorization gate's worklist, skipping maturation. `toIssuePayloadV2` (`bin/lib/code-health/issue-payload.js`) assembles the payload via `record.js`'s `recordPayload` — the emitted label set is exactly `by:code-health`, `risk:<tier>`, `effort:<tier>`, `ready` (no per-criterion label).

Before filing this firing's own new findings, drain the durable retry queue from prior firings' filing failures (see `_shared/health-state.md`):

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/code-health.js" retry-queue drain --root . > /tmp/code-health-retry-payloads.json
```

For each payload in `/tmp/code-health-retry-payloads.json`, attempt `gh issue create` exactly as below. Track the outcome of every attempt (this firing's retry-queue payloads AND any brand-new payload from Step 9's own filing loop that fails) as `[{ fingerprint, payload, ok: true }]` or `[{ fingerprint, payload, ok: false, error: "<gh's error output>" }]`, write to `/tmp/code-health-retry-results.json`, then:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/code-health.js" retry-queue update /tmp/code-health-retry-results.json --root . > /tmp/code-health-escalated.json
```

This records successes (removed from the queue) and failures (added/incremented) in one durable write. If `/tmp/code-health-escalated.json` is non-empty, file (or update) a `code-health:filing-failed` issue for each entry, naming the stuck fingerprint and its failure history — bootstrap that label the same way as the others below.

Before filing, bootstrap only the label families this run applies, with real descriptions — using the shared helper so a too-long description fails loudly here rather than as a 422 on `gh issue create`. Pairs copied verbatim from `_shared/label-bootstrap.md`'s canonical `LABELS_JSON`:

```bash
# Bootstrap per _shared/label-bootstrap.md, LABELS_JSON =
# [["by:code-health", "Origin: filed by the code-health skill"],
#  ["risk:low",        "Scoring: low blast radius — safe for autonomous build"],
#  ["risk:medium",     "Scoring: moderate blast radius — review before merge recommended"],
#  ["risk:high",       "Scoring: high blast radius — human review required"],
#  ["effort:low",      "Scoring: small, agent-sized change"],
#  ["effort:medium",   "Scoring: moderate change, may span several files"],
#  ["effort:high",     "Scoring: large change — consider decomposition before building"],
#  ["ready",           "Stage: spec-shaped and agent-sized — in the authorization gate's worklist"]]
```

There is no per-criterion label anymore — the criterion is already in the issue body's header line (`**Criterion:** ...`), and nothing reads it back off a label; this was also the label class that hit GitHub's 100-char cap (see `bin/lib/code-health/issue-payload.js`).

Per `_shared/health-filing-gate.md`'s applicability/scope/placement rule: in interactive mode, before filing this firing's own new findings (not the retry-queue drains or reopen decisions below, which already executed unconditionally), route survivors through a two-tier decision:

1. Render all findings as a markdown batch table:

   ```
   | # | Title | Criterion | Severity | Confidence | Recommended |
   |---|-------|-----------|----------|------------|-------------|
   | 1 | {title} | {criterion} | {severity} | {confidence} | {File issue|Capture} |
   ```

   Pre-fill the Recommended column: high severity + high confidence → `"File issue"`; below `--min-risk` or low confidence → `"Capture"`; everything else (e.g. medium severity + high confidence) → `"File issue"` — file issue is the safe default whenever a finding clears the confidence bar but isn't low-risk enough for `Capture`.

2. Call `AskUserQuestion` with `question`: `"How do you want to handle these findings?"`, `header`: `"Findings"`, `multiSelect`: `false`, and:
   - Option 1 — `label`: `"Apply all recommended (Recommended)"`, `description`: `"File / Capture each finding per the Recommended column above"`
   - Option 2 — `label`: `"Route individually"`, `description`: `"Decide each finding one at a time"`

3. If "Route individually" was chosen, call `AskUserQuestion` once per finding — `question`: `"How do you want to handle finding #{N}: {title}?"`, `header`: `"Finding #{N}"`, `multiSelect`: `false`, and:
   - Option 1 — `label`: `"File issue"`, `description`: `"File as a GitHub code-health issue"`
   - Option 2 — `label`: `"Capture"`, `description`: `"Capture via /claude-tweaks:capture for later triage"`
   - Option 3 — `label`: `"/claude-tweaks:specify directly"`, `description`: `"Promote straight to a spec, skipping the issue"`
   - Option 4 — `label`: `"Dismiss"`, `description`: `"Drop this finding"`

For each survivor disposed as "File issue" (every payload if "Apply all recommended" was chosen and its Recommended value was `"File issue"`; only the individually-chosen ones otherwise), call `gh issue create`. The engine is emit-only; filing is always done by the skill.

**Type expression branch.** Read the project's `work-types` config key once before filing and branch — never re-probe mid-flow (`_shared/work-record.md`'s config-key table; the key is written by `/init`). `work-types: native` applies `payload.type` (always `task`) via GitHub's native Issue Type; `work-types: labels` adds the matching `type:task` label instead (the pair lives in `record.js`'s `TYPE_LABELS`):

```bash
# work-types: native
gh issue create \
  --title "<payload.title>" \
  --body "<payload.body>" \
  --type task \
  --label by:code-health \
  --label "risk:<tier>" \
  --label "effort:<tier>" \
  --label ready

# work-types: labels
gh issue create \
  --title "<payload.title>" \
  --body "<payload.body>" \
  --label by:code-health \
  --label "risk:<tier>" \
  --label "effort:<tier>" \
  --label ready \
  --label type:task
```

Apply the same branch to every payload regardless of criterion — only the `--type task` vs. `--label type:task` branch changes; the `risk`/`effort` tier labels and the underlying `gh issue create --title/--body` never do.

For `reopen` decisions (a finding matching a closed non-`wontfix` issue has reappeared), reopen the issue and comment:

```bash
gh issue reopen <issue_number>
gh issue comment <issue_number> --body "Regressed: this finding reappeared. Run: ${RUN_ID}"
```

In `--dry-run` mode, print the payloads and the `gh` commands that would run, but do not call `gh`.

**Step 9.5 — Confirm health-state persistence.**

Cursor, run-log, and remembered-cache persistence now happens against the durable `health-state`
branch, not local disk — see `_shared/health-state.md` for the mechanism. `validate-findings`
handles this internally (via `bin/lib/health-core/durable-state.js`) whenever it's run without
`--dry-run` and `--slice` is set; a persistence failure after retries is reported to stderr but
never blocks payload emission (a lost bookkeeping write just means the next firing might redo
some rotation work, which is safe).

In `--dry-run` mode, neither the local cache nor the durable health-state write happens — the
run is truly a no-op for all persistence.

**Step 10 — SUMMARIZE.**

Report: how many findings were emitted, how many survived dedup, how many issues were filed / skipped / remembered. List any new issue URLs.

## Routine Configuration

`/code-health` ships a routine template (`skills/code-health/routine-template.yml`) designed for small, predictable sips: one slice per run, so a scheduled firing is cheap and a skipped one is harmless. Instantiate it for the current project with:

```
/claude-tweaks:routine create code-health
```

This resolves the account- and project-specific values a portable template can't hardcode (which environment, which repo) and creates a live cloud Routine via `RemoteTrigger` directly — see `skills/routine/SKILL.md` for the full mechanism. Add `--dry-run` to inspect the assembled configuration before anything is created.

**Headless run flow:** SCOPE(`next-slice`) → CLASSIFY → JUDGE → `validate-findings` → file issues. Triage happens later in GitHub — the Routine does not wait for interactive input. The template's prompt omits `--area` so `next-slice` always picks the highest-priority slice automatically. Code-health's own `--budget` flag (default 1 slice per run) governs how deep each firing goes — raise it via a manual `/claude-tweaks:code-health --budget <n>` run if you want a one-off deeper sweep; the routine itself always uses the template's single-slice default, and token cost scales with whatever budget is in effect for that invocation.

A skipped run (e.g., `next-slice` returns `null` because all slices are fresh) is harmless — rotation resumes from the same position on the next window. This is now actually true across a scheduled cloud-routine's container recycling too: rotation cursors, the sub-threshold remembered cache, and the filing retry queue all live on the durable `health-state` branch (`_shared/health-state.md`), not local disk that a fresh container wouldn't have.

> **Billing note:** Routines run inside the subscription; verify automation-credit specifics against the live account.

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

## Next Actions

Call `AskUserQuestion` with `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`, and:

- Option 1 — `label`: `"Promote to a spec"`, `description`: `"/claude-tweaks:specify <issue-url-or-title> — promote a filed code-health issue into an agent-sized spec"`. Suffix the label `(Recommended)` when high-severity issues were filed.
- Option 2 — `label`: `"Capture"`, `description`: `"/claude-tweaks:capture <finding> — park a fuzzy or below-threshold finding in the backlog for later triage"`
- Option 3 — `label`: `"Re-run elsewhere"`, `description`: `"/claude-tweaks:code-health --area <other-path> — re-run on a different directory slice"`
- Option 4 — `label`: `"Backlog hygiene"`, `description`: `"/claude-tweaks:tidy — fold the new issues into a backlog-hygiene pass alongside captured and deferred items"`

## Component-Skill Contract

When `$PIPELINE_RUN_DIR` is set, `/claude-tweaks:code-health` is running inside a pipeline (invoked by `/claude-tweaks:flow` or another pipeline orchestrator). In that case omit the `## Next Actions` block — the parent owns the handoff.

Direct invocation may pass `--source <parent-skill>` as an explicit fallback when ambiguity exists (rare; `$PIPELINE_RUN_DIR` is the primary signal). Standalone (no `$PIPELINE_RUN_DIR`) is the common case and renders Next Actions as usual.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Editing code to "just fix" a finding during a code-health run | Code-health is report-only. Fixing belongs to `/build` / `/flow` after a finding is promoted to a spec via `/specify`. |
| Filing every finding regardless of severity or confidence | Floods the tracker. Below-threshold or low-confidence findings are remembered in the cache, not filed. |
| Re-filing a finding that already has an open issue | Duplicates the tracker. Always run `validate-findings` with `--issues` before filing. |
| Hashing the prose description instead of the anchor | The dedup contract requires a stable structural anchor (`relfile#NearestSymbol`), not a content hash. Prose changes every run. |
| Emitting a line number in the anchor | Line numbers move when code is edited, breaking dedup. The anchor format is `file#Symbol` — no `:12`, no `:12:3`. |
| Calling the network from `code-health.js` or `criteria.js` | The engine is emit-only and unit-testable. The skill hands payloads to `gh`; the engine never does. |
| Treating the cache as durable state | The cache is a rebuildable optimization. GitHub issue state is the source of truth for cross-run memory. |
| Filing a finding with `confidence: 'low'` for a noisy criterion | Noisy criteria (`security-logic`, `config-secrets`, `input-validation`, `resilience`) require `confidence: 'high'` to file. The confidence floor is enforced by the skill judgment, not the engine — the engine validates the shape, not the policy. |
| Skipping the verify gate before filing | Files plausible-but-wrong findings. Every surviving finding must pass all five verify questions — real, actionable, reproducible, likelihood justified, effort consistent — before reaching dedup. |
| Filing `gh issue create` directly off a `--dry-run` payload without a matching non-`--dry-run` `validate-findings` call | Breaks rotation state silently — cursors and the run-log never persist, so `next-slice` re-selects the same slice next time. Always follow a `--dry-run` preview with the real call before filing. |
| Splitting one recurring root cause into N near-duplicate issues instead of bundling | Floods the tracker with issues that are really one fix applied at N call sites. Use `relatedAnchors` to cover every occurrence in a single finding instead. |
| Filing before presenting the interactive gate | The two-tier decision must run before any `gh issue create` call for new findings — see `_shared/health-filing-gate.md`'s placement rule. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:specify` | Code-health findings are pre-specs — a filed `by:code-health` issue body is `/specify`-shaped (Current State / Deliverables / Acceptance Criteria), so `/specify` consumes it with near-zero translation. |
| `/claude-tweaks:capture` | Fuzzy or below-threshold findings route to the backlog via `/capture` instead of inflating the tracker. |
| `/claude-tweaks:tidy` | `/tidy` Step 4.8 audits open `by:code-health`-labelled issues in its hygiene pass — stale/superseded ones are closed (with comment) after batch approval; still-valid ones are suggested for `/claude-tweaks:triage` or captured to the backlog. |
| `/claude-tweaks:triage` | Triage's bare invocation is the primary consumer of code-health's `risk:<tier>`/`effort:<tier>` labels — the Tier Rule reads them directly to recommend an authorization tier. `triage dispatch` claims each authorized issue and hands it to `/claude-tweaks:flow #{issue}` for pure execution — `/flow` no longer selects or claims issues itself. |
| `/claude-tweaks:review` | `/review` judges diffs reactively; `/code-health` judges latent code proactively. Both reuse the same criteria fragments from `skills/_shared/`. |
| `/claude-tweaks:deepen` | `/deepen` applies the architecture-depth criterion reactively to code you are changing; `/code-health` applies it proactively on a schedule. Both read `criteria-architecture-depth.md`. |
| `/claude-tweaks:routine` | `/routine create code-health` instantiates code-health's `routine-template.yml` into a live, scheduled cloud Routine — the mechanism behind this skill's own "Routine Configuration" section. |
| `/claude-tweaks:simplify` | `/simplify` applies the simplification criterion reactively; `/code-health` applies it proactively. Both read `criteria-simplification.md`. |
| `/claude-tweaks:docs-health` | Sibling health skill — same SELECT → JUDGE → VERIFY → FINGERPRINT/DEDUP → FILE pipeline and shared `_shared/health-state.md` persistence, but scoped to `docs/**` for Diátaxis genre-drift + depth-mismatch + findability + staleness instead of code quality. Both file born-`ready` findings on the unified work-record contract. |
| `_shared/health-filing-gate.md` | The canonical interactive file-all/route-individually gate this skill's Step 9 applies before calling `gh issue create` on new findings — shared with `/harness-health`, `/journey-health`, and `/docs-health`. |
