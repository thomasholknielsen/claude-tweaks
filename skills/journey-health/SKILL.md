---
name: claude-tweaks:journey-health
description: Use when you want to check whether docs/journeys/*.md files still accurately describe the codebase and still back reliable agent e2e testing — picks one journey to audit (or the coverage scan, when due), judges it via file-existence + self-review + coverage checks, and always files a by:journey-health-labelled GitHub issue. Runs standalone or on a schedule via a Routine. Never edits journeys, stories, or code. Keywords - journey health, journey drift, journey staleness, agent e2e testing, coverage gap, scheduled, routine.
allowed-tools: Read, Grep, Glob, Bash, AskUserQuestion
---
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.

# Journey Health — Keep Journeys Honest for Agent E2E Testing

A recurring health check for `docs/journeys/*.md`: picks one journey to audit against the codebase, judges it, and always files a `by:journey-health`-labelled, born-`ready` GitHub issue. Records enter the same gate worklist as the other health-skill producers — journey-health issues are not a separate lane. Never edits journey files, stories, or code — every fix routes through `/claude-tweaks:journeys` or `/claude-tweaks:stories`, invoked by a human or `/triage dispatch` → `/flow`.

```
              [ /claude-tweaks:journey-health ] <- utility (no fixed lifecycle position)
                           |  next-target picks a journey; coverage scan runs when due
                           v
file-existence + self-review + coverage -> finding -> validate-findings -> file GitHub issue (by:journey-health, ready)
```

## When to Use

- You want journey documentation to stay accurate — and the QA stories/agent e2e checks built on it to stay trustworthy — without manually re-walking every journey.
- You want a scheduled Routine that periodically rotates through journeys and flags drift or coverage gaps as they're found.
- You want to check one specific journey right now (`--target <name>`).

Not for: creating or updating journey content (`/claude-tweaks:journeys`' job) or generating story coverage (`/claude-tweaks:stories`' job) — this skill only judges and files; it never writes journey files or story YAMLs itself. (The deep tier's `_shared/dev-url-detection.md` call does write `stories/servers.yml` — dev-server URL cache, not journey/story content — see Step 3.5.)

## Input

`$ARGUMENTS` may contain:

- `--target <journey-name>` — manual override: audit one specific journey directly, bypassing `next-target` selection.
- `--dry-run` — emit findings; never write cursor/cache state; never call `gh`.
- `--budget <n>` — audit up to `n` journeys in one firing (default 1).
- `--root <dir>` — audit a project elsewhere (default: current working directory).
- `--deep` — also run the deep tier (Step 3.5): actually execute the selected journey's QA stories or walk it live, catching drift/regressions a static check can't. Interactive only — no scheduled Routine drives this yet (see Routine Configuration).

## Workflow

**Step 1 — SELECT: pick the next journey.**

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/journey-health.js" next-target --root . ${TARGET:+--target "$TARGET"} ${BUDGET:+--budget "$BUDGET"}
```

Without `--budget` (or `--budget 1`), prints `{ target: {...}|null, coverageScanDue: boolean }`. With `--budget <n>` where `n > 1`, prints `{ targets: [...], coverageScanDue: boolean }` instead — run Steps 2-6 once per entry before moving on. `--budget` only governs the light tier's rotation; Step 3.5 (the deep tier, `--deep` only) re-resolves its own single target independently and runs at most once per firing regardless of `--budget`.

Read the `why` field on whichever target came back:
- If `target` is `null` and `coverageScanDue` is `false`: nothing is due this firing. Report this to the user and stop.
- `why: "deleted-file"` — this journey has a `files:` entry that no longer exists on disk (`target.missingFiles` lists which). Takes priority over staleness and churn — light tier only, always checked before Phase 1/2.
- `why: "stale"` — this journey has not been audited in over 30 days regardless of churn.
- `why: "hotspot"` — this journey's `files:` frontmatter paths have the highest git churn since its last light-tier audit among journeys with any churn at all.
- `why: "manual"` — `--target` was passed, bypassing selection.

If `target` is `null` but `coverageScanDue` is `true`, skip straight to Step 3 (coverage scan) — the coverage scan is still due even with nothing else to audit.

**Step 2 — LIGHT TIER JUDGE (when a target was selected).**

Read the target's journey file (`target.path`) in full.

1. **File-existence check.** For each path in `target.filesFrontmatter`, check whether it still exists in the repo (`Read` or a quick `test -f`). For each missing path, emit a finding: `{ journey: target.id, category: "drift", section: "files-frontmatter", description: "files: entry '{path}' no longer exists", reason: "<how you confirmed it's missing>", confidence: "high", severity: "high", recommendation: "Run /claude-tweaks:journeys {target.id} to prune the dead entry" }`. A missing declared file is never low-severity — it means the journey's documented domain mapping is flat-out wrong.
2. **Self-review criteria.** Apply the four checks (and the structural-validity check) in `_shared/journey-self-review.md` against the journey file's actual content. For each violated check, emit a finding: `{ journey: target.id, category: "drift", section: "self-review", description: "<which check failed and why>", reason: "<the specific text/evidence>", confidence: "high"|"med", severity: "high"|"med"|"low", recommendation: "Run /claude-tweaks:journeys {target.id} to fix {check name}" }`. A structural-validity failure (missing frontmatter, missing `## Steps`, no steps) always gets `confidence: "high"`, `severity: "high"`. A real-but-non-structural check failure (persona, origin coverage, outcome clarity) gets `severity: "med"`. Purely cosmetic wording drift gets `severity: "low"`.

Collect all findings from both checks (may be zero, one, or several) into a JSON array.

**Step 3 — COVERAGE SCAN (when `coverageScanDue`, per Step 1).**

Run the computation in `_shared/journey-coverage-check.md` across all journeys and all stories (not just the Step 1 target — this is a whole-library scan). For each uncovered-journey-step result, emit a finding: `{ journey: "<journey name>", category: "coverage", section: "coverage", description: "{M} uncovered steps ({step numbers})", reason: "no story in the stories directory has journey: {journey name} covering these steps", confidence: "high", severity: "high"|"med"|"low", recommendation: "Run /claude-tweaks:stories journey={journey name}" }`. Severity scales with how much of the journey is uncovered: `"high"` when every documented step is uncovered (zero story coverage for this journey at all), `"low"` when exactly one step is uncovered, `"med"` for anything in between. For each orphaned-story-with-URL-match result, emit a finding with `journey` set to the *suggested* journey (not an existing journey's own drift, but still filed the same way): `{ journey: "<suggested journey>", category: "coverage", section: "coverage", description: "Story '{storyId}' matches journey '{journey}' but has no journey: field", reason: "story '{storyId}''s URL {url} matches a step in journey '{journey}', but the story has no journey: field linking them", confidence: "med", severity: "low", recommendation: "Add journey: {journey} to {storyFile}" }`. Skip orphaned stories with no match entirely (informational only, never a finding, per the shared fragment).

**Bundling rule (recurring root causes):** when two or more `category: "coverage"` findings emitted in this same coverage-scan firing share the same root cause (e.g., a single batch story deletion causing several coverage gaps at once), file **one** finding, not one per journey/story. Pick the clearest/most representative occurrence as the primary finding; list every other occurrence in `relatedSections` — since `section` is always `"coverage"` here and carries no distinguishing information, populate each entry with an identifying label for that sibling occurrence instead (e.g. `"signup-flow: steps 2,3"`, `"login-flow: steps 4"`), not the literal `section` value; make `reason` state the shared root cause explaining all of them; make `recommendation` cover every listed occurrence, not just the primary one. Only bundle occurrences that share both `category: "coverage"` AND the root cause — never bundle unrelated coverage gaps together. This never applies to Step 2's `files-frontmatter`/`self-review` findings or Step 3.5's `live-check` findings — each of those emits at most one finding per violation, so there's nothing to bundle.

Append these findings to the same array from Step 2 (Steps 2 and 3 can both produce findings in the same firing; Step 2 is skipped entirely when Step 1 returned `target: null`).

Write the combined Steps 2-3 findings array to `/tmp/journey-health-findings-light.json`. If neither step produced any findings, write `[]`.

**Step 3.5 — DEEP TIER (only when `--deep` was passed).**

Re-resolve the target for the deep tier — deep and light tiers use independent cursors, so re-run Step 1's `next-target` call with `--tier deep` (this may select a different journey than Step 1's light-tier pick, or the same one, depending on each tier's own churn/staleness state):

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/journey-health.js" next-target --root . --tier deep ${TARGET:+--target "$TARGET"}
```

If `target` is `null`, report "nothing due for the deep tier" and skip the rest of this step.

**Skip condition:** read the selected journey's `files:` frontmatter. If any entry doesn't exist on disk, skip the deep tier for this journey entirely — file-existence drift must be fixed (via the light tier's finding, already emitted in Step 2) before a live run is worth attempting. Do not advance the deep-tier cursor when skipping this way; log the gap.

Otherwise:

0. **Check for recent QA evidence.** Glob `screenshots/qa/*/report.json`, take the most recent by timestamp prefix. If none exists, skip to sub-step 1. Read the stories directory and collect the `id` of every story with `journey: {target.id}`, reusing `_shared/journey-coverage-check.md`'s cross-reference (don't recompute it independently). If the journey has no stories at all, skip to sub-step 1 — there is no possible QA evidence to check.

   Otherwise, read that report.json and run:
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/journey-health.js" qa-evidence <report.json path> --story-ids "<comma-separated story ids>"
   ```
   This prints `{ verdict: "satisfied"|"regression"|"inconclusive", finding?: {...}, reason?: "..." }`.
   - `verdict: "satisfied"` — the deep audit is satisfied by this evidence. Skip sub-steps 1-3 entirely (no dev URL, no live test/visual-review). The deep findings array stays empty. Continue to sub-step 4.
   - `verdict: "regression"` — take the printed `finding`, add `journey: target.id` to it, append it to the deep findings array. Skip sub-steps 1-3 entirely. Continue to sub-step 4.
   - `verdict: "inconclusive"` — fall through to sub-step 1 and drive live verification as normal. The `reason` is worth noting in the eventual summary, but does not block proceeding.

