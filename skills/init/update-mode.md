# Update Mode — Audit Procedures

Loaded by `/init` Phase 1 when existing config is detected. Covers the Update Mode inventory (Phase 1u), contract-drift detection (Phase 1u.5), the early-exit fast path (Phase 1u.6), and the Phase 4 scoring approach for gaps.

## Phase 1u: Audit Existing Configuration

Build an inventory of what's currently configured before scanning the codebase:

```markdown
## Existing Configuration Inventory

### CLAUDE.md
- Lines: {count}
- Stack table: {lists these technologies}
- Commands: {lists these scripts}
- Conventions: {count} bullets
- Don'ts: {count} items
- Contract markers: {pipeline-section | auto-mode-flag | bookend | run-dir} — {present/missing for each}
- Last meaningful edit: {git log for CLAUDE.md — when, what changed}

### policy.yml
- `project.maturity`: {value, or "not set" if the key is absent}

### Skills ({count})
| Skill | Description trigger | Key file paths referenced |
|-------|-------------------|--------------------------|
| {name} | {from description field} | {paths mentioned in body} |

### Rules ({count})
| Rule | Scoped to | Content summary |
|------|-----------|-----------------|
| {name} | {paths} | {1-line summary} |
```

Then proceed to Phase 2 as normal — but carry this inventory forward. Every Phase 2 finding will be compared against the inventory to classify it as:

- **Covered** — existing config accurately describes this
- **Stale** — existing config references something that has changed or no longer exists
- **Drifted** — existing config describes a pattern but the codebase has moved away from it
- **Gap** — codebase has this pattern but no config covers it

## Phase 1u.5: claude-tweaks Contract Drift

Existing CLAUDE.md files may pre-date claude-tweaks contract changes (auto-mode, bookend architecture, etc.). Detect missing contract sections so Update Mode can offer pre-filled patches.

> **Parallel execution:** Use parallel tool calls aggressively — all marker checks below are independent and should run concurrently.

| Marker | Grep target | Contract version | Patch source |
|---|---|---|---|
| `## claude-tweaks Pipeline` section | `^## claude-tweaks Pipeline` in CLAUDE.md | v4.0+ | `claude-md-template.md` Initial Mode template |
| Auto-mode flag (`auto-mode: default-off` / `default-on`) | `auto-mode:` in CLAUDE.md | v4.5+ | `claude-md-template.md` Project Defaults block |
| Bookend architecture paragraph | `Bookend architecture` in CLAUDE.md | v4.6+ | `claude-md-template.md` Pipeline section |
| Pipeline run directory reference | `pipelines/{run-id}` in CLAUDE.md | v4.6+ | `claude-md-template.md` Pipeline section |

For each missing marker, record a **Contract Drift** entry with the suggested patch — the body comes verbatim from `claude-md-template.md`, so no creative writing required. Carry these forward into the Drift Report (Phase 3) under a dedicated "Contract Drift" section so the user can approve them as a batch alongside other CLAUDE.md patches.

If all markers are present, record "Contract: up to date (v4.6+)" in the inventory and skip ahead.

### Work-Record Backend Drift

The work-record backend (`work-backend` / `work-types` / `work-links`) predates a
versioned contract tag, so it isn't a row in the marker table above — but its drift
is detected the same pass and counts identically toward the Total drift count in
Phase 1u.6 below (treat entries from this table as additional Contract Drift
entries from 1u.5). All three rows are **staged offers** — never a silent CLAUDE.md
edit, per the auto-mode contract's rule that CLAUDE.md is never edited
autonomously.

| Signal | Detection | Offer (staged) |
|---|---|---|
| Legacy `backlog-backend:` flag present, no `work-backend:` line | `backlog-backend:` found under `## Backlog integration` in CLAUDE.md | Offer the rename: write `work-backend: {same value}` under a new `## Work records` section, replacing `## Backlog integration` — one staged patch (flag + section header together) |
| `work-backend: github-issues` present but `work-types` and/or `work-links` missing | Absence of `work-types:` / `work-links:` lines alongside a present `work-backend: github-issues` | Run `probeCapabilities()` (`bin/lib/issues/capabilities-probe.js`) and offer to write the missing key(s) |
| `work-backend: github-issues` with both `work-types` and `work-links` already present | — | Every full Update-Mode pass re-probes capabilities (`probeCapabilities()`) and offers a patch when the result has drifted from what's recorded (e.g. the org enabled Issue Types since the last run) |

`work-backend: local-files` needs no probe on any of these rows — its
`work-types: labels` / `work-links: body-text` fallback is unconditional, the same
as bootstrap Step 17b.

### Maturity Drift

