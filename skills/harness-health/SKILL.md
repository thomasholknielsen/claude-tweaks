---
name: claude-tweaks:harness-health
description: Use when you want to check whether a project's harness documentation — `.claude/skills/*.md`, `.claude/rules/*.md`, and CLAUDE.md — still accurately describes the codebase, still conforms to its own origin template, and still follows best practices for getting the harness to perform well; or find a reusable pattern with no skill covering it. Runs standalone or on a schedule via a Routine. Never edits code — only harness documentation. Keywords - harness health, skill health, skill drift, rule drift, CLAUDE.md drift, best practice, template conformance, new-skill gap, scheduled, routine.
argument-hint: "[--target <id>] [--kind skill|rule|claude-md|design-artifact|memory] [--memory-dir <path>] [--budget <n>] [--min-confidence low|med|high] [--force-gap-scan] [--dry-run] [--root <dir>]"
allowed-tools: Read, Grep, Glob, Bash, AskUserQuestion
---
> **Interaction style:** Present single decisions via the `AskUserQuestion` tool (options with one marked Recommended) instead of a plain-text numbered list. For multi-item decisions, render a batch table with recommended actions pre-filled, then capture the apply-all/override decision via one `AskUserQuestion` call. Never make more than one `AskUserQuestion` call per logical decision — resolve each before showing the next. End skills with a `## Next Actions` block rendered via `AskUserQuestion` (context-specific options, one recommended), not a navigation menu.

# Harness Health — Keep Skills, Rules, and CLAUDE.md Honest

A recurring health check for `.claude/skills/*.md`, `.claude/rules/*.md`, and CLAUDE.md: picks one target to audit against the codebase (or the next new-skill gap to check for), judges it via the shared `_shared/harness-health-analysis.md` procedure, and files a `by:harness-health`-labelled, born-`ready` GitHub issue. Never edits code — only harness documentation.

```
              [ /claude-tweaks:harness-health ] <- utility (no fixed lifecycle position)
                           |  picks a target via next-target; judges via the shared fragment
                           v
finding -> validate-findings -> file GitHub issue (by:harness-health, ready)
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
- `--min-confidence <low|med|high>` — minimum `confidence` a finding needs to be filed as a GitHub issue (default: none — every surviving finding files regardless of confidence). Findings below this floor are held in the durable `remembered` cache — not dropped, not filed — until a later, deliberately deeper run lowers the bar. Mirrors `/code-health`'s `--min-risk`; closes this skill's own previously-documented no-floor asymmetry with it (see Routine Configuration below).
- `--force-gap-scan` — force `gapScanDue: true` this firing regardless of the 90-day gap-scan cursor. A manual escape hatch for testing gap-detection heuristics or checking a suspected fresh pattern on demand, mirroring `--target`'s existing manual override for the deep-audit side of selection.
- `--root <dir>` — audit a project elsewhere (default: current working directory).

## Workflow

**Step 1 — SELECT: pick the next target(s).**

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/harness-health.js" next-target --root . ${TARGET:+--target "$TARGET"} ${KIND:+--kind "$KIND"} ${BUDGET:+--budget "$BUDGET"} ${MEMORY_DIR:+--memory-dir "$MEMORY_DIR"} ${FORCE_GAP_SCAN:+--force-gap-scan}
```

To audit memory, the human must explicitly ask for it — set `KIND=memory` and `MEMORY_DIR=<your own memory directory path, from your system prompt>` before invoking. Never set these automatically or infer them from context. `FORCE_GAP_SCAN` is likewise only ever a deliberate human request (`--force-gap-scan`) — never set it automatically.

Without `--budget` (or `--budget 1`), prints `{ target: { kind, id, path, why } | null, gapScanDue: boolean }` — a single target. With `--budget <n>` where `n > 1`, prints `{ targets: [{ kind, id, path, why }, ...], gapScanDue: boolean }` instead — up to `n` targets, each a different id (possibly mixing kinds).