1. **Resolve a dev URL.** Follow `_shared/dev-url-detection.md` in auto mode — this starts an ephemeral server on a free port with no prompt when no server is already running and a dev command is known. Record whether this procedure started the server (`SERVER_STARTED`).
2. **Check for story coverage.** Read the stories directory for any story with `journey: {target.id}`.
   - Stories exist → drive `/claude-tweaks:test journey={target.id}` against the resolved dev URL.
   - No stories → fall back to `/claude-tweaks:visual-review journey:{target.id}` against the resolved dev URL.
3. **On failure, judge drift vs. regression** — don't assume either. Compare the failure evidence (a changed selector, a renamed route, a UI element that no longer exists) against the journey file's documented steps:
   - **Confirmed drift** (the app's structure changed and the journey/story text is what's stale): emit `{ journey: target.id, category: "drift", section: "live-check", description: "<what changed>", reason: "<the failure evidence>", confidence: "high"|"med", severity: "high"|"med", recommendation: "Run /claude-tweaks:journeys {target.id} — <what needs updating>" }`. `severity: "high"` when the journey can no longer complete at all; `"med"` for a partial or cosmetic break.
   - **Confirmed regression** (the app's actual behavior broke, journey/story text still accurately describes the intended flow): emit `{ journey: target.id, category: "regression-suspected", section: "live-check", description: "<what broke>", reason: "<the failure evidence>", confidence: "high"|"med", severity: "high"|"med", recommendation: "File as a product bug — journey/story text is accurate, the implementation regressed" }`. Same severity guidance as the drift case above.
   - If genuinely ambiguous, emit the drift-leaning finding with `confidence: "med"`, `severity: "med"`, and say so explicitly in `reason` — never silently pick one.
4. **Clean up.** If `SERVER_STARTED` is `true`, stop the ephemeral server now (`lsof -ti tcp:{port} | xargs kill`) — this is a standalone invocation with no `/wrap-up` to do it later, per `_shared/dev-url-detection.md`'s "Standalone" cleanup rule. (`SERVER_STARTED` is never `true` when sub-step 0 satisfied or resolved the deep tier via QA evidence, since sub-step 1 never ran on that path — this cleanup correctly no-ops.)

Write Step 3.5's findings to `/tmp/journey-health-findings-deep.json` whenever the **Otherwise:** block above ran — including an empty array `[]` (the QA-evidence-satisfied path and a clean live-verification pass both produce no findings, but the file must still be written so the deep-tier call below runs and the cursor advances). Skip creating this file entirely only when Step 3.5 didn't run at all (`--deep` wasn't passed), resolved `target: null`, or hit the **Skip condition** (missing declared file) — none of those three cases reach the **Otherwise:** block, and none of them should advance the deep-tier cursor.

**Step 3.6 — VERIFY GATE: sanity-check surviving findings before dedup.**

Before fingerprinting and dedup, re-examine every finding in `/tmp/journey-health-findings-light.json` and (when Step 3.5 ran) `/tmp/journey-health-findings-deep.json` and ask: is it real (does the journey file, coverage scan, or live-check evidence actually show this, or was it misread)? Is it actionable (a concrete `recommendation`, not vague)? Would running the recommended follow-up skill actually resolve it without further investigation? Is `severity` justified by the `reason` cited? Drop any finding that fails. This is the same adversarial-verify discipline `/code-health`, `/harness-health`, and `/docs-health` apply — do not skip it under time pressure, and do not skip it just because a finding came from a mechanical check (file-existence, coverage) rather than open-ended judgment; a mechanical check can still misfire (a path resolved against the wrong cwd, a story matched against the wrong journey).

**Step 4 — GATHER OPEN ISSUES for dedup.**

```bash
gh issue list --label by:journey-health --state all --json number,state,labels,body --limit 500 > /tmp/journey-health-issues-raw.json
```

Parse each issue body for its fingerprint marker. Fingerprint extraction reads the dual-marker form via `extractFingerprint` (`bin/lib/issues/record.js`): the current `<!-- work-fingerprint: journeyhealth-XXXXXXXX -->` marker, falling back to the legacy `<!-- journey-health-fingerprint: journeyhealth-XXXXXXXX -->` marker still present on issues filed before this skill moved onto the unified work record (`skills/_shared/work-record.md`). Build an array of `{ number, state, labels, fingerprint }` objects and write to `/tmp/journey-health-issues.json`. If `gh` is unavailable or the repo has no `by:journey-health` issues yet, skip this step and set `ISSUES_FILE=""` — the run dedups against the local cache only.

A matched issue carrying the `wontfix` label is a standing suppression decision: Step 5's `validate-findings` reads it directly off this issue index and skips re-filing entirely (see `_shared/work-record.md`'s `wontfix` closure row). Like `/harness-health` and unlike `/code-health`, journey-health has no cache-level wontfix fallback — every firing re-fetches the live issue index in this step, and `gh issue list --state all` already includes closed `wontfix`'d issues, so the suppression is always seen fresh; there is nothing to persist locally for it.

**Step 5 — VALIDATE, FINGERPRINT, DEDUP.**

Findings from Steps 2-3 (light tier) and Step 3.5 (deep tier) use different `--tier`/`--target` cursor keys and must never share one `validate-findings` call — each tier's own target needs its own cursor recorded independently (same discipline `/code-health`'s multi-slice `--budget` runs use: one call per distinct target).

