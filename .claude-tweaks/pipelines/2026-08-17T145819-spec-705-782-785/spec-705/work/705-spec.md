---
record: 705
origin: human
risk: low
size: medium
ceremony: standard
grants: []
surface: backend
---
# 705: specify shaping-mode: no multi-record input contract — a `#A–#B` range was absorbed by hand-rolled per-record bash, and the read-back verification that ran exists nowhere in the skill

Surface: backend

## Current State
`/claude-tweaks:specify`'s `## Input` section (`skills/specify/SKILL.md`) documents only a single work record reference (`#N`, an issue URL, or a bare local id) as the resolvable record-mode input; there is no `#A,#B` or `#A-#B`/`#A–#B` range form, unlike `/claude-tweaks:flow`, which already accepts a comma-joined multi-target list (`#A,#B,...`). When a session needed to shape a six-record range (`#678`–`#683`), the model had no documented procedure to follow and improvised: a hand-rolled heredoc composing six `shaped-{n}.md` drafts, an ad-hoc `for n in 678 … 683` loop calling `gh issue edit` per record, and a second hand-written loop reading back each edited issue's labels and body to verify the shape actually landed. None of that read-back verification exists anywhere in `shaping-mode.md` today — it was invented on the spot, and it happens to demonstrate the exact gap a sibling record (#681, shaped in the same session) files against `/feedback`'s own filing step: nothing forces a post-write check.

**Build-time note (added by `/flow`, not part of the original record — see Gotchas below for why this matters):** Since this record was filed, `#695`/`#702` shipped the comma-joined `#A,#B` batch input contract in `SKILL.md`'s `## Input` (with per-record resolution, mixed-list/empty-element error handling, and a "multiple records shaped" `## Next Actions` row) and the per-record loop in `shaping-mode.md`. **Two of this record's three original Deliverables are therefore already satisfied by shipped code — do not re-add them.** The residual, still-unaddressed gap is narrower than the Deliverables/Acceptance Criteria below state in full:
1. The **range form** (`#A-#B`/`#A–#B`, inclusive, expanding to the equivalent comma-joined list before resolution) is genuinely still missing — only the comma-joined form (`#A,#B`) exists today.
2. The **mandatory read-back verification step** after each record's write in `shaping-mode.md`'s per-record loop is genuinely still missing — this is the deliverable the record's own Gotchas section calls "a genuinely new mechanical check, not just documentation of existing behavior."
Deliverable 3 (a "multiple records shaped" `## Next Actions` row) is already shipped verbatim at `SKILL.md`'s "Shaping mode — multiple records shaped in place" situation row — no further action needed there.

Build only items 1 and 2 above. Verify the Acceptance Criteria below against the current state of `SKILL.md`/`shaping-mode.md` before writing anything — most of them already pass.

## Deliverables
- Extend `/claude-tweaks:specify`'s `## Input` (`skills/specify/SKILL.md`) to document a multi-record form for shaping mode: `#A,#B` (comma-joined, matching `/flow`'s existing convention) and `#A-#B`/`#A–#B` (an inclusive range, expanded to the comma-joined list before resolution).
- Add an explicit per-record loop section to `shaping-mode.md` that: (a) repeats the existing single-record shaping procedure (Edit the body / Preserve the original request / Metadata block / Stamp scoring and stage labels / Compose-then-write-once) once per record in the resolved list, and (b) after every record's write call, runs a mandatory read-back step — `gh issue view {n} --json labels,body` (or the local-files equivalent) — asserting `ready` plus the scoring labels are present, the five spec-shaped sections plus `## Original request` are present, and no unresolved placeholder marker (a deferred-work comment or an ambiguity note) survived into the written body.
- Add a "multiple records shaped" row to `SKILL.md`'s `## Next Actions` Situation table, recommending `/claude-tweaks:flow #A,#B,…` once every record in the batch has passed its read-back.

