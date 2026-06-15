---
name: claude-tweaks:recon
description: Use when you want a proactive, report-only sweep of one code area that surfaces improvement opportunities as deduplicated GitHub issues. An LLM judges the slice against the universal criteria catalog and files the work worth doing. Never edits code. Keywords - recon, sweep, repo audit, technical debt, proactive, github issues, llm judge.
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
- You want to run on demand against a specific area (rotation is Phase 3).

Not for: auto-fixing (report-only), CI gating (CI stays reactive), or replacing INBOX/specs (recon owns no backlog — it routes findings into the stores that already exist).

## Input

`$ARGUMENTS` may contain:

- `--area <path>` — the directory slice to judge (relative to root; required for on-demand runs).
- `--dry-run` — fingerprint and dedup, print payloads, but write nothing to cache and file no issues.
- `--root <dir>` — scan a project elsewhere (default: current working directory).

Scope note: auto-rotation (picking the next slice automatically) is Phase 3. In Phase 1, always supply `--area`.

## Workflow

**Step 1 — SCOPE: resolve the area.**

The `--area` argument is the directory slice to judge. Verify it exists:

```bash
ls "${ROOT:-$PWD}/${AREA}"
```

If the path does not exist, stop and ask the user to correct it. If `--area` was not supplied, ask the user which directory to judge.

Set `AREA` and `ROOT` for the rest of the steps.

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

**Step 4 — CLASSIFY: select applicable criteria.**

For Phase 1 the area type is not yet detected (that is Phase 2). Apply all universal criteria: `architecture-depth`, `simplification`, `review-quality`, `scalability`, `security-logic`, `bad-practice`, `doc-freshness`, `dead-code`, `test-quality`, `resilience`, `observability`, `config-secrets`, `dependency-health`, `input-validation`, `naming-clarity`.

You can verify the catalog at any time:

```bash
node -e "const {criteriaForArea}=require('${CLAUDE_PLUGIN_ROOT}/bin/lib/recon/criteria.js'); console.log(criteriaForArea([]).map(c=>c.id).join(', '))"
```

**Step 5 — JUDGE: apply each criterion holistically.**

For each universal criterion, read the code with that criterion as the lens. Apply the criterion holistically — this is a behavioral judgment, not a mechanical check. Call deterministic tools as evidence when they help (lint, grep, git log); skip them gracefully when not available. Evidence grounds the finding; do not file speculative findings.

For `architecture-depth`, `simplification`, and `review-quality`: read the criterion fragment embedded here before judging:

- `architecture-depth`: read `skills/_shared/criteria-architecture-depth.md` relative to `$CLAUDE_PLUGIN_ROOT`.
- `simplification`: read `skills/_shared/criteria-simplification.md` relative to `$CLAUDE_PLUGIN_ROOT`.
- `review-quality`: read `skills/_shared/criteria-review-quality.md` relative to `$CLAUDE_PLUGIN_ROOT`.

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

**Step 7 — VALIDATE, FINGERPRINT, DEDUP.**

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

**Step 8 — FILE / REOPEN ISSUES.**

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

**Step 9 — SUMMARIZE.**

Report: how many findings were emitted, how many survived dedup, how many issues were filed / skipped / remembered. List any new issue URLs. In interactive mode, present findings as a batch table and let the user route each to: file issue / INBOX (`/capture`) / `/specify` directly / dismiss.

## Routine Configuration

`/recon` is designed to run unattended on a schedule via a Claude Code Routine (`/schedule`). Design for small predictable sips: one area per run so a scheduled run is cheap and a skipped run is harmless.

```
Name:      recon-daily
Schedule:  daily at 03:00 (off-peak)
Prompt:    /claude-tweaks:recon --area <area>
```

Auto-rotation (picking the next area automatically each run) is Phase 3. Until then, set a fixed `--area` in the Routine prompt or rotate manually.

> **Billing note:** Routines run inside the subscription (no separate API key); verify any automation-credit specifics against the live account.

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
| Reporting rotation in P1 | Auto-rotation (picking the next area automatically) is Phase 3. P1 is on-demand with `--area` explicitly supplied. |

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