Like the Work-Record Backend Drift check above, maturity drift isn't a row in the
Phase 1u.5 marker table — that table checks for presence/absence of contract
markers, while this checks whether a *value* has changed. Unlike every other
drift check in this file, it can only be detected as part of a full
reconnaissance pass, never the early-exit fast path (Phase 1u.6): re-detecting
maturity requires re-running Phase 2h, and Phase 1u.6's own early-exit decision
is made *before* Phase 2 ever runs. This entry therefore never contributes to
Phase 1u.6's preliminary drift count.

Unlike Contract Drift and Work-Record Backend Drift, this is not a separate
staged offer requiring its own approval — Phase 3's existing Project
Classification gate already IS the approval step for whatever maturity value
gets written (see `phase-3-classification.md`'s "Writing project.maturity to
policy.yml"), whether or not that value has changed since the last run. What
this check adds is *visibility*: when the value read into the Phase 1u
inventory (`### policy.yml` above) differs from what Phase 3 goes on to
confirm, note that specific change in Phase 9's Actions Performed
Classification row (e.g. "Confirmed maturity `established` (changed from
`early-production`), doc tier `{N}`") rather than the Drift Report — the
Drift Report's own Contract-Drift and Stale/Drifted/Gaps batches are already
presented and resolved earlier in this same phase, before Phase 3's
classification gate produces the value this comparison needs, so it is no
longer an open surface by the time this comparison is computable.

| Signal | Detection | Surfacing |
|---|---|---|
| The `project.maturity` value read into the Phase 1u inventory differs from the classification Phase 3 goes on to confirm | Compare the Phase 1u inventory's stored value against Phase 3's freshly confirmed classification, once Phase 3 completes | Note the change in Phase 9's Actions Performed Classification row (see `SKILL.md`'s Phase 9 Actions Performed table); the write itself happens via Phase 3's existing confirmation gate, not a separate approval here |

### Auto-Mode-Policy Migration

Existing projects initialized before the policy-schema consolidation may have
CLAUDE.md's retired `## Auto-mode policy` block still present (8 lever lines —
see `_shared/policy-schema.md`'s "Auto-mode levers" section for the full list).
`claude-tweaks:init` no longer generates this block for new projects; this
check offers existing projects a one-time cleanup.

Run:

```bash
node -e "const {auditPolicy}=require(process.env.CLAUDE_PLUGIN_ROOT+'/bin/lib/policy-schema.js'); console.log(JSON.stringify(auditPolicy(process.cwd())))"
```

If `legacyClaudeMdLevers` is empty, record "Auto-mode policy: already migrated or never present" in the inventory and skip the rest of this section — no prompt.

Otherwise, for each entry, the recommendation is:
- `isValid: false` → **flag, don't move**: report "`{key}: {value}` isn't a recognized value — fix or remove it" and leave the CLAUDE.md line untouched. Never silently relocate a broken value into `policy.yml`.
- `isValid: true, matchesDefault: true` → **delete** the line from CLAUDE.md. Pure cleanup — dual-read already falls through to the same default either way, so this is a zero-behavior-change removal.
- `isValid: true, matchesDefault: false` → **move to `policy.yml`**: append `{key}: {value}` to `.claude-tweaks/policy.yml` (creating the file/directory if absent), then delete the line from CLAUDE.md. Preserves the project's override.