Always run the light-tier call, even when its findings file is `[]`:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/journey-health.js" validate-findings /tmp/journey-health-findings-light.json \
  --root "${ROOT:-$PWD}" --tier light \
  ${ISSUES_FILE:+--issues "$ISSUES_FILE"} \
  ${LIGHT_TARGET_ID:+--target "$LIGHT_TARGET_ID"} \
  ${COVERAGE_SCAN_RAN:+--coverage-scan} \
  ${DRY_RUN:+--dry-run} \
  > /tmp/journey-health-payloads-light.json
```

Run the deep-tier call whenever `/tmp/journey-health-findings-deep.json` exists (i.e., whenever Step 3.5 reached the **Otherwise:** block, even if the file is `[]`) — this is required for `recordAudit` to fire and the deep cursor to advance on every path through that block (QA-evidence-satisfied, QA-evidence-regression, or live-verification):

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/journey-health.js" validate-findings /tmp/journey-health-findings-deep.json \
  --root "${ROOT:-$PWD}" --tier deep \
  ${ISSUES_FILE:+--issues "$ISSUES_FILE"} \
  --target "$DEEP_TARGET_ID" \
  ${DRY_RUN:+--dry-run} \
  > /tmp/journey-health-payloads-deep.json
```

`LIGHT_TARGET_ID`/`DEEP_TARGET_ID` are the respective `target.id` values from Step 1 and Step 3.5 (omit `LIGHT_TARGET_ID` if Step 1 returned `target: null` and only the coverage scan ran; `DEEP_TARGET_ID` is required whenever the deep-tier call runs at all, since Step 3.5 always resolves a concrete journey before producing findings). Both commands validate, fingerprint, dedup, and record their own tier's cursor unless `--dry-run`, and both emit gh-ready payloads on stdout.