**Multi-target runs (`--budget > 1`):** treat each `targets` array entry as its own full per-target sweep — run Steps 2, 3, 6, and 7 in their entirety for target 1 (including its own `validate-findings --target <id> --kind <kind>` call and its own `gh issue create` calls), writing that target's Step 3 findings to its own file (`/tmp/harness-health-findings-{target.id}.json`, not a shared path), then repeat Steps 2, 3, 6, 7 for target 2, and so on. Never collect findings from multiple targets into one shared `validate-findings` call — each target needs its own `--target`/`--kind` pair so its cursor persists independently; skipping this silently leaves N-1 of N targets' cursors stuck, so they get immediately re-selected as `stale`/`hotspot` on the very next firing despite having just been judged. Step 5 (GATHER OPEN ISSUES) only needs to run once per firing — its open-issue index is reused across every target's Step 6 call, not target-specific. Step 4 (GAP SCAN), when due, also runs once per firing regardless of budget, never once per target (see below); fold its new-skill candidates into whichever single target's findings file is processed last this firing, or — if no `targets` came back but `gapScanDue` is still `true` — write them to their own `/tmp/harness-health-findings-gapscan.json` and give that file its own dedicated `validate-findings --gap-scan` call with no `--target`/`--kind`. A run that audits 3 targets makes 3 separate `validate-findings` invocations (plus the gap scan's own standalone call if it had nowhere else to attach), never 1 shared invocation across targets.

> **Parallel execution (conditional):** When `--budget > 1` returns 2 or more targets, dispatch each target's READ+JUDGE work (Steps 2-3) as parallel Task agents — each target is a different file with an independent 8-dimension check, so the audits don't interact. Otherwise (a single target, or `--budget` not passed), run Steps 2-3 sequentially in the main thread. Each dispatched agent gets: the target's `{ kind, id, path, why }` object from Step 1; a pointer to `_shared/harness-health-analysis.md` (or, for `kind: design-artifact`/`memory`, this skill's own Step 3 branch text) as the judging procedure to apply; and an explicit instruction to write its findings array to `/tmp/harness-health-findings-{target.id}.json` and reply with nothing but the status line required by the Subagent Contract (`_shared/subagent-output-contract.md`): `DONE`/`DONE_WITH_CONCERNS` once the findings file is written, `NEEDS_CONTEXT` if the target/procedure pointer was insufficient, or `BLOCKED` if it couldn't complete. This doesn't fit Template A/B/C (the output is a JSON findings array written to a file path, not a table/bullet-list/yes-no answer), so the literal per-agent output instruction above stands in for one, per that contract's "not every consumer uses A/B/C" allowance. `[Use: Standard model — this is judgment-heavy analysis against the 8-dimension check, not mechanical extraction]`. Assemble results after all agents complete, then proceed to each target's own Steps 6-7 sequentially in the main thread (dedup/filing must not race against a shared `gh`/cache write).

Unlike `/code-health`'s `next-slice`, this command is named `next-target` because harness-health, journey-health, and docs-health each rotate over one specific file at a time (a skill file, a journey file, a doc). `/code-health`'s `next-slice` rotates over an area/directory that gets fully swept per firing — a coarser unit than a single file — so it kept its own name rather than adopting this family's.

**Policy schema check (separate from the target/gap-scan work above, runs every firing).** Placed here — immediately after `next-target` returns, before the nothing-due early-stop and the gap-scan-only skip below — so it executes on every firing regardless of which branch Step 1 takes. Call:

```bash
node -e "const {auditPolicy}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/policy-schema.js'); console.log(JSON.stringify(auditPolicy(process.cwd())))"
```

