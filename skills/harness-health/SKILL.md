---
name: claude-tweaks:harness-health
description: Use when you want to check whether a project's harness documentation — `.claude/skills/*.md`, `.claude/rules/*.md`, and CLAUDE.md — still accurately describes the codebase, still conforms to its own origin template, and still follows best practices for getting the harness to perform well; or find a reusable pattern with no skill covering it. Runs standalone or on a schedule via a Routine. Never edits code — only harness documentation, and never auto-applies to CLAUDE.md. Keywords - harness health, skill health, skill drift, rule drift, CLAUDE.md drift, best practice, template conformance, new-skill gap, scheduled, routine.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a Next Actions block (context-specific numbered options with one recommended), not a navigation menu.

# Harness Health — Keep Skills, Rules, and CLAUDE.md Honest

A recurring watchman for `.claude/skills/*.md`, `.claude/rules/*.md`, and CLAUDE.md: picks one target to audit against the codebase (or the next new-skill gap to check for), judges it via the shared `_shared/harness-health-analysis.md` procedure, and either auto-applies a safe patch or files a `harness-health`-labelled GitHub issue. CLAUDE.md findings always file as an issue — never auto-applied. Never edits code — only harness documentation.

```
              [ /claude-tweaks:harness-health ] <- utility (no fixed lifecycle position)
                           |  picks a target via next-target; judges via the shared fragment
                           v
finding -> validate-findings -> auto-apply (skill/rule, additive+high-confidence+high-reversibility)
                              OR file GitHub issue (harness-health label; always for CLAUDE.md)
```

## When to Use

- You want skill, rule, and CLAUDE.md documentation to stay accurate between spec completions and full `/init` re-runs, without driving each check yourself.
- You want a scheduled Routine that periodically rotates through skills, rules, and CLAUDE.md and flags drift, structural decay, or best-practice gaps as they're found.
- You want to check one specific target right now (`--target <name> [--kind <skill|rule|claude-md>]`).