**Step 6 — FILE.**

Every journey-health record files onto the unified work record (`skills/_shared/work-record.md`): origin `by:journey-health`; severity folds into the scoring axis instead of staying a producer-specific label the gate must know:

| Severity | risk | effort |
|---|---|---|
| `high` | `risk:high` | `effort:medium` |
| `med` | `risk:medium` | `effort:medium` |
| `low` | `risk:low` | `effort:medium` |

Effort is always `effort:medium` — a journey-health finding carries no scope/size signal (no files-changed count, no lines-changed estimate) the way a code-health or harness-health finding's own evidence does, so there is no deterministic basis to fold into a `low`/`high` split; `medium` is the flat, honest default for every finding this skill files. Type follows the finding's `category`: `regression-suspected` files as `bug` (the journey/story text is accurate — the implementation broke); `drift` and `coverage` file as `task` (documentation or coverage maintenance, not a defect). Every filed finding is **born-`ready`** — journey-health findings are agent-sized and spec-shaped by construction (Current State / Deliverables / Acceptance Criteria), so they file with the `ready` label already applied and appear directly in the authorization gate's worklist, skipping maturation — records enter the same gate worklist as the other health-skill producers (`/code-health`, `/harness-health`); journey-health issues are not a separate lane. `toIssuePayload` (`bin/lib/journey-health/issue-payload.js`) assembles the payload via `record.js`'s `recordPayload`, then appends the category-derived diagnostic label (`journey-health:drift` / `journey-health:coverage` / `journey-health:regression-suspected`) after the canonical labels — the emitted label set is exactly `by:journey-health` + `risk:<tier>` + `effort:medium` + `ready` + the diagnostic label, matching the table above.

