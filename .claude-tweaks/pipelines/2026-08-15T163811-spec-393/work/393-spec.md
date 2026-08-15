---
record: 393
origin: capture
risk: low
size: low
ceremony: fast-lane
grants: []
surface: backend
---
# 393: dispatch frontmatter description silently truncated by unquoted # (YAML comment)

Surface: backend

## Current State

`skills/*/SKILL.md` and other harness-loaded frontmatter files declare a plain-scalar
`description:` value with no quoting. YAML treats an unquoted, unescaped ` #` (a hash preceded by
whitespace) as the start of a line comment — everything after it is silently dropped when the
frontmatter is parsed, truncating the description mid-sentence with no error surfaced anywhere.
This was confirmed live against `skills/dispatch/SKILL.md` at filing time: its description read
"...Bare picklist, next for the headless routine unit, or #N direct..." — parsed, the ` #N
direct...` clause and everything after it silently vanished from what every session actually loads.

Since filing, an unrelated commit (`260715a2`, #394 — "Trim 13 skill frontmatter descriptions and
add a description budget check") rewrote and double-quoted dispatch's own description as a side
effect of an unrelated length trim, incidentally fixing the one confirmed live instance.
`bin/lib/skill-audit/context-cost.js`'s `extractDescription()` also now correctly parses both
quoted and unquoted forms (added by that same commit — its own comment explicitly cites this
record's failure mode). But nothing enforces the fix going forward: a repo-wide re-sweep today
(every `skills/*/SKILL.md`, 32 files) finds zero remaining unquoted-and-hazardous descriptions —
the class is currently clean — but no mechanical check gates a regression, so a future skill (or a
future edit to an existing one) can silently reintroduce the same truncation with nothing to catch
it.

## Deliverables

- A `node --test` test that scans every `skills/*/SKILL.md`'s `description:` frontmatter line and
  fails if any unquoted scalar contains a bare `#` preceded by whitespace (the YAML-comment
  hazard) — reusing or paralleling `extractDescription` (`bin/lib/skill-audit/context-cost.js`) so
  the check and the existing reader agree on what counts as "quoted."
- Confirm — don't just assert — that the sweep is currently clean: the new check runs against the
  live tree as part of its own passing state, not asserted from memory.
- No changes needed to any individual skill's frontmatter — the sweep is already clean; this is a
  regression guard only, not a live fix.

## Acceptance Criteria

1. A new automated check exists and runs as part of `npm test`, covering every `skills/*/SKILL.md`'s
   `description:` line.
2. The check is proven to actually catch the hazard: trigger it once during development against a
   deliberately-reintroduced unquoted description containing a bare ` #`, confirm it fails, then
   revert — not asserted from reading the code.
3. The check passes cleanly against the current tree (0 skills flagged), shown in the test run
   output.
4. Full `npm test` suite remains green.

## Technical Approach

Reuse `bin/lib/skill-audit/context-cost.js`'s `extractDescription` (already handles both
plain-scalar and quoted forms) as the parsing primitive. The new check additionally inspects the
raw pre-quote-stripped frontmatter line to detect an unquoted value containing what would be a
YAML comment start (whitespace immediately followed by `#`, outside any quotes). Land the test in
`tests/bin-lib/skill-audit/` alongside `context-cost`'s existing test coverage if one exists there
— check first rather than assuming a new file is needed.

## Gotchas

- The hazard is specifically "whitespace immediately before `#`" — a `#` with no preceding
  whitespace (inside a word, a URL fragment, an anchor) is not a YAML comment start and must not
  false-positive.
- Don't conflate this with `context-cost.js`'s existing `DESCRIPTION_CEILING_CHARS` length check —
  that's a budget concern, unrelated to this correctness hazard, though both read the same
  `description:` line.
- `agents/*.md` frontmatter (e.g. `agents/qa-agent.md`) carries the same `description:` YAML
  hazard in principle, though today's sweep shows it clean too. The original scope named only the
  33 (now 32) skill frontmatters; extending the same check to `agents/*.md` is the implementer's
  call — cheap given the parsing logic is identical, but not required by the Acceptance Criteria
  above.

## Original request

dispatch frontmatter description silently truncated by unquoted # (YAML comment)

**Related:** #394

Context: The unquoted " #N direct" in skills/dispatch/SKILL.md's description starts a YAML comment, so every session loads the description clipped mid-sentence ("…routine unit, or"). Confirmed live in the harness skill listing.

Scope: quote or reword the scalar; sweep all 33 skill frontmatters for the same hazard; consider a frontmatter lint/test.
