# Skill Health — A Shared Skill-Accuracy Judge for Init, Wrap-Up, and a New Routine

**Date:** 2026-07-05
**Status:** Approved (brainstorm 2026-07-05)
**Origin:** Started as "extract routine-able functionality from `/init` and `/wrap-up`, following the recon/tidy/flow pattern." A whole-lifecycle survey narrowed the scope; the user then asked to go deeper on the surviving thread's underlying judgment logic and to unify it across all three consumers that touch it.

## Problem

`/claude-tweaks:init` (Update Mode) and `/claude-tweaks:wrap-up` (Step 7, Skill Curation) each independently judge whether a project's `SKILL.md` files still accurately describe the codebase, and each independently proposes patches or new-skill candidates. Both procedures are currently interactive-only, tied to a triggering context (init's whole-codebase reconnaissance; wrap-up's finished spec), and duplicate a large fraction of the same judgment logic (a 6-dimension accuracy check, a new-skill qualification gate, a patch format, quality gates) in two separate files (`skills/wrap-up/skill-curation.md` and `skills/init/skill-template.md`).

No mechanism currently keeps skill documentation honest *between* spec completions or full re-inits — a skill can drift silently for months if no spec happens to touch its domain and nobody re-runs `/init update --full`.

## Whole-lifecycle survey (why the scope is exactly this)

A survey of all 24 plugin skills for genuinely new, non-duplicative routine potential (i.e., clears the same bar recon/tidy/flow already clear: headless, unattended, zero conversation history, no in-progress work item as context) found:

| Finding | Why it's out |
|---|---|
| `deepen` / `simplify` proactive routines | Would duplicate recon's existing `architecture-depth`/`simplification` universal criteria — recon already applies these proactively. |
| `capture` / `challenge` | Conversational/debiasing by design — need a human in the loop. |
| `build` / `test` / `stories` / `review` / `reflect` / `journeys` | Spec-or-diff-scoped; no natural unattended trigger without an in-progress work item. |
| `visual-review` | Needs a live, reachable dev server — infra mismatch for a headless routine (recon/tidy/flow only need git+gh). |
| `help` / `design` / `ledger` / `browse` / `version` / `research` | Interactive dashboards, pure wrappers, or need a fresh user-supplied topic each time. |
| `specify` | Judgment-heavy design-doc decomposition; no natural batch/queue to sweep unattended. |
| **`init` Update Mode (CLAUDE.md/rules drift)** | Genuinely routine-shaped, but the user explicitly dropped this from scope during the brainstorm — see "Explicitly out of scope" below. |
| **`init`/`wrap-up` skill-accuracy judging** | **The only surviving, genuinely new, non-duplicative candidate.** This design covers it. |

## Architecture: one shared judge, three consumers

`skills/_shared/skill-health-analysis.md` becomes the single canonical procedure for "does this skill's content still match the codebase, and is there an uncovered reusable pattern that warrants a new one" — mirroring the existing pattern where `architecture-depth`/`simplification`/`review-quality` criteria live once in `_shared/` and are read by multiple skills (recon, deepen, simplify, review) with different scoping logic layered on top.

Three consumers share it, each supplying its own scope model and its own destination for findings:

| Consumer | Scope model | Findings destination |
|---|---|---|
| `/claude-tweaks:wrap-up` Step 7 | This spec's changed files + ledger/reflection seeds | Wrap-Up Review Console (existing) |
| `/claude-tweaks:init` Phase 3/6 | Whole-codebase Phase 2 reconnaissance | Init's Drift Report / Phase 9 confirmation (existing) |
| `/claude-tweaks:skill-health` (new) | Git-churn + staleness rotation, one skill-target per firing | `skill-health`-labelled GitHub issue, or direct auto-apply + commit for safe additive patches |

None of the three invoke each other — they independently read the same fragment text and share persistent rotation/dedup state (below), the same way recon/deepen/simplify/review independently read the same criteria text today.

## The shared fragment: `skills/_shared/skill-health-analysis.md`

Extracted and improved from today's `skills/wrap-up/skill-curation.md` (7.3-7.5) and `skills/init/skill-template.md` ("Update Mode" + "Quality Gates" sections). Ten improvements folded in during this brainstorm:

