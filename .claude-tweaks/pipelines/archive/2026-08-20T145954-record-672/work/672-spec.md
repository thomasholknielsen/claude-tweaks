---
record: 672
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build]
surface: backend
---
# 672: Track-carve-out task briefs should audit every lettered sub-step of review.md Step 3.8, not just the ones the spec names

Surface: backend

## Current State

`### Step 3.8: Dispatch project-local craft critics` in `skills/design-wrapper/modes/review.md`
(lines 126-254) has six lettered sub-steps forming a sequential gating chain: **(a)** Lever, **(b)**
Roster selection, **(c)** Availability, **(d)** Decisions layer, **(e)** Dispatch, **(f)** Parse and
encode. A later sub-step's correctness depends on earlier ones — e.g. **(c)** Availability gates
whether a critic dispatches at all for a given track.

`#601`'s spec named exactly one sub-step — **(d)** Decisions layer — as the terminal-track carve-out
needed, and the plan's Task 5 brief mirrored that scope literally. The mandatory whole-branch review
caught that **(c)** Availability also needed a terminal carve-out: without it, the terminal critic
would be permanently marked `unavailable`, contradicting `critics.md`'s and `terminal-routing.md`'s
own "never absent" contract for that track. The gap survived spec-authoring, plan-authoring, Task 5's
own build, and Task 5's task-scoped review — only the whole-branch review's end-to-end trace of the
full (b)→(c)→(d)→(e) chain for a concrete dispatch scenario caught it.

Verified directly against the live file this session: Step 3.8 does have exactly six lettered
sub-steps as described, and (c) does gate dispatch — the issue's diagnosis reproduces against current
code. No maintainer note currently exists at Step 3.8 (or anywhere in the design-wrapper skill)
warning a future track-carve-out author to check every lettered sub-step rather than only the one
they already have in mind.

## Deliverables

- Add a short blockquote note immediately after the `### Step 3.8: Dispatch project-local craft
  critics` heading in `skills/design-wrapper/modes/review.md`, before the existing intro paragraph —
  the same placement convention already used for this file's `> **Parallel execution:**` directives.
- The note must instruct: any spec/task brief adding or modifying a track's behavior at Step 3.8 must
  explicitly state which of the six lettered sub-steps **(a)-(f)** were checked and which need a
  carve-out — e.g. "checked (a) through (f), carve-out needed at: (c), (d)" — rather than naming only
  the sub-step the author already believes is relevant.
- Name the concrete failure mode the note guards against (a carve-out that mirrors only the named
  sub-step and misses an earlier gating one, silently breaking a track's availability or dispatch) so
  the note is self-explanatory without requiring the reader to look up this issue.

## Acceptance Criteria

- `skills/design-wrapper/modes/review.md`'s Step 3.8 heading is immediately followed by a blockquote
  note requiring the "checked (a) through (f), carve-out needed at: [list]" framing for any future
  track-carve-out spec/task brief touching this step.
- The note names the specific failure class (an earlier gating sub-step silently missed because only
  the sub-step the author had in mind was named) rather than a generic "review carefully" instruction.
- No existing Step 3.8 sub-step content, lettering, or logic is altered — this is a documentation-only
  addition, confirmed by `git diff` showing only the inserted blockquote.
- `skills/design-wrapper/modes/review.md` stays under its file's practical size headroom (38,261 bytes
  measured this session; a ~400-byte blockquote leaves it comfortably under the 40 KB soft ceiling
  `docs/skill-authoring.md` documents for skill files).
- `npm test` passes with no new failures.

## Technical Approach

- Insert the note as a `>`-prefixed blockquote, matching the visual convention `docs/skill-authoring.md`'s
  Parallel execution directives section documents for other blockquote directives in skill files (this
  note is not one of that section's three named forms — Form A/B/C — and should not claim to be; it
  follows the same visual pattern for a maintainer-facing directive, not a dispatch trigger).
