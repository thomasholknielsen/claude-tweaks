---
record: 57
origin: human
risk: low
effort: low
ceremony: fast-lane
grants: []
fingerprint: wrap-up-drift-prevention:journeys-build-time-recalibration
surface: backend
---
# 57: journeys: replace unanchored "no interaction surface" check with a 3-signal evidence checklist

Surface: backend

## Current State

`skills/journeys/SKILL.md` Step 1's "No interaction surface" check is a single holistic judgment call with no evidence anchor: "if the work has no flow impact for any persona (pure internal refactor, library-only changes with no behavioral shift), report 'No user-facing journeys affected' and stop." This project's own history shows the cost of that: `docs/journeys/` does not exist anywhere in this repo's history. Every build run that logged a journey decision concluded "no interaction surface" — e.g. spec 13: "contract-doc change, no persona-facing interaction surface"; spec 14: "internal library, no persona surface" — despite `/journeys`' own persona list explicitly including "developers" and "internal tooling users," and despite both specs changing what a slash command actually does for the person running it.

## Deliverables

Replace the unanchored "No interaction surface" conclusion in `skills/journeys/SKILL.md` Step 1 with a 3-signal evidence checklist that must be checked before that conclusion is allowed. Any hit disqualifies "no interaction surface" — the work must then be evaluated for at least a journey update (even a minor one), not skipped outright:

1. Does the diff touch a route/page/API endpoint/CLI command/exported function directly invoked by an end user, admin, or developer-user?
2. Does the diff change any user-observable output (new field, error message, flag, response shape)?
3. Does the diff add/remove/rename a capability reachable without reading source (a slash command, a CLI subcommand, a UI element)?

**What "evaluated" must produce (resolved — was previously unspecified, and an unspecified evaluation step risked silently recreating the same unanchored-judgment problem this leaf exists to remove, just one step later):** when a hit disqualifies the skip, the evaluation step still runs Step 1's normal existing-journey scan / new-journey-need assessment (Steps 1-2 as already documented). If that evaluation *still* concludes no journey update is warranted, it must log a one-line rationale citing which signal(s) fired and why the resulting change genuinely has no persona-visible effect worth documenting (e.g. "signal 1 fired — touches CLI command X, but X's behavior is unchanged, only an internal refactor of its implementation") — this is the same evidence-anchor discipline the checklist itself is meant to enforce, applied to the evaluation's own conclusion, not just its trigger.

## Acceptance Criteria

- [ ] `skills/journeys/SKILL.md` Step 1's "No interaction surface" bullet is replaced with the 3-signal checklist above, worded so any single hit (an OR, not an AND across all three) disqualifies the "no surface" conclusion.
- [ ] The evaluation-after-disqualification step is documented with the one-line-rationale requirement above — a disqualified case that still ends in "no journey needed" must cite its reasoning, not silently return to the old unanchored behavior.
- [ ] The existing "No interaction surface" anti-pattern-table row and any other prose describing the old unanchored judgment call is updated to reference the new checklist.
- [ ] **Concrete regression test**: hand-trace the new checklist against this project's own historical spec 13 and spec 14 diffs. Confirm which signal(s) actually fire for each — don't assume it's signal 3 specifically; this leaf's own red-team pass flagged that both diffs (described as "changing what a slash command does") more plausibly trip signal 1 (touches a CLI command) than signal 3 (add/remove/rename a capability) — either is a valid confirmation of the fix, the acceptance bar is "at least one signal fires," not a specific one. If the archive path `.claude-tweaks/pipelines/archive/2026-07-14T020251-.../spec-13/` (and `.../spec-14/`) no longer exists by the time this is implemented (this project runs active archival compaction via `/tidy`), cite the corresponding commit/PR diff instead — don't treat the archive path as guaranteed-permanent. Document this trace directly in the PR/commit description as evidence the fix actually changes behavior on a real, previously-mishandled case.
- [ ] `npm test` still passes unmodified (no `bin/lib/*` code touched — this is a skill-markdown-only change).

## Technical Approach

### Key Files
- `skills/journeys/SKILL.md` — Step 1 only. No other file needs to change for this leaf.

## Gotchas

- This leaf is deliberately narrow and independent of the other four in this decomposition — it can ship in any order relative to them. The one soft (non-blocking) preference: shipping this before the "journeys wrap-up drift step" leaf means that leaf's own missing-journey gap detection is less redundant from the start, rather than temporarily overlapping with an unfixed Step 1. Not a hard dependency — no `Blocked by` link needed.
- Don't over-tighten the checklist into requiring ALL three signals — the design intent is "any single hit disqualifies the skip," matching an OR, not an AND. A checklist requiring all three would reproduce the same under-triggering problem this leaf exists to fix, just with extra steps.
- Watch for false negatives specifically in changes to *this plugin's own* skill-markdown files (like the other four leaves in this decomposition!) — a change to what a slash command does clearly trips signal 1 or signal 3, so applying this fixed checklist to claude-tweaks' own future builds should now actually produce journey files where it previously never did, for CLI/skill-plugin projects that treat "the developer running slash commands" as a real persona.
- **Volume tradeoff, accepted deliberately**: for this specific plugin, nearly every skill-file edit plausibly touches a CLI command directly invoked by a developer-user (signal 1) — the evaluation step will trigger far more often post-fix than it did before. This is the intended, accepted consequence of fixing a check that was flagging zero true positives across this project's entire history; the one-line-rationale requirement (above) is what keeps the resulting higher volume from becoming a rubber-stamp rather than a meaningful gate. Signals 1 and 2 have no historical regression-test case in this repo the way signal-related spec 13/14 traces confirm signal 1/3 — they're carried on the same design logic (an evidence anchor, not a vibe call) but haven't yet been validated against a real historical miss; note this if a future audit wants to specifically hunt for one.


<!-- work-fingerprint: wrap-up-drift-prevention:journeys-build-time-recalibration -->