1. **Fingerprint + dedup cache** (`criterion/skill + section + normalizedDescription`, borrowing recon's `criterion+areaId+anchor` shape) — an unresolved proposal isn't re-staged every firing.
2. **Evidence-grounded stale-example check** — a deterministic `ls`/`grep` pass verifies referenced file paths/commands still exist before the judge weighs in (same "tools as evidence" idea recon already uses).
3. **Explicit adversarial verify gate** before staging — real? actionable? reproducible? (recon's three questions), catching misreads before they become staged noise.
4. **Tightened patch format** — exact, unique `old_string`/`new_string` blocks (not paraphrased "Current/Proposed" prose), required for the additive+high-confidence auto-apply path to actually apply reliably via the `Edit` tool.
5. **Rotation/staleness fallback** (90-day default) — catches drift caused by changes *outside* a skill's own file domain (e.g., a documented dependency removed elsewhere), not just in-domain churn.
6. **Decline-memory cache** — a patch the user already rejected doesn't reappear every firing forever (same failure mode recon already solved via its cache + reopen logic).
7. **Quantified convention-drift signal** — grep a documented pattern's usage count across the codebase instead of relying purely on impression.
8. **Concrete new-skill-gap signals** — new top-level directory with N files sharing a naming pattern, a recurring import combo, etc. — instead of pure "cohesive pattern" judgment.
9. **Bounded sub-file reads** — read sub-files by relevance, not "read the top-5 candidate skills in full" (some skills, e.g. `build`/`stories`/`init`, have many sub-files; exhaustive reads get expensive across a whole-library sweep).
10. **Churn-report-style diagnostic** — flag when a large fraction of skills flip status between runs (recon's `churn-report` idea), signaling criteria/anchor drift or a large refactor rather than real findings.

The fragment retains the existing 6-dimension check (pattern accuracy, convention drift, missing patterns, stale examples, anti-pattern gaps, decision-framework completeness) and the ≥2-of-3 new-skill qualification gate (reusability/complexity/project-specificity), both carried over from today's `skill-curation.md` largely as-is.

## New skill: `/claude-tweaks:skill-health`

A new utility skill (no fixed lifecycle position, like recon/tidy/flow). Report-mostly with a narrow write path: judges skill documentation, never touches code.

**Persistent state** (`.claude-tweaks/skill-health/`):
- `cursors.json` — per-skill `{ lastAuditedSha, lastAuditedMs }`, plus one global `gapScanCursor: { lastScannedSha, lastScannedMs }` for new-skill gap detection (not tied to any single skill's domain). Written by all three consumers (see integration sections below), not just the routine.
- `cache.json` — fingerprint → `{ status: staged|applied|declined, lastSeenMs }`, shared across all three consumers.

**Engine:** `bin/skill-health.js` + `bin/lib/skill-health/*.js`, mirroring recon's separation of concerns — the engine owns cursor selection, fingerprinting, and dedup/decline math (unit-tested); the skill owns LLM judgment and is the only thing that calls `gh`.

**Selection logic per firing** ("next-target", same shape as recon's `next-slice`):
1. Score every skill by churn (commits touching its domain files since `lastAuditedSha`) and staleness (days since `lastAuditedMs`, 90-day fallback).
2. Pick the highest-churn skill, or the stalest one if nothing has changed recently (`why: "hotspot"` vs `why: "stale"`).
3. Separately, check the global gap-scan cursor — if enough commits/time have passed, run new-skill gap detection over the commit range since `lastScannedSha`, independent of step 2's pick.
4. Run `skill-health-analysis.md` against whatever was selected.
5. Every finding passes through the fingerprint+dedup+decline-memory cache before staging/filing/auto-applying.

**Budget & cadence:** default 1 skill-target per firing (recon's "small, predictable sips" philosophy). With ~24 skills in this repo, a daily cadence cycles the full library roughly every 3-4 weeks; the 90-day staleness fallback guarantees no skill goes unaudited indefinitely regardless of churn locality.

**Output:** additive + high-confidence + high-reversibility patches auto-apply and commit (`Edit` in `allowed_tools`). Restructural patches and all new-skill candidates always file as a `skill-health`-labelled GitHub issue (recon's `gh issue create` + fingerprint-marker dedup pattern), never auto-created.

**`$ARGUMENTS`:**
- `--skill <name>` — manual override, audit one specific skill directly, bypassing `next-target` selection.
- `--dry-run` — emit findings; never write cursor/cache state; never call `gh` or `Edit`.
- `--budget <n>` — audit up to `n` skill-targets in one firing (default 1).

**Error handling:** `gh` unavailable/no remote → skip issue filing, log to stderr, findings stay in the local cache for next time (recon's existing pattern). No skills exist yet → report "nothing to audit," not an error. Auto-apply attempted without `auto-mode: default-on` set on the target project → falls back to filing everything as an issue rather than blocking on an unanswerable interactive prompt.

**`routine-template.yml`:**

```yaml
template_version: 1
routine_name: skill-health-daily
prompt: "/claude-tweaks:skill-health"
model: claude-sonnet-5
allowed_tools: [Bash, Read, Grep, Glob, Edit]
mcp_connections: []
default_schedule:
  cron_expression: "0 5 * * *"
  description: "off-peak anchor, UTC — confirm against your local timezone at creation time"
notes: >
  Unlike recon, skill-health has a genuine stage-vs-auto-apply decision (additive +
  high-confidence patches auto-apply; everything else files as an issue) — the same
  situation tidy is in, not recon's report-only case. A bare firing has zero conversation
  history and no CLI arg to signal auto mode, so this routine only auto-applies safely when
  the target project's CLAUDE.md already sets `auto-mode: default-on`; otherwise it degrades
  to filing everything as an issue instead of blocking. See auto-mode-contract.md.
```

## Wrap-up integration

`skills/wrap-up/skill-curation.md` becomes a thin wrapper:

- **7.1 (seed gathering)** and **7.2 (independent scan/domain-ranking)** stay as-is — spec-scoped concepts the shared fragment doesn't need to know about.
- **7.3-7.5** change from an inline copy to "apply the procedure in `_shared/skill-health-analysis.md`."
- **7.6 (stage-or-present into the Wrap-Up Review Console)** stays in wrap-up.
- **New:** after analyzing a skill, wrap-up writes that skill's `lastAuditedSha`/`lastAuditedMs` into the shared `cursors.json`, and reads/writes the shared `cache.json` for dedup+decline-memory — so a patch staged (or declined) via wrap-up is honored by init and the routine, and vice versa.

## Init integration

- **Phase 6, "patch a drifted existing skill"** — replaces `skill-template.md`'s own "Update Mode" and "Quality Gates" sections with a reference to `_shared/skill-health-analysis.md`, picking up the tightened patch format and shared quality gates.
- **Phase 3/Phase 1u's skill-specific classification** (covered/stale/drifted/gap — for the *skills* portion of the inventory only, not CLAUDE.md/rules) — now applies the shared fragment's 6-dimension check as its judging criteria.
- **Cursor participation** — Phase 6 writes to the same `cursors.json` wrap-up and the routine write to. Phase 1u/Phase 3, when classifying skills, check that cursor first — a skill recently audited by skill-health or wrap-up is marked "recently verified" and skipped rather than re-judged from scratch, saving Phase 2 reconnaissance cost.
- **Stays entirely in init, untouched:** Phase 6's Initial-Mode from-scratch skill generation (not a drift/patch judgment), and Phase 4's Frequency+Complexity+Danger scoring rubric (a different purpose — breadth-first prioritization across many candidates at once, not qualifying a single incidentally-discovered gap).
- CLAUDE.md/rules drift logic is untouched — out of scope (see below).

## Tidy integration

Extend `_shared/github-pr-scan.md` (already generalized for `recon`-labelled issues) to also sweep `skill-health`-labelled issues in tidy's Step 4.8 — same stale/superseded triage, same batch table. Avoids a second orphaned issue label nobody triages.

## Cross-references requiring updates (bidirectional convention)

- `CLAUDE.md`: utility skill list and skill count (24 → 25).
- `README.md` and `/help`'s `reference-card.md`/command-map: add `/claude-tweaks:skill-health`.
- `/claude-tweaks:routine`'s Relationship table: add `skill-health` as a fourth consumer (alongside recon/tidy/flow).
- `skills/wrap-up/SKILL.md` and `skills/init/SKILL.md` Relationship tables: add `skill-health` and `_shared/skill-health-analysis.md` rows (bidirectional).

## Testing approach

`bin/lib/skill-health/*.js` gets `node --test` coverage for the deterministic parts — cursor/next-target selection, fingerprinting, dedup/decline-cache transitions — mirroring `bin/lib/recon/tests/`. The LLM-judgment half (the 6-dimension check itself) isn't unit-testable; verified via `--dry-run` runs during development, same convention recon already established.

## Explicitly out of scope

- **CLAUDE.md/rules drift auditing** ("config-drift") — considered as a paired routine alongside skill-health during this brainstorm, then explicitly dropped. Init's Phase 1u.5 contract-drift detection and CLAUDE.md-specific inventory checks remain entirely manual (`/init update`), unchanged by this design.
- **A cross-project skill-health rollup** — no mechanism to see skill-health status across every project it's instantiated in; `RemoteTrigger {action: "list"}` already gives this ad hoc if ever needed, same as the routine-template design's own deferred item.
- **Auto-applying restructural patches or new-skill creation** — always human-reviewed via a filed issue, never auto-applied, regardless of confidence.
