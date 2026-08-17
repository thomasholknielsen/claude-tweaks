---
record: 685
origin: capture
risk: low
size: medium
ceremony: standard
grants: []
surface: terminal
---
# 685: tidy report rendering: width discipline, fenced column layout, command-grouped Yours with batch-pasteable commands

Surface: terminal

## Current State

`/claude-tweaks:tidy`'s report template lives in `skills/tidy/step-6-auto.md` (`#### The report template (standalone auto)`, `#### Bucket mapping`, `### Report rules`) and is mirrored — template restated, rules cross-referenced — in `skills/tidy/step-6-interactive.md`. `skills/tidy/SKILL.md`'s `## Next Actions` derives its options from the report's **Approve ({N})** and **Yours ({N})** sections. `docs/journeys/tidy-standalone-auto-report.md` Step 3 pins the report's shape as a journey expectation.

The template today is four verb-grouped sections (**Applied automatically**, **Approve ({N})**, **Yours ({N})**, **Clean:**) rendered as markdown lists, bound by six Report rules: no box-drawing tables; every actionable line carries a paste-ready command or lands in Approve; a command sits alone on its own line with its annotation on the line above; records render as `#{N} "{title}"`; `decisions.md` referenced once in the footer; empty sections omitted, Clean always present.

A real full sweep (2026-08-16: 181 open records, 16 Yours items) rendered as an unscannable wall:

- 150-200-char prose rows with parentheticals; bold section headers as the only hierarchy.
- Yours mixed single rows with 10-record groups collapsed via `(likewise #41 #113 …)` — no per-record `#N "title"`, no per-record command.
- Clean rendered as a 3-line parenthetical paragraph.
- Commands indistinguishable from body text.

Two causes:

1. The renderer broke Report rules that already exist (one `#N "title"` per record; command alone on its line) and nothing checks conformance of the rendered report before it ships.
2. The template itself has no width rule, no column shape, no grouping rule for Yours, and a Clean shape that does not scale past ~4 scans.

Where the runnable-commands convention lives: **only** in `step-6-auto.md`'s Report rules (tidy is the sole renderer of this report; `_shared/terminal-ux.md` carries the general "what next is a runnable command" principle for error messages, and `/help`'s dashboard has its own Action column). Nothing in `skills/_shared/` states a Yours-row command rule, so there is nothing there to update — this record keeps the rule tidy-local.

## Deliverables

All four scope items compose; **D** is conditional.

**A — Width discipline + conformance scan** (`skills/tidy/step-6-auto.md`, Report rules):

- Add binding width rules: a ~100-character cap per rendered line; one fact per line; record titles truncated to ~50 characters with a trailing `…`; commands always alone on their line (already a rule — keep, and make it the thing the scan checks).
- Add a **conformance scan** step over the rendered report — a scan-row-shaped check the skill runs on the literal markdown it is about to send, *before* the existing "Hard gate (report before question)". Each row names the rule, the check, and the remedy: line length ≤ cap; every Yours row has exactly one `#{N} "{title}"` and one command line; no `(likewise …)` / `(also …)` / `(and N more)` shorthand anywhere; no annotation trailing a command on its line; every row in a section starts its trailing column at one shared offset (an *Aligned* row); Clean rendered as the fenced form below. Against a digest only the line-level rows apply — the section-shape rows are checked against the full report in `report.md`. A non-conformant render is re-rendered, not shipped — the scan is a gate, not a note.

**B — Column layout inside a code fence** (`step-6-auto.md` template + `step-6-interactive.md` mirror):

- Render **Applied automatically**, **Approve ({N})**, and **Yours ({N})** rows as whitespace-aligned columns inside a fenced ```` ```text ```` block (annotation column: tag / `#N` / truncated title / one-line why; command line beneath, indented under its row), so alignment survives Claude Code's terminal renderer. **Clean:** becomes one line per scan inside the same or its own fence (`scan-name  count`), never a parenthetical paragraph.
- Restate the "no box-drawing tables" rule as banning `┌─┐│└─┘` art, not aligned columns — aligned padded text inside a fence is the intended shape.
- Accepted tradeoff, stated in the template: fenced text loses clickable `#N` / path links in the terminal.