Not for: code-quality findings (`/claude-tweaks:recon`'s job — including cases where a rule's `paths:` glob is still correct but the code doesn't comply with it). Not a replacement for `/claude-tweaks:wrap-up` Step 7 or `/claude-tweaks:init`'s Update Mode — both consume the same shared procedure this skill does (currently against skills only), on their own scope models (a finished spec's diff; a whole-codebase reconnaissance) rather than this skill's churn/staleness rotation. Not for auditing memory (`~/.claude/projects/*/memory/`) — out of scope; see the harness-health design doc for why.

## Input

`$ARGUMENTS` may contain:

- `--target <id>` — manual override: audit one specific target directly, bypassing `next-target` selection.
- `--kind <skill|rule|claude-md>` — disambiguate `--target` when an id collides across kinds, or (without `--target`) restrict auto-selection to one kind.
- `--dry-run` — emit findings; never write cursor/cache state; never call `gh` or `Edit`.
- `--budget <n>` — audit up to `n` targets in one firing (default 1).
- `--root <dir>` — audit a project elsewhere (default: current working directory).

## Workflow

**Step 1 — SELECT: pick the next target(s).**

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/harness-health.js" next-target --root . ${TARGET:+--target "$TARGET"} ${KIND:+--kind "$KIND"} ${BUDGET:+--budget "$BUDGET"}
```

Without `--budget` (or `--budget 1`), prints `{ target: { kind, id, path, why } | null, gapScanDue: boolean }` — a single target. With `--budget <n>` where `n > 1`, prints `{ targets: [{ kind, id, path, why }, ...], gapScanDue: boolean }` instead — up to `n` targets, each a different id (possibly mixing kinds). When `targets` is present, run Steps 2-3 once per entry before moving on to Step 4 (gap scan runs once per firing regardless of budget, not once per target).

Read the `why` field on whichever target(s) came back:
- If both `target`/`targets` are empty and `gapScanDue` is `false`: nothing is due this firing. Report this to the user and stop.
- `why: "stale"` — this target has not been audited in over 90 days regardless of domain churn.
- `why: "hotspot"` — this target's domain paths (backtick-quoted references for skills/CLAUDE.md; the `paths:` frontmatter glob for rules) have the highest git churn since its last audit among targets with any churn at all.
- `why: "manual"` — `--target` was passed, bypassing selection.

If there is no target to deep-audit this firing (`target` is `null`, or `targets` is empty) but `gapScanDue` is `true`, skip straight to Step 4 (gap detection) — the gap scan is still due even with nothing else to audit.

**Step 2 — READ the target.**

Read the file at `target.path` in full. If none of `.claude/skills/`, `.claude/rules/`, or CLAUDE.md exist yet, report "no harness documentation to audit yet" and stop (this is a real state, not an error — a project that only ran `/init bootstrap`).

**Step 3 — JUDGE the target.**

Apply the full procedure in `_shared/harness-health-analysis.md` (the 8-dimension check, evidence pre-checks, verify gate, concrete gap signals — using `target.kind` to select which dimensions and origin-template references apply) to the target. Emit findings as a JSON array in the Finding Shape that file defines, with `assetType` set to `target.kind` and `target` set to `target.id`. Write the array to `/tmp/harness-health-findings.json`.

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

**Step 7 — APPLY or FILE.**

Each payload in `/tmp/harness-health-payloads.json` carries structured fields, not just the GitHub issue text — `id`, `kind`, `target`, `assetType`, `category`, `section`, `classification`, `confidence`, `reversibility`, `oldString`, `newString` are all present directly on the payload object (not just embedded in `payload.body`'s markdown).

For each payload:
- If `payload.assetType === 'claude-md'` — **always file it, regardless of classification/confidence/reversibility.** CLAUDE.md governs every future session's behavior; an unattended routine auto-editing it carries outsized blast radius compared to one skill's documentation. This overrides the additive/high/high rule below.
- Otherwise, if `payload.classification === "additive"`, `payload.confidence === "high"`, and `payload.reversibility === "high"` — apply it directly with `Edit` (using `payload.oldString`/`payload.newString` exactly), commit: `git commit -am "harness-health: apply additive patch to {target} ({section})"`, then mark it applied so it doesn't get re-proposed: `node "${CLAUDE_PLUGIN_ROOT}/bin/harness-health.js" mark "${payload.id}" applied --root .`.
- Otherwise (restructural patches, any new-skill candidate, lower confidence/reversibility, or any CLAUDE.md finding) — file it: `gh issue create --title "<payload.title>" --body "<payload.body>" --label harness-health --label "<payload.labels[1]>"`.

In `--dry-run` mode, print what would be applied/filed but do not call `Edit`, `git commit`, `gh`, or `mark`.

**Step 8 — SUMMARIZE.**

Report: which target(s) were audited (or that only the gap scan ran), how many findings were emitted, how many auto-applied vs filed vs skipped by dedup. List any new issue URLs. In interactive mode, present findings as a batch table and let the user route each to: apply now / file issue / dismiss. For "dismiss," run `node "${CLAUDE_PLUGIN_ROOT}/bin/harness-health.js" mark "<payload.id>" declined --root .` so the same proposal doesn't reappear on a future firing.

## Routine Configuration

`/harness-health` ships a routine template (`skills/harness-health/routine-template.yml`) designed for small, predictable sips: one target per run, so a scheduled firing is cheap and a skipped one is harmless. Instantiate it for the current project with:

```
/claude-tweaks:routine create harness-health
```

**Headless run flow:** SELECT(`next-target`) → JUDGE → validate-findings → apply/file. A firing with nothing due (`target: null`, `gapScanDue: false`) is a cheap no-op.

Additive+high-confidence+high-reversibility patches on **skills and rules** auto-apply and commit directly — this depends on the target project's CLAUDE.md already setting `auto-mode: default-on` (same situation `/tidy`'s routine is in, not `/recon`'s report-only case — see `_shared/auto-mode-contract.md`). Without that project policy, everything files as an issue instead of blocking on an unanswerable prompt. **CLAUDE.md findings always file as an issue, regardless of this policy.**

> **Billing note:** Routines run inside the subscription; verify automation-credit specifics against the live account.

## Next Actions

1. `/claude-tweaks:routine create harness-health` — schedule this as a recurring Routine. **(Recommended after a first standalone run confirms the output looks right.)**
2. `/claude-tweaks:harness-health --target <name> --kind <skill|rule|claude-md>` — audit one specific target right now.
3. `/claude-tweaks:tidy` — fold any filed `harness-health` issues into a backlog-hygiene pass.

## Component-Skill Contract

When `$PIPELINE_RUN_DIR` is set, `/claude-tweaks:harness-health` is running inside a pipeline (invoked by `/claude-tweaks:flow` or another pipeline orchestrator). In that case omit the `## Next Actions` block — the parent owns the handoff.

Direct invocation may pass `--source <parent-skill>` as an explicit fallback when ambiguity exists (rare; `$PIPELINE_RUN_DIR` is the primary signal). Standalone (no `$PIPELINE_RUN_DIR`) is the common case and renders Next Actions as usual.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Auto-applying a CLAUDE.md patch | CLAUDE.md findings always file as an issue for human review, regardless of classification/confidence/reversibility — it governs every future session's behavior, so an unattended bad edit has outsized blast radius. |
| Auto-applying a restructural patch (skill/rule) | Only additive+high-confidence+high-reversibility patches auto-apply — restructural changes always go through a filed issue for human review. |
| Treating a rule's low compliance ratio as automatic drift | A low adherence ratio can mean the code violates a still-correct rule (a `/recon` code-quality problem) rather than the rule being stale — always reason about *why* the ratio is low before emitting a finding. |
| Re-proposing a patch already marked `declined` in the cache | The decline-memory cache exists specifically so a rejected proposal doesn't reappear every firing forever. |
| Skipping the verify gate under time pressure | Unattended firings compound false positives into staged noise if a misread isn't caught before staging — the verify gate in `_shared/harness-health-analysis.md` is not optional. |
| Reading every sub-file of a candidate skill regardless of relevance | Some skills (`build`, `stories`, `init`) have many sub-files — exhaustive reads get expensive across a whole-library rotation. Bound reads by relevance. |
| Treating the local cache as durable state | The cache is a rebuildable optimization — GitHub issue state is the source of truth for cross-run memory, same as `/recon`. |
| Editing code to "fix" what a skill, rule, or CLAUDE.md describes | This skill only ever touches harness documentation, never the code it describes. |
| Proposing a "new-rule" or "new-claude-md-section" finding | Gap detection (proposing a brand-new artifact) is skill-only this phase — rules and CLAUDE.md only ever get `patch` findings against their existing content. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:wrap-up` | Step 7 (Skill Curation) applies the same `_shared/harness-health-analysis.md` procedure on a spec's changed skill files, and writes to the same cursor/cache state this skill reads and writes. |
| `/claude-tweaks:init` | Phase 6 (Update Mode skill patches) and Phase 3/1u's skill classification apply the same shared procedure on whole-codebase reconnaissance, sharing the same cursor/cache state. |
| `_shared/harness-health-analysis.md` | The canonical judge this skill, `/wrap-up`, and `/init` all read — the 8-dimension check, evidence pre-checks, verify gate, patch format, and new-skill gate live there, not here. |
| `/claude-tweaks:tidy` | Step 4.8 sweeps `harness-health`-labelled issues alongside `recon`-labelled ones, using the same stale/superseded triage. |
| `/claude-tweaks:routine` | `/routine create harness-health` instantiates this skill's `routine-template.yml` into a live, scheduled cloud Routine. |
