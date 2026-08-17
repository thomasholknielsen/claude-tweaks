---
record: 625
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
fingerprint: 2026-08-16-exhaust-deferral-gate-design:capture-shaped-body-branch-files-spec-shaped-born-ready-clau
blocked-by: [623, 575]
surface: backend
---
# 625: capture shaped-body branch files spec-shaped born-ready; CLAUDE.md template no-implicit-deferrals clause names it

Surface: backend

## Overview

Give `/capture` a shaped-body branch: when the supplied idea text already carries `## Current State`, `## Deliverables`, and `## Acceptance Criteria` (or `## Open Question` in place of AC), each with non-empty content and no placeholder marker, capture composes via `specShapedBody` (#623), judges and stamps `risk:*`/`size:*`, applies `ready`, and skips the 5-line cap and #575's chain-into-`/specify` path — the record is already the shape that path exists to produce. **Detection is by what is supplied, never by who invoked** — this holds for the branch itself: a human who pastes a shaped body takes the shaped branch too; a human typing a short idea still gets the 5-line stub and today's behavior. `needs:definition` judgment still runs first and wins. The `--defer-reason=` requirement is the one deliberate content-keyed exception spelled out below. The CLAUDE.md template's "No implicit deferrals" clause (and this repo's own CLAUDE.md copy) says the filer supplies the shaped body and a `Defer-reason:`.

**Complexity:** Medium
**Estimated tasks:** 5

## Non-Goals

- Short, unshaped captures — the 5-line stub, the routing prompt, and #575's trusted+ chain are unchanged for them, whoever the invoker is.
- Any producer's side of the Capture route (what body reflect/review hand over) — #624; this record owns capture's acceptance of what they send.
- `/feedback`.
- A content-quality gate before `ready` beyond the structural check — deliberately unconditional; see Decision below.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #620 | deferral gate contract: `DEFER_REASONS` in `record.js`, `_shared/deferral-gate.md` | must be merged first — `--defer-reason=` validates against its export |
| #623 | `specShapedBody` provenance/footer/openQuestion params + `/capture` matrix row wording | must be merged first |
| #575 | born-ready capture chains into headless `/specify` shaping | must be merged first — same capture branch, same `work-record.md` row (`bot:in-progress`, PR #586); **re-verify the exact skip/fallthrough point against the post-merge Backend Selection text before implementing, not just before editing** |

## Current State

- `skills/capture/SKILL.md` (26.7 KB): Input `<idea text> [--route] [--title] [--type] [--needs-definition|--no-needs-definition]`; Entry Format = `**Related:**` / `Context:` / `Scope:` block, "Hard cap: ~5 lines per entry — if it takes more than 5 lines … run `/superpowers:brainstorming` instead"; Backend Selection applies `by:capture`, Type, `needs:definition`, and (trusted+/clean, per #575 after it lands: chains into `/specify` shaping instead of stamping bare `ready`); Judging Definition runs at filing time; Routing prompt; Component-Skill Contract (parents: `/build`, `/reflect`; `--source <parent-skill>` fallback flag). Anti-pattern row "Writing a full spec as a backlog record".
- `skills/init/claude-md-template.md:150` and this repo's `CLAUDE.md` Philosophy: "**No implicit deferrals.** When something needs doing, either do it now or explicitly file a backlog work record (via `/claude-tweaks:capture`) with scope and context. Never silently skip work or leave to-do comments without a corresponding backlog record."
- `_shared/work-record.md` (after #623): `/capture` row — `by:capture`, Type, `needs:definition`; `ready` at trusted+/clean via #575's chain — the shaped-body branch is not yet in the row; "## Spec-shaped body" defines the structural check: `Current State`, `Deliverables`, `Acceptance Criteria` present and non-empty, none of the three placeholder markers `_shared/work-record.md`'s Spec-shaped body section names (the to-be-determined tag, the to-do tag, the unresolved-ambiguity HTML comment).
- `bin/lib/issues/record.js` (after #620/#623): `DEFER_REASONS`; `specShapedBody` with `provenance`/`footer`/`openQuestion`; `recordPayload` with `risk`, `size`, `ready`, `deferReason` (validates and de-duplicates against a body-carried `Defer-reason:` line).

## Deliverables

- [ ] `skills/capture/SKILL.md`: a **Shaped-body branch** section — **detection:** split `$BODY` on line-anchored `## ` headings; shaped when it contains `## Current State`, `## Deliverables`, and exactly one of `## Acceptance Criteria` / `## Open Question`, each followed by non-empty content, and none of the three placeholder markers `_shared/work-record.md`'s Spec-shaped body section names (the to-be-determined tag, the to-do tag, the unresolved-ambiguity HTML comment) anywhere; anything before the first heading becomes `header` (e.g. `Origin:`/`Trigger:` lines the caller supplied); a body that has the headings but fails the check falls through to the stub branch with one line saying why. On match: skip Entry Format's stub assembly and the 5-line cap; run Judging Definition first — `needs:definition` (judged, or `--needs-definition`, or an `## Open Question` section present) → compose via `specShapedBody` with `openQuestion`, file with `needs:definition`, no `ready`, no scoring (unchanged rule: an undecided record is never born-ready), and `--defer-reason=` is **not** required (a needs-you record is not a deferral; when supplied it is still rendered); otherwise judge `risk`/`size` per `_shared/work-record.md`'s Scoring axis (or take `--risk=`/`--size=` overrides — same auto/headless rationale as `--type=`), compose via `specShapedBody({ header, currentState, deliverables, acceptanceCriteria, filedBy: 'capture', provenance: { origin: <optional --origin= text>, deferReason }, footer: '_Filed by \`capture\` via specShapedBody._' })`, and file with `recordPayload({ …, origin:'capture', risk, size, ready:true, deferReason })` — `ready` regardless of the autonomy ceiling; #575's chain-into-`/specify` step is skipped on this branch (nothing left to shape). Presentation line: `Added: '{title}' (Type: {t}, Definition: clear, shaped — risk:{r} size:{s}, ready)`.
- [ ] **Decision, recorded in the section:** `ready` on the shaped branch follows from the born-ready rule's own reasoning (a `specShapedBody`-composed, scored body is structurally what health skills file, and they are `ready` by construction) — not from a trust verdict; the human gate stays the grant at `refine`, and the trust ledger's `producer:capture` class grades outcomes post-hoc. Self-judged scoring is likewise deliberately unconditional (the same judgment `/specify` shaping mode makes) — recorded as a decision, not an omission.
- [ ] `--defer-reason=<value>` flag: validated against `DEFER_REASONS`; **required** whenever the body is a deferral — i.e. it carries an `Origin:` line (content signal) **or** any `--source` value is given (a producer's Capture route — reflect, review, or any future producer; the rule keys on "any `--source`", not two named ones); missing → stop and report, never file a reason-less deferral (the same hard gate #622's console enforces); for a fresh idea with neither signal it is optional. Precedence: `needs:definition` first (never requires a reason), then the deferral check, then scoring + `ready`. Also accept the #621 pass-through: a `Defer-reason: {value}` line already inside the idea text counts as supplied (validated the same way).
- [ ] `_shared/work-record.md` `/capture` row: Adds gains `risk:*`, `size:*`, `ready` **only on the shaped-body branch** (structural check passed, `needs:definition` false, `via specShapedBody` footer present); the Never cell keeps `ready` on a stub at every ceiling.
- [ ] `skills/init/claude-md-template.md:150` and this repo's `CLAUDE.md` Philosophy bullet: "…explicitly file a backlog work record (via `/claude-tweaks:capture`) **with a spec-shaped body (Current State / Deliverables / Acceptance Criteria) and a `Defer-reason:` from `_shared/deferral-gate.md`** — an agent that holds the context files it shaped; a stub is for a human typing an idea." Keep the bullet to two sentences (memory: CLAUDE.md conciseness); `tests/claude-md-budget.test.js` must stay green.
- [ ] `tests/deferral-gate-conformance.test.js` (this file, definitively): `capture/SKILL.md` contains "Shaped-body branch", `--defer-reason=`, and still contains the 5-line cap; `claude-md-template.md` and `CLAUDE.md` contain "spec-shaped body" in the no-implicit-deferrals bullet.
- [ ] `docs/skill-graph.md` `## capture` section: no new edge (the producers' Capture route already exists as an edge; this only changes the payload) — verify and leave unchanged unless a producer edge is missing.

## Acceptance Criteria

1. Invoking `/claude-tweaks:capture` with a body carrying the three non-empty sections and `--defer-reason=tangential` files a record whose labels are `by:capture`, `type:{t}`, `risk:{r}`, `size:{s}`, `ready` and whose body contains exactly one `Defer-reason: tangential` line and a `via specShapedBody` footer (verified with `gh issue view {n} --json labels,body`) — the invoker's identity does not matter.
2. Invoking with a body carrying `## Current State`, `## Deliverables`, `## Open Question` and `--source reflect` and no `--defer-reason=` files `by:capture`, `type:{t}`, `needs:definition` and no `ready`/`risk`/`size` (needs:definition wins; no reason required).
3. Invoking with the three sections plus an `Origin:` line (or any `--source`) and no `--defer-reason=` and no `Defer-reason:` line in the text files nothing and reports the missing reason.
4. Invoking with a 5-line stub body behaves exactly as before this record (labels `by:capture`, `type:{t}`, no scoring, #575's path applies) — verified by a stub filing on a fixture repo or by reading the unchanged Backend Selection text.
5. `grep -n "spec-shaped body" skills/init/claude-md-template.md CLAUDE.md` matches the no-implicit-deferrals bullet in both; `node --test tests/claude-md-budget.test.js tests/deferral-gate-conformance.test.js` passes; `npm test` passes in full.

## Technical Approach

The branch keys on the body's structure, not on the invoker: the same `Current State`/`Deliverables`/`Acceptance Criteria`(or `Open Question`) presence-and-non-empty, no-placeholder check the gate re-verifies, parsed by line-anchored `## ` headings. Because the record is spec-shaped by construction, `ready` follows from the born-ready rule directly — no trust-verdict round-trip and no `/specify` chain — which is why this branch skips both the `gh issue list`/git-log fetch and #575's chain step. The stub branch is untouched. The deferral check is content-keyed (`Origin:` line) with `--source` as the headless-caller equivalent — the one place invoker identity enters, named as such.

### Data / API Surface

- New flags: `--defer-reason=<DEFER_REASONS value>`, `--risk=<low|medium|high>`, `--size=<low|medium|high>`, `--origin="<text>"`.
- Section parse: split on `^## ` lines; heading line stripped; content trimmed; leading text before the first heading → `header`.
- Body layout: composer output (`[header]\n\n[Origin: …]\n\n[Defer-reason: …]\n\n## Current State …\n\n## Deliverables …\n\n(## Acceptance Criteria | ## Open Question) …\n\n_Filed by \`capture\` via specShapedBody._`).

### Key Files

- `skills/capture/SKILL.md` — Shaped-body branch, flags, precedence, presentation line, Backend Selection skip note, anti-pattern reword
- `skills/_shared/work-record.md` — `/capture` row Adds/Never cells
- `skills/init/claude-md-template.md`, `CLAUDE.md` — no-implicit-deferrals bullet
- `tests/deferral-gate-conformance.test.js` — capture + template assertions

### Package Dependencies

None.

## Gotchas

- `capture/SKILL.md` is 26.7 KB — the branch is one section plus a flag-table row; do not duplicate Backend Selection's filing blocks, add a "skip to the filing step with these values" pointer.
- Wait for #575 to merge and re-read capture's Backend Selection before implementing — its born-ready paragraph will read differently (chain-into-specify) than the 6.86.0 text quoted in Current State; the shaped branch's skip point must be placed against the merged text.
- `ready` and `needs:definition` never coexist; `ready` and `parked` never coexist (`recordPayload` throws) — the shaped branch never emits `parked`.
- Anti-pattern row "Writing a full spec as a backlog record" — reword it: a *human* brain-dump that grows past 5 lines still goes to brainstorming; a supplied shaped body is the intended input of this branch, not the anti-pattern.
- Both CLAUDE.md copies (template + this repo) must change together — `tests/claude-md-budget.test.js` pins the repo's line count; keep the bullet short.


<!-- work-fingerprint: 2026-08-16-exhaust-deferral-gate-design:capture-shaped-body-branch-files-spec-shaped-born-ready-clau -->