Before filing this firing's own new findings, drain the durable retry queue from prior firings' filing failures and check for regressed reopens (see `_shared/health-state.md`) — both mechanics below follow the canonical shape in `_shared/health-filing-mechanics.md` (`{BINARY}` = `journey-health.js`, `{PREFIX}` = `journey-health`); check that file when either changes to keep this skill's copy in sync with its three siblings:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/journey-health.js" retry-queue drain --root . > /tmp/journey-health-retry-payloads.json
```

For each payload in `/tmp/journey-health-retry-payloads.json`, attempt `gh issue create` exactly as below. Track every attempt's outcome (retry-queue payloads AND any brand-new payload from this step's own filing loop that fails) as `[{ fingerprint, payload, ok: true }]` or `[{ fingerprint, payload, ok: false, error: "<gh's error output>" }]`, write to `/tmp/journey-health-retry-results.json`, then:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/journey-health.js" retry-queue update /tmp/journey-health-retry-results.json --root . > /tmp/journey-health-escalated.json
```

If `/tmp/journey-health-escalated.json` is non-empty, file (or update) a `journey-health:filing-failed` issue for each entry, naming the stuck fingerprint and its failure history — bootstrap that label the same way as the others below.

Before filing, bootstrap only the label families this run applies, with real descriptions — using the shared helper so a too-long description fails loudly here rather than as a 422 on `gh issue create`. Canonical pairs copied verbatim from `_shared/label-bootstrap.md`'s `LABELS_JSON`, plus journey-health's own diagnostic labels:

```bash
# Bootstrap per _shared/label-bootstrap.md, LABELS_JSON =
# [["by:journey-health",  "Origin: filed by the journey-health skill"],
#  ["risk:low",           "Scoring: low blast radius — safe for autonomous build"],
#  ["risk:medium",        "Scoring: moderate blast radius — review before merge recommended"],
#  ["risk:high",          "Scoring: high blast radius — human review required"],
#  ["effort:medium",      "Scoring: moderate change, may span several files"],
#  ["ready",              "Stage: spec-shaped and agent-sized — in the authorization gate's worklist"],
#  ["journey-health:drift",                "Journey category: the journey file no longer matches the codebase"],
#  ["journey-health:coverage",             "Journey category: a journey step or story has a coverage gap"],
#  ["journey-health:regression-suspected", "Journey category: live behavior appears to have regressed"],
#  ["journey-health:filing-failed",        "Escalation: gh issue create failed repeatedly for this fingerprint — needs human attention"]]
```

