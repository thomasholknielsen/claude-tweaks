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
- Contract markers: {pipeline-section | auto-mode-flag | bookend | auto-mode-policy | run-dir} — {present/missing for each}
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
| `## Auto-mode policy` block (lever count matches `claude-md-template.md`'s block — see there, not restated here) | `^## Auto-mode policy` in CLAUDE.md | v4.6+ | `claude-md-template.md` Auto-mode policy block |
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
as bootstrap Step 15b.

### Maturity Drift

Like the Work-Record Backend Drift check above, maturity drift isn't a row in the
Phase 1u.5 marker table — that table checks for presence/absence of contract
markers, while this checks whether a *value* has changed. Unlike every other
drift check in this file, it can only be detected as part of a full
reconnaissance pass, never the early-exit fast path (Phase 1u.6): re-detecting
maturity requires re-running Phase 2h, and Phase 1u.6's own early-exit decision
is made *before* Phase 2 ever runs. This entry therefore never contributes to
Phase 1u.6's preliminary drift count — it surfaces only in Phase 3's Drift
Report, once a full pass is already underway.

| Signal | Detection | Offer (staged) |
|---|---|---|
| A full pass's freshly re-confirmed maturity classification (Phase 3) differs from the `project.maturity` value already stored in `.claude-tweaks/policy.yml` | Compare Phase 3's newly confirmed classification against the stored `policy.yml` value read into the inventory at Phase 1u | Offer to update `policy.yml`'s `project.maturity` line to the newly confirmed value — routed through the same Drift Report batch-approval as every other Contract Drift entry, never a silent write |

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

   Contract markers (claude-tweaks v{X.Y}+): pipeline section, auto-mode flag, bookend paragraph, auto-mode policy block, run-dir reference — all present.

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
