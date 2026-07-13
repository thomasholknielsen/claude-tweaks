---
name: claude-tweaks:harness-health
description: Use when you want to check whether a project's harness documentation — `.claude/skills/*.md`, `.claude/rules/*.md`, and CLAUDE.md — still accurately describes the codebase, still conforms to its own origin template, and still follows best practices for getting the harness to perform well; or find a reusable pattern with no skill covering it. Runs standalone or on a schedule via a Routine. Never edits code — only harness documentation. Keywords - harness health, skill health, skill drift, rule drift, CLAUDE.md drift, best practice, template conformance, new-skill gap, scheduled, routine.
---
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.

# Harness Health — Keep Skills, Rules, and CLAUDE.md Honest

A recurring health check for `.claude/skills/*.md`, `.claude/rules/*.md`, and CLAUDE.md: picks one target to audit against the codebase (or the next new-skill gap to check for), judges it via the shared `_shared/harness-health-analysis.md` procedure, and files a `harness-health`-labelled GitHub issue. Never edits code — only harness documentation.

```
              [ /claude-tweaks:harness-health ] <- utility (no fixed lifecycle position)
                           |  picks a target via next-target; judges via the shared fragment
                           v
finding -> validate-findings -> file GitHub issue (harness-health label)
```

## When to Use

- You want skill, rule, and CLAUDE.md documentation to stay accurate between spec completions and full `/init` re-runs, without driving each check yourself.
- You want a scheduled Routine that periodically rotates through skills, rules, and CLAUDE.md and flags drift, structural decay, or best-practice gaps as they're found.
- You want to check one specific target right now (`--target <name> [--kind <skill|rule|claude-md|design-artifact>]`).
- You want to spot-check your own memory directory for format-budget violations, stale or contradicted facts, or duplication with checked-in docs (`--kind memory --memory-dir <path>`), interactively — never via a scheduled Routine.