This is a deterministic validation check, not the 8-dimension judged analysis `_shared/harness-health-analysis.md` performs — a malformed key or value is a mechanical fact, not a semantic judgment, so it doesn't produce a `patch`/`new-skill` finding through that shared file. Before checking emptiness, filter `invalidValues` to exclude any entry whose `source` is `CLAUDE.md` and whose `key` is one of the 8 legacy Auto-mode-policy levers (`unattended-tier`, `scope-creep`, `overlap`, `design-intent`, `leftover-default`, `auto-fix-threshold`, `review-severity-floor`, `tidy-aggressiveness`) — those are already surfaced through `/init` Update Mode's migration offer (which flags an invalid legacy value distinctly), so filing here too would duplicate that path. If both `unrecognizedKeys` and the filtered `invalidValues` are empty, do nothing further for this check this firing. Otherwise, file one work-record issue (origin `by:harness-health`, `risk:low` + `effort:low` — this is always a same-shape mechanical fix) titled `"policy.yml/CLAUDE.md has {N} unrecognized key(s) / invalid value(s)"` when any remaining `invalidValues` entry has `source: 'CLAUDE.md'` (a non-legacy CLAUDE.md-only key, e.g. a mistyped `depth-survey` value), or `"policy.yml has {N} unrecognized key(s) / invalid value(s)"` otherwise (covers both an empty `invalidValues` and a `policy.yml`-only `invalidValues` — `unrecognizedKeys` entries are always policy.yml-derived, so they never affect this branch), with a body listing each `unrecognizedKeys` entry (possible typo or a stale key removed from the schema — see `_shared/policy-schema.md`) and each remaining `invalidValues` entry (`key`, the actual `value`, `source`, and the expected type/enum from `expected`). Dedup against open `by:harness-health` issues the same way Step 5/6 do for the main target — reuse Step 5's `gh issue list` fetch when this firing reaches Step 5 (a target/gap-scan firing); on a firing that stops at the nothing-due early-exit before ever reaching Step 5, run the same `gh issue list --label by:harness-health --state all --json number,state,labels,body --limit 500` fetch here instead, since Step 5 never ran this firing — except in `--dry-run` mode, where this fetch is skipped entirely (per this skill's own `--dry-run` rule: never call `gh`) and the finding is only printed as what would be checked and potentially filed, with no dedup performed. Never file for `legacyClaudeMdLevers` alone — that's `/claude-tweaks:init` Update Mode's interactive migration to offer (see `skills/init/update-mode.md`'s "Auto-Mode-Policy Migration"), not something to push through an unattended Routine's issue queue.

Read the `why` field on whichever target(s) came back:
- If both `target`/`targets` are empty and `gapScanDue` is `false`: nothing is due this firing. Report this to the user and stop.
- `why: "stale"` — this target has not been audited in over 90 days regardless of domain churn.
- `why: "hotspot"` — this target's domain paths (backtick-quoted references for skills/CLAUDE.md; the `paths:` frontmatter glob for rules) have the highest git churn since its last audit among targets with any churn at all.
- `why: "manual"` — `--target` was passed, bypassing selection.
- Memory targets (`kind: memory`) only ever produce `why: "stale"` or `why: "manual"` — never `"hotspot"`, since memory has no git churn signal.

If there is no target to deep-audit this firing (`target` is `null`, or `targets` is empty) but `gapScanDue` is `true`, skip straight to Step 4 (gap detection) — the gap scan is still due even with nothing else to audit.

**Skill-library shape pass (separate from the target/gap-scan due-ness above).** Read `library-shape-analysis.md` in this skill's directory for a periodic pass comparing skills *against each other* (too-shallow / overlapping / bloated) on its own 90-day cursor — check its own due-ness (per that file's "Due-ness and SELECT" section) independently of whatever `next-target` returned above, and run it in addition to the standard target/gap-scan work this firing when due.

**Step 2 — READ the target.**

Read the file at `target.path` in full. If none of `.claude/skills/`, `.claude/rules/`, or CLAUDE.md exist yet, report "no harness documentation to audit yet" and stop (this is a real state, not an error — a project that only ran `/init bootstrap`).

**Step 3 — JUDGE the target.**

Findings file path: `/tmp/harness-health-findings.json` for a single-target run (no `--budget`, or `--budget 1`). For a multi-target run (`--budget > 1`), each target gets its own `/tmp/harness-health-findings-{target.id}.json` instead — per Step 1's multi-target repeat instructions, never write two targets' findings into one shared file.

When `target.kind === 'design-artifact'`, skip the full procedure below — construct one finding directly, without a content read:

1. Map `target.id` to its regenerate command: `PRODUCT` → `/impeccable:impeccable init`, `DESIGN` → `/impeccable:impeccable document`.
2. Build `oldString` from `target.why`: `"Unaudited for {target.daysSinceLastAudit} days"` when `why: "stale"`; when `why: "hotspot"`, use `"{target.churnCount} commits touching {target.pathGlobs joined with ', '}, since last audit"` if `target.pathGlobs` is non-empty, otherwise `"{target.churnCount} commits touching referenced content, since last audit"` (`PRODUCT`'s `pathGlobs` is always `[]` by design — selection can still return `why: "hotspot"` for it via paths scraped from its own prose, but those scraped paths aren't carried onto `target.pathGlobs`, so name them generically rather than joining an empty list); when `why: "manual"`, use `"Freshness audit manually requested"` (a manual `--target` invocation carries neither `daysSinceLastAudit` nor `churnCount` — don't fabricate either).
3. Emit one finding: `{ kind: "patch", assetType: "design-artifact", target: target.id, category: "drift", section: "Freshness", oldString: <from step 2>, newString: "Run {regenerate command}", classification: "restructural", confidence: "high", reversibility: "high", reason: <one sentence restating the oldString evidence>, description: "Re-run {regenerate command} to refresh {target.id === 'PRODUCT' ? 'PRODUCT.md' : 'DESIGN.md'}, confirm the regenerated content still matches the project's actual state, and close this issue." }`. Write it (as a single-element array, or appended to an existing array if the gap scan also ran this firing) to this target's findings file (see the path rule above Step 3's design-artifact branch).

This branch doesn't need `_shared/harness-health-analysis.md`'s 8-dimension check — the 8 dimensions (template conformance, best-practice fit, cross-skill overlap, etc.) are skill/rule/claude-md-specific and don't map onto a project-root design-context file. `_shared/harness-health-analysis.md` is shared by `/wrap-up` and `/init`, neither of which ever passes a `design-artifact` target, so this branch lives here rather than in the shared file.

