# Spec 22: /init — work-backend, Label Bootstrap, Types Probe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/init` provisions the unified record system: `work-backend` flag (replacing `backlog-backend`) under `## Work records`, the `probeCapabilities()` sub-step writing `work-types`/`work-links`, the 17-label provision-now offer, Update-Mode rename/re-probe rows, and Step 9 issue-form wording.

**Architecture:** Surgical edits to 4 init files. Step 15's recommendation logic (GHE-safe gate → silent `github-issues`, gate-fails prompt → choice) is UNCHANGED; only the flag name, section name, and the retired migration block change. The probe runs once at init and persists results as config — no skill re-probes mid-flow.

## Global Constraints

- Work from: `/Users/thomasholknielsen/Code Workspaces/claude-tweaks/.claude/worktrees/flow-spec-13-23` — verify `pwd` + `git rev-parse --show-toplevel`.
- **Non-Goal guard:** no migration of live issues/labels and NO edits to this repo's own CLAUDE.md (`## Backlog integration` stays as-is here — Update-Mode *offers* the rename as a staged change on target projects; CLAUDE.md is never edited autonomously per the auto-mode contract).
- Init stays project-agnostic: no assumption the repo has legacy labels.
- The `.gitignore` prose near Step 15 (blanket-ignore incident guidance) must NOT be disturbed.
- Config keys by literal name: `work-backend: github-issues | local-files`, `work-types: native | labels`, `work-links: native | body-text` (from `_shared/work-record.md`'s config-key table). No aliases/env renames.
- Retiring vocabulary in the four touched files: `backlog-backend` survives ONLY in legacy-alias / Update-Mode-rename prose (AC 1); `inboxIssuePayload`/`parkedIssuePayload`/`backlog:category`/`backlog` label references → 0.
- No emojis; commit style; update any tests asserting init content in the same task.

## Content requirements

### Step 15 rewrite (`bootstrap-steps.md` ~:667-784, `SKILL.md` :132-135 + :382)

1. Retitle: `### Step 15 — Work-Record Backend (detailed procedure)`. Intro: work records (`/capture`, `/specify`, `/triage`, `/dispatch`, `/tidy`, health skills) are backed by GitHub issues or local record files (`specs/{id}-{slug}.md` via `local-store.js`). Same GHE-safe gate; gate-succeeds → silent `work-backend: github-issues`; gate-fails → the same 2-option prompt (option 2 wording: "Local record files (specs/{id}-{slug}.md, one file per record) — no GitHub dependency").
2. **Write the flag** to a `## Work records` CLAUDE.md section (`work-backend: github-issues`). Note: skills read `backlog-backend` as a read-only legacy alias until the later migration plan runs; a `## Backlog integration` section found on a target project is handled by Update-Mode's rename offer (below), never silently rewritten.
3. **NEW sub-step 15b — capability probe:** run `probeCapabilities({owner, repo, runner})` from `bin/lib/issues/capabilities-probe.js` via one `node -e` snippet (owner/repo from `gh repo view --json owner,name`); write results beside the flag: `work-types: native` when `types` is true else `labels`; `work-links: native` when BOTH `subIssues` and `dependencies` are true else `body-text`. One sentence: filing/shaping skills branch on these keys and never re-probe mid-flow. Local-files backend → skip the probe, write `work-types: labels` + `work-links: body-text` (the fallback expressions are the only ones a file store supports).
4. **NEW sub-step 15c — label provisioning offer** (github-issues only): AskUserQuestion, default yes — "Provision all 17 core work-record labels now?" Option 1 (Recommended): run `_shared/label-bootstrap.md`'s canonical LABELS_JSON whole (the one caller allowed to use the full list — the file says so); Option 2: decline — lazy creation by each filing skill remains (both valid; say so). Cite `_shared/work-record.md` as the taxonomy home.
5. **Replace the "Existing-content migration" block** with a short note: pre-6.0 artifacts (`specs/backlog/` entries, `tier:*`/`status:*`/`backlog`-labelled live issues) are the separate migration plan's scope; until it runs, `/tidy` surfaces them (unsynced local records → Sync findings; retired-vocabulary issues → re-triage flags). Delete the `inboxIssuePayload`/`parkedIssuePayload`/milestone-judging prose entirely.
6. **Re-run behavior** paragraph: keyed to `work-backend` (no-op when set to `github-issues`; `local-files` → re-run gate, offer upgrade; missing → fresh-init handling). The dangling design-doc pointer (`2026-07-08-backlog-github-issues-design.md`) → `_shared/work-record.md`.
7. `SKILL.md` :132-135: rename the step line ("Work-Record Backend"; decide `work-backend`, probe capabilities, offer label provisioning); :382 summary-table row: `| Work records | Set work-backend / work-types / work-links in CLAUDE.md; offer 17-label bootstrap | Step 15 |`.

### Step 9 wording (`bootstrap-steps.md` ~:235-277)

8. Update the issue-form offer wording: the form's field set matches the RECORD spec shape (Current State / Deliverables / Acceptance Criteria — what the gate's re-verification checks); mention that when `work-types: native`, the form can set the issue Type; the template itself (`agent-task.yml` YAML) changes only if it names retired labels (inspect: if it applies `backlog`/`code-health` labels, update to no-labels-or-`by:*`-appropriate; if it applies none, leave the YAML).