Each payload in `/tmp/journey-health-payloads-light.json` and (when Step 3.5 ran) `/tmp/journey-health-payloads-deep.json` carries structured fields, not just the GitHub issue text — `id`, `journey`, `category`, `section`, `severity`, `confidence` are all present directly on the payload object (not just embedded in `payload.body`'s markdown), alongside `title`, `body`, `labels`, and `type`. These stay on the payload as triage metadata — nothing here branches on them anymore.

For a payload whose fingerprint marker (embedded in `payload.body`, read via `extractFingerprint`) matches a `status: "regressed"` entry in `.claude-tweaks/journey-health/cache.json` after this run, the finding was previously closed and has reappeared — reopen the existing issue instead of filing a new one:

```bash
gh issue reopen <issue_number>
gh issue comment <issue_number> --body "Regressed: this finding reappeared. Run: ${RUN_ID}"
```

`<issue_number>` is that cache entry's `issue` field.

Per `_shared/health-filing-gate.md`'s applicability/scope/placement rule: in interactive mode, before filing this firing's own new findings (not the retry-queue drains or regressed reopens above, which already executed unconditionally), render surviving findings as a markdown batch table:

```
| # | Journey | Category | Section | Severity | Confidence | Recommended |
|---|---------|----------|---------|----------|------------|-------------|
| 1 | {journey} | {category} | {section} | {severity} | {confidence} | {File issue|Capture} |
```

Pre-fill the Recommended column: `confidence: high` or `confidence: med` → `"File issue"`; `confidence: low` → `"Capture"`.

Then call `AskUserQuestion` with `question`: `"How do you want to handle these findings?"`, `header`: `"Findings"`, `multiSelect`: `false`, and:
- Option 1 — `label`: `"Apply all recommended (Recommended)"`, `description`: `"File / Capture each finding per the Recommended column above"`
- Option 2 — `label`: `"Route individually"`, `description`: `"Decide each finding one at a time"`

If "Route individually" was chosen, call `AskUserQuestion` once per finding — `question`: `"How do you want to handle finding #{N}: {journey}/{section}?"`, `header`: `"Finding #{N}"`, `multiSelect`: `false`, and:
- Option 1 — `label`: `"File issue"`, `description`: `"File as a GitHub by:journey-health issue"`
- Option 2 — `label`: `"Capture"`, `description`: `"Capture via /claude-tweaks:capture for later triage"`
- Option 3 — `label`: `"/claude-tweaks:specify directly"`, `description`: `"Promote straight to a spec, skipping the issue"`
- Option 4 — `label`: `"Dismiss"`, `description`: `"Run mark declined so it doesn't reappear"`

For "dismiss," run `node "${CLAUDE_PLUGIN_ROOT}/bin/journey-health.js" mark "<payload.id>" declined --root .` so the same proposal doesn't reappear on a future firing.

For each survivor disposed as "File issue" (every payload if "Apply all recommended" was chosen and its Recommended value was `"File issue"`; only the individually-chosen ones otherwise), call `gh issue create` per the branch below.

**Type expression branch.** Read the project's `work-types` config key once before filing and branch — never re-probe mid-flow (`_shared/work-record.md`'s config-key table; the key is written by `/init`). `work-types: native` applies `payload.type` (`bug` for a `regression-suspected` finding, `task` for `drift`/`coverage`) via GitHub's native Issue Type; `work-types: labels` adds the matching `type:bug`/`type:task` label instead (the pairs live in `record.js`'s `TYPE_LABELS`):

```bash
# Example: a drift finding (type task), work-types: native
gh issue create --title "<payload.title>" --body "<payload.body>" --type task \
  --label by:journey-health --label risk:high --label effort:medium --label ready --label journey-health:drift

# Same finding, work-types: labels
gh issue create --title "<payload.title>" --body "<payload.body>" \
  --label by:journey-health --label risk:high --label effort:medium --label ready --label journey-health:drift --label type:task

# Example: a regression-suspected finding (type bug), work-types: native
gh issue create --title "<payload.title>" --body "<payload.body>" --type bug \
  --label by:journey-health --label risk:medium --label effort:medium --label ready --label journey-health:regression-suspected

# Same finding, work-types: labels
gh issue create --title "<payload.title>" --body "<payload.body>" \
  --label by:journey-health --label risk:medium --label effort:medium --label ready --label journey-health:regression-suspected --label type:bug
```

Apply the same branch to every payload regardless of category — a `coverage` payload's call carries `journey-health:coverage` and `--type task`/`--label type:task` the same way a `drift` payload does; only the `--type task`/`--type bug` vs. `--label type:task`/`--label type:bug` branch and the `--label` list change, never the underlying `gh issue create --title/--body`. `/journey-health` never edits journey files, stories, or code.

In `--dry-run` mode, print what would be filed or reopened, and the `gh` commands that would run, but do not call `gh`.

**Step 7 — SUMMARIZE.**

Report: which journey (if any) was audited, whether the coverage scan ran, how many findings were emitted, how many filed vs skipped by dedup. When Step 3.5 ran, also report: which journey was deep-audited (or that nothing was due, or that it was skipped for missing `files:` entries), and the drift-vs-regression verdict for any live-check failure. List any new issue URLs.

