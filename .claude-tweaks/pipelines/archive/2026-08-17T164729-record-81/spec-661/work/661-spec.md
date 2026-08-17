---
record: 661
origin: human
risk: low
size: medium
ceremony: standard
grants: [build, merge]
surface: backend
---
# 661: specify shaping-mode: composed body omits ### Key Files, silently disabling flow/dispatch/help overlap detection

Surface: backend

## Current State

`skills/specify/shaping-mode.md`'s "Edit the body into spec shape" instruction tells shaping agents to compose exactly five sections — `## Current State`, `## Deliverables`, `## Acceptance Criteria`, `## Technical Approach`, `## Gotchas` — and never mentions the `### Key Files` subsection that `spec-template.md` places under `## Technical Approach` and that `/flow`, `/dispatch`, and `/help` all read.

Observed live in run `2026-08-16T091924-spec-563-564-565-566`: four records shaped via shaping-mode carried no `### Key Files` subsection — the shaping agents followed the five-section list faithfully, so this is a skill-text omission, not agent drift. `/flow`'s cross-spec conflict detection (`skills/flow/multi-spec.md`) extracts `### Key Files` per record via `extractKeyFiles`/`extractKeyFilesSection` (`bin/lib/issues/grouping.js`), hit the function's documented "no such subsection → `[]`" fallback four times, and the run proceeded with overlap analysis silently disabled — four extraction calls each returning an empty array, then "no overlap" reported with no indication the check never actually ran. The same shared primitive backs `skills/dispatch/queue-pull-script.md`'s eligible-record grouping and `skills/help/status-scan.md`'s dashboard conflict detection, so both degrade the same way for any `ready` record shaped under the incomplete instruction.

Secondary, related finding from the same evaluation: the session's shaping fan-out used `subagent_type: "fork"` with "already loaded in your context" framing — the inverse of `_shared/subagent-output-contract.md`'s clean-room input discipline. 8 of 21 dispatches in that run (4 shaping forks, 4 implementers) also carried no status line. `_shared/subagent-output-contract.md` line ~132 already treats fork dispatches as restricted (referencing the incident-log rule on forks) but never states the prohibition as an explicit rule in the file agents read while authoring a fan-out.

Related prior work: #490 (cross-referencing Key Files into siblings), #550 (consumer-grep clause in the template guidance), #649 (fan-out contract gap).

## Deliverables

1. `skills/specify/shaping-mode.md`'s "Edit the body into spec shape" section reproduces the composed-body section list as a literal template block that includes `### Key Files` nested under `## Technical Approach`, matching `spec-template.md`'s placement and its `- \`{path}\` — {what changes}` bullet format — populated from whichever files the shaped Technical Approach names.
2. Each of the three call sites that currently no-op silently on a missing `### Key Files` subsection — `skills/flow/multi-spec.md`'s Cross-spec conflict detection Step 1, `skills/dispatch/queue-pull-script.md`'s eligible-record grouping, and `skills/help/status-scan.md`'s Conflict detection section — surfaces one visible warning naming the record when the record is already `ready` (i.e., is supposed to have a `### Key Files` subsection), instead of silently contributing an empty `keyFiles` array. `help/status-scan.md`'s separate backlog/parked skip (line ~129) is a documented, correct absence case and is unaffected by this change.
3. `_shared/subagent-output-contract.md` states explicitly, alongside its existing input-discipline rules, that `subagent_type: "fork"` is prohibited for a clean-room fan-out dispatch.

## Acceptance Criteria

1. `skills/specify/shaping-mode.md`'s "Edit the body into spec shape" section contains a fenced template block with all five current headings plus `### Key Files` nested under `## Technical Approach` — a fresh shaping run following the instruction literally produces a body whose Technical Approach section has a populated `### Key Files` subsection.
2. `skills/flow/multi-spec.md`'s "Cross-spec conflict detection" Step 1 — the sentence "A record with no `### Key Files` subsection (not yet spec-shaped; shouldn't happen here, but handled defensively) contributes an empty `keyFiles` array rather than erroring" — is rewritten so that when the affected record is already `ready`, the step also appends one warning line to the run's decision log (`_shared/auto-decision-log.md` format) naming the record id and stating that overlap detection is disabled for it; a record that is not yet `ready` (the genuinely-expected absence case) stays silent as today.
3. `skills/dispatch/queue-pull-script.md`'s eligible-record grouping step prints one warning naming any eligible (`ready`, authorized) record whose extracted `keyFiles` array comes back empty.
4. `skills/help/status-scan.md`'s Conflict detection section (not its backlog/parked skip at line ~129, which is left unchanged) surfaces an equivalent warning for any `ready`/`authorized` record with an empty extracted `keyFiles` array.
5. `_shared/subagent-output-contract.md` gains an explicit sentence naming `subagent_type: "fork"` as prohibited for a clean-room fan-out, placed next to (or cross-referenced from) the existing input-discipline section so a reader authoring a dispatch prompt encounters it there.
6. `npm test` passes, including the prose-conformance suites that pin text in the four edited skill files.