## Acceptance Criteria
- `skills/specify/SKILL.md`'s `## Input` documents both `#A,#B` and `#A-#B`/`#A–#B` as valid shaping-mode inputs, with the range form's expansion rule stated explicitly.
- `shaping-mode.md` contains an explicit multi-record loop section (not just an implicit "repeat this for each record" understanding) that ends every record's pass with the read-back check described above.
- `SKILL.md`'s `## Next Actions` renders a distinct row for the multi-record-shaped situation, recommending `/claude-tweaks:flow #A,#B,…`.
- No existing single-record shaping behavior changes — a single `#N` input still resolves and shapes exactly as it does today; the loop is additive, not a rewrite of the base case.

## Technical Approach
Parse the range/list form at `## Input` resolution time (case 1 of Resolve-the-input), before `shaping-mode.md` is ever loaded — a `#A-#B`/`#A–#B` range expands to the equivalent `#A,#B,...` comma-joined list, then both forms share one resolution path. `shaping-mode.md` gains a loop wrapper around its existing single-record procedure rather than a parallel second procedure — every step inside the loop body is identical to today's single-record path; only the read-back step and the loop framing are new. The read-back re-fetches each record after its write (a second `gh issue view` / local-files read), rather than trusting the write call's own response, so it catches a write that landed with the wrong labels or a body that silently dropped a section.

## Gotchas
- The read-back step is a genuinely new mechanical check, not just documentation of existing behavior — write it as a must-run step in `shaping-mode.md`, not a suggestion, or the next multi-record run will skip it under time pressure the same way this session's manual version was improvised rather than planned.
- Keep the per-record loop's failure handling consistent with the Materialization hard gate's existing "report every failing record in one message, not just the first" convention (`flow/materialize.md`) — a multi-record shaping run should surface every record's read-back failure together, not stop silently on the first one.
- This record and `#782`/`#785` are themselves being shaped as a manual multi-record batch in the same session that files this gap — there is no automated loop to exercise yet, so this shaping pass is evidence for the gap rather than a demonstration of its fix.
- **Build-time addendum:** `#695`/`#702` shipped the comma-list form and its per-record loop (without the read-back step) after this record was filed but before this build ran. The range form and the read-back step are additive to that existing loop, not a rewrite of it — read `shaping-mode.md`'s current per-record loop section in full before editing, and insert the read-back step into the existing loop rather than authoring a second one.

## Original request

specify shaping-mode: no multi-record input contract — a `#A–#B` range was absorbed by hand-rolled per-record bash, and the read-back verification that ran exists nowhere in the skill

**Summary:** `/specify`'s `## Input` defines the first argument as a single record reference and `shaping-mode.md` is "Shaping Mode (single record)"; the user typed `across #678–#683` and the six-record run — draft composition, the per-record `gh issue edit` loop, and a post-write read-back — was hand-rolled bash improvised on the spot rather than driven by the skill.

**Kind:** Gap

**Affected component:** `skills/specify/SKILL.md` `## Input`; `skills/specify/shaping-mode.md`

**Objective:** Automation efficiency

**Use case:** A user who has just had N related records filed (a `/feedback` batch, a health sweep) wants to shape them all in one invocation, and the run should verify what it wrote. In this session the model absorbed the range with an ad-hoc heredoc writing six `shaped-{n}.md` drafts, a hand-written `for n in 678 … 683` edit loop, then a second hand-written read-back loop verifying labels, section presence, fingerprint preservation, and placeholder absence. The read-back appears nowhere in `shaping-mode.md` — it is model invention this run, and its absence elsewhere is exactly what #681 (shaped in this same session) files as a defect against `/feedback`'s filing step.

**Proposed fix:** Add a documented multi-record input to `/specify`'s `## Input` (`#A,#B` and `#A–#B`/`#A-#B` range forms, matching `/flow`'s existing `#A,#B` shape), and give `shaping-mode.md` an explicit per-record loop section that (a) repeats the component-skill invocations per record and (b) ends with a mandatory read-back step (`gh issue view {n} --json labels,body` → assert `ready` + scoring labels present, the five sections + `## Original request` present, no placeholder tokens) — so the verification that happened here by improvisation happens by contract. Next Actions gains a "multiple records shaped" row (`/claude-tweaks:flow #A,#B,…`).

**Definition:** Clear

**Plugin version:** 6.88.0

---
Filed via /claude-tweaks:feedback (session evaluation, self-referenced repo — routed to this project's own backlog).
<!-- fingerprint: feedback-d091c1da -->
