---
record: 704
origin: capture
risk: low
size: low
ceremony: standard
grants: []
surface: backend
---
# 704: Consistency polish for the new Next Actions close-out corpus

Surface: backend

## Current State

#646 migrated every skill's terminal `## Next Actions` block from an `AskUserQuestion` menu to plain-markdown close-outs (convention: `docs/skill-authoring.md`, "Skill handoffs (Next Actions)" — one paste-ready fully-qualified command per line, em-dash annotation, recommended line first, bolded, suffixed `(recommended)`). Its review pass surfaced six low-confidence consistency findings on the freshly converted corpus — single-agent, unreproduced, none a correctness defect (full table preserved in run `2026-08-16T210739-spec-646`'s `staged/review-low-confidence.md`). As of `origin/main` today the six sites read:

1. `skills/build/SKILL.md` `## Next Actions` — the rendered block lists `/claude-tweaks:review {N} full` and `/claude-tweaks:review {N}` as two bare consecutive lines. The prose above them states they are mutually exclusive (UI changed AND browser available → full; otherwise → plain), but the lines themselves carry no `(when ...)` qualifier, unlike the two sibling lines (`test qa` — "(when QA stories exist)", finish-branch — "(when in worktree mode)").
2. `skills/visualize/SKILL.md` `## Next Actions` — three lines: a command line annotated "(recommended if more signals matched)" (not bolded, conditional rather than a fixed recommended slot), a prose line "Continue the calling flow — return to wherever this was invoked from …" (not a command; and the block only renders standalone, per its own Component-Skill Contract, so there is no calling flow to return to), and `{path} — open to view the generated diagram (when persisted)` (a bare path, not a command). No line in the block is bolded.
3. `skills/feedback/SKILL.md` `## Next Actions` — third line is `{created issue URL} — the filed issue, for reading or follow-up`: a bare URL, not a paste-ready command. Earlier ruling when this was raised during #646: the block is a context-drawn template and the convention governs render-time output; the line was left as-is.
4. `skills/flow/worktree-merge.md` `## Next Actions` — two command lines, neither bolded, neither suffixed `(recommended)`; the block has no recommended slot at all.
5. `skills/tidy/SKILL.md` `## Next Actions` — the first (recommended) line is an in-session execute instruction ("Execute Step 7 over the {N} staged items …") explicitly annotated "not a slash command". The convention text in `docs/skill-authoring.md` says "one paste-ready command per line" and does not formally accommodate a non-command action line, so this line is convention-conformant only by local annotation.
6. `skills/help/policy.md` `## Next Actions (apply path)` — the mode's one surviving mid-flow `AskUserQuestion` (the capped apply question) is a blocking apply/write gate, which the convention permits ("decisions that block the skill from finishing"), but the block carries no inline sentence saying so; a reader applying the convention's terminal-menu prohibition has to infer the classification.

## Deliverables