**C — Group Yours by the command the human runs** (`step-6-auto.md` Bucket mapping + template; `step-6-interactive.md` mirror; `SKILL.md` Next Actions derivation):

- Yours groups by the leading command the human runs — `specify`, `demo`, `git`, `capture`, `backlog refine`, then a fixed-order fallback group for anything else (`gh`, resume commands, `doctor`) — never by scan step or Shape number. Each group head states the command; records list beneath it.
- **Hard requirement:** every Yours row carries a command pasteable straight into another terminal. When several records share a command, prefer one batch invocation at the group head — batch form **only** where the target skill's `argument-hint` accepts multiple refs (`/claude-tweaks:flow #n,#m` and `/claude-tweaks:dispatch #N,#M` do; `/claude-tweaks:specify` and `/claude-tweaks:demo` are single-ref today per their `argument-hint`) — otherwise a consecutive paste block of single commands, one per record; a command that takes no record (`/claude-tweaks:backlog refine`) renders once as the group's ref-less line. Record-less findings (`[health]`, `[doctor]`, `[pattern]`) render `—` in the record column with their tag in the title column. `(likewise …)` shorthand is never acceptable, and the conformance scan in A rejects it.
- `SKILL.md`'s Next Actions derivation still takes Yours items in report order (now group order); a group head's batch command is a valid option `description`.

**D — Digest + full report file** (only if a Yours-heavy render is still >~40 lines after A+C are applied): render a ~20-line digest in chat (section headers, group heads with counts, first row per group) and write the full report to `{run-dir}/report.md`, referenced once alongside the existing `decisions.md` footer reference. Threshold and shape stated in the template; when the report is under the threshold, D never triggers and no `report.md` is written.

**Docs and tests:**

- Update `docs/journeys/tidy-standalone-auto-report.md` Step 3's Expect (and Step 4 if Yours ordering changes it) to the new shape.
- Extend `tests/sweep-backstop.test.js` (which already reads `step-6-auto.md`) — or a sibling conformance test — to pin the new Report rules' literal text (width cap, no-shorthand rule, command-grouped Yours, conformance-scan heading present) so a later edit that drops them fails CI.

**Explicitly not bundled** (follow-on candidate, deliberately separate): teaching `/claude-tweaks:specify` and `/claude-tweaks:demo` a `#N,#M` batch argument so those Yours groups collapse to one line — file via `/claude-tweaks:capture` if it is still wanted after this lands.

## Acceptance Criteria

- [ ] `skills/tidy/step-6-auto.md`'s `### Report rules` contains a line-width cap (~100 chars), a title-truncation rule (~50 chars), a one-fact-per-line rule, and an explicit ban on `(likewise …)`-style multi-record shorthand.
- [ ] `step-6-auto.md` contains a conformance scan section (heading contains "conformance") positioned before `#### Hard gate (report before question)`, with one row per Report rule it enforces, each naming check + remedy, and stating that a failing render is re-rendered rather than shipped.
- [ ] The report template in `step-6-auto.md` renders Applied / Approve / Yours rows and Clean inside a fenced code block with aligned columns; the "no box-drawing tables" rule text explicitly distinguishes `┌─┐` art (banned) from aligned columns (required); the clickable-link tradeoff is stated.
- [ ] `step-6-auto.md`'s Bucket mapping (or an adjacent "Yours grouping" rule) states that Yours groups by the human's command, names the group order (`specify`, `demo`, `git`, `capture`, `backlog refine`, fallback), and states the batch-vs-paste-block rule keyed to the target skill's `argument-hint`.
- [ ] `step-6-interactive.md`'s template mirrors the new fenced shape and still cross-references (never restates) the Report rules.
- [ ] `skills/tidy/SKILL.md`'s `## Next Actions` derivation still resolves against the new Yours shape (group order = report order; one plain-markdown line per Yours group carrying its batch line, first paste line, or ref-less line — #646's handoff convention) — no dangling reference to per-scan Yours ordering.
- [ ] `step-6-auto.md` states the D threshold (~40 lines) and the `{run-dir}/report.md` digest behavior, and that below the threshold nothing extra is written.
- [ ] `docs/journeys/tidy-standalone-auto-report.md` Step 3 Expect matches the new shape (fenced columns, command-grouped Yours, no shorthand).
- [ ] A `node --test` suite pins the new rule text (width cap, shorthand ban, command grouping, conformance heading) and fails when any is removed; `npm test` passes.
- [ ] `wc -c skills/tidy/SKILL.md` stays ≤ 40960 bytes (the 40 KB SKILL.md ceiling `bin/lib/skill-audit/context-cost.js` enforces) after the Next Actions edit — it is at 40931 bytes today, so the edit must be byte-neutral or move text into a sub-file.
- [ ] A dry rendering of a 16-record Yours section against the new template fits in ≤ ~40 lines with every row covered by a command line (worked example in the journey doc: Yours 37 lines; the whole report is 58, so the digest rule fires — proving D).

