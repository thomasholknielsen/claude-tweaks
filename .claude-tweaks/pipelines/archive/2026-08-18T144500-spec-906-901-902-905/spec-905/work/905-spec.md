---
record: 905
origin: human
risk: low
size: low
ceremony: fast-lane
grants: []
fingerprint: wrapup-objective-audit-fixes:tidy-backstop-scan-for-preserved-but-unfiled-upstream-feedba
surface: terminal
---
# 905: tidy: backstop scan for preserved-but-unfiled upstream feedback drafts

Surface: terminal

## Overview

When an upstream feedback filing fails at the Review Console (`/claude-tweaks:feedback`'s Step 8 `filing-failure` row), the draft is preserved as `staged/upstream-unfiled-{N}.md` — deliberately outside the `staged/wrap-up-upstream-*.md` glob the consoles re-enumerate, so a resume never re-files it. Correct for resume safety, but terminal for the draft: there is no automatic retry for upstream filings, run-dir archival preserves the file into `.claude-tweaks/pipelines/archive/{run-id}/staged/`, and nothing ever surfaces it again. Unless the user caught one report line at filing time, an approved, scrubbed, unfiled draft dies silently. This record adds the backstop: a `/claude-tweaks:tidy` scan row that enumerates preserved unfiled drafts and hands each to the human with a paste-ready re-file command.

**Complexity:** Low
**Estimated tasks:** 3-4

## Non-Goals

- No automatic re-filing — report-only, human decides per row (filing publishes to a public repo; the no-auto-retry rule stands).
- No change to `/feedback`'s staged-fallback behavior or filename convention.
- No new CLI — the scan is a tidy prose procedure over a simple glob, consistent with tidy's other filesystem scans.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| — | The calibration read-out record in this same decomposition edits `plugin/skills/tidy/scan-procedures.md` first — this record is Blocked by it (same file, sequential builds) | — |

## Current State

- `plugin/skills/feedback/SKILL.md` Step 8 item 4 — writes `staged/upstream-unfiled-{N}.md` on `filing-failure`, "deliberately outside the `staged/wrap-up-upstream-*.md` aggregation glob … so a stop-and-resume never re-enumerates a failed draft as a fresh upstream proposal", and states "There is no automatic retry for upstream filings."
- `plugin/skills/wrap-up/cleanup-procedures-execution.md` Section B — archival moves `staged/` wholesale into `.claude-tweaks/pipelines/archive/{run-id}/staged/`; "Skipped staged items remain in the archive; they are NOT silently dropped" (preserved, but also never re-surfaced).
- `plugin/skills/tidy/scan-procedures.md` — tidy's scan roster; each scan states what it enumerates, how it reports, and its action semantics. Adjacent precedent: parked #113 tracks a similar orphan-scan gap for `docs/plans/` ledgers.
- Run dirs are gitignored — enumeration must be `find`/`fs`-based, never a git-aware grep (recursive-grep-skips-gitignored-files).

## Deliverables

- [ ] A new scan row in `plugin/skills/tidy/scan-procedures.md`: enumerate `upstream-unfiled-*.md` under both `.claude-tweaks/pipelines/archive/*/staged/` and live `.claude-tweaks/pipelines/*/staged/` (a parked run's draft is just as orphaned), via `find` with explicit paths.
- [ ] Report shape: one row per draft — run id, file path, draft title, age — and, per the report-lines convention, a paste-ready command on its own line per row: `/claude-tweaks:feedback re-file the preserved draft at {abs path}`. Never `--pre-confirmed` (console-callers-only). Mechanism: the free-text argument is an instruction naming the absolute path, which `/feedback` Step 1's gather resolves by reading that file as the report's substance — verify this reading of Step 1 against `feedback/SKILL.md` at build time, and if it does not hold as written, add one sentence to that Step 1 naming a preserved-draft path as a valid gather source (a small, in-scope amendment; the full scrub/confirm flow reruns regardless). Title extraction: the first `**Summary:**` line — the field `feedback/SKILL.md` Step 5's draft template guarantees — falling back to the filename plus run id when absent; age from the run-id timestamp, rendered `age unknown` when the run-id doesn't parse as one.
- [ ] Action semantics: report-only rows with two stated options per row, both human-executed — the re-file command above, or a paste-ready `rm '{abs path}'` on its own line; tidy itself never deletes or files anything from this scan. A row from a **live** (unarchived) run dir whose `run-state.json` is non-terminal is annotated "run still live — leave unless abandoned"; the race with an active session is accepted because every action here is a human paste, nothing destructive runs automatically.
- [ ] A clean scan reports "0 unfiled upstream drafts" explicitly (a scan that ran and found nothing is a different fact from a scan that never ran).

## Acceptance Criteria

1. With a seeded archived run containing `staged/upstream-unfiled-1.md`, the tidy scan's report includes that row with run id, title, and a runnable `/claude-tweaks:feedback` command on its own line.
2. With no such files anywhere, the report states the scan ran clean — never silently omits the row.
3. The re-file command in the prose does not use `--pre-confirmed` (grep the new scan text; that flag's legitimacy is console-callers-only per `feedback/SKILL.md`'s Component-Skill Contract).
4. `npm test` green (tidy prose-pin suites updated if any pin the scan roster).

## Technical Approach

Prose-only addition to tidy's scan procedures, following the structure of its existing filesystem scans (state the find command, the report table, the per-row options). The draft body is already scrubbed (scrubbing happens at staging time), but re-filing goes through `/feedback`'s full flow anyway — its Step 6 scrub reruns as the standing safety net and Step 7's confirm gate applies, which is exactly the human decision this backstop exists to enable.

### Key Files

- `plugin/skills/tidy/scan-procedures.md` — the new scan row
- `docs/skill-graph.md` — add the tidy→feedback edge for this scan (one line; every cross-skill relationship is stated once, there)

## Gotchas

- Build after the calibration record (same file — `scan-procedures.md`); the Blocked-by link enforces this.
- `find`, not grep-based enumeration: run dirs are gitignored and ugrep-family tools skip them silently.
- The command line must be paste-ready and on its own line, with no inline comment appended (report-lines-must-carry-runnable-commands).
- Do not add a `by:*` label or file anything from the scan itself — tidy reports; `/feedback`'s own gates own the filing.


<!-- work-fingerprint: wrapup-objective-audit-fixes:tidy-backstop-scan-for-preserved-but-unfiled-upstream-feedba -->
