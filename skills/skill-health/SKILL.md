---
name: claude-tweaks:skill-health
description: Use when you want to check whether a project's .claude/skills/*.md files still accurately describe the codebase, or find a reusable pattern with no skill covering it. Runs standalone or on a schedule via a Routine. Never edits code — only skill documentation. Keywords - skill health, skill drift, skill accuracy, new skill gap, scheduled, routine.
---
> **Interaction style:** Present decisions as numbered options so the user can reply with just a number. For multi-item decisions, present a table with recommended actions and offer "apply all / override." Never present more than one batch decision table per message — resolve each before showing the next. End skills with a Next Actions block (context-specific numbered options with one recommended), not a navigation menu.

# Skill Health — Keep the Skill Library Honest

A recurring watchman for `.claude/skills/*.md`: picks one skill to audit against the codebase (or the next new-skill gap to check for), judges it via the shared `_shared/skill-health-analysis.md` procedure, and either auto-applies a safe patch or files a `skill-health`-labelled GitHub issue. Never edits code — only skill documentation.

```
              [ /claude-tweaks:skill-health ] <- utility (no fixed lifecycle position)
                           |  picks a skill via next-target; judges via the shared fragment
                           v
finding -> validate-findings -> auto-apply (additive+high-confidence+high-reversibility) OR file GitHub issue (skill-health label)
```

## When to Use

- You want skill documentation to stay accurate between spec completions and full `/init` re-runs, without driving each check yourself.
- You want a scheduled Routine that periodically rotates through the skill library and flags drift as it's found.
- You want to check one specific skill right now (`--skill <name>`).