Not for: code-quality findings (`/claude-tweaks:code-health`'s job — including cases where a rule's `paths:` glob is still correct but the code doesn't comply with it). Not a replacement for `/claude-tweaks:wrap-up` Step 7 or `/claude-tweaks:init`'s Update Mode — both consume the same shared procedure this skill does (currently against skills only), on their own scope models (a finished spec's diff; a whole-codebase reconnaissance) rather than this skill's churn/staleness rotation. Memory (`~/.claude/projects/{slug}/memory/`) is not auto-audited — reachable only via an explicit `--kind memory --memory-dir <path>` invocation, never through the automatic rotation a scheduled Routine uses, since memory lives outside the repo with no git churn signal and is not expected to be reachable from a Routine's execution environment.

## Input

`$ARGUMENTS` may contain:

- `--target <id>` — manual override: audit one specific target directly, bypassing `next-target` selection.
- `--kind <skill|rule|claude-md|design-artifact|memory>` — disambiguate `--target` when an id collides across kinds, or (without `--target`) restrict auto-selection to one kind. `memory` is never auto-selected without this flag — it is excluded from the default rotation pool entirely.
- `--memory-dir <path>` — required when `--kind memory` is used. The invoking assistant's own memory directory path, exactly as stated in its own system prompt's auto-memory section for this project. Never derive or guess this path.
- `--dry-run` — emit findings; never write cursor/cache state; never call `gh`.
- `--budget <n>` — audit up to `n` targets in one firing (default 1).
- `--root <dir>` — audit a project elsewhere (default: current working directory).

## Workflow

**Step 1 — SELECT: pick the next target(s).**

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/harness-health.js" next-target --root . ${TARGET:+--target "$TARGET"} ${KIND:+--kind "$KIND"} ${BUDGET:+--budget "$BUDGET"} ${MEMORY_DIR:+--memory-dir "$MEMORY_DIR"}
```

To audit memory, the human must explicitly ask for it — set `KIND=memory` and `MEMORY_DIR=<your own memory directory path, from your system prompt>` before invoking. Never set these automatically or infer them from context.

Without `--budget` (or `--budget 1`), prints `{ target: { kind, id, path, why } | null, gapScanDue: boolean }` — a single target. With `--budget <n>` where `n > 1`, prints `{ targets: [{ kind, id, path, why }, ...], gapScanDue: boolean }` instead — up to `n` targets, each a different id (possibly mixing kinds). When `targets` is present, run Steps 2-3 once per entry before moving on to Step 4 (gap scan runs once per firing regardless of budget, not once per target).

Read the `why` field on whichever target(s) came back:
- If both `target`/`targets` are empty and `gapScanDue` is `false`: nothing is due this firing. Report this to the user and stop.
- `why: "stale"` — this target has not been audited in over 90 days regardless of domain churn.
- `why: "hotspot"` — this target's domain paths (backtick-quoted references for skills/CLAUDE.md; the `paths:` frontmatter glob for rules) have the highest git churn since its last audit among targets with any churn at all.
- `why: "manual"` — `--target` was passed, bypassing selection.
- Memory targets (`kind: memory`) only ever produce `why: "stale"` or `why: "manual"` — never `"hotspot"`, since memory has no git churn signal.

If there is no target to deep-audit this firing (`target` is `null`, or `targets` is empty) but `gapScanDue` is `true`, skip straight to Step 4 (gap detection) — the gap scan is still due even with nothing else to audit.

**Step 2 — READ the target.**

Read the file at `target.path` in full. If none of `.claude/skills/`, `.claude/rules/`, or CLAUDE.md exist yet, report "no harness documentation to audit yet" and stop (this is a real state, not an error — a project that only ran `/init bootstrap`).

**Step 3 — JUDGE the target.**

When `target.kind === 'design-artifact'`, skip the full procedure below — construct one finding directly, without a content read:

1. Map `target.id` to its regenerate command: `PRODUCT` → `/impeccable:impeccable init`, `DESIGN` → `/impeccable:impeccable document`.
2. Build `oldString` from `target.why`: `"Unaudited for {target.daysSinceLastAudit} days"` when `why: "stale"`; when `why: "hotspot"`, use `"{target.churnCount} commits touching {target.pathGlobs joined with ', '}, since last audit"` if `target.pathGlobs` is non-empty, otherwise `"{target.churnCount} commits touching referenced content, since last audit"` (`PRODUCT`'s `pathGlobs` is always `[]` by design — selection can still return `why: "hotspot"` for it via paths scraped from its own prose, but those scraped paths aren't carried onto `target.pathGlobs`, so name them generically rather than joining an empty list); when `why: "manual"`, use `"Freshness audit manually requested"` (a manual `--target` invocation carries neither `daysSinceLastAudit` nor `churnCount` — don't fabricate either).
3. Emit one finding: `{ kind: "patch", assetType: "design-artifact", target: target.id, category: "drift", section: "Freshness", oldString: <from step 2>, newString: "Run {regenerate command}", classification: "restructural", confidence: "high", reversibility: "high", reason: <one sentence restating the oldString evidence>, description: "Re-run {regenerate command} to refresh {target.id === 'PRODUCT' ? 'PRODUCT.md' : 'DESIGN.md'}, confirm the regenerated content still matches the project's actual state, and close this issue." }`. Write it (as a single-element array, or appended to an existing array if the gap scan also ran this firing) to `/tmp/harness-health-findings.json`.

This branch doesn't need `_shared/harness-health-analysis.md`'s 8-dimension check — the 8 dimensions (template conformance, best-practice fit, cross-skill overlap, etc.) are skill/rule/claude-md-specific and don't map onto a project-root design-context file. `_shared/harness-health-analysis.md` is shared by `/wrap-up` and `/init`, neither of which ever passes a `design-artifact` target, so this branch lives here rather than in the shared file.

When `target.kind === 'memory'`, also skip the 8-dimension check — read the target file's full body and apply `_shared/harness-health-analysis.md`'s "Memory-Specific Checks" section instead, a narrower, more mechanical procedure suited to an index entry rather than a multi-section document. Emit findings the same way (Finding Shape, `assetType: "memory"`, `target: target.id`), appended to the same findings array.

For every other `target.kind` (skill, rule, claude-md), apply the full procedure in `_shared/harness-health-analysis.md` (the 8-dimension check, evidence pre-checks, verify gate, concrete gap signals — using `target.kind` to select which dimensions and origin-template references apply) to the target. Emit findings as a JSON array in the Finding Shape that file defines, with `assetType` set to `target.kind` and `target` set to `target.id`. Write the array to `/tmp/harness-health-findings.json`.

**Step 4 — GAP SCAN (when due, per Step 1's `gapScanDue`).**

Apply `_shared/harness-health-analysis.md`'s new-skill gap detection over commits since the gap-scan cursor (or the whole repo, if this is the first-ever gap scan). Append any new-skill candidates to the same findings array from Step 3. This step is skill-only — it never proposes a new rule or a new CLAUDE.md section.

**Step 5 — GATHER OPEN ISSUES for dedup.**

```bash
gh issue list --label harness-health --state all --json number,state,labels,body --limit 500 > /tmp/harness-health-issues-raw.json
```

Parse each issue body for the fingerprint marker `<!-- harness-health-fingerprint: harnesshealth-XXXXXXXX -->` and build an array of `{ number, state, labels, fingerprint }` objects. Write to `/tmp/harness-health-issues.json`. If `gh` is unavailable or the repo has no `harness-health` issues yet, skip this step and set `ISSUES_FILE=""` — the run dedups against the local cache only.

**Step 6 — VALIDATE, FINGERPRINT, DEDUP.**

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/harness-health.js" validate-findings /tmp/harness-health-findings.json \
  --root "${ROOT:-$PWD}" \
  ${ISSUES_FILE:+--issues "$ISSUES_FILE"} \
  ${TARGET_ID:+--target "$TARGET_ID"} ${TARGET_KIND:+--kind "$TARGET_KIND"} \
  ${GAP_SCAN_RAN:+--gap-scan} \
  ${DRY_RUN:+--dry-run} \
  > /tmp/harness-health-payloads.json
```

`TARGET_ID`/`TARGET_KIND` are `target.id`/`target.kind` from Step 1 (omit both if Step 1 returned `target: null` and only the gap scan ran — pass both together or neither, since cursor recording needs the namespaced `kind:id` key). `GAP_SCAN_RAN` is passed whenever Step 4 actually ran this firing. The command validates each finding, fingerprints via `assetType + target + section + normalizedDescription`, dedups against open `harness-health` issues and the local cache, records the audit cursor for `${TARGET_KIND}:${TARGET_ID}` (and the gap-scan cursor when `--gap-scan` was passed) unless `--dry-run`, and emits gh-ready payloads on stdout.

**Step 7 — FILE.**

Before filing anything this firing, bootstrap harness-health's labels with real descriptions — this project's other issue-filing skills (code-health) already do this; harness-health previously did not, leaving every one of its labels with GitHub's blank auto-vivified description:

```bash
# Bootstrap per _shared/label-bootstrap.md, LABELS_JSON =
# [['harness-health', 'Filed by the harness-health engine - a plugin harness maintenance finding'],
#  ['harness-health:additive', 'Safe, mechanical patch - additive change with no removed behavior'],
#  ['harness-health:restructural', 'Structural change requiring human review before applying'],
#  ['harness-health:new-skill', 'Proposes a new skill candidate surfaced by harness-health']]
```

Each payload in `/tmp/harness-health-payloads.json` carries structured fields, not just the GitHub issue text — `id`, `kind`, `target`, `assetType`, `category`, `section`, `classification`, `confidence`, `reversibility`, `oldString`, `newString` are all present directly on the payload object (not just embedded in `payload.body`'s markdown). These stay on the payload as triage metadata — nothing here branches on them anymore.

For each payload, file it: `gh issue create --title "<payload.title>" --body "<payload.body>" --label harness-health --label "<payload.labels[1]>"`. This applies uniformly — CLAUDE.md findings, design-artifact findings, additive skill/rule patches, restructural patches, and new-skill candidates all file the same way. `/harness-health` never edits anything directly; matching `/code-health`, it only ever judges and files.

For a payload whose fingerprint marker (`<!-- harness-health-fingerprint: {id} -->`, embedded in `payload.body`) matches a `status: "regressed"` entry in `.claude-tweaks/harness-health/cache.json` after this run, the finding was previously closed and has reappeared — reopen the existing issue instead of filing a new one:

```bash
gh issue reopen <issue_number>
gh issue comment <issue_number> --body "Regressed: this finding reappeared. Run: ${RUN_ID}"
```

`<issue_number>` is that cache entry's `issue` field. In `--dry-run` mode, print what would be filed or reopened, and the `gh` commands that would run, but do not call `gh`.

**Step 8 — SUMMARIZE.**

Report: which target(s) were audited (or that only the gap scan ran), how many findings were emitted, how many filed vs skipped by dedup. List any new issue URLs.

In interactive mode, route surviving findings through a two-tier decision:

1. Render all findings as a markdown batch table:

   ```
   | # | Title | Category | Classification | Confidence | Reversibility |
   |---|-------|----------|-----------------|------------|----------------|
   | 1 | {title} | {category} | {classification} | {confidence} | {reversibility} |
   ```

   `classification`/`confidence`/`reversibility` stay visible as triage metadata — every row files the same way, so there is no per-row recommendation column to pre-fill.

2. Call `AskUserQuestion` with `question`: `"How do you want to handle these findings?"`, `header`: `"Findings"`, `multiSelect`: `false`, and:
   - Option 1 — `label`: `"File all (Recommended)"`, `description`: `"File every finding above as a GitHub harness-health issue"`
   - Option 2 — `label`: `"Route individually"`, `description`: `"Decide each finding one at a time"`

3. If "Route individually" was chosen, call `AskUserQuestion` once per finding — `question`: `"How do you want to handle finding #{N}: {title}?"`, `header`: `"Finding #{N}"`, `multiSelect`: `false`, and:
   - Option 1 — `label`: `"File issue"`, `description`: `"File as a GitHub harness-health issue"`
   - Option 2 — `label`: `"Dismiss"`, `description`: `"Run mark declined so it doesn't reappear"`

For "dismiss," run `node "${CLAUDE_PLUGIN_ROOT}/bin/harness-health.js" mark "<payload.id>" declined --root .` so the same proposal doesn't reappear on a future firing.

## Routine Configuration

`/harness-health` ships a routine template (`skills/harness-health/routine-template.yml`) designed for small, predictable sips: one target per run, so a scheduled firing is cheap and a skipped one is harmless. Instantiate it for the current project with:

```
/claude-tweaks:routine create harness-health
```

**Headless run flow:** SELECT(`next-target`) → JUDGE → validate-findings → file. A firing with nothing due (`target: null`, `gapScanDue: false`) is a cheap no-op.

Report-only, matching `/code-health` — every finding files as a `harness-health`-labelled GitHub issue, with no `Edit` call anywhere in its documented workflow.

> **Billing note:** Routines run inside the subscription; verify automation-credit specifics against the live account.

## Next Actions

Call `AskUserQuestion` with `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`, and:

- Option 1 — `label`: `"Schedule a Routine"`, `description`: `"/claude-tweaks:routine create harness-health — schedule this as a recurring Routine"`. Suffix the label `(Recommended)` after a first standalone run confirms the output looks right.
- Option 2 — `label`: `"Audit one target"`, `description`: `"/claude-tweaks:harness-health --target <name> --kind <skill|rule|claude-md|design-artifact> — audit one specific target right now"`
- Option 3 — `label`: `"Backlog hygiene"`, `description`: `"/claude-tweaks:tidy — fold any filed harness-health issues into a backlog-hygiene pass"`

## Component-Skill Contract

When `$PIPELINE_RUN_DIR` is set, `/claude-tweaks:harness-health` is running inside a pipeline (invoked by `/claude-tweaks:flow` or another pipeline orchestrator). In that case omit the `## Next Actions` block — the parent owns the handoff.

Direct invocation may pass `--source <parent-skill>` as an explicit fallback when ambiguity exists (rare; `$PIPELINE_RUN_DIR` is the primary signal). Standalone (no `$PIPELINE_RUN_DIR`) is the common case and renders Next Actions as usual.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Applying any patch directly instead of filing an issue | `/harness-health` never edits anything — every finding, regardless of `assetType`/classification/confidence/reversibility, files as a GitHub issue for human review. Matches `/code-health`'s report-only contract. |
| Treating a rule's low compliance ratio as automatic drift | A low adherence ratio can mean the code violates a still-correct rule (a `/code-health` code-quality problem) rather than the rule being stale — always reason about *why* the ratio is low before emitting a finding. |
| Re-proposing a patch already marked `declined` in the cache | The decline-memory cache exists specifically so a rejected proposal doesn't reappear every firing forever. |
| Skipping the verify gate under time pressure | Unattended firings compound false positives into staged noise if a misread isn't caught before staging — the verify gate in `_shared/harness-health-analysis.md` is not optional. |
| Reading every sub-file of a candidate skill regardless of relevance | Some skills (`build`, `stories`, `init`) have many sub-files — exhaustive reads get expensive across a whole-library rotation. Bound reads by relevance. |
| Treating the local cache as durable state | The cache is a rebuildable optimization — GitHub issue state is the source of truth for cross-run memory, same as `/code-health`. |
| Editing code to "fix" what a skill, rule, or CLAUDE.md describes | This skill only ever touches harness documentation, never the code it describes. |
| Proposing a "new-rule" or "new-claude-md-section" finding | Gap detection (proposing a brand-new artifact) is skill-only this phase — rules and CLAUDE.md only ever get `patch` findings against their existing content. |
| Folding memory into `listTargets`'s default pool | A bare Routine firing has no way to know it shouldn't touch memory — the exclusion has to be structural (a separate lister, a separate CLI branch), not a documented convention alone. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:wrap-up` | Step 7 (Skill Curation) applies the same `_shared/harness-health-analysis.md` procedure on a spec's changed skill files, and writes to the same cursor/cache state this skill reads and writes. |
| `/claude-tweaks:init` | Phase 6 (Update Mode skill patches) and Phase 3/1u's skill classification apply the same shared procedure on whole-codebase reconnaissance, sharing the same cursor/cache state. |
| `_shared/harness-health-analysis.md` | The canonical judge this skill, `/wrap-up`, and `/init` all read — the 8-dimension check, evidence pre-checks, verify gate, patch format, and new-skill gate live there, not here. |
| `/claude-tweaks:tidy` | Step 4.8 sweeps `harness-health`-labelled issues alongside `code-health`-labelled ones, using the same stale/superseded triage. |
| `/claude-tweaks:triage` | The Tier Rule in triage's bare invocation reads this skill's `harness-health:additive`/`harness-health:restructural` classification labels directly, recommending fast-track for additive and approved for restructural — the harness-health-side counterpart to how triage reads code-health's `risk-<tier>`/`effort-<tier>` labels. Triage never files or closes harness-health issues. |
| `/claude-tweaks:routine` | `/routine create harness-health` instantiates this skill's `routine-template.yml` into a live, scheduled cloud Routine. |