When `target.kind === 'memory'`, also skip the 8-dimension check — read the target file's full body and apply `_shared/harness-health-analysis.md`'s "Memory-Specific Checks" section instead, a narrower, more mechanical procedure suited to an index entry rather than a multi-section document. Emit findings the same way (Finding Shape, `assetType: "memory"`, `target: target.id`), appended to the same findings array.

For every other `target.kind` (skill, rule, claude-md), apply the full procedure in `_shared/harness-health-analysis.md` (the 8-dimension check, evidence pre-checks, verify gate, concrete gap signals — using `target.kind` to select which dimensions and origin-template references apply) to the target. Emit findings as a JSON array in the Finding Shape that file defines, with `assetType` set to `target.kind` and `target` set to `target.id`. Write the array to this target's findings file (see the path rule above Step 3's design-artifact branch).

**Bundling rule (recurring root causes)** (canonical shape in `_shared/health-finding-shapes.md` — check that file when either changes to keep this skill's copy in sync with its three siblings): when two or more `kind: "patch"` findings against this same target share both the same `category` and the same root-cause explanation, file **one** finding, not one per section. Pick the clearest/most representative occurrence as the primary `section`; list every other occurrence in `relatedSections` (`_shared/harness-health-analysis.md`'s Finding Shape); make `reason` state the shared root cause explaining all of them; make `description` (the acceptance criteria) require every listed section fixed, not just the primary one. Only bundle occurrences that share both `category` AND the root cause. `kind: "new-skill"` candidates never carry `relatedSections` — they have no `section` to bundle by.

**Step 4 — GAP SCAN (when due, per Step 1's `gapScanDue`).**

Apply `_shared/harness-health-analysis.md`'s new-skill gap detection over commits since the gap-scan cursor (or the whole repo, if this is the first-ever gap scan). Runs once per firing regardless of budget, never once per target. Append any new-skill candidates to the findings array from Step 3 — for a single-target run, that's the one shared file; for a multi-target run (`--budget > 1`), append them to whichever target's findings file is processed last this firing (or, if no `targets` came back this firing but `gapScanDue` is still `true`, write them to their own `/tmp/harness-health-findings-gapscan.json` per Step 1's multi-target instructions). This step is skill-only — it never proposes a new rule or a new CLAUDE.md section.

**Step 5 — GATHER OPEN ISSUES for dedup.**

```bash
gh issue list --label by:harness-health --state all --json number,state,labels,body --limit 500 > /tmp/harness-health-issues-raw.json
```

Parse each issue body for its fingerprint marker. Fingerprint extraction reads the dual-marker form via `extractFingerprint` (`bin/lib/issues/record.js`): the current `<!-- work-fingerprint: harnesshealth-XXXXXXXX -->` marker, falling back to the legacy `<!-- harness-health-fingerprint: harnesshealth-XXXXXXXX -->` marker still present on issues filed before this skill moved onto the unified work record (`skills/_shared/work-record.md`). Build an array of `{ number, state, labels, fingerprint }` objects and write to `/tmp/harness-health-issues.json`. If `gh` is unavailable or the repo has no `by:harness-health` issues yet, skip this step and set `ISSUES_FILE=""` — the run dedups against the local cache only.

A matched issue carrying the `wontfix` label is a standing suppression decision: Step 6's `validate-findings` reads it directly off this issue index and skips re-filing entirely (see `_shared/work-record.md`'s `wontfix` closure row). Unlike `/code-health`, harness-health has no cache-level wontfix fallback — every firing re-fetches the live issue index in this step, and `gh issue list --state all` already includes closed `wontfix`'d issues, so the suppression is always seen fresh; there is nothing to persist locally for it.

**Step 6 — VALIDATE, FINGERPRINT, DEDUP.**

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/harness-health.js" validate-findings "${FINDINGS_FILE:-/tmp/harness-health-findings.json}" \
  --root "${ROOT:-$PWD}" \
  ${ISSUES_FILE:+--issues "$ISSUES_FILE"} \
  ${TARGET_ID:+--target "$TARGET_ID"} ${TARGET_KIND:+--kind "$TARGET_KIND"} \
  ${GAP_SCAN_RAN:+--gap-scan} \
  ${MIN_CONFIDENCE:+--min-confidence "$MIN_CONFIDENCE"} \
  ${DRY_RUN:+--dry-run} \
  > /tmp/harness-health-payloads.json