## Routine Configuration

`/journey-health` ships a routine template (`skills/journey-health/routine-template.yml`) designed for small, predictable sips: one journey per run, so a scheduled firing is cheap and a skipped one is harmless. Instantiate it for the current project with:

```
/claude-tweaks:routine create journey-health
```

**Headless run flow:** SELECT(`next-target`) → LIGHT TIER JUDGE → COVERAGE SCAN (when due) → validate-findings → file. A firing with nothing due (`target: null`, `coverageScanDue: false`) is a cheap no-op. Rotation cursors (light/deep audit + coverage-scan) and the filing retry queue live on the durable `health-state` branch (`_shared/health-state.md`), surviving container recycling across scheduled firings.

Report-only, matching `/code-health` and `/harness-health` — every finding files as a `by:journey-health`-labelled, born-`ready` GitHub issue, with no `Edit` in `allowed_tools`.

**No confidence floor on headless firings.** Unlike `/code-health`'s `--min-risk` flag (which holds below-threshold findings in a `remembered` cache instead of filing them), this skill's `validate-findings` call carries no equivalent threshold — a headless Routine firing files every surviving finding regardless of `confidence`, including a `confidence: low` one that the interactive gate's own Recommended-column rule would otherwise route to Capture. Known asymmetry with `/code-health`, not yet closed: a scheduled firing is noisier than an interactive one on low-confidence findings until this skill gains an equivalent holdback mechanism.

> **Billing note:** Routines run inside the subscription; verify automation-credit specifics against the live account.

## Next Actions

Call `AskUserQuestion` with `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`, and:

- Option 1 — `label`: `"Schedule a Routine"`, `description`: `"/claude-tweaks:routine create journey-health — schedule this as a recurring Routine"`. Suffix the label `(Recommended)` after a first standalone run confirms the output looks right.
- Option 2 — `label`: `"Audit one journey"`, `description`: `"/claude-tweaks:journey-health --target <name> — audit one specific journey right now"`
- Option 3 — `label`: `"Backlog hygiene"`, `description`: `"/claude-tweaks:tidy — fold any filed journey-health issues into a backlog-hygiene pass"`

## Component-Skill Contract

