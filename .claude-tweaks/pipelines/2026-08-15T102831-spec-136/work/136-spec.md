---
record: 136
origin: human
risk: low
size: low
ceremony: fast-lane
grants: []
surface: backend
---
# 136: CLAUDE.md: one Don'ts bullet is 214 words, having absorbed the incident narrative that belongs in the incident log

Surface: backend

## Current State

The `docs/donts.md` [IL-70] bullet (line 14 as of this writing) is no longer the 214-word outlier this record originally cited — a later commit (`cea8caa3`, "Compress the densest Don'ts bullets in CLAUDE.md") already trimmed it to ~89 words while sweeping the ~10 densest bullets in the section. That trim compressed the bullet correctly on its own terms, but it dropped the concrete evidence this record's first deliverable required be re-homed first: the original 214-word version stated `init/bootstrap-steps.md` reached 86 KB behind 18 section-naming stubs while the rule was followed to the letter (#83, `[IL-70]`) — the case proving a sub-file becomes an overflow bucket once 2+ stubs cite sections of it. That sentence was deleted, not moved.

Checked whether it survived anywhere else in `docs/incident-log.md`: `grep -n "86 KB\|18 section-naming\|#83\b"` finds one hit, in `## IL-44 — Merge conflicts against an upstream structural refactor`'s "inverted case" sub-note. That sub-note mentions the same 86 KB / 18-stub file split, but only as an example of resolving a merge conflict against your own structural refactor — it never states the sub-file-overflow-bucket lesson (a sub-file is a lazy-load unit, not an overflow bucket; shape, not size, is the defect). `IL-70` itself documents a different, unrelated hazard (an in-place transform script reading its own output). So the overflow-bucket evidence currently has no home in the incident log — if the `docs/donts.md` bullet's second half is ever trimmed further, that case disappears with no record of it.

The `docs/donts.md` bullet is also still ~89 words, over this record's ~60-word target (peers average ~38 words/bullet), though far short of the original 214.

## Deliverables

