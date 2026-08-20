---
record: 283
origin: human
risk: low
size: low
ceremony: fast-lane
grants: []
surface: backend
---
# 283: /claude-tweaks:specify: AC-writing guidance has no note against literal class-string equality

Surface: backend

## Current State

- `/claude-tweaks:specify`'s AC-writing conventions live in `skills/specify/spec-template.md` (the record body template both shaping mode and decomposition mode compose against). Its `## No Placeholders` section lists categories of AC anti-patterns to reject (vague language, ACs that can't convert to a TDD test, "standard error handling," etc.) but has no guidance addressing literal class-string equality specifically.
- Nothing in `spec-template.md`, `shaping-mode.md`, or `decomposition-mode.md`'s AC-writing instructions currently warns against phrasing a "styling/classes unchanged" AC as literal string equality. A spec author (human or `/specify` itself) can write an AC like "the element's `className` must remain byte-for-byte identical" with no structural guardrail catching it.
- Confirmed incident (source of this record): a leaf spec's AC asserted byte-for-byte class-string preservation at a call site. `prettier-plugin-tailwindcss` reorders class tokens on every commit in projects that use it, so the AC was unenforceable through the project's own standard commit pipeline — not because the implementation was wrong, but because the check itself could never pass post-format. Two independent reviewers (a per-task reviewer and a final whole-branch reviewer) each had to manually re-derive class-*set* equivalence from scratch to determine the AC was actually satisfied.

## Deliverables

- [ ] Add a guidance note to `skills/specify/spec-template.md`'s `## No Placeholders` section (alongside its existing "spec failures, never write them" bullet examples): when an AC needs to assert "this element's styling/classes are unchanged," phrase it as class-*set* equivalence or a rendered/visual check — never literal string equality — because a class-sorting formatter (e.g. `prettier-plugin-tailwindcss`) reorders class tokens and makes a literal-string AC structurally unenforceable.
- [ ] Confirm the note requires no separate copy in `shaping-mode.md` or `record-creation.md` — both already compose AC prose against `spec-template.md`'s shared conventions, so one addition in the template covers both modes.

## Acceptance Criteria

1. `skills/specify/spec-template.md` contains a guidance line (or single short bullet) naming both acceptable alternatives explicitly — "class-*set* equivalence" and "a rendered/visual check" — for a "styling/classes unchanged" AC, and states that literal string equality is not acceptable for this purpose.
2. The added note states the reason: a class-sorting formatter (name `prettier-plugin-tailwindcss` as the concrete example) reorders class tokens, making literal-string equality unenforceable through the project's own formatting pipeline.
3. The note is a single bullet addition — not a new subsection — matching the terse `"X" ≠ "Y"` / short-prose-warning style already used by the section's existing entries (e.g. `"feels fast" ≠ "p95 < 200ms on the journey defined in spec 41"`).
4. No other AC-writing guidance in `spec-template.md`, `shaping-mode.md`, or `decomposition-mode.md` is altered — this is an additive note, not a rewrite of existing conventions.

## Technical Approach

Add the note as a new bullet inside `skills/specify/spec-template.md`'s `## No Placeholders` section — the existing list of "spec failures, never write them" examples is the natural home, and the new bullet should follow the same terse format already used there. Example phrasing to adapt (not to copy verbatim without review):

> An AC asserting "styling/classes are unchanged" as literal string equality (e.g. `className === "flex p-4 text-sm"`) — a class-sorting formatter such as `prettier-plugin-tailwindcss` reorders class tokens on every commit, making literal-string equality unenforceable. Phrase it as class-*set* equivalence (e.g. comparing sorted token arrays) or a rendered/visual check instead.

### Key Files

- `skills/specify/spec-template.md` — add the guidance bullet to `## No Placeholders`.

## Gotchas

- This is guidance-only — no code changes, no runtime behavior change. Verification is a manual read of the rendered template section, not a test suite run.
- Don't broaden this into a general "never use string equality for CSS-related assertions" rule — the suggested resolution is scoped specifically to "styling/classes are unchanged" (structural-preservation) ACs, not every possible class-related assertion.
- Match the existing `## No Placeholders` bullets' terseness (single line, `"X" ≠ "Y"` or short prose) rather than writing a new prose subsection — that section's format is already established and this is one more entry in it, not a new pattern.

## Original request

/claude-tweaks:specify: AC-writing guidance has no note against literal class-string equality

**Summary:** A leaf spec's own acceptance criterion demanded literal byte-for-byte class-string preservation at a call site; `prettier-plugin-tailwindcss` reorders class tokens on every commit regardless of authoring intent, making that phrasing structurally unenforceable in any project using Tailwind + `prettier-plugin-tailwindcss`.

**Kind:** Gap

**Affected component:** `/claude-tweaks:specify`'s AC-writing conventions / `spec-template.md`

**Use case:** A spec author wrote an acceptance criterion asserting a rendered element's class list must remain byte-for-byte identical after a refactor. During implementation review, two independent reviewers (a per-task reviewer and a final whole-branch reviewer) each had to re-derive class-*set* equivalence from scratch to determine the AC was actually satisfied, since the class-token order genuinely differs after the project's own formatter runs. The AC's literal wording was, in effect, unverifiable as written — not because the implementation was wrong, but because the check itself couldn't be satisfied through the project's own standard commit pipeline.

**Suggested resolution:** Add a one-line guidance note to `/claude-tweaks:specify`'s AC-writing conventions — when an AC needs to assert "this element's styling/classes are unchanged," phrase it as class-*set* equivalence or a rendered/visual check, never literal string equality, since any project using a class-sorting formatter (e.g. `prettier-plugin-tailwindcss`) cannot satisfy a literal-string AC.

**Plugin version:** 6.74.0

---
Filed via /claude-tweaks:feedback.