## Technical Approach

1. Read `skills/tidy/step-6-auto.md` end-to-end (template, Bucket mapping, Report rules, Hard gate), `step-6-interactive.md`, `SKILL.md` lines around `## Next Actions`, and `docs/journeys/tidy-standalone-auto-report.md`. Read `skills/_shared/terminal-ux.md` `## Output formatting` — its "align columns so the eye can scan one" and "one record per line" principles are the craft basis for A and B; cite it once from the Report rules rather than restating.
2. Rewrite the template block in `step-6-auto.md`: keep the four literal section headers (tests and the journey pin them), move row bodies into a ```` ```text ```` fence with fixed columns, add the Yours group-head form, and the one-line-per-scan Clean form. Mirror the same block into `step-6-interactive.md`, keeping its "rules stated once in step-6-auto.md" cross-reference.
3. Add the width/shorthand/grouping rules to `### Report rules`; add the `#### Conformance scan` section immediately above `#### Hard gate` with a rule → check → remedy table (plain markdown table is fine in skill prose — the fence rule applies to the *rendered report*, not the skill file).
4. Add the Yours grouping rule to Bucket mapping (group order, batch-vs-paste-block keyed to `argument-hint`, no shorthand).
5. Add the D digest rule with its threshold and `report.md` path.
6. Update `SKILL.md`'s Next Actions derivation paragraph so "Yours items, in report order" is read as group order and a batch head command is an acceptable option `description` — byte-neutrally, or by relocating the derivation detail into `step-6-auto.md` with a pointer, because `SKILL.md` has 29 bytes of headroom under the 40 KB ceiling (see Gotchas).
7. Update the journey doc; extend `tests/sweep-backstop.test.js` (or add `tests/tidy-report-rules.test.js`) with literal-text pins for the new rules.
8. Dry-render the 2026-08-16 sweep's Yours set by hand against the new template to prove the ≤ ~40-line target; include it in the PR description.

## Gotchas

