---
files:
  - plugin/skills/specify/SKILL.md
  - plugin/skills/specify/shaping-mode.md
  - plugin/skills/specify/next-mode.md
---

# Refuse to Shape a Decomposition Parent

**Persona:** A claude-tweaks maintainer grooming the backlog who runs `/claude-tweaks:specify #N` on a record that turns out to be a decomposition parent — either knowingly (cleaning up a past mis-shape) or by accident (17 open parents carry no "(parent)" in their titles).
**Goal:** The parent is never rewritten into spec shape or marked `ready`; any residue from a past mis-shape is cleaned; the maintainer is pointed at the actual buildable leaves instead.
**Entry point:** A Claude Code session at the project checkout, `work-backend: github-issues`, a `#N` reference in hand that resolves to a parent record.
**Success state:** The invocation stops with a message naming the parent and its leaves; the parent's labels carry no `ready`/`risk:*`/`size:*`/`ceremony:*`/`solution:unjustified`; a legacy unlabeled parent optionally gained its missing `parent-issue` label; nothing was silently shaped.

## Steps

### 1. Run /specify on a labeled parent — the hard stop
- **URL:** `/claude-tweaks:specify #416` (a record carrying `parent-issue`)
- **Action:** Reference the parent directly, as if it were an ordinary shaping target.
- **Should feel:** An immediate, unambiguous stop — no prompt to dismiss, no body rewritten — with a pointer worth following: the leaves from the body's `## Leaves` table when one exists, else the record's own issue URL where GitHub renders the native sub-issue list.
- **Should understand:** The `parent-issue` label (or, under `local-files`, the `isParentIssue` facet — the two are driver-exclusive, only one ever exists per record) is authoritative: no question is asked because there is nothing to decide. The pointer is static prose — the guard makes no extra API call to enumerate leaves. A parent carrying `needs:definition` also stops here — it never reaches the brainstorming redirect.
- **Red flags:** The parent's body rewritten into spec sections; `ready` stamped; an `AskUserQuestion` on an unambiguous labeled parent; the stop message suggesting a GraphQL query.

### 2. See past mis-shape residue cleaned without a click
- **URL:** the same stop message, when the parent carries `ready`/scoring from an earlier incorrect shaping
- **Action:** Read the strip report in the guard's output.
- **Should feel:** Repair, not ceremony — the wrong state (`ready`, `risk:*`, `size:*`, `ceremony:*`, `solution:unjustified`) is gone in the same breath, and the output says exactly which labels were removed.
- **Should understand:** "Silent" means unprompted, never unreported: the strip is always named in the output and logged as an `AUTO` entry when a pipeline run directory resolves. `type:*` and `priority:*` survive — they are legitimate on parents — and `auto:*`/`bot:*` are never touched (other skills' territory; the carve-out is recorded in `_shared/work-record.md`'s permission matrix, extracted to `_shared/work-record-permission-matrix.md` as of #1488 — `work-record.md` still resolves the same content via its own one-paragraph pointer).
- **Red flags:** A confirmation prompt for the strip; a strip that ran but went unmentioned; `type:feature` or a `priority:*` label removed.

### 3. Hit an unlabeled legacy parent — repair or escape
- **URL:** `/claude-tweaks:specify #140` (no `parent-issue` label, but the body carries a `## Leaves` table)
- **Action:** Answer the one `AskUserQuestion`: repair (Recommended — stamp `parent-issue` so future runs hit the authoritative tier, plus the same residue strip) or shape anyway (a sniff false-positive escape).
- **Should feel:** Trusted with the judgment call exactly once — the sniff is a line-anchored `## Leaves` heading match, strong evidence but not a marker, so a human confirms.
- **Should understand:** "Shape anyway" is deliberately one-shot: nothing is persisted, so the same question returns on any future invocation against the same record. Repairing converts the record permanently — the next run stops at tier 1 with no prompt.
- **Red flags:** The record shaped with no question asked; the escape persisting a suppress marker; prose merely *mentioning* the word Leaves triggering the sniff (the match is line-anchored).

### 4. Trigger the guard headlessly — refusal, not a hang
- **URL:** a `specify next` Routine firing, or `/claude-tweaks:capture`'s born-ready chain (`--chained`)
- **Action:** Nothing — nobody is present; the guard resolves the sniff tier conservatively on its own.
- **Should feel:** (Observed after the fact.) A clean, diagnosable refusal: the `next` firing reports the refusal as its outcome and exits; a `--chained` call returns the refusal as its output to the calling skill.
- **Should understand:** `next`'s eligibility filter already excludes labeled parents; the guard is the shaping-time backstop for the unlabeled-legacy gap, applied in `next-mode.md`'s `## Shape` step against the body already fetched. Headless tier-2 never prompts and never repairs — repair is a human decision.
- **Red flags:** A headless firing hanging on a question; a legacy parent shaped `ready` by a Routine; a refusal that leaves no trace in the firing report or decision log.

## Origin
- Created for #1071 (parent-record guard in /specify shaping mode; incidents #416 and #140)
- Related specs: #1071 (guard), #695/#705 (batch/range forms whose fail-all posture step 7 of the batch journey documents)