### Update-Mode (`update-mode.md`)

9. Drift-table rows (staged offers, never silent CLAUDE.md edits): (a) `backlog-backend` present → offer rename to `work-backend` under `## Work records` (flag + section header, one staged change); (b) `work-types`/`work-links` missing while `work-backend: github-issues` → probe + offer the write; (c) every update pass re-probes capabilities and offers an update when drifted (org settings change). AC 4 needs rows (a) and (b) literally present.

### Summary templates (`summary-templates.md`)

10. Any backlog-integration summary line → work-records vocabulary (grep-driven).

### Cross-references

11. `SKILL.md` Anti-Patterns/Relationship: cite `_shared/work-record.md` by path (AC: cited ≥1); relationship rows for capture/tidy reference records vocabulary where they name the flag.

---

### Task 1: Apply the rewrite across the four init files

**Files:** `skills/init/bootstrap-steps.md`, `skills/init/SKILL.md`, `skills/init/update-mode.md`, `skills/init/summary-templates.md` (+ any test asserting init content — locate first)

- [ ] Step 1: Read the four files (bootstrap-steps: Steps 9 + 15 regions; SKILL.md: step lines + summary table + relationship; update-mode + summary-templates fully). Apply requirements 1-11.
- [ ] Step 2: Verify:
```bash
grep -n "backlog-backend" skills/init/*.md          # only legacy-alias/rename-offer prose (AC 1); the WRITE path emits work-backend
grep -c "work-backend" skills/init/bootstrap-steps.md   # ≥ 3
grep -n "work-types\|work-links" skills/init/bootstrap-steps.md skills/init/update-mode.md | head -8   # probe sub-step + drift rows (AC 2, 4)
grep -in "17" skills/init/bootstrap-steps.md | grep -i label   # provision offer (AC 3)
grep -n "inboxIssuePayload\|parkedIssuePayload\|backlog:category" skills/init/*.md   # 0
grep -c "work-record.md" skills/init/SKILL.md       # ≥ 1
grep -n "capabilities-probe" skills/init/bootstrap-steps.md   # snippet present
npm test 2>&1 | tail -3
```
- [ ] Step 3: Commit — `git add skills/init/ bin/lib/ && git commit -m "Provision the unified record system from init — work-backend flag, capability probe, 17-label offer"`

### Task 2: Spec-22 acceptance sweep

- [ ] Step 1: Re-run Task-1 greps + ACs 1-5 from the spec + `npm test` tail.
- [ ] Step 2: Fix findings (init files only), re-run until clean. Commit only if fixes: `Fix spec-22 acceptance sweep findings`