Present via the standard batch-table convention (`AskUserQuestion`, per the root CLAUDE.md's Multi-item Decisions rule):

- `question`: `"{N} legacy Auto-mode policy line(s) found in CLAUDE.md. Clean these up? Levers at their default get deleted; overrides move to .claude-tweaks/policy.yml."`, `header`: `"Policy cleanup"`, `multiSelect`: `false`
- Option 1 — `label`: `"Apply all recommended (Recommended)"`, `description`: `"Delete {D} default-valued line(s), move {M} override(s) to policy.yml{, flag {F} invalid value(s) if F > 0}."` (`D`/`M`/`F` are the counts of `isValid: true, matchesDefault: true` / `isValid: true, matchesDefault: false` / `isValid: false` entries — omit the flag clause entirely when `F` is 0)
- Option 2 — `label`: `"Override specific items"`, `description`: `"Choose per-line what happens to each of the {N} entries."`
- Option 3 — `label`: `"Skip entirely"`, `description`: `"Leave CLAUDE.md as-is — I'll clean it up myself later."`

On "Override specific items," follow up with the per-line choices as ordinary free-text in the next message (per the root CLAUDE.md's batch-table convention — the tool's `Other` field is a single answer to the batch question, not a per-item list).

On any outcome except "Skip entirely," apply the selected deletions/moves (invalid entries are only flagged, never touched), then log to `decisions.md` (or the inventory summary, if this project has no active pipeline run dir):
```
AUTO {time} — Update Mode: migrated {D + M} of {N} legacy Auto-mode policy line(s) off CLAUDE.md ({D} deleted at-default, {M} moved to policy.yml{, F flagged as invalid and left untouched if F > 0}).
```

This check runs once per Update Mode invocation and counts toward the Total drift count in Phase 1u.6 the same way Work-Record Backend Drift does — a non-empty `legacyClaudeMdLevers` result is one additional Contract Drift entry.

### Routine Drift

Unlike the checks above, this isn't a CLAUDE.md/policy.yml marker — it audits the project's
instantiated cloud Routines (`.claude-tweaks/routines/*.yml`) against the templates they were
created from. Skip this entire check if `.claude-tweaks/routines/` doesn't exist — nothing is
instantiated yet, most commonly a project that has never run `/claude-tweaks:routine create`.

Run `/claude-tweaks:routine status --all --source init`.

Each returned record resolves to one of five verdicts (see `skills/routine/SKILL.md`'s STATUS
`--all` mode for the full detection logic): In sync, Drifted, Orphaned, Stale, or Malformed.

- **In sync** records need no action — omit them from the presented table entirely.
- **Drifted** records are staged the standard way: present a batch table (Routine | Current →
  live template_version | Field drift | Recommended action: "Re-sync"), then call
  `AskUserQuestion`:
  - `question`: `"{N} routine(s) have drifted from their templates. Re-sync now?"`, `header`:
    `"Routine drift"`, `multiSelect`: `false`
  - Option 1 — `label`: `"Apply all recommended (Recommended)"`, `description`: `"Re-sync all
    {N} drifted routine(s) to their current templates, keeping each one's existing schedule"`
  - Option 2 — `label`: `"Override specific items"`, `description`: `"Choose per-routine what
    happens to each of the {N} entries"`
  - Option 3 — `label`: `"Skip entirely"`, `description`: `"Leave routines as-is — I'll re-sync
    manually later"`

  On "Apply all recommended," invoke `/claude-tweaks:routine update <skill>
  --defaults --source init` once per Drifted record. On "Override specific items," follow up
  with the per-item choices as ordinary free-text in the next message, per CLAUDE.md's
  Multi-item Decisions convention (not the tool's `Other` field). On any outcome except "Skip
  entirely," log to `decisions.md` (or the inventory summary, if this project has no active
  pipeline run dir):
  ```
  AUTO {time} — Update Mode: re-synced {M} of {N} drifted routine(s) to their current templates.
  ```
- **Orphaned**, **Stale**, and **Malformed** records are presented as flagged advisories
  only — no bulk auto-fix offered, since none has a safe default action (Orphaned suggests
  manual investigation — was the skill renamed, delete and recreate under the new name;
  Stale suggests the same delete-and-recreate recourse STATUS Step 2 already documents for a
  routine deleted out-of-band; Malformed requires a human to inspect and fix or delete the
  broken record file directly — there is no template or live routine to resync against).

This check's Drifted count (not Orphaned/Stale/Malformed, which have no auto-fix and so aren't
"drift a re-run of /init would resolve" in the same sense) counts toward Phase 1u.6's Total
drift count — treat each Drifted record as an additional Contract Drift entry for that count,
the same self-classifying convention Work-Record Backend Drift and Auto-Mode-Policy Migration
both already use, so Phase 1u.6's own "Contract Drift entries from 1u.5" formula picks it up
without that table needing its own edit.

### Routine Relevance

