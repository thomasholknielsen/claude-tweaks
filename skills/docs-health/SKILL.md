---
name: claude-tweaks:docs-health
description: Use when you want a proactive, report-only sweep of docs/** that surfaces Diátaxis genre-drift (implied doc type vs. actual content shape, and directory placement vs. content genre), depth-mismatch (implied reading investment vs. actual word count), findability (can a reader or agent actually discover this doc), and factual staleness (including author-declared freshness dependencies), deduplicated and filed as GitHub issues. An LLM judges the docs; deterministic helpers handle scope rotation, fingerprinting, dedup, issue filing, word-count computation, inbound-reference counting, and tracked-dependency freshness checks. Never edits docs. Keywords - docs-health, documentation drift, Diátaxis, genre drift, depth mismatch, findability, orphan docs, staleness, proactive, github issues, scheduled, routine.
allowed-tools: Read, Grep, Glob, Bash, AskUserQuestion
---
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.

# Docs Health — Diátaxis Genre-Drift + Depth-Mismatch + Findability + Staleness Sweep for docs/**

A recurring health check for `docs/**`: picks one doc to audit, judges it against the shared `_shared/criteria-docs-diataxis.md` procedure (implied-type-vs-found-type and placement-vs-content genre-drift, implied-vs-found depth-mismatch, inbound-reference findability, factual staleness including declared freshness-dependencies, dual-persona misleading-risk), and files a `by:docs-health`-labelled, born-`ready` GitHub issue. Never edits docs — only files findings, mirroring `/code-health` and `/harness-health`.

```
              [ /claude-tweaks:docs-health ] <- utility (no fixed lifecycle position)
                           |  picks a target via next-target; judges via the shared criteria fragment
                           v
finding -> validate-findings -> file GitHub issue (by:docs-health, ready)
```

## When to Use

- You want `docs/**` (guides, references, ADRs, retrospectives) to stay accurate, appropriately scoped, and correctly shaped — Diátaxis genre where it applies, native genre otherwise (an ADR stays ADR-shaped, not forced into a tutorial/how-to/reference/explanation mold) — between manual edits, without driving each check yourself.
- You want a scheduled Routine that periodically rotates through `docs/**` and flags genre-drift, depth-mismatch, findability, or staleness as it's found.
- You want to check one specific doc right now (`--target <id>`).

Not for: mechanical/unambiguous checks (broken links, malformed frontmatter, missing structural metadata) — those belong in the consuming project's own build/CI pipeline, the same "CI stays reactive" boundary `/code-health` already draws for code. Not for `.claude/skills/*.md`/`.claude/rules/*.md`/CLAUDE.md — that is `/claude-tweaks:harness-health`'s exclusive territory; docs-health's rotation pool only ever walks `docs/`, so it structurally never touches those files. Not for `docs/superpowers/**` — ephemeral `/claude-tweaks:specify` + `/superpowers:writing-plans` build history, not Diátaxis-portal content; excluded from the rotation pool entirely. Not for `docs/journeys/**` — that is `/claude-tweaks:journey-health`'s exclusive territory (journey accuracy and agent-e2e coverage instead of Diátaxis genre-drift); excluded from the rotation pool entirely, mirroring the harness-health exclusion above.

## Input

`$ARGUMENTS` may contain:

- `--target <id>` — manual override: audit one specific doc directly, bypassing `next-target` selection. `<id>` is the doc's path relative to `docs/`, without the `.md` extension (e.g. `decisions/0007-foo`).
- `--dry-run` — emit findings; never write cursor/cache state; never call `gh`.
- `--budget <n>` — audit up to `n` docs in one firing (default 1).
- `--root <dir>` — audit a project elsewhere (default: current working directory).

## Workflow

**Step 1 — SELECT: pick the next target(s).**

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/docs-health.js" next-target --root . ${TARGET:+--target "$TARGET"} ${BUDGET:+--budget "$BUDGET"}
```

Without `--budget` (or `--budget 1`), prints `{ target: { kind, id, path, why } | null }` — a single target. With `--budget <n>` where `n > 1`, prints `{ targets: [{ kind, id, path, why }, ...] }` instead — up to `n` targets, each a different id. When `targets` is present, run Steps 2-3 once per entry before moving on to Step 4.

Read the `why` field on whichever target(s) came back:
- If `target`/`targets` is empty: nothing is due this firing. Report this to the user and stop.
- `why: "stale"` — this doc has not been audited in over 60 days regardless of churn.
- `why: "hotspot"` — this doc (or its own backtick-quoted referenced paths) has the highest churn since its last audit among docs with any churn at all.
- `why: "manual"` — `--target` was passed, bypassing selection.

**Step 2 — READ the target.**

Read the file at `target.path` in full. If `docs/` doesn't exist yet, report "no docs/ tree to audit yet" and stop (a real state, not an error).

**Step 3 — JUDGE the target.**

Apply the full procedure in `_shared/criteria-docs-diataxis.md` (genre-drift, depth-mismatch, findability, staleness, dual-persona misleading-risk) to the target's content:

1. First, determine whether the doc has a self-evident non-Diátaxis-native genre (ADR/decision-record, structured spec/journey, dated retrospective/log — see the criteria fragment's Dimension 1). If so, skip type classification: spot-check it still reads as its own native genre, and flag only if it has drifted out of that genre into something else.
2. Otherwise, determine the doc's **implied type** from its location/heading language, and its **found type** from what the content actually does (tutorial / how-to / reference / explanation — see the criteria fragment's Dimension 1 table). Flag a mismatch only when it would actually mislead a reader or leave the doc's purpose unserved — a `category: "genre-drift"` finding.
3. Separately, determine an implied type from the doc's **directory alone** (ignoring heading language) and compare it against found type independently of step 2. A divergence here is also `category: "genre-drift"` (placement-fit — see the criteria fragment's Dimension 1), typically `classification: "restructural"`.
4. Compute the doc's word count:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/docs-health.js" word-count "${TARGET_PATH}"
   ```

   `TARGET_PATH` is `target.path` from Step 1. The result is either an integer word count, or (if the doc's frontmatter declares `depth-hint:`) that value's literal string, returned as-is — ground truth, skip the judgment below entirely in that case. Otherwise, judge whether the computed word count is surprising given what the doc's location, heading, and native genre (from step 1) lead a reader to expect walking in — same "would this actually mislead" bar as step 2, never length by itself. A surprising mismatch is a `category: "depth-mismatch"` finding.
5. Compute the doc's inbound-reference count:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/docs-health.js" find-refs "${TARGET_PATH}"
   ```

   Judge whether a near-zero count means a genuine orphan (blocks discovery) or an intentionally standalone doc (see the criteria fragment's Dimension 5). A genuine orphan is a `category: "findability"` finding.
6. Check every stated fact (counts, dates, paths, versions, availability claims) against live repository state (grep, `find`, `git log`). Additionally, check any declared freshness-dependencies:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/docs-health.js" check-freshness "${TARGET_PATH}"
   ```

   For each path in the result's `missing` array, that's a broken dependency — a staleness finding on its own. For each entry in `stale`, judge whether the tracked file's change is substantive enough to actually invalidate what the doc claims (see the criteria fragment's Dimension 2). A mismatch (stated fact, broken dependency, or substantive tracked-file drift) is a `category: "staleness"` finding.
7. For every finding, judge `misleads`: `"human"` (a skim-and-notice-caveat reader partially self-corrects), `"agent"` (retrieval-style consumption has no such safety net — weight this higher), or `"both"`.
8. Judge `classification`: `"additive"` (a one-line fact correction, an added disclaimer) or `"restructural"` (reorganizing a doc that mixes genres, splitting a doc).

Emit each finding in this shape:

```json
{
  "target": "<doc id relative to docs/, no .md>",
  "assetType": "doc",
  "section": "<heading within the doc, or 'Freshness' for a whole-doc staleness finding>",
  "relatedSections": "<optional array of sibling section names sharing this finding's root cause; omit if there's only one occurrence>",
  "category": "genre-drift | depth-mismatch | findability | staleness",
  "misleads": "human | agent | both",
  "classification": "additive | restructural",
  "confidence": "high | med | low",
  "reversibility": "high | med | low",
  "description": "<acceptance criteria text>",
  "reason": "<evidence — why this was flagged>",
  "oldString": "<current text, or empty string for a pure addition>",
  "newString": "<proposed text>"
}
```

**Bundling rule (recurring root causes):** when two or more findings within this doc audit share both the same `category` and the same root-cause explanation, file **one** finding, not one per section. Pick the clearest/most representative occurrence as the primary `section`; list every other occurrence in `relatedSections`; make `reason` state the shared root cause explaining all of them; make `description` (the acceptance criteria) require every listed section fixed, not just the primary one. Only bundle occurrences that share both `category` AND the root cause — never bundle unrelated findings just because they're in the same doc.

Write the array to `/tmp/docs-health-findings.json`.

**Step 3.5 — VERIFY GATE: sanity-check surviving findings before dedup.**

Before fingerprinting and dedup, re-examine each finding and ask: is it real (does the doc actually say this, or was it misread)? Is it actionable (a concrete `oldString`/`newString`, not vague)? Would a human editor be able to apply the fix without further investigation? Is `misleads` justified by which reader would actually encounter this doc's failure mode? Drop any finding that fails. This is the same adversarial-verify discipline `/code-health` and `/harness-health` apply — do not skip it under time pressure.

**Step 4 — GATHER OPEN ISSUES for dedup.**

```bash
gh issue list --label by:docs-health --state all --json number,state,labels,body --limit 500 > /tmp/docs-health-issues-raw.json
```

Parse each issue body for its fingerprint marker via `extractFingerprint` (`bin/lib/issues/record.js`): the `<!-- work-fingerprint: docshealth-XXXXXXXX -->` marker. Build an array of `{ number, state, labels, fingerprint }` objects and write to `/tmp/docs-health-issues.json`. If `gh` is unavailable or the repo has no `by:docs-health` issues yet, skip this step and set `ISSUES_FILE=""` — the run dedups against the local cache only.

A matched issue carrying the `wontfix` label is a standing suppression decision: Step 5's `validate-findings` reads it directly off this issue index and skips re-filing entirely (see `_shared/work-record.md`'s `wontfix` closure row).

**Step 5 — VALIDATE, FINGERPRINT, DEDUP.**

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/docs-health.js" validate-findings /tmp/docs-health-findings.json \
  --root "${ROOT:-$PWD}" \
  ${ISSUES_FILE:+--issues "$ISSUES_FILE"} \
  ${TARGET_ID:+--target "$TARGET_ID"} \
  ${DRY_RUN:+--dry-run} \
  > /tmp/docs-health-payloads.json
```

`TARGET_ID` is `target.id` from Step 1 (omit if only auto-selection ran and no single target is being tracked for cursor purposes — pass it whenever a single target drove this firing). The command validates each finding, fingerprints via `assetType + target + section + normalizedDescription`, dedups against open `by:docs-health` issues and the local cache, records the audit cursor for `doc:${TARGET_ID}` unless `--dry-run`, and emits gh-ready payloads on stdout.

**Step 6 — FILE.**

Every docs-health record files onto the unified work record (`skills/_shared/work-record.md`): origin `by:docs-health`; classification folds into the scoring axis:

| Classification | risk | effort |
|---|---|---|
| `additive` | `risk:low` | `effort:low` |
| `restructural` | `risk:medium` | `effort:high` |

Every filed finding is **born-`ready`** — docs-health findings are agent-sized and spec-shaped by construction (Current State / Deliverables / Acceptance Criteria), so they file with the `ready` label already applied and appear directly in the authorization gate's worklist, skipping maturation. `toIssuePayload` (`bin/lib/docs-health/issue-payload.js`) assembles the payload via `record.js`'s `recordPayload`, then appends the classification-derived diagnostic label (`docs-health:additive` / `docs-health:restructural`) after the canonical labels — the emitted label set is exactly `by:docs-health` + scoring + `ready` + the diagnostic label.

Before filing this firing's own new findings, drain the durable retry queue from prior firings' filing failures and check for regressed reopens (see `_shared/health-state.md`) — both mechanics below follow the canonical shape in `_shared/health-filing-mechanics.md` (`{BINARY}` = `docs-health.js`, `{PREFIX}` = `docs-health`); check that file when either changes to keep this skill's copy in sync with its three siblings:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/docs-health.js" retry-queue drain --root . > /tmp/docs-health-retry-payloads.json
```

For each payload in `/tmp/docs-health-retry-payloads.json`, attempt `gh issue create` exactly as below. Track every attempt's outcome (retry-queue payloads AND any brand-new payload from this step's own filing loop that fails) as `[{ fingerprint, payload, ok: true }]` or `[{ fingerprint, payload, ok: false, error: "<gh's error output>" }]`, write to `/tmp/docs-health-retry-results.json`, then:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/docs-health.js" retry-queue update /tmp/docs-health-retry-results.json --root . > /tmp/docs-health-escalated.json
```

If `/tmp/docs-health-escalated.json` is non-empty, file (or update) a `docs-health:filing-failed` issue for each entry, naming the stuck fingerprint and its failure history — bootstrap that label the same way as the others below.

For a payload whose fingerprint marker matches a `status: "regressed"` entry in `.claude-tweaks/docs-health/cache.json` after this run, the finding was previously closed and has reappeared — reopen the existing issue instead of filing a new one:

```bash
gh issue reopen <issue_number>
gh issue comment <issue_number> --body "Regressed: this finding reappeared. Run: ${RUN_ID}"
```

Before filing, bootstrap only the label families this run applies, with real descriptions — using the shared helper so a too-long description fails loudly here rather than as a 422 on `gh issue create`. Canonical pairs copied verbatim from `_shared/label-bootstrap.md`'s `LABELS_JSON`, plus docs-health's own diagnostic labels:

```bash
# Bootstrap per _shared/label-bootstrap.md, LABELS_JSON =
# [["by:docs-health",  "Origin: filed by the docs-health skill"],
#  ["risk:low",         "Scoring: low blast radius — safe for autonomous build"],
#  ["risk:medium",      "Scoring: moderate blast radius — review before merge recommended"],
#  ["effort:low",       "Scoring: small, agent-sized change"],
#  ["effort:high",      "Scoring: large change — consider decomposition before building"],
#  ["ready",            "Stage: spec-shaped and agent-sized — in the authorization gate's worklist"],
#  ["docs-health:additive",     "Safe, mechanical patch — additive change with no removed content"],
#  ["docs-health:restructural", "Structural change requiring human review before applying"]]
```

Each payload in `/tmp/docs-health-payloads.json` carries structured fields directly (`target`, `assetType`, `category`, `misleads`, `section`, `classification`, `confidence`, `reversibility`, `oldString`, `newString`), alongside `title`, `body`, `labels`, and `type`.

Per `_shared/health-filing-gate.md`'s applicability/scope/placement rule: in interactive mode, before filing this firing's own new findings (not the retry-queue drains or regressed reopens above, which already executed unconditionally), route survivors through a two-tier decision:

1. Render all findings as a markdown batch table:

   ```
   | # | Title | Category | Misleads | Classification | Confidence | Recommended |
   |---|-------|----------|----------|-----------------|------------|-------------|
   | 1 | {title} | {category} | {misleads} | {classification} | {confidence} | {File issue|Capture} |
   ```

   Pre-fill the Recommended column: `confidence: high` or `confidence: med` → `"File issue"`; `confidence: low` → `"Capture"`.

2. Call `AskUserQuestion` with `question`: `"How do you want to handle these findings?"`, `header`: `"Findings"`, `multiSelect`: `false`, and:
   - Option 1 — `label`: `"Apply all recommended (Recommended)"`, `description`: `"File / Capture each finding per the Recommended column above"`
   - Option 2 — `label`: `"Route individually"`, `description`: `"Decide each finding one at a time"`

3. If "Route individually" was chosen, call `AskUserQuestion` once per finding — `question`: `"How do you want to handle finding #{N}: {title}?"`, `header`: `"Finding #{N}"`, `multiSelect`: `false`, and:
   - Option 1 — `label`: `"File issue"`, `description`: `"File as a GitHub docs-health issue"`
   - Option 2 — `label`: `"Capture"`, `description`: `"Capture via /claude-tweaks:capture for later triage"`
   - Option 3 — `label`: `"/claude-tweaks:specify directly"`, `description`: `"Promote straight to a spec, skipping the issue"`
   - Option 4 — `label`: `"Dismiss"`, `description`: `"Run mark declined so it doesn't reappear"`

For "dismiss," run `node "${CLAUDE_PLUGIN_ROOT}/bin/docs-health.js" mark "<payload.id>" declined --root .` so the same proposal doesn't reappear on a future firing.

For each survivor disposed as "File issue" (every payload if "Apply all recommended" was chosen and its Recommended value was `"File issue"`; only the individually-chosen ones otherwise), call `gh issue create`.

**Type expression branch.** Read the project's `work-types` config key once before filing and branch — never re-probe mid-flow (`_shared/work-record.md`'s config-key table). `work-types: native` applies `payload.type` (always `task`) via GitHub's native Issue Type; `work-types: labels` adds the matching `type:task` label instead:

```bash
# work-types: native
gh issue create --title "<payload.title>" --body "<payload.body>" --type task \
  --label by:docs-health --label risk:low --label effort:low --label ready --label docs-health:additive

# work-types: labels
gh issue create --title "<payload.title>" --body "<payload.body>" \
  --label by:docs-health --label risk:low --label effort:low --label ready --label docs-health:additive --label type:task
```

Apply the same branch to every payload regardless of classification — a `restructural` payload's call carries `risk:medium`/`effort:high`/`docs-health:restructural` instead. `/docs-health` never edits anything directly; matching `/code-health`/`/harness-health`, it only ever judges and files.

In `--dry-run` mode, print what would be filed or reopened, and the `gh` commands that would run, but do not call `gh`.

**Step 7 — SUMMARIZE.**

Report: which target(s) were audited, how many findings were emitted, how many filed vs skipped by dedup. List any new issue URLs.

## Routine Configuration

`/docs-health` ships a routine template (`skills/docs-health/routine-template.yml`) designed for small, predictable sips: one target per run, so a scheduled firing is cheap and a skipped one is harmless. Instantiate it for the current project with:

```
/claude-tweaks:routine create docs-health
```

**Headless run flow:** SELECT(`next-target`) → JUDGE → validate-findings → file. A firing with nothing due (`target: null`) is a cheap no-op.

Report-only, matching `/code-health`/`/harness-health` — every finding files as a `by:docs-health`-labelled, born-`ready` GitHub issue, with no `Edit` call anywhere in its documented workflow. Rotation cursors and the filing retry queue live on the durable `health-state` branch (`_shared/health-state.md`), surviving container recycling across scheduled firings — a skipped or failed firing does not lose progress.

**No confidence floor on headless firings.** Unlike `/code-health`'s `--min-risk` flag (which holds below-threshold findings in a `remembered` cache instead of filing them), this skill's `validate-findings` call carries no equivalent threshold — a headless Routine firing files every surviving finding regardless of `confidence`, including a `confidence: low` one that the interactive gate's own Recommended-column rule would otherwise route to Capture. Known asymmetry with `/code-health`, not yet closed: a scheduled firing is noisier than an interactive one on low-confidence findings until this skill gains an equivalent holdback mechanism.

> **Billing note:** Routines run inside the subscription; verify automation-credit specifics against the live account.

## Next Actions

Call `AskUserQuestion` with `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`, and:

- Option 1 — `label`: `"Schedule a Routine"`, `description`: `"/claude-tweaks:routine create docs-health — schedule this as a recurring Routine"`. Suffix the label `(Recommended)` after a first standalone run confirms the output looks right.
- Option 2 — `label`: `"Audit one doc"`, `description`: `"/claude-tweaks:docs-health --target <id> — audit one specific doc right now"`
- Option 3 — `label`: `"Backlog hygiene"`, `description`: `"/claude-tweaks:tidy — fold any filed docs-health issues into a backlog-hygiene pass"`

## Component-Skill Contract

`/claude-tweaks:docs-health` is a **standalone-only** skill — no invocation path exists from `/claude-tweaks:flow` or any other skill in this project today (`flow/SKILL.md`'s Allowed Steps table, workflow text, and Relationship table never mention `docs-health`). The `## Next Actions` block always renders. If a future orchestrator wraps this skill, that orchestrator must update this contract to state its own `$PIPELINE_RUN_DIR`-gated handoff; until then, treat parent invocation as not applicable.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Applying any patch directly instead of filing an issue | `/docs-health` never edits anything — every finding files as a GitHub issue for human review. Matches `/code-health`/`/harness-health`'s report-only contract. |
| Flagging prose quality or style as a finding | Content quality is explicitly out of scope — only genre-drift, depth-mismatch, findability, and factual staleness are judged, all structural/expectation checks, never editorial ones. See `_shared/criteria-docs-diataxis.md`'s Constraints section. |
| Flagging a doc's length by itself, without a mismatched expectation | Depth-mismatch only fires when a doc's actual word count would surprise a reader given what its location/heading/native genre imply — a correctly-signaled long or short doc is never a finding regardless of absolute length. See `_shared/criteria-docs-diataxis.md`'s Dimension 3. |
| Flagging a doc's low inbound-reference count without judging whether it's intentionally standalone | Findability only fires on a genuine, blocking orphan — a doc explicitly marked draft/archived/template, or one meant to be reached only via an out-of-scope external link, is not a finding regardless of its reference count. See `_shared/criteria-docs-diataxis.md`'s Dimension 5. |
| Flagging mechanical issues (broken links, malformed frontmatter) | Those belong in CI, not an LLM-judged health sweep — the same "CI stays reactive" boundary `/code-health` draws for code. |
| Including `docs/superpowers/**` in the rotation pool | Ephemeral `/specify` + `/superpowers:writing-plans` build artifacts, not Diátaxis-portal content — excluded from `bin/lib/docs-health/scope.js`'s `listDocs` by construction. |
| Auditing `.claude/skills/*.md`, `.claude/rules/*.md`, or CLAUDE.md | That is `/claude-tweaks:harness-health`'s exclusive territory — docs-health's rotation pool only ever walks `docs/`. |
| Re-proposing a patch already marked `declined` in the cache | The decline-memory cache exists specifically so a rejected proposal doesn't reappear every firing forever. |
| Skipping the verify gate under time pressure | Unattended firings compound false positives into staged noise if a misread isn't caught before staging. |
| Treating the local cache as durable state | The cache is a rebuildable optimization — GitHub issue state is the source of truth for cross-run memory, same as `/code-health`/`/harness-health`. |
| Editing `docs/**` content to "fix" what a finding describes | This skill only ever judges and files — never edits. |
| Splitting one recurring root cause into N near-duplicate issues instead of bundling | Floods the tracker with issues that are really one fix applied to N sections. Use `relatedSections` to cover every occurrence in a single finding instead. |
| Filing before presenting the interactive gate | The two-tier decision must run before any `gh issue create` call for new findings — see `_shared/health-filing-gate.md`'s placement rule. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:harness-health` | Sibling health skill — mirrors the same SELECT → JUDGE → VERIFY GATE → FINGERPRINT/DEDUP → FILE pipeline and shares `_shared/health-state.md`'s durable persistence, but scoped to `docs/**` (excluding harness-health's own `.claude/skills/**`/`.claude/rules/**`/CLAUDE.md territory) for Diátaxis genre-drift + depth-mismatch + findability + staleness instead of skill/rule/CLAUDE.md accuracy and template-conformance. |
| `/claude-tweaks:code-health` | Sibling health skill for code quality — one of the four recurring-sweep siblings (code-health, harness-health, journey-health, docs-health). Shares the unified work-record filing contract. |
| `/claude-tweaks:journey-health` | Sibling health skill for `docs/journeys/*.md` accuracy and agent-e2e coverage — same SELECT → JUDGE → VERIFY GATE → FINGERPRINT/DEDUP → FILE pipeline shape (journey-health's Step 3.6 mirrors this skill's own Step 3.5) and `_shared/health-state.md` persistence, scoped to journeys instead of `docs/**` Diátaxis genre-drift + depth-mismatch + findability + staleness. Both file born-`ready` findings on the unified work-record contract. |
| `/claude-tweaks:specify` | docs-health findings are pre-specs — a filed `by:docs-health` issue body is `/specify`-shaped (Current State / Deliverables / Acceptance Criteria), so `/specify` consumes it with near-zero translation. |
| `/claude-tweaks:wrap-up` | Step 6.1 applies the same `_shared/criteria-docs-diataxis.md` procedure inline to docs touched by the just-completed work (see `docs-health-integration.md` in that skill's directory), and separately detects missing documentation from the diff — the same reuse pattern `/wrap-up` Step 7 applies to `_shared/harness-health-analysis.md`. |
| `/claude-tweaks:tidy` | `/tidy` Step 4.8 audits open `by:code-health`/`by:harness-health`/`by:journey-health` issues in its hygiene pass; docs-health follows the same pattern for `by:docs-health` issues. |
| `/claude-tweaks:triage` | The human gate over the `ready` queue — records docs-health files feed into triage's worklist the same way code-health/harness-health findings do. |
| `/claude-tweaks:routine` | `/routine create docs-health` instantiates docs-health's `routine-template.yml` into a live, scheduled cloud Routine. |
| `_shared/criteria-docs-diataxis.md` | The canonical judge this skill reads — the genre-drift/depth-mismatch/findability/staleness dimensions, dual-persona misleading-risk tagging, and Finding Shape live there, not here. |
| `_shared/health-state.md` | Durable cross-firing storage contract — docs-health's cursors, retry queue, and run history live on the `health-state` branch, reusing the exact same `bin/lib/health-core/*` primitives harness-health and code-health already use. No new persistence mechanism. |
| `_shared/work-record.md` | Canonical taxonomy docs-health files against — origin `by:docs-health`, scoring, `ready` stage, born-ready rule. |
| `_shared/health-filing-gate.md` | The canonical interactive file-all/route-individually gate this skill's Step 6 applies before calling `gh issue create` on new findings — shared with `/code-health`, `/harness-health`, and `/journey-health`. |
| `_shared/health-filing-mechanics.md` | The canonical retry-queue-drain and regressed-reopen shape this skill's Step 6 inlines (as `{BINARY}` = `docs-health.js`, `{PREFIX}` = `docs-health`) — shared with `/code-health`, `/harness-health`, and `/journey-health`. |
