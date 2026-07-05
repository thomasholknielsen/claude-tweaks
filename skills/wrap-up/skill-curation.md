# Skill Curation — full procedure

Wrap-Up Step 7. Analyze whether project skills need updating, and whether the work warrants a **new** skill — based on what was actually built. Runs standalone (not batched with Step 6) because skill curation requires reading and comparing full skill files — a heavier weight of analysis than the doc/CLAUDE.md scans.

**Core principle: this step *generates* candidates from the work itself — it does not merely filter whatever upstream producers tagged.** Ledger entries and reflection insights are **seeds** that focus the analysis, not the gate that decides whether it runs. Even with zero seeds, the independent scan (7.2) inspects the skills whose domain overlaps the changed files, and gap detection looks for reusable patterns no skill covers.

## 7.1: Gather Seeds

1. Read ledger entries with phase `build/skill` (from /build Step 4.5) or `review/skill` (from /review lens 3a), plus any ledger entry whose body contains a `[skill: …]` tag (from /reflect findings under phases `review/hindsight`, `wrap-up`, or `reflect`).
2. Check reflection insights (SKILL.md Step 3) tagged for skill destinations.
3. Collect the seeds as `{skill name | NEW — name} ← {source}` pairs.

Seeds are inputs, not gates. **Proceed to 7.2 regardless of how many seeds exist — including zero.** A skill audit that runs only when something was pre-tagged is the failure mode this procedure exists to fix.

## 7.2: Independent Scan (generation)

> **Parallel execution:** Use parallel tool calls aggressively — the changed-file list and the ranked skill reads are independent and should run concurrently.

Regardless of seeds, look at the work itself:

1. **List changed files** — `git diff --name-only` against the work's base ref.
2. **List skills** — enumerate skill files in `.claude/skills/`. If the directory doesn't exist, still run step 4 (gap detection) — a project with no skills is the strongest case for a first one.
3. **Rank by domain overlap** — score each skill by how much its domain (the directories, file-types, and patterns it documents) intersects the changed files. Read the **top ~5 most relevant** skills in full. The cap bounds token cost; the ranking ensures the highest-value skills are covered. If more than 5 skills are relevant, **note the overflow explicitly** — `/claude-tweaks:tidy` and future wrap-ups pick up the remainder (never silently truncate).
4. **Gap detection** — identify any *cohesive* set of changed files implementing one reusable pattern in a domain that **no** skill covers. "Cohesive" means multiple files implementing a single pattern, not scattered one-off edits. Each cohesive uncovered domain becomes a new-skill gap candidate, evaluated in 7.4.
5. **Union with seeds** — add any seeded skills from 7.1 not already in the top-5 to the read set. Seeds are always analyzed.

## 7.3-7.5: Judge Each Relevant Skill and New-Skill Candidates

Apply the full procedure in `_shared/skill-health-analysis.md` (Steps 1-6: evidence pre-checks, the 6-dimension check, new-skill gap detection, the new-skill qualification gate, the verify gate, and quality gates) to every skill in the read set (seeded + scanned from 7.2) and to any new-skill candidates discovered there. That file is the single canonical procedure — also read by `/claude-tweaks:init` (Phase 3/6) and the standalone `/claude-tweaks:skill-health` routine — so a skill's drift verdict doesn't depend on which of the three ever looked at it.

Emit findings in the Finding Shape that file defines. A proposed new-skill candidate is **never auto-created** — it is always staged for an explicit decision (7.6). For approved candidates, note the skill name and scope; the actual skill file is created during SKILL.md Step 10 execution.

**Record the audit.** For each skill analyzed in this pass — whether or not a patch was proposed — record it in the shared cursor so `/claude-tweaks:skill-health`'s rotation and `/claude-tweaks:init`'s classification skip a skill wrap-up just reviewed:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/skill-health.js" validate-findings <findings-for-that-skill.json> --root . --skill <skill-id>
```

An empty findings array is valid here — it still records `lastAuditedSha`/`lastAuditedMs` for that skill.

## 7.6: Stage or Present

**Auto mode (pipeline run dir exists):**

For each proposed change:

1. Classify as **additive** (new examples, new anti-patterns, new section appended) or **restructural** (changing existing wording, moving content, renaming sections, splitting/merging skills).
2. **Additive + reversibility:high + confidence:high** → auto-apply now. Commit. This rule applies whether or not a ledger entry seeded the change. Log entry:
   ```
   AUTO 14:52:24 — Step 7: applied additive update to {skill}/SKILL.md ({section}). Reversibility: high; commit: {hash}.
   ```
3. **Restructural OR confidence:med-low** → stage as `staged/wrap-up-skill-{N}.md` containing the Update Mode patch. Log entry:
   ```
   STAGED 14:52:31 — Step 7: skill update proposed for {skill}/SKILL.md ({section}). Reversibility: high (stage path: staged/wrap-up-skill-{N}.md).
   ```
4. **New skill candidates** (7.4) → always stage (creating a new skill is a structural decision). Log entry:
   ```
   STAGED 14:52:38 — Step 7: new skill candidate "{name}". Reversibility: high (stage path: staged/wrap-up-skill-new-{name}.md).
   ```

Staged items surface at the Wrap-Up Review Console (SKILL.md Step 8.6) as rows in the "Skill updates" section. New-skill candidates appear as ordinary rows covered by "Approve all." Do not present a separate batch decision here.

Declare **"No skill updates needed"** only when 7.1 found no seeds, 7.2's scan found no relevant skills and no gap candidates, and 7.4 produced no candidates. Do not declare it merely because no ledger entries were tagged.

**Interactive mode:** Present the dedicated batch decision table:

```
### Skill Updates

| # | Skill | Section | Change | Source |
|---|-------|---------|--------|--------|
| 1 | {skill name} | {section} | {change description} | {ledger entry / reflection insight / changed-file scan} |
| 2 | {skill name} | {section} | {change description} | {source} |
| 3 | NEW: {name} | — | Create new skill | {seed or independent gap scan} |

1. Apply all **(Recommended)**
2. Override specific items (tell me which #s to change)
```

Below the table, show the full Update Mode patches for each row so the user can see exactly what will change.

Wait for resolution before proceeding to SKILL.md Step 8 (interactive mode only).
