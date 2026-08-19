---
record: 783
origin: human
risk: low
size: low
ceremony: fast-lane
grants: []
fingerprint: feedback-e4f603ba
surface: backend
---
# 783: capture: the ~5-line hard cap is gameable — satisfied in letter, defeated in substance

Surface: backend

## Current State

`skills/capture/SKILL.md`'s "Hard cap: ~5 lines per entry" rule (the `### Hard cap` section, line ~271) is meant to redirect anything past raw-capture scope to `/superpowers:brainstorming`, but it measures newline-delimited lines, not content. A measured batch of 7 entries in one session were each exactly 5 lines yet 825–1,014 characters — full audit-derived specs with file:line evidence and multi-part fixes — and none were redirected. A long-but-5-line entry is indistinguishable at capture time from the genuinely terse entries the format is designed for: the cap is satisfied in letter and defeated in substance.

## Deliverables

- Re-express the cap in a unit wrapping can't game — e.g. a character budget on the combined `Context:` + `Scope:` fields (roughly 400 characters, matching the two-line examples under "Good entries") — replacing or supplementing the line count.
- A named, sanctioned exception path for legitimately dense, evidence-carrying captures (audit- or health-sweep-derived findings that arrive with a determined fix), so that case takes an explicit branch instead of implicitly working around the cap.
- Any conformance tests or cross-file restatements pinning the current "~5 lines" phrasing updated in the same pass.

## Acceptance Criteria

- An entry within the line count but exceeding the new content budget triggers the redirect — or the sanctioned exception branch — rather than filing directly as a backlog record.
- Genuinely terse entries within the budget file exactly as today.
- The exception path is named in the skill text with an explicit qualifying condition (not "use judgment"), so a dense capture takes a deliberate branch.
- `npm test` passes, including the skill-prose conformance suites.

## Technical Approach

Edit the `### Hard cap` section of `skills/capture/SKILL.md`: state the budget over the content-bearing fields in characters, keep the brainstorming redirect, and add the exception branch adjacent to the existing branch structure. Reconcile with the Shaped-body branch, which already skips the cap for spec-shaped `$BODY` input — the dense-capture case may belong there rather than in a new branch. Before editing, sweep for other restatements of the 5-line cap (skills, docs, tests) per the state-it-once convention.

## Gotchas

- The Shaped-body branch already bypasses the cap for spec-shaped input; the new exception must be reconciled with it, not duplicated alongside it.
- Conformance tests may byte-pin the current cap prose repo-wide — run the full suite, not just capture-named test files.
- `SKILL.md` files can sit near a byte-ceiling budget; check `wc -c` headroom before adding a branch, and slim first if headroom is thin.

## Original request

capture: the ~5-line hard cap is gameable — satisfied in letter, defeated in substance

**Summary:** Capture's "Hard cap: ~5 lines per entry" redirect rule ("If it takes more than 5 lines to describe, it's past the raw-capture stage — run /superpowers:brainstorming on it instead") counts newline-delimited lines, not content. A batch of 7 entries this session were each exactly 5 lines but 825-1,014 characters — full audit-derived specs with file:line evidence and multi-part fixes — and the cap never redirected any of them to brainstorming.

**Kind:** Defect

**Affected component:** `skills/capture/SKILL.md` — "Hard cap: ~5 lines per entry"

**Objective:** Instruction efficacy

**Repro steps:**
1. Compose a capture entry whose `Context:`/`Scope:` lines are long paragraphs (400-600+ characters each) rather than short sentences, keeping the total at exactly 5 newline-delimited lines.
2. Invoke `/claude-tweaks:capture` with that entry.

**Expected vs. actual:**
Expected: an entry substantively past raw-capture scope (dense evidence, multiple named fixes, full spec-shaped content) is caught by the cap and redirected to `/superpowers:brainstorming`, per the rule's own stated intent.
Actual: the rule only measures line count, so a long-but-5-line entry sails through uncapped and gets filed directly as a backlog record, indistinguishable at capture time from the genuinely-terse entries the format is designed for.

**Proposed fix:** Express the cap in a unit wrapping can't game — e.g. a character budget on the `Context:` + `Scope:` fields combined (roughly 400 characters, matching the two-line examples in "Good entries") — and add a named, sanctioned exception path for legitimately dense, evidence-carrying captures (e.g. audit- or health-sweep-derived findings that already have a determined fix), so that case takes an explicit branch instead of an implicit workaround of the stated cap.

**Definition:** Clear

**Plugin version:** 6.88.0

---
Filed via /claude-tweaks:feedback (session evaluation).
<!-- fingerprint: feedback-e4f603ba -->
