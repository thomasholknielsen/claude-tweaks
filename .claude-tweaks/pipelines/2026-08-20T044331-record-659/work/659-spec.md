---
record: 659
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build]
surface: backend
---
# 659: skill-authoring interaction style: option descriptions state consequences, never the deliberation behind the recommendation

Surface: backend

## Current State

`docs/skill-authoring.md`'s `## Interaction patterns` section (the "Decisions" bullet) and its `## Interaction style directive` section together document how a skill constructs an `AskUserQuestion` option — but neither states any constraint on what an option's `description` field may contain. Verified against the current file (2026-08-17): grepping both sections for any rule about description *content* (as opposed to structure — batch tables, option counts, the terminal-menu-vs-markdown split from #646) returns nothing. The gap is real, not already covered.

Observed defect: at the single most user-facing moment of a 9-hour run — the end-of-run merge decision — the Recommended option's `description` read:

> `"Mark PR #583 ready + gh pr merge --squash? No — this repo merges with a merge commit per its existing PR history; mark ready, merge, close #563–#566 via the Fixes lines, release claims, tear down the worktree and run dir"`

A self-posed question, its own answer, and a five-clause run-on inside a two-line option box — deliberation leaking into the option surface instead of stating the option's consequence.

**Empirical scan of the current corpus** (`grep -rEon '`description`: `"[^"]*"`' skills/`, 211 matches across all `skills/**/*.md` prose-authored `AskUserQuestion` option blocks): zero currently contain a literal `?` inside the description text — the corpus is clean on that signal today, so a `?`-detection conformance check can be added with zero pre-existing violations to fix. Six existing descriptions exceed 140 characters (up to 229 chars — `skills/wrap-up/review-console.md:292`, `skills/flow/multispec-review-console.md:81`, `skills/backlog/refine-lanes.md:273`, `skills/init/bootstrap/step-06-worktree-configuration.md:29`, `skills/specify/design-pre-steps.md:73`, plus one more), all of which are legitimate multi-clause **consequence** statements for complex batch "apply-all" console options — not deliberation, no self-posed question. A hard length gate at ~140 chars (the issue's suggested threshold) would false-positive on these six today; length alone does not discriminate deliberation from a long-but-legitimate consequence description as cleanly as the `?` signal does. See Gotchas.

Related: #639 (Recommended justified on churn/effort), #646 (Next Actions render form — the sibling change to this same doc section, precedent for how to scope an expand-contract sweep here).

## Deliverables

- [ ] `docs/skill-authoring.md` — add one constraint to the `## Interaction patterns` section's "Decisions" bullet (the existing home for `AskUserQuestion` option-construction guidance — see Gotchas for why this bullet rather than the byte-pinned `## Interaction style directive` blockquote): an option `description` states the consequence of choosing it, in one clause; rejected alternatives and the reasoning behind a recommendation belong in the message body above the call (or, for a multi-item batch, in the table's own row prose), never inside an option's `description` field.
- [ ] New conformance check (new module in `bin/lib/skill-audit/`, mirroring the existing scan pattern in `bin/lib/skill-audit/anti-patterns.js`, plus a corresponding `node --test` suite in `tests/bin-lib/skill-audit/`) that scans every shipped `skills/**/*.md` for an `AskUserQuestion` option's `description` field and flags any that contains a literal `?` — the discriminating signal confirmed clean (zero hits) against the current corpus above. Do not gate on a hard character-length threshold — the empirical scan above shows ~140 chars false-positives on six existing, legitimate long descriptions; if a length signal is added at all, it is non-blocking/advisory only, at a threshold clear of the 229-char legitimate maximum found above (documented, not enforced as a test failure).
- [ ] The new check runs as part of `npm test` (added to the existing `tests/bin-lib/skill-audit/` suite set, picked up by the recursive glob per CLAUDE.md's `## Commands`) — no new npm script needed.

## Acceptance Criteria

1. `docs/skill-authoring.md`'s "Decisions" bullet states the new constraint in the exact terms above (consequence-in-one-clause; rejected alternatives/reasoning excluded from the option `description`), readable in context without needing this record open alongside it.
2. A new `node --test` suite fails when run against a fixture `AskUserQuestion` option block whose `description` contains a literal `?`, and passes against the current shipped `skills/**/*.md` corpus unchanged (zero pre-existing violations, confirmed above) — i.e., adding the check does not require fixing any existing file.
3. `npm test` passes in full with the new suite included.
4. No skill's `## Interaction style directive` blockquote (the byte-pinned line restated at the top of every SKILL.md, pinned by `tests/bin-lib/skill-audit/house-structure.test.js`) is modified by this change — confirm via `git diff` that no `> **Interaction style:**` line changed, and that `house-structure.test.js`'s existing pin still passes unmodified.

## Technical Approach

Two independent, small edits — no shared state, no ordering dependency:

1. **Docs edit**: insert the new sentence(s) into the existing "Decisions" bullet in `docs/skill-authoring.md`'s `## Interaction patterns` section (currently the line beginning "**Decisions** — call the `AskUserQuestion` tool with human-readable options..."). Keep it to the one clause the issue itself proposes; no new subsection needed.
2. **Conformance check**: a new `bin/lib/skill-audit/*.js` module that (a) locates `AskUserQuestion` option blocks in a skill file's prose — the existing corpus convention is a line shaped `- Option N — `label`: `"..."`, `description`: `"..."`` (in-fence templates use the same shape inside a code block) — and (b) extracts each `description` field's literal string content, flagging any containing `?`. Model the module and its test file on `bin/lib/skill-audit/anti-patterns.js` / `tests/bin-lib/skill-audit/anti-patterns.test.js`'s existing shape (parse function unit-tested in isolation, then one test that walks every shipped skill file). Run the empirical scan (reproducible via `grep -rEon '`description`: `"[^"]*"`' skills/`) once more at implementation time in case the corpus has drifted since this record was shaped, and re-confirm zero `?` hits before wiring the check in as a hard failure.

## Gotchas

- **Location judgment call**: the issue's suggested shape says "Add one constraint to `docs/skill-authoring.md`'s Interaction-style directive." Read literally, that names the `## Interaction style directive` section — but that section documents the byte-identical one-line blockquote restated verbatim at the top of every one of the 33 SKILL.md files (pinned whole-line by `house-structure.test.js`); expanding *that* line would require the same 33-file sweep + test-pin update #646 actually did for a related but distinct concern (terminal `## Next Actions` rendering). The new rule here is about `description`-field *content*, not about when the directive fires — it fits the existing `## Interaction patterns` → "Decisions" bullet (already the per-option authoring-guidance home) far better, and needs no multi-file sweep. This record deliberately targets the narrower, lower-blast-radius location; if a future reviewer judges the terser blockquote should also gain a clause, that is a separate, larger expand-contract change out of scope here.
- **Length-threshold premise checked against the live corpus and found not to hold cleanly**: the issue's optional stretch goal — "flagging option descriptions containing `?` or exceeding ~140 chars" — was verified against all 211 current `AskUserQuestion` option `description` occurrences in `skills/**/*.md` before writing this record. Zero contain `?` (confirmed clean baseline for that check); six exceed 140 chars, up to 229, and all six are legitimate multi-clause consequence statements for complex batch console options, not deliberation. The observed real defect (quoted in Current State) is itself ~230 characters — the same order of magnitude as the legitimate long descriptions — so length cannot discriminate the defect class as reliably as the `?` signal does. Scope this record's hard-gated check to the `?` signal only; do not add a blocking length gate without either raising the threshold well past 229 or exempting the identified console-batch pattern, and treat that as a separate follow-up if wanted.
- **`work-types: labels`** — this repo stamps Type via a label (`type:task`), not the native GitHub Issue Type field; #659 already carries `type:task`, so no Type stamp is needed on promotion.

## Original request

skill-authoring interaction style: option descriptions state consequences, never the deliberation behind the recommendation

## Overview

An `AskUserQuestion` option description can carry the model's unresolved internal deliberation instead of the choice's consequence. Observed at the single most user-facing moment of a 9-hour run — the end-of-run merge decision — whose Recommended option read:

> `description: "Mark PR #583 ready + gh pr merge --squash? No — this repo merges with a merge commit per its existing PR history; mark ready, merge, close #563–#566 via the Fixes lines, release claims, tear down the worktree and run dir"`

A self-posed question, its own answer, and a five-clause run-on inside a two-line option box. The surrounding Review Console was otherwise clean — the defect is specifically deliberation leaking into the option surface.

Related: #639 (Recommended justified on churn/effort), #646 (Next Actions render form).

## Suggested shape

Add one constraint to `docs/skill-authoring.md`'s Interaction-style directive: an option `description` states the consequence of choosing it, in one clause — rejected alternatives and the reasoning behind the recommendation belong in the message body above the call, never inside an option. Optionally pin with a conformance check flagging option descriptions containing `?` or exceeding ~140 chars in skill-authored templates.

**Origin:** `/claude-tweaks:feedback` session evaluation (Developer joy lens), run 2026-08-16T091924-spec-563-564-565-566.

**Files:** docs/skill-authoring.md