1. Add the missing evidence to `docs/incident-log.md`, tagged so it resolves from `docs/donts.md`'s `[IL-70]` citation: either extend the existing `## IL-70` entry with a second paragraph/sub-note (the `## IL-27` entry's `**Recurrence**`-style sub-note is the established precedent for a second account under one number — see `docs/donts.md`'s own "Adding one" guidance), or add a new `IL-nn` entry cross-referenced from the `docs/donts.md` bullet. Content: the sub-file-as-overflow-bucket mechanism (a sub-file is a lazy-load unit, not an overflow bucket; `Read` has no section granularity, so once 2+ stubs cite sections of one sub-file, every stub pays for the whole file), with `init/bootstrap-steps.md`'s 86 KB / 18-stub case (#83) as the concrete instance.
2. Trim `docs/donts.md` line 14 to ~60 words now that the narrative has a real home — keep both halves of the rule (the 40 KB soft ceiling, and that it applies per sub-file too) plus the `[IL-70]` tag, drop the restated mechanism prose that now lives in the incident-log entry.
3. Verify the `[IL-70]` tag on the trimmed bullet resolves to an entry that documents the sub-file-overflow hazard specifically (not just the unrelated in-place-transform-script hazard already there).

## Acceptance Criteria

- `docs/incident-log.md` contains the 86 KB / 18-stub / #83 evidence, framed as the sub-file-overflow-bucket lesson (not merely as a merge-conflict resolution example, which is IL-44's separate concern).
- `docs/donts.md` line 14 is at or under ~60 words (`wc -w` on the bullet text), in family with the section's ~38-word average.
- Every substantive claim removed from the bullet during this trim appears in the incident-log entry it now points to.
- `grep -n "86 KB\|18 section-naming\|#83\b" docs/incident-log.md` returns a hit under the entry the `docs/donts.md` `[IL-70]` tag resolves to.

## Technical Approach

Read the current `docs/donts.md` line 14 and `docs/incident-log.md`'s `## IL-70` entry (both already quoted above). Compose the new/extended incident-log paragraph from the original 214-word bullet's dropped sentence (recoverable via `git log -p --follow -- CLAUDE.md | grep -n "18 section-naming"` — the pre-compression text is in history). Land the incident-log write first, then trim `docs/donts.md` referencing it, so the evidence is never mid-flight without a home (mirrors this record's own stated ordering).

## Gotchas

- Don't conflate this with IL-70's existing content — the in-place-transform-script hazard (re-running `split.js` against its own output) is a real, separate lesson and must stay intact if extending that entry rather than adding a new number.
- `docs/donts.md`'s own "Adding one" convention: allocate the next free `IL-nn` (gaps fine) if adding a new entry rather than extending IL-70; never renumber one already on `main`; re-check against `origin/main` before pushing.
- This record's own filed word count (214) is stale against the live file (now ~89) — the fix is still real, just narrower in scope than the record's original framing suggested.

## Original request

CLAUDE.md: one Don'ts bullet is 214 words, having absorbed the incident narrative that belongs in the incident log

**Summary:** One `## Don'ts` bullet in CLAUDE.md is 214 words — 5.6x the section's 38-word average and 3.4x the next-longest peer. It has absorbed the incident narrative that justifies it, which the project's own convention says belongs in `docs/incident-log.md`.

**Type:** Task

**Affected component:** `CLAUDE.md` `## Don'ts` — the sub-file-extraction / 40 KB soft-ceiling bullet, tagged `[IL-70]`.

**Evidence (measured, not impression):**

- `awk`-extracted `## Don'ts` section: 4175 words across 109 bullets = **38.3 words/bullet** average — under `_shared/harness-health-analysis.md`'s ~40 words/bullet narrative-density threshold, so the section as a whole is healthy.
- Longest three bullets by word count: **214**, 63, 62. The 214-word outlier is the only bullet meaningfully out of family.
- The excess is narrative, not constraint: `` `init/bootstrap-steps.md` reached 86 KB behind 18 section-naming stubs while this rule was followed to the letter (#83, `[IL-70]`) ``, plus the reasoning about why that shape (not size alone) is the defect.

This is exactly dimension 9's "over-long rows" case in `_shared/harness-health-analysis.md`: *"a row that has absorbed the reason it was added — an incident narrative ... which belongs in the project's incident log, not in a table re-read on every invocation."* CLAUDE.md is paid for by every session **and** every dispatched subagent.

**Why this is a two-part change, not a trim:**

`docs/incident-log.md`'s IL-70 entry covers a *different* hazard — an in-place transform script reading its own output (`split.js` pointed at `bootstrap-steps.md` itself). The sub-file-as-overflow-bucket evidence (86 KB behind 18 stubs) is **not** homed there; it currently lives only in the CLAUDE.md bullet and in #83. Compressing the bullet without re-homing that evidence first would destroy it.

**Deliverables:**

1. Re-home the sub-file-overflow evidence into `docs/incident-log.md` — either a new `IL-nn` entry or an explicit second section under IL-70 (the `## IL-27` entry's `**Recurrence (this session)**` sub-note is the established precedent for a second account under one number).
2. Compress the CLAUDE.md bullet to the project's stated shape: one sentence of rule, one clause of why, plus the `[IL-nn]` tag.
3. Verify the compressed bullet still states both halves of the rule that are load-bearing at runtime — the 40 KB soft ceiling **and** that the ceiling applies to sub-files too (a sub-file cited by 2+ section-naming stubs is the same defect one level down).

**Acceptance criteria:**

- The 214-word bullet is under roughly 60 words (in family with its peers).
- Every substantive claim removed from it appears in `docs/incident-log.md`.
- The `[IL-nn]` tag on the bullet resolves to an entry that actually documents the sub-file-overflow hazard.

**Origin:** `/claude-tweaks:wrap-up` Step 7.9 (CLAUDE.md curation) during the #131 journey-health fix. The gate opened because that work recorded an incident account; the audit's mechanical checks surfaced this independently of #131's own changes.