1. **Convention accommodation for non-command action lines** (`docs/skill-authoring.md`, "Skill handoffs (Next Actions)" bullet + the Interaction style directive paragraph if it restates the line rule): add one sentence stating that a close-out line may name a non-command action (an in-session step, a file to open, a URL to visit) only when it carries an explicit annotation marking it as not a command — one fixed wording, chosen once here and used everywhere (tidy's existing "not a slash command" is the incumbent candidate; if a different wording is chosen, tidy's line changes to match). This decides finding 5 and is the rule findings 2 and 3 are then measured against.
2. **`skills/build/SKILL.md`** — add `(when ...)` qualifiers to the two review lines in the rendered block: `full` gets "(when UI changed and a browser is available)", plain gets "(when no UI change or no browser)" — mirroring the two sibling lines' existing form. Prose above the block stays as-is.
3. **`skills/visualize/SKILL.md`** — rework the block so exactly one line is bolded and suffixed `(recommended)` (the `/claude-tweaks:visualize <type> <topic>` command line — its "if more signals matched" condition moves into the line's annotation, not the recommended marker), the `{path}` line becomes a paste-ready command (`open {path}` — annotated per Deliverable 1 if it is judged a non-command), and the "Continue the calling flow" line is either dropped (the block never renders inside a pipeline — the Component-Skill Contract three lines below already omits it) or annotated per Deliverable 1. Dropping is the recommended resolution; keep it only if a standalone reader would otherwise lose a real action.
4. **`skills/feedback/SKILL.md`** — the `{created issue URL}` line either becomes a paste-ready command (`gh issue view {n} --repo {owner}/{repo} --web`, values drawn from the filed issue) or keeps the URL with the Deliverable 1 annotation. Command form is recommended: the skill already has the created issue's number in hand at that point.
5. **`skills/flow/worktree-merge.md`** — bold the `/claude-tweaks:flow {spec} worktree {remaining steps}` line and suffix `(recommended)`; the help line stays plain.
6. **`skills/tidy/SKILL.md`** — bring the "Execute Step 7 …" line's annotation into the exact wording Deliverable 1 fixed (a no-op if "not a slash command" is the wording chosen). Net byte change must be ≤ 0 or the file must be trimmed elsewhere — see Gotchas.
7. **`skills/help/policy.md`** — add one inline sentence at the surviving `AskUserQuestion` ("Otherwise, the mode's ONE `AskUserQuestion` call") classifying it: a blocking apply/write gate under `docs/skill-authoring.md`'s "decisions that block the skill from finishing" clause, not a terminal menu — so the terminal-markdown rule does not apply to it.
8. **Consistency backstop** — after edits, a repo-wide scan of every `## Next Actions` block (`grep -rn '^## Next Actions' skills/`) confirms no other block has the same three defects: (a) two mutually-exclusive command lines without qualifiers, (b) zero bolded `(recommended)` lines in a block that has ≥1 command line, (c) a non-command action line without the Deliverable 1 annotation. Fix any hit in the same run; list scanned blocks and hits in the PR description.

## Acceptance Criteria

- `docs/skill-authoring.md`'s Skill handoffs bullet contains one sentence permitting annotated non-command action lines and naming the fixed annotation wording; the same wording appears in `skills/tidy/SKILL.md`'s Next Actions block and in every other block that keeps a non-command line.
- `skills/build/SKILL.md`: `grep -c 'code + visual review (when' skills/build/SKILL.md` ≥ 1 and `grep -c '— code review (when' skills/build/SKILL.md` ≥ 1.
- `skills/visualize/SKILL.md` Next Actions block: exactly one line matches `^\*\*.*\*\* — .*\(recommended\)`; no line begins with an unbackticked prose verb ("Continue …") unless it carries the Deliverable 1 annotation; the `{path}` line is a command (`open {path}` or equivalent) or carries the annotation.
- `skills/feedback/SKILL.md` Next Actions block: the third line is a backticked `gh issue view` command or carries the Deliverable 1 annotation — no bare `{created issue URL}` line remains.
- `skills/flow/worktree-merge.md` Next Actions block: exactly one line matches `^\*\*.*\*\* — .*\(recommended\)` and it is the `/claude-tweaks:flow` line.
- `skills/help/policy.md`: the paragraph introducing the mode's one `AskUserQuestion` contains a sentence with both "block" (blocking gate) and "not a terminal menu" (or equivalent phrasing that names the convention clause) — verifiable by grep for `terminal menu` in that file.
- Every touched `SKILL.md` and sub-file stays ≤ 40 KB (`tests/bin-lib/skill-audit/context-cost.test.js` guards); in particular `skills/tidy/SKILL.md` and `skills/build/SKILL.md` do not exceed their current headroom.
- `npm test` passes in full (conformance suites pin close-out prose repo-wide — run the full suite, not filename-matched files only).
- The PR description lists the Deliverable 8 scan: every `## Next Actions` block scanned, hits (if any) and their fix.

## Technical Approach

Markdown-only edits, no code. Order: Deliverable 1 first (it fixes the wording the others reference), then the six site edits, then the Deliverable 8 scan, then `npm test`. Read each block's surrounding prose before editing — build's block is preceded by an instruction paragraph that already states the exclusivity rule (leave it; only the rendered lines change), and tidy's block is preceded by a derivation paragraph that restates the annotation (change both occurrences if the wording changes). Keep every edit surgical: the finding is inconsistency, not structure — do not re-shape a block beyond the named change.

## Gotchas

- `skills/tidy/SKILL.md` is ~261 bytes under the 40 KB SKILL.md ceiling on today's `origin/main` (40699 bytes); `skills/build/SKILL.md` has ~1.7 KB. Measure `wc -c` before and after; if Deliverable 6's wording is longer than the incumbent, trim an equivalent number of bytes elsewhere in tidy's block rather than raising the ceiling.
- Conformance tests pin close-out prose (`tests/*.test.js` grep the "Skill handoffs" convention text and several skills' Next Actions blocks). A wording change in `docs/skill-authoring.md` may need a matching pin update — search `tests/` for the exact phrase being edited before changing it, and update the pin in the same commit.
- Finding 3 (feedback) was previously parked with an explicit ruling that a context-drawn template is not itself convention-bound. This record reopens it deliberately under the Deliverable 1 rule; if the build concludes the URL line is fine once annotated, that is an accepted outcome — the acceptance criterion allows either form.
- The scope names six sites; Deliverable 8's scan may find more. Fix same-class hits in the same run (they are the same one-line change), but a hit needing structural rework goes to a new record via `/claude-tweaks:capture`, not into this one.
- The installed plugin build reads this repo's committed config with older code — none of these edits touch a contract another consumer reads (no frontmatter, no `_shared/*.md` schema), so no expand-contract migration applies.

## Original request

Consistency polish for the new Next Actions close-out corpus

**Related:** #646

Context: #646's review surfaced 6 low-confidence consistency findings on the freshly converted markdown close-outs (single-agent, unreproduced; full table preserved in run 2026-08-16T210739-spec-646's staged/review-low-confidence.md).

Scope: add (when ...) qualifiers to build's two mutually-exclusive review lines; bold/command-format the visualize and feedback non-command lines where sensible; add a bolded (recommended) line to flow/worktree-merge.md; decide how the convention accommodates tidy's non-slash action line; add an inline gate-classification sentence to help/policy.md's surviving AskUserQuestion.