```

`TARGET_ID`/`TARGET_KIND` are `target.id`/`target.kind` from Step 1 (omit both if Step 1 returned `target: null` and only the gap scan ran — pass both together or neither, since cursor recording needs the namespaced `kind:id` key). `GAP_SCAN_RAN` is passed whenever Step 4 actually ran this firing. `FINDINGS_FILE` is the target-scoped path from Step 3 (`/tmp/harness-health-findings.json` for a single-target run; `/tmp/harness-health-findings-{target.id}.json` per target, or `/tmp/harness-health-findings-gapscan.json`, for a multi-target run) — run this whole command once per target for a `--budget > 1` firing, per Step 1's multi-target instructions, never once for a shared file covering multiple targets. `MIN_CONFIDENCE` is only ever set from an explicit human `--min-confidence` request; a Routine's default headless firing omits it (see Routine Configuration below). The command validates each finding, fingerprints via `assetType + target + section + normalizedDescription`, dedups against open `by:harness-health` issues and the local cache, drops any finding below `--min-confidence` into the durable `remembered` cache instead of filing it, records the audit cursor for `${TARGET_KIND}:${TARGET_ID}` (and the gap-scan cursor when `--gap-scan` was passed) unless `--dry-run`, and emits gh-ready payloads on stdout.

**Step 7 — FILE.**

Every harness-health record files onto the unified work record (`skills/_shared/work-record.md`): origin `by:harness-health`; classification folds into the scoring axis instead of staying a producer-specific label the gate must know:

| Classification | risk | effort |
|---|---|---|
| `additive` | `risk:low` | `effort:low` |
| `restructural` | `risk:medium` | `effort:high` |
| kind `new-skill` (no classification-driven scoring) | unscored — no `risk:*` label | unscored — no `effort:*` label |

`new-skill` candidates file with no scoring labels by design — there is no classification-driven
tier to guess from a kind that carries no scoring evidence. `/claude-tweaks:assess-agent-autonomy`'s
`grant-check` mode (`backlog refine`'s grant sub-stage) recognizes a `new-skill` finding from its body content
directly (it reads "**New skill candidate**" with a "Proposed new skill" deliverable) rather than
depending on a scoring label being present, and can still recommend `auto:build` for a
well-specified proposal — building the draft autonomously is reasonable, since a human confirms the
grant and reviews again before any merge — while recommending against `auto:merge`, since a new
skill file shapes future agent behavior regardless of how clean the diff looks. Every filed finding
is **born-`ready`** — harness-health findings are agent-sized and spec-shaped by construction
(Current State / Deliverables / Acceptance Criteria), so they file with the `ready` label already
applied and appear directly in the authorization gate's worklist, skipping maturation. `toIssuePayload` (`bin/lib/harness-health/issue-payload.js`) assembles the payload via `record.js`'s `recordPayload`, then appends the classification/kind-derived diagnostic label (`harness-health:additive` / `harness-health:restructural` / `harness-health:new-skill`) after the canonical labels — the emitted label set is exactly `by:harness-health` + scoring (when present) + `ready` + the diagnostic label, matching the table above.

Before filing this firing's own new findings, drain the durable retry queue from prior firings' filing failures and check for regressed reopens (see `_shared/health-state.md`) — both mechanics below follow the canonical shape in `_shared/health-filing-mechanics.md` (`{BINARY}` = `harness-health.js`, `{PREFIX}` = `harness-health`); check that file when either changes to keep this skill's copy in sync with its three siblings:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/harness-health.js" retry-queue drain --root . > /tmp/harness-health-retry-payloads.json
```