Not for: auditing CLAUDE.md or `.claude/rules/` (out of scope for this skill). Not for code-quality findings (`/claude-tweaks:recon`'s job). Not a replacement for `/claude-tweaks:wrap-up` Step 7 or `/claude-tweaks:init`'s Update Mode — both consume the same shared procedure this skill does, on their own scope models (a finished spec's diff; a whole-codebase reconnaissance) rather than this skill's churn/staleness rotation.

## Input

`$ARGUMENTS` may contain:

- `--skill <name>` — manual override: audit one specific skill directly, bypassing `next-target` selection.
- `--dry-run` — emit findings; never write cursor/cache state; never call `gh` or `Edit`.
- `--budget <n>` — audit up to `n` skill-targets in one firing (default 1).
- `--root <dir>` — audit a project elsewhere (default: current working directory).

## Workflow

**Step 1 — SELECT: pick the next target.**

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/skill-health.js" next-target --root . ${SKILL:+--skill "$SKILL"}
```

Prints `{ target: { id, path, why } | null, gapScanDue: boolean }`. Read the output:
- If `target` is `null` and `gapScanDue` is `false`: nothing is due this firing. Report this to the user and stop.
- If `why: "stale"`: this skill has not been audited in over 90 days regardless of domain churn.
- If `why: "hotspot"`: this skill's documented file paths (backtick-quoted references extracted from its own content) have the highest git churn since its last audit among skills with any churn at all.
- If `why: "manual"`: `--skill` was passed, bypassing selection.

If `target` is `null` but `gapScanDue` is `true`, skip straight to Step 4 (gap detection) — there's no specific skill to deep-audit this firing, but the gap scan is still due.

**Step 2 — READ the target skill.**

Read the skill file at `target.path` in full. If `.claude/skills/` doesn't exist at all, report "no skills to audit yet" and stop (this is a real state, not an error — a project that only ran `/init bootstrap`).

**Step 3 — JUDGE the target skill.**

Apply the full procedure in `_shared/skill-health-analysis.md` (6-dimension check, evidence pre-checks, verify gate, concrete gap signals) to the target skill. Emit findings as a JSON array in the Finding Shape that file defines. Write the array to `/tmp/skill-health-findings.json`.

**Step 4 — GAP SCAN (when due, per Step 1's `gapScanDue`).**

Apply `_shared/skill-health-analysis.md`'s new-skill gap detection over commits since the gap-scan cursor (or the whole repo, if this is the first-ever gap scan). Append any new-skill candidates to the same findings array from Step 3.

**Step 5 — GATHER OPEN ISSUES for dedup.**

```bash
gh issue list --label skill-health --state all --json number,state,labels,body --limit 500 > /tmp/skill-health-issues-raw.json
```

Parse each issue body for the fingerprint marker `<!-- skill-health-fingerprint: skillhealth-XXXXXXXX -->` and build an array of `{ number, state, labels, fingerprint }` objects. Write to `/tmp/skill-health-issues.json`. If `gh` is unavailable or the repo has no `skill-health` issues yet, skip this step and set `ISSUES_FILE=""` — the run dedups against the local cache only.

**Step 6 — VALIDATE, FINGERPRINT, DEDUP.**

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/skill-health.js" validate-findings /tmp/skill-health-findings.json \
  --root "${ROOT:-$PWD}" \
  ${ISSUES_FILE:+--issues "$ISSUES_FILE"} \
  ${SKILL_ID:+--skill "$SKILL_ID"} \
  ${GAP_SCAN_RAN:+--gap-scan} \
  ${DRY_RUN:+--dry-run} \
  > /tmp/skill-health-payloads.json
```

`SKILL_ID` is `target.id` from Step 1 (omit if Step 1 returned `target: null` and only the gap scan ran). `GAP_SCAN_RAN` is passed whenever Step 4 actually ran this firing. The command validates each finding, fingerprints via `skill + section + normalizedDescription`, dedups against open `skill-health` issues and the local cache, records the audit cursor for `SKILL_ID` (and the gap-scan cursor when `--gap-scan` was passed) unless `--dry-run`, and emits gh-ready payloads on stdout.

**Step 7 — APPLY or FILE.**

For each payload in `/tmp/skill-health-payloads.json`:
- If the underlying finding is `kind: "patch"` with `classification: "additive"`, `confidence: "high"`, and `reversibility: "high"` — apply it directly with `Edit` (using the finding's exact `oldString`/`newString`), then commit: `git commit -am "skill-health: apply additive patch to {skill} ({section})"`.
- Otherwise (restructural patches, any new-skill candidate, or lower confidence/reversibility) — file it: `gh issue create --title "<payload.title>" --body "<payload.body>" --label skill-health --label "<payload.labels[1]>"`.

In `--dry-run` mode, print what would be applied/filed but do not call `Edit`, `git commit`, or `gh`.

**Step 8 — SUMMARIZE.**

Report: which skill was audited (or that only the gap scan ran), how many findings were emitted, how many auto-applied vs filed vs skipped by dedup. List any new issue URLs. In interactive mode, present findings as a batch table and let the user route each to: apply now / file issue / dismiss.

## Routine Configuration

`/skill-health` ships a routine template (`skills/skill-health/routine-template.yml`) designed for small, predictable sips: one skill-target per run, so a scheduled firing is cheap and a skipped one is harmless. Instantiate it for the current project with:

```
/claude-tweaks:routine create skill-health
```

**Headless run flow:** SELECT(`next-target`) → JUDGE → validate-findings → apply/file. A firing with nothing due (`target: null`, `gapScanDue: false`) is a cheap no-op.

Additive+high-confidence+high-reversibility patches auto-apply and commit directly — this depends on the target project's CLAUDE.md already setting `auto-mode: default-on` (same situation `/tidy`'s routine is in, not `/recon`'s report-only case — see `_shared/auto-mode-contract.md`). Without that project policy, everything files as an issue instead of blocking on an unanswerable prompt.

> **Billing note:** Routines run inside the subscription; verify automation-credit specifics against the live account.

## Next Actions

1. `/claude-tweaks:routine create skill-health` — schedule this as a recurring Routine. **(Recommended after a first standalone run confirms the output looks right.)**
2. `/claude-tweaks:skill-health --skill <name>` — audit one specific skill right now.
3. `/claude-tweaks:tidy` — fold any filed `skill-health` issues into a backlog-hygiene pass.

## Component-Skill Contract

When `$PIPELINE_RUN_DIR` is set, `/claude-tweaks:skill-health` is running inside a pipeline (invoked by `/claude-tweaks:flow` or another pipeline orchestrator). In that case omit the `## Next Actions` block — the parent owns the handoff.

Direct invocation may pass `--source <parent-skill>` as an explicit fallback when ambiguity exists (rare; `$PIPELINE_RUN_DIR` is the primary signal). Standalone (no `$PIPELINE_RUN_DIR`) is the common case and renders Next Actions as usual.

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Auto-applying a restructural patch | Only additive+high-confidence+high-reversibility patches auto-apply — restructural changes always go through a filed issue for human review. |
| Re-proposing a patch already marked `declined` in the cache | The decline-memory cache exists specifically so a rejected proposal doesn't reappear every firing forever. |
| Skipping the verify gate under time pressure | Unattended firings compound false positives into staged noise if a misread isn't caught before staging — the verify gate in `_shared/skill-health-analysis.md` is not optional. |
| Reading every sub-file of a candidate skill regardless of relevance | Some skills (`build`, `stories`, `init`) have many sub-files — exhaustive reads get expensive across a whole-library rotation. Bound reads by relevance. |
| Treating the local cache as durable state | The cache is a rebuildable optimization — GitHub issue state is the source of truth for cross-run memory, same as `/recon`. |
| Editing code to "fix" what a skill describes | This skill only ever touches skill documentation, never the code the skill describes. |

## Relationship to Other Skills

| Skill | Relationship |
|-------|-------------|
| `/claude-tweaks:wrap-up` | Step 7 (Skill Curation) applies the same `_shared/skill-health-analysis.md` procedure on a spec's changed files, and writes to the same cursor/cache state this skill reads and writes. |
| `/claude-tweaks:init` | Phase 6 (Update Mode skill patches) and Phase 3/1u's skill classification apply the same shared procedure on whole-codebase reconnaissance, sharing the same cursor/cache state. |
| `_shared/skill-health-analysis.md` | The canonical judge this skill, `/wrap-up`, and `/init` all read — the 6-dimension check, evidence pre-checks, verify gate, patch format, and new-skill gate live there, not here. |
| `/claude-tweaks:tidy` | Step 4.8 sweeps `skill-health`-labelled issues alongside `recon`-labelled ones, using the same stale/superseded triage. |
| `/claude-tweaks:routine` | `/routine create skill-health` instantiates this skill's `routine-template.yml` into a live, scheduled cloud Routine. |