Skip entirely if `.claude-tweaks/routines/` doesn't exist (same gate as Routine Drift above).
Otherwise, read `${CLAUDE_PLUGIN_ROOT}/skills/harness-health/routine-relevance-analysis.md`
and apply its procedure directly against this project's instantiated records — this is the
one place `/init` reaches into a harness-health-owned file outside that skill's own
SELECT/JUDGE/FILE pipeline (see that file's own header for why).

Present any resulting rows directly, right here in Phase 1u.5 — matching the Auto-Mode-Policy
Migration subsection's own precedent above, this resolves immediately with no Phase 3
hand-off:

```
| Routine | Churn since created_at | Relevance note |
|---|---|---|
| {routine identity} | {N} commits, {date range} | {note} |
```

Resolve with a single acknowledge/defer choice, not a per-row apply (these are judgment calls
with no single mechanical fix, unlike Routine Drift's clean version-diff apply path):

- `question`: `"{N} routine(s) may be worth reconsidering given recent changes to their
  skills. Anything to act on now?"`, `header`: `"Routine relevance"`, `multiSelect`: `false`
- Option 1 — `label`: `"Acknowledged — I'll look into these myself (Recommended)"`,
  `description`: `"No changes made now; revisit manually (e.g. /claude-tweaks:routine update
  <skill> to adjust cadence/tools)"`
- Option 2 — `label`: `"Skip — not relevant"`, `description`: `"Dismiss this run's relevance
  notes entirely"`

Log this pass's outcome to `decisions.md` (or the inventory summary, if this project has no
active pipeline run dir) regardless of outcome: `SCANNED {time} — Routine Relevance: audited
{N} record(s), {M} surfaced for review.` (M may be 0 — log the scan even when nothing was
found, so there's a record the pass ran.)

This check does not count toward Phase 1u.6's Total drift count — like Maturity Drift above,
it isn't a presence/absence signal Phase 1u.6 can cheaply precompute before Phase 3 runs (it
requires reading git history and judging diffs, not checking a marker's existence).

## Phase 1u.6: Update Mode Early-Exit Gate

After Phase 1u (inventory) and Phase 1u.5 (contract drift) complete, evaluate the audit signal before committing to the full phase ceremony. Update Mode's value is in catching drift quickly — when there's almost nothing to catch, the ceremony costs more than it produces.

**Compute the audit totals from Phase 1u + 1u.5 so far:**

| Metric | Source |
|--------|--------|
| **Total drift count** | Contract Drift entries from 1u.5 + any stale/drifted entries from the 1u inventory pass |
| **Gap count** | Codebase patterns that have no existing config (initially zero — full Gap count is computed in Phase 3; this gate uses the preliminary signal from the inventory pass) |

**Early-exit criteria:**

- `$ARGUMENTS` contains `--full` → skip this gate entirely, go straight to the full pass (Phase 2 onward) regardless of drift/gap counts. This is the override the early-exit output text and `SKILL.md` both advertise as the way to force the complete reconnaissance pass.
- Otherwise: Total drift count = 0 **AND** preliminary gap signal < 3 → **early-exit fast path**

**On early-exit:**

1. Present the audit findings inline (one block, not a full phase summary). Enumerate what was verified — the early-exit must still answer "what did you check and find healthy?", just from the inventory + contract-marker passes (Phases 1u/1u.5), since Phases 2-8.5 were skipped:

   ```
   ### Update Mode — Quick Audit

   Config is current. No drift detected. {N} preliminary gap signals (below threshold).

   **Verified & Consistent**

   Environment & dependencies:
   - Superpowers: present · Code simplifier: available · agent-browser: installed (v{X.Y.Z})
   - Git repo: yes · Node: v{X} · Statusline: wired · Workflow dirs: present

   Contract markers (claude-tweaks v{X.Y}+): pipeline section, auto-mode flag, bookend paragraph, run-dir reference — all present.

   Inventory: {M} skills, {R} rules, CLAUDE.md ({L} lines) — all classified "covered" against the existing config.

   {if N > 0: list the N preliminary gap signals briefly with file paths}

   Skipping Phases 2-8.5 (full reconnaissance) — re-run `/init update --full` to force the complete pass.
   ```

   Only include lines for checks that ran; omit any the inventory pass did not compute.

2. Log to the active pipeline's `decisions.md` using the resolution order in `_shared/pipeline-run-dir.md`. `/init` is on the standalone-auto allowlist — if `PIPELINE_RUN_DIR` is unset and no recent run matches, create a standalone run dir at `.claude-tweaks/pipelines/{ISO-timestamp}-init-standalone/` and append the entry there. Never suppress the audit-log write.
   ```
   AUTO {ISO-time} — Phase 1u.6: early-exit (drift=0, gaps<3). Reason: Update Mode fast path per the Phase 1u.6 early-exit gate. Reversibility: high.
   ```

3. Skip directly to Phase 9 (Summary). Phase 9's summary template adapts: "Update Mode — no patches needed" instead of the full patch list.

**On full pass (criteria not met):** drift > 0 OR preliminary gap signal >= 3 → continue to Phase 2 (Codebase Reconnaissance) as normal.

The gate is automatic — no user prompt. The user always sees the audit findings, just without the ceremony when there's nothing to act on.

## Phase 4 in Update Mode: Score the Gaps

Update Mode runs Phase 4 only against **gaps** — patterns the codebase has that no existing config covers. Existing skills that need updating are handled as patches in Phase 6, not new skills.

Apply the standard Phase 4 scoring procedure (Frequency + Complexity + Danger; see `phase-4-scoring.md` in this skill's directory) to gap candidates only. Existing skills that were classified as **Drifted** in Phase 3 do not go through scoring — their patches are surfaced in the Drift Report's "Drifted" section.