## Technical Approach

The four consumer call sites (`/specify`, `/flow`, `/dispatch`, `/help`) all read `### Key Files` through the same shared primitive, `extractKeyFiles`/`extractKeyFilesSection` in `bin/lib/issues/grouping.js` — evaluate centralizing the "empty result on a `ready` record" warning there (one code path) before duplicating warning logic across three separate skill-markdown call sites. If centralized, each Acceptance Criterion 2-4's observable warning behavior must still hold per call site — the AC is about the visible outcome at each site, not about where the warning is implemented.

Item 1 (the template fix) is a self-contained prose edit and has no dependency on items 2-4; land it first since it's what prevents new records from lacking `### Key Files` going forward, independent of how loud the fallback becomes.

### Key Files

- `skills/specify/shaping-mode.md` — literalize the composed-body section list to include `### Key Files` under `## Technical Approach`
- `skills/flow/multi-spec.md` — turn the silent empty-`keyFiles` fallback into a logged warning for `ready` records (Cross-spec conflict detection, Step 1)
- `skills/dispatch/queue-pull-script.md` — add a warning for eligible records with an empty extracted `keyFiles` array
- `skills/help/status-scan.md` — add a warning for `ready`/`authorized` records with an empty extracted `keyFiles` array; leave the backlog/parked skip (line ~129) unchanged
- `skills/_shared/subagent-output-contract.md` — name `subagent_type: "fork"` as prohibited for clean-room fan-out dispatches
- `bin/lib/issues/grouping.js` — candidate location for centralizing the warning behind `extractKeyFiles`/`extractKeyFilesSection` instead of duplicating it at each call site

## Gotchas

- The `### Key Files` omission is a skill-text gap, not agent drift — the four shaping agents in run `2026-08-16T091924-spec-563-564-565-566` correctly followed the (incomplete) five-section list as written.
- `help/status-scan.md` line ~129's backlog/parked skip is a *different*, already-correct silent case (those records are genuinely not yet spec-shaped) — do not touch it; only the `ready`-record empty-array fallback across the three call sites is the defect this record is fixing.
- `subagent_type: "fork"` is already treated as restricted per an existing incident-log rule referenced near `_shared/subagent-output-contract.md` line ~132 — this fix makes that restriction an explicit, findable rule in the file agents read while authoring a fan-out; it is not introducing a brand-new restriction.
- `bin/lib/issues/grouping.js`'s `extractKeyFiles` already special-cases `by:code-health`/`by:harness-health`-origin records (different body shapes, no `### Key Files` heading at all) — any warning added there must not fire for those origins, since an empty result is expected and correct for them too.

## Original request

specify shaping-mode: composed body omits ### Key Files, silently disabling flow/dispatch/help overlap detection

## Overview

`skills/specify/shaping-mode.md`'s body-composition instruction names five sections — Current State, Deliverables, Acceptance Criteria, Technical Approach, Gotchas — and never mentions the `### Key Files` subsection that `spec-template.md` places under `## Technical Approach` and that downstream consumers depend on. Consequence chain observed live in run 2026-08-16T091924-spec-563-564-565-566:

1. Four records shaped via shaping-mode carried no `### Key Files` (the shaping agents followed the five-section list faithfully — this is a skill-text omission, not agent drift).
2. `/flow`'s cross-spec conflict detection (`multi-spec.md`) greps `### Key Files` per record, hit its defensive fallback ("shouldn't happen for a target that reached this pipeline ... contributes an empty `keyFiles` array rather than erroring") four times, and the run proceeded with overlap analysis silently disabled — four `grep -A5 "Key Files"` calls each returning empty, then "no overlap".
3. The same absence degrades `/dispatch`'s file-overlap grouping and `/help`'s conflict detection for every record shaped this way.

Secondary finding, same evaluation: the session's shaping fan-out used `subagent_type: "fork"` with "already loaded in your context" framing — the inverse of `_shared/subagent-output-contract.md`'s clean-room input discipline; 8 of 21 dispatches (4 shaping forks, 4 implementers) also carried no status line.

Related: #490 (cross-referencing Key Files into siblings), #550 (consumer-grep clause in the template guidance), #649 (fan-out contract gap).

## Suggested shape

1. `shaping-mode.md`: make the composed-body section list a literal template block including `### Key Files` under `## Technical Approach`, populated from the files the Technical Approach names.
2. `multi-spec.md` (and dispatch/help's shared grouping path): turn the silent empty-`keyFiles` fallback loud — one warning line to the decision log naming the record, so a disabled overlap gate is visible instead of indistinguishable from "no overlap".
3. `_shared/subagent-output-contract.md`: name `subagent_type: "fork"` as prohibited for clean-room fan-outs.

**Origin:** `/claude-tweaks:feedback` session evaluation (Instruction efficacy lens), run 2026-08-16T091924-spec-563-564-565-566.

**Files:** skills/specify/shaping-mode.md, skills/flow/multi-spec.md, skills/_shared/subagent-output-contract.md