`/claude-tweaks:journey-health` is a **standalone-only** skill — no invocation path exists from `/claude-tweaks:flow` or any other skill in this project today (`flow/SKILL.md`'s Allowed Steps table, workflow text, and Relationship table never mention `journey-health`). The `## Next Actions` block always renders. If a future orchestrator wraps this skill, that orchestrator must update this contract to state its own `$PIPELINE_RUN_DIR`-gated handoff; until then, treat parent invocation as not applicable.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Editing a journey file, story YAML, or code directly | `/journey-health` only ever judges and files — every fix routes through `/claude-tweaks:journeys` or `/claude-tweaks:stories`, invoked by a human or `/triage dispatch` → `/flow`. |
| Treating a `files:` entry that exists but is content-stale the same as a missing one | Missing-on-disk is a mechanical, high-confidence file-existence finding. Content drift (the step no longer matches what the file does) is a self-review or deep-tier finding, not a file-existence one — don't conflate the two `section` values. |
| Re-proposing a patch already marked `declined` in the cache | The decline-memory cache exists specifically so a rejected proposal doesn't reappear every firing forever. |
| Skipping the coverage scan because a per-journey target was already selected this firing | The coverage scan is a decoupled, whole-library check (its own cursor) — run it whenever `coverageScanDue` is true, independent of which single journey `next-target` picked. |
| Treating the local cache as durable state | The cache is a rebuildable optimization — GitHub issue state is the source of truth for cross-run memory, same as `/code-health`/`/harness-health`. |
| Running the deep tier's dev server without stopping it afterward | This is always a standalone invocation (no `/wrap-up` to clean up later) — Step 3.5 must stop any ephemeral server it started before returning, per `_shared/dev-url-detection.md`'s "Standalone" cleanup rule. |
| Splitting one recurring root cause into N near-duplicate issues instead of bundling | Floods the tracker with issues that are really one fix applied to N sections. Use `relatedSections` to cover every occurrence in a single finding instead. |
| Filing before presenting the interactive gate | The two-tier decision must run before any `gh issue create` call for new findings — see `_shared/health-filing-gate.md`'s placement rule. |
| Skipping Step 3.6's verify gate under time pressure | A mechanical check (file-existence, coverage scan) can still misfire — a path resolved against the wrong cwd, a story matched against the wrong journey. Every surviving finding must pass the verify gate before reaching Step 4's dedup, matching `/code-health`, `/harness-health`, and `/docs-health`. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:journeys` | Produces and updates the journey files this skill audits. `/journey-health` never edits them — it files an issue recommending `/claude-tweaks:journeys {name}` be re-run. Shares `_shared/journey-self-review.md`'s four checks (write-time here, audit-time in `/journey-health`). |
| `/claude-tweaks:stories` | Produces the QA story YAMLs this skill's coverage scan checks against. Coverage-gap findings recommend `/claude-tweaks:stories journey={name}`. |
| `/claude-tweaks:test` | The deep tier drives `/test journey={name}` when stories exist for the selected journey — this is the "agent e2e testing" this skill exists to protect. |
| `/claude-tweaks:visual-review` | The deep tier falls back to `/visual-review journey:{name}` when no stories exist yet for the selected journey. |
| `/claude-tweaks:review` | Shares `_shared/journey-coverage-check.md`'s coverage computation with lens `3g-cov` — `/review`'s lens stays inline/informational; this skill adds cursor-tracking and issue-filing on top. |
| `/claude-tweaks:routine` | `/routine create journey-health` instantiates this skill's `routine-template.yml` into a live, scheduled cloud Routine. |
| `/claude-tweaks:tidy` | Step 4.8 sweeps `by:journey-health`-labelled issues alongside `by:code-health`/`by:harness-health`/`by:docs-health` ones, using the same stale/superseded triage. |
| `/claude-tweaks:code-health` | Sibling health skill for code quality — one of the four recurring-sweep siblings (code-health, harness-health, journey-health, docs-health). Shares the unified work-record filing contract and `_shared/health-state.md`'s durable persistence, scoped to code instead of journey accuracy. |
| `/claude-tweaks:harness-health` | Sibling health skill — same SELECT → JUDGE → VERIFY GATE → FINGERPRINT/DEDUP → FILE pipeline shape, though harness-health folds its verify gate into Step 3 (JUDGE) rather than a separate numbered step (this skill's own Step 3.6 corresponds to that embedded check, not harness-health's Step 5, which is GATHER OPEN ISSUES for dedup) — and `_shared/health-state.md` persistence, but scoped to `.claude/skills/**`/`.claude/rules/**`/CLAUDE.md for skill/rule/CLAUDE.md accuracy and template-conformance instead of `docs/journeys/*.md` accuracy and agent-e2e coverage. |
| `/claude-tweaks:docs-health` | Sibling health skill — same SELECT → JUDGE → VERIFY GATE → FINGERPRINT/DEDUP → FILE pipeline shape (this skill's own Step 3.6 mirrors docs-health's Step 3.5) and `_shared/health-state.md` persistence, but scoped to `docs/**` Diátaxis genre-drift + depth-mismatch + findability + staleness instead of `docs/journeys/*.md` accuracy and agent-e2e coverage. Both file born-`ready` findings on the unified work-record contract. |
| `/claude-tweaks:triage` | Filed `by:journey-health` issues resolve through `/triage dispatch` → `/flow`, or manually — same path `by:code-health`/`by:harness-health` issues already take. Records enter the same gate worklist as the other health-skill producers — journey-health issues are not a separate lane. |
| `/claude-tweaks:specify` | Journey-health findings are pre-specs — a filed `by:journey-health` issue body is `/specify`-shaped (Current State / Deliverables / Acceptance Criteria), so `/specify` consumes it with near-zero translation. |
| `_shared/journey-self-review.md` | Canonical four-check + structural-validity criteria this skill's light tier applies — shared with `/claude-tweaks:journeys` Step 3.5. |
| `_shared/health-filing-gate.md` | The canonical interactive file-all/route-individually gate this skill's Step 6 applies before calling `gh issue create` on new findings — shared with `/code-health`, `/harness-health`, and `/docs-health`. |
| `_shared/health-filing-mechanics.md` | The canonical retry-queue-drain and regressed-reopen shape this skill's Step 6 inlines (as `{BINARY}` = `journey-health.js`, `{PREFIX}` = `journey-health`) — shared with `/code-health`, `/harness-health`, and `/docs-health`. |
| `_shared/journey-coverage-check.md` | Canonical coverage computation this skill's coverage scan applies — shared with `/claude-tweaks:review`'s `3g-cov` lens. |