For each payload in `/tmp/harness-health-retry-payloads.json`, attempt `gh issue create` exactly as below. Track every attempt's outcome (retry-queue payloads AND any brand-new payload from this step's own filing loop that fails) as `[{ fingerprint, payload, ok: true }]` or `[{ fingerprint, payload, ok: false, error: "<gh's error output>" }]`, write to `/tmp/harness-health-retry-results.json`, then:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/harness-health.js" retry-queue update /tmp/harness-health-retry-results.json --root . > /tmp/harness-health-escalated.json
```

If `/tmp/harness-health-escalated.json` is non-empty, file (or update) a `harness-health:filing-failed` issue for each entry, naming the stuck fingerprint and its failure history — bootstrap that label the same way as the others below.

Before filing, bootstrap only the label families this run applies, with real descriptions — using the shared helper so a too-long description fails loudly here rather than as a 422 on `gh issue create`. Canonical pairs copied verbatim from `_shared/label-bootstrap.md`'s `LABELS_JSON`, plus harness-health's own diagnostic labels:

```bash
# Bootstrap per _shared/label-bootstrap.md, LABELS_JSON =
# [["by:harness-health", "Origin: filed by the harness-health skill"],
#  ["risk:low",          "Scoring: low blast radius — safe for autonomous build"],
#  ["risk:medium",       "Scoring: moderate blast radius — review before merge recommended"],
#  ["effort:low",        "Scoring: small, agent-sized change"],
#  ["effort:high",       "Scoring: large change — consider decomposition before building"],
#  ["ready",             "Stage: spec-shaped and agent-sized — in the authorization gate's worklist"],
#  ["harness-health:additive",     "Safe, mechanical patch - additive change with no removed behavior"],
#  ["harness-health:restructural", "Structural change requiring human review before applying"],
#  ["harness-health:new-skill",    "Proposes a new skill candidate surfaced by harness-health"],
#  ["harness-health:filing-failed", "Escalation: gh issue create failed repeatedly for this fingerprint — needs human attention"]]
```

Each payload in `/tmp/harness-health-payloads.json` carries structured fields, not just the GitHub issue text — `id`, `kind`, `target`, `assetType`, `category`, `section`, `classification`, `confidence`, `reversibility`, `oldString`, `newString` are all present directly on the payload object (not just embedded in `payload.body`'s markdown), alongside `title`, `body`, `labels`, and `type`. These stay on the payload as triage metadata — nothing here branches on them anymore.

For a payload whose fingerprint marker (embedded in `payload.body`, read via `extractFingerprint`) matches a `status: "regressed"` entry in `.claude-tweaks/harness-health/cache.json` after this run, the finding was previously closed and has reappeared — reopen the existing issue instead of filing a new one:

```bash
gh issue reopen <issue_number>
gh issue comment <issue_number> --body "Regressed: this finding reappeared. Run: ${RUN_ID}"
```

`<issue_number>` is that cache entry's `issue` field.

Per `_shared/health-filing-gate.md`'s applicability/scope/placement rule: in interactive mode, before filing this firing's own new findings (not the retry-queue drains or regressed reopens above, which already executed unconditionally), route survivors through a two-tier decision:

1. Render all findings as a markdown batch table:

   ```
   | # | Title | Category | Classification | Confidence | Reversibility | Recommended |
   |---|-------|----------|-----------------|------------|----------------|-------------|
   | 1 | {title} | {category} | {classification} | {confidence} | {reversibility} | {File issue|Capture} |
   ```

   Pre-fill the Recommended column: `confidence: high` or `confidence: med` → `"File issue"`; `confidence: low` → `"Capture"`. (When `--min-confidence` was passed, findings below it never reach this table at all — Step 6's `validate-findings` already diverted them into the `remembered` cache before Step 7 runs.)

2. Call `AskUserQuestion` with `question`: `"How do you want to handle these findings?"`, `header`: `"Findings"`, `multiSelect`: `false`, and:
   - Option 1 — `label`: `"Apply all recommended (Recommended)"`, `description`: `"File / Capture each finding per the Recommended column above"`
   - Option 2 — `label`: `"Override specific items"`, `description`: `"Tell me which #s to change"`

3. If "Override specific items" was chosen, the follow-up is ordinary free-text chat in the next message, per CLAUDE.md's Multi-item decisions convention — not the tool's `Other` field. The user names findings by number and states each one's disposition — `File issue` (file as a GitHub harness-health issue), `Capture` (via `/claude-tweaks:capture` for later triage), `/claude-tweaks:specify directly` (promote straight to a spec, skipping the issue), or `Dismiss` (run `mark` so it doesn't reappear) — e.g. "file 2, capture 5, dismiss 7." Apply the stated disposition to those specific findings; every finding not named keeps its Recommended-column value.

For "dismiss," run `node "${CLAUDE_PLUGIN_ROOT}/bin/harness-health.js" mark "<payload.id>" declined --root .` so the same proposal doesn't reappear on a future firing.

For each survivor disposed as "File issue" (every payload if "Apply all recommended" was chosen and its Recommended value was `"File issue"`; only the individually-overridden ones otherwise), call `gh issue create`.

**Type expression branch** (canonical shape in `_shared/health-finding-shapes.md` — check that file when either changes to keep this skill's copy in sync with its three siblings). Read the project's `work-types` config key once before filing and branch — never re-probe mid-flow (`_shared/work-record.md`'s config-key table; the key is written by `/init`). `work-types: native` applies `payload.type` (always `task`) via GitHub's native Issue Type; `work-types: labels` adds the matching `type:task` label instead (the pair lives in `record.js`'s `TYPE_LABELS`):

```bash
# Example: an additive finding, work-types: native
gh issue create --title "<payload.title>" --body "<payload.body>" --type task \
  --label by:harness-health --label risk:low --label effort:low --label ready --label harness-health:additive

# Same finding, work-types: labels
gh issue create --title "<payload.title>" --body "<payload.body>" \
  --label by:harness-health --label risk:low --label effort:low --label ready --label harness-health:additive --label type:task