- Before editing, grep `tests/` for anything that pins `skills/design-wrapper/modes/review.md`'s byte
  content or exact structure (a byte-pin or extraction test per `docs/skill-authoring.md`'s Executable
  snippets section) and update the corresponding fixture/pin in the same change if one exists — the
  session's own grep found two files referencing this path (`tests/subagent-contract-clauses.test.js`,
  `tests/bin-lib/skill-audit/anti-patterns.test.js`) but neither appeared to byte-pin Step 3.8's prose
  specifically; re-verify at build time rather than trusting this shaping-time read.
- Do not touch `docs/skill-authoring.md`. The issue's suggested resolution named it as one candidate
  location ("a one-line authoring checklist item in `docs/skill-authoring.md` or the plan-writing
  convention") — a repo-wide grep this session found only one other skill file with a similar lettered
  sub-step structure (`skills/simplify/SKILL.md`, unrelated mechanism, no established track-carve-out
  precedent), which isn't enough shared structure to justify a general authoring-conventions rule. The
  local note at Step 3.8 itself is read by exactly the person editing that step — a stronger guarantee
  than a rule buried in a general conventions file — and is the lower-risk, more surgical fix.

## Gotchas

- The issue's cited plan file (`docs/superpowers/plans/2026-08-16-601-terminal-track.md`) no longer
  exists — confirmed via `ls` this session. It was deleted by the recent "Tidy: delete 49 execution
  plans whose tracking issues/PRs are all closed or merged" commit (`bb1ae052`), since `#601` shipped
  and closed. This doesn't affect the fix: the plan file was only cited as historical evidence of where
  the gap occurred, not an artifact this record needs to edit.
- `skills/simplify/SKILL.md` also has lettered sub-steps matching the same repo-wide grep pattern used
  to scope this fix. It is a different mechanism with no established track-carve-out precedent, so it's
  left untouched here — worth a separate look only if this exact failure shape (a spec naming one
  lettered sub-step, missing an earlier gating one) recurs there in a future incident.
- `docs/skill-authoring.md` currently has roughly 12 KB of headroom before its own 40 KB soft ceiling
  (28,764 bytes measured this session). If a maintainer later decides a general authoring-conventions
  rule is preferable to this record's local-note approach, there's room to add one without first
  needing to slim the file.
- `skills/design-wrapper/modes/review.md` itself is close to the 40 KB soft ceiling (38,261 bytes
  measured this session, ~2.7 KB of headroom) — keep the inserted note terse; a future addition to this
  same file may need to trim elsewhere first.

## Original request

Track-carve-out task briefs should audit every lettered sub-step of review.md Step 3.8, not just the ones the spec names

**Category:** tangential
**Severity:** low
**Reversibility:** high
**Source:** hindsight mode, `/claude-tweaks:review` of #601 (run `2026-08-16T160107-spec-597-595-598-599-601`)
**Files:** skills/design-wrapper/modes/review.md, docs/superpowers/plans/2026-08-16-601-terminal-track.md

## Finding

#601's spec Deliverable for `review.md` named exactly one Step 3.8 clause ("(d) Decisions layer") to add for the terminal carve-out, and the plan's Task 5 brief mirrored that scope literally. The mandatory whole-branch review caught that sub-step (c) — Availability, the two-path Emil lookup that gates whether a critic dispatches at all — also needed a terminal carve-out (it would otherwise mark the terminal critic permanently `unavailable`, contradicting `critics.md`'s and `terminal-routing.md`'s own "never absent" contract). The gap survived spec-authoring, plan-authoring, Task 5's own build, and Task 5's task-scoped review — it only surfaced because the whole-branch review traced the full (b)→(c)→(d)→(e) chain end-to-end for a concrete dispatch scenario rather than checking each named clause in isolation. Step 3.8 has 6 lettered sub-steps ((a)-(f)); a future record adding a new track (or a new selection axis to the roster) is likely to repeat this exact shape — a spec/plan naming only the sub-step it thinks is relevant, missing a gating sub-step earlier in the chain.

## Suggested resolution

When a future spec/plan adds a track carve-out to Step 3.8, require the task brief to explicitly state "checked (a) through (f), carve-out needed at: [list]" rather than naming only the sub-steps the author already has in mind — a one-line authoring checklist item in `docs/skill-authoring.md` or the plan-writing convention would catch this earlier than the whole-branch review's end-to-end trace, which currently is the only place this class of gap gets caught.