- The original body says the fenced column layout "matches `/help`'s dashboard" — it does not: `skills/help/status-scan.md`'s Present Dashboard uses markdown pipe tables, not fenced text. The agreed direction (fence) stands on its own merits — whitespace-preserved alignment plus commands that visibly differ from prose — not on parity with `/help`. Do not "fix" `/help` to match; it is out of scope.
- The runnable-commands convention does **not** live in `skills/_shared/` — the original body asked to check; the answer is: it lives only in `step-6-auto.md`'s Report rules. Keep it there; do not create a `_shared/` file for a single consumer.
- `tests/sweep-backstop.test.js` reads `step-6-auto.md` and pins several routing-table rows (Arm ready PR tiers, ungranted PRs never auto-apply). Do not reword those rows while editing the template and rules — the change is to the report template/rules/bucket mapping only. Run the full suite, not just filename-matched tests (repo-wide conformance tests pin prose).
- `docs/journeys/tidy-standalone-auto-report.md` Step 3's Expect currently pins "No box-drawing tables" — update it to the refined wording (`┌─┐` art banned, aligned columns required) in the same change, or the journey drifts.
- The batch-vs-paste-block rule is keyed to the target skill's `argument-hint` *as it is today* — `specify` and `demo` are single-ref. If the follow-on batch-argument record ships later, the grouping rule needs no edit (it reads the hint), only the rendered output changes.
- `Surface: terminal` was chosen because this record is terminal output formatting — `spec-template.md` names "output formatting" as the terminal case, and it is declared-only (never sniffed), so it is stated here explicitly. The terminal track loads `_shared/terminal-ux.md` at `pre-build` and runs the terminal critic at review; the Impeccable web/native steps skip.
- `skills/tidy/SKILL.md` is 40931 bytes against a 40960-byte ceiling (`bin/lib/skill-audit/context-cost.js`, `CEILING_BYTES = 40 * 1024`, enforced repo-wide by its tests) — 29 bytes of headroom. Any Next Actions wording change must be byte-neutral, or the derivation paragraph must move into a sub-file (`step-6-auto.md` is at ~21 KB and has room) with a one-line pointer left in `SKILL.md`. Check `wc -c` before every commit that touches it.
- Under `worktree-always`, all edits happen in the build worktree; the record's own files are skill prose plus one journey doc and one test — no `bin/` changes.

## Original request

tidy report rendering: width discipline, fenced column layout, command-grouped Yours with batch-pasteable commands

**Related:** #506 (parent of the shipped Applied/Approve/Yours/Clean template — this is a delta on that family), #613 (separate: net-empty branch reclaim)

Context: A real full sweep (2026-08-16: 181 open records, 16 Yours items) rendered as an unscannable wall — 150-200-char prose rows with parentheticals, bold headers as the only hierarchy, Yours mixing single rows with 10-record groups collapsed via "(likewise #41 #113 …)", Clean as a 3-line parenthetical paragraph, commands indistinguishable from body text. Two causes: the renderer broke `step-6-auto.md`'s own Report rules (one `#N "title"` per record, command alone on its line) and nothing checks conformance; and the template itself has no width rule, no column shape, no grouping rule for Yours, and a Clean shape that doesn't scale past ~4 scans.

Scope (agreed direction, all composed): **A** width discipline — ~100-char line cap, one fact per line, titles truncated ~50 chars, commands always alone — plus a conformance scan over the rendered report (IL-rule scan-row shape) so a non-conformant render is caught, not shipped. **B** column layout inside a code fence so alignment survives the terminal (matches `/help`'s dashboard; restate that "no box-drawing tables" bans ┌─┐ art, not alignment); accepted tradeoff: fenced text loses clickable `#N`/path links. **C** group Yours by the command the human runs (specify / demo / git / capture / backlog refine), never by scan step — group head states the command, records listed beneath. **D** only if still >~40 lines after A+C: ~20-line digest in chat, full report written to `{run-dir}/report.md`. **Hard requirement:** every Yours row carries a command pasteable straight into another terminal; when several records share a command, prefer one batch invocation at the group head — batch form only where the target skill's argument-hint accepts multiple refs (`flow #n,#m` and `dispatch #N,#M` do; `specify` and `demo` are single-ref today), otherwise a consecutive paste block of single commands, one per record — "(likewise …)" shorthand is never acceptable. Follow-on candidate, deliberately not bundled: teach `/specify` and `/demo` a `#N,#M` batch argument so those groups collapse to one line. Files: `skills/tidy/step-6-auto.md` (template, Report rules, Bucket mapping), `skills/tidy/step-6-interactive.md`, `skills/tidy/SKILL.md` (Next Actions derives from the sections); check whether the runnable-commands convention lives in `_shared/` and update it there. Origin: `/claude-tweaks:feedback` self-reference stop → local backlog.