```

Apply the same branch to every payload regardless of classification/kind — a `restructural` payload's call carries `risk:medium`/`effort:high`/`harness-health:restructural` instead, and a `new-skill` payload's call carries only `by:harness-health`/`ready`/`harness-health:new-skill` (no scoring labels), per the mapping table above; only the `--type task` vs. `--label type:task` branch and the `--label` list change, never the underlying `gh issue create --title/--body`. This applies uniformly — CLAUDE.md findings, design-artifact findings, additive skill/rule patches, restructural patches, and new-skill candidates all file the same way. `/harness-health` never edits anything directly; matching `/code-health`, it only ever judges and files.

In `--dry-run` mode, print what would be filed or reopened, and the `gh` commands that would run, but do not call `gh`.

**Step 8 — SUMMARIZE.**

Report: which target(s) were audited (or that only the gap scan ran), how many findings were emitted, how many filed vs skipped by dedup. List any new issue URLs.

## Routine Configuration

`/harness-health` ships a routine template (`skills/harness-health/routine-template.yml`) designed for small, predictable sips: one target per run, so a scheduled firing is cheap and a skipped one is harmless. Instantiate it for the current project with:

```
/claude-tweaks:routine create harness-health
```

**Headless run flow:** SELECT(`next-target`) → JUDGE → validate-findings → file. A firing with nothing due (`target: null`, `gapScanDue: false`) is a cheap no-op.

Report-only, matching `/code-health` — every finding files as a `by:harness-health`-labelled, born-`ready` GitHub issue, with no `Edit` call anywhere in its documented workflow. Rotation cursors and the filing retry queue live on the durable `health-state` branch (`_shared/health-state.md`), surviving container recycling across scheduled firings — a skipped or failed firing does not lose progress.

**Confidence floor on headless firings.** This skill's own `validate-findings --min-confidence <low|med|high>` now mirrors `/code-health`'s `--min-risk` flag — a finding below the floor is held in the durable `remembered` cache instead of filed. `docs-health` closed the same gap the same way in the same pass; `journey-health` also closed it, but with a different mechanism (drops a below-floor finding for that run rather than holding it durably — see `_shared/health-routine-notes.md`). The routine template's default prompt omits `--min-confidence`, so a scheduled firing still files every surviving finding regardless of confidence by default, matching this skill's pre-existing behavior — pass `--min-confidence med` (or `low`) in a customized Routine prompt to intentionally quiet a noisy headless firing down to `/code-health`'s own default posture.

> **Billing note:** Routines run inside the subscription; verify automation-credit specifics against the live account. (Canonical text in `_shared/health-routine-notes.md` — shared with `/code-health`, `/docs-health`, and `/journey-health`.)

## Next Actions

Call `AskUserQuestion` with `question`: `"What's next?"`, `header`: `"Next step"`, `multiSelect`: `false`, and:

- Option 1 — `label`: `"Schedule a Routine"`, `description`: `"/claude-tweaks:routine create harness-health — schedule this as a recurring Routine"`. Suffix the label `(Recommended)` after a first standalone run confirms the output looks right.
- Option 2 — `label`: `"Audit one target"`, `description`: `"/claude-tweaks:harness-health --target <name> --kind <skill|rule|claude-md|design-artifact> — audit one specific target right now"`
- Option 3 — `label`: `"Backlog hygiene"`, `description`: `"/claude-tweaks:tidy — fold any filed harness-health issues into a backlog-hygiene pass"`

## Component-Skill Contract

`/claude-tweaks:harness-health` is a **standalone-only** skill — no invocation path exists from `/claude-tweaks:flow` or any other skill in this project today (`flow/SKILL.md`'s Allowed Steps table, workflow text, and Relationship table never mention `harness-health`). The `## Next Actions` block always renders. If a future orchestrator wraps this skill, that orchestrator must update this contract to state its own `$PIPELINE_RUN_DIR`-gated handoff; until then, treat parent invocation as not applicable.

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
| Splitting one recurring root cause into N near-duplicate issues instead of bundling | Floods the tracker with issues that are really one fix applied to N sections. Use `relatedSections` to cover every occurrence in a single finding instead. |
| Filing before presenting the interactive gate | The two-tier decision must run before any `gh issue create` call for new findings — see `_shared/health-filing-gate.md`'s placement rule. |
| Collecting findings from multiple `--budget > 1` targets into one shared `validate-findings` call | `validate-findings` advances the audit cursor for exactly one `--target`/`--kind` pair per invocation — a shared call across targets silently leaves N-1 of N targets' cursors stuck, re-selecting them as due again on the very next firing despite having just been judged. Run Step 6/7 once per target, per Step 1's multi-target instructions. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:wrap-up` | Step 7 (Skill Curation) applies the same `_shared/harness-health-analysis.md` procedure on a spec's changed skill files, and writes to the same cursor/cache state this skill reads and writes. |
| `/claude-tweaks:init` | Phase 6 (Update Mode skill patches) and Phase 3/1u's skill classification apply the same shared procedure on whole-codebase reconnaissance, sharing the same cursor/cache state. Update Mode also invokes this skill's `routine-relevance-analysis.md` directly to judge whether a project's instantiated cloud Routines are still relevant given recent skill changes — the only consumer of that file, and the only case where `/init` reaches into a harness-health-owned analysis file outside this skill's own SELECT/JUDGE/FILE pipeline. |
| `_shared/harness-health-analysis.md` | The canonical judge this skill, `/wrap-up`, and `/init` all read — the 8-dimension check, evidence pre-checks, verify gate, patch format, and new-skill gate live there, not here. |
| `/claude-tweaks:tidy` | Step 4.8 sweeps `by:harness-health`-labelled issues alongside `by:code-health`-labelled ones, using the same stale/superseded triage. |
| `/claude-tweaks:backlog` | `/claude-tweaks:assess-agent-autonomy`'s `grant-check` mode (invoked from `refine` mode's grant sub-stage) reads this skill's finding body directly — including recognizing `harness-health:new-skill` findings from their "New skill candidate" body content, not from a label, since those findings carry no `risk:*`/`effort:*` labels at all. `additive`/`restructural` findings already carry colon-form `risk:*`/`effort:*` labels (this skill's own `issue-payload.js` co-emits them alongside the diagnostic label), which grant-check also reads as one input. `/claude-tweaks:backlog` never files or closes harness-health issues. |
| `/claude-tweaks:code-health` | Sibling health skill for code quality — one of the four recurring-sweep siblings (code-health, harness-health, journey-health, docs-health). Shares the unified work-record filing contract and `_shared/health-state.md`'s durable persistence, scoped to code instead of skill/rule/CLAUDE.md accuracy. |
| `/claude-tweaks:journey-health` | Sibling health skill for `docs/journeys/*.md` accuracy and agent-e2e coverage — same SELECT → JUDGE → VERIFY GATE → FINGERPRINT/DEDUP → FILE pipeline shape (journey-health's Step 3.6) and `_shared/health-state.md`'s durable persistence, scoped to journeys instead of skill/rule/CLAUDE.md accuracy. |
| `/claude-tweaks:docs-health` | Sibling health skill for `docs/**` (Diátaxis genre-drift + depth-mismatch + findability + staleness) — shares this skill's SELECT → JUDGE → VERIFY GATE → FINGERPRINT/DEDUP → FILE pipeline shape and `_shared/health-state.md`'s durable persistence, but scoped to a disjoint file set: docs-health's rotation pool only ever walks `docs/`, never `.claude/skills/**`/`.claude/rules/**`/CLAUDE.md. |
| `/claude-tweaks:routine` | `/routine create harness-health` instantiates this skill's `routine-template.yml` into a live, scheduled cloud Routine. |
| `/claude-tweaks:specify` | Harness-health findings are pre-specs — a filed `by:harness-health` issue body is `/specify`-shaped (Current State / Deliverables / Acceptance Criteria), so `/specify` consumes it with near-zero translation. |
| `_shared/health-filing-gate.md` | The canonical interactive file-all/route-individually gate this skill's Step 7 applies before calling `gh issue create` on new findings — shared with `/code-health`, `/journey-health`, and `/docs-health`. |
| `_shared/health-filing-mechanics.md` | The canonical retry-queue-drain and regressed-reopen shape this skill's Step 7 inlines (as `{BINARY}` = `harness-health.js`, `{PREFIX}` = `harness-health`) — shared with `/code-health`, `/journey-health`, and `/docs-health`. |
| `_shared/health-verify-gate.md` | The canonical adversarial-verify-gate question shape this skill applies via its embedded copy in `_shared/harness-health-analysis.md` — `/code-health`, `/docs-health`, and `/journey-health` each inline their own copy the same way. |
| `_shared/health-finding-shapes.md` | The canonical type-expression-branch and bundling-rule shape this skill's Step 5/Step 7 inline — shared with `/code-health`, `/journey-health`, and `/docs-health`. |
| `_shared/health-routine-notes.md` | The canonical text of this skill's Routine Configuration billing note, shared with `/code-health`, `/journey-health`, and `/docs-health` — and of the confidence-floor paragraph, shared with `/journey-health` and `/docs-health` now that all three (plus `/code-health`'s own `--min-risk`) have closed the gap it used to describe as open. |
