---
record: 781
origin: human
risk: low
size: medium
ceremony: standard
grants: []
fingerprint: feedback-9ec7c6ab
surface: backend
---
# 781: capture: no multi-entry/batch filing mode

Surface: backend

## Current State

`/claude-tweaks:capture` files exactly one record per invocation — `skills/capture/SKILL.md`'s `## Workflow` describes a single `$TITLE`/`$BODY`/`$TYPE` payload and one `gh issue create` call. Filing 7 related, already-scoped items in one session required a hand-rolled Node script (a JSON entries file plus a loop calling `recordPayload`/`gh issue create`) outside the skill entirely — bypassing the per-item label-bootstrap, type-branch, and routing logic the skill would otherwise apply. Any multi-finding producer (a user with several small scoped items, or another skill after an audit) hits the same wall: N separate `/capture` invocations or an ad-hoc reimplementation.

## Deliverables

- A documented multi-entry input form for `/claude-tweaks:capture` — e.g. one entry per line, and/or `--batch <file>` pointing at a JSON/YAML list of `{title, body, type}` — looping the existing single-entry payload-build + create steps per entry.
- Each entry still gets the skill's per-item logic: cap/redirect check, type branch, label bootstrap, and born-ready chaining where its conditions hold.
- One routing/confirmation pass for the whole set rather than per item.
- Parity across both drivers (`github-issues` via `recordPayload` + `gh issue create`, `local-files` via `local-store.js`).

## Acceptance Criteria

- A batch of N well-formed entries files N records through the skill's own payload path with a single confirmation pass.
- Single-entry invocations behave exactly as today — the batch form is additive.
- The interaction of batch mode with the oversize-capture redirect and the born-ready `--chained` chain is explicitly specified per entry (an entry tripping the redirect is reported and skipped or redirected individually, never silently dropped, and never aborts the sibling entries' filings).
- Partial failure is reported per entry — which filed, which did not — per the per-call fail-safe batching convention.
- `npm test` passes.

## Technical Approach

Extend `skills/capture/SKILL.md`'s Input and Workflow sections with the batch form; loop the existing `recordPayload`/`gh issue create` steps (and the `local-store.js` equivalent) per entry with per-call fail-safe batching. Choose the input syntax against the real usage that motivated this — the 7-item session used a JSON entries file, which suggests `--batch <file>` as the primary form. Specify per-entry semantics for the cap check and the born-ready chain before writing the workflow text.

## Gotchas

- Entries that individually trip the oversize-capture redirect need defined batch behavior; the cap itself is under revision in #783 (gameable line-count unit) — coordinate so the batch form encodes the revised cap, not the old one.
- The born-ready chain invokes `/claude-tweaks:specify #{n} --chained` per record — N chained shaping runs per batch may need sequencing or an explicit opt-out to keep batch filing fast.
- The `github-issues` snippet's temp-file paths are being made session-unique in #784 — a batch loop reusing one temp path per entry must not reintroduce the collision inside its own loop.

## Original request

capture: no multi-entry/batch filing mode

**Summary:** Filing 7 related, already-well-defined backlog items required a hand-rolled Node script (a JSON entries file plus a loop calling `recordPayload`/`gh issue create`) because `/claude-tweaks:capture`'s documented procedure files exactly one record per invocation.

**Kind:** Gap

**Affected component:** `skills/capture/SKILL.md`

**Objective:** Automation efficiency

**Use case:** A user (or another skill, e.g. after a multi-finding audit) has several small, independent, already-scoped items to capture as backlog records in one go. Today's `## Workflow` only describes a single `$TITLE`/`$BODY`/`$TYPE` payload and one `gh issue create` call, so a batch of N items either needs N separate `/capture` invocations or, as happened this session, an ad-hoc script that reimplements `recordPayload` + `gh issue create` in a loop outside the skill entirely — bypassing whatever label-bootstrap/type-branch logic the skill would otherwise apply per item.

**Proposed fix:** Add a documented multi-entry input form to `/claude-tweaks:capture` (one entry per line, or `--batch <file>` pointing at a JSON/YAML list of `{title, body, type}`), looping the existing single-entry payload-build + `gh issue create` steps per entry, with one routing/confirmation pass for the whole set rather than per item.

**Definition:** Clear

**Plugin version:** 6.88.0

---
Filed via /claude-tweaks:feedback (session evaluation).
<!-- fingerprint: feedback-9ec7c6ab -->
