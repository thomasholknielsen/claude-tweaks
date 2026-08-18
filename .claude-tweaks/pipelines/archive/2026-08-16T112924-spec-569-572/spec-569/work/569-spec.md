---
record: 569
origin: capture
risk: low
size: low
ceremony: fast-lane
grants: []
surface: backend
---
# 569: tidy report rules: paste-ready commands must be on their own line, never inline

Surface: backend

## Current State

The tidy report templates render paste-ready commands inline at the end of prose lines, so an operator who copies a whole report line gets prose mixed into the command and it does not run as-is (observed on the 2026-08-16 tidy run):

- `skills/tidy/step-6-auto.md`, report template: the **Approve ({N})** row renders `… {staged action, one line} → approve applies: ` followed by the command in backticks on the same line; the **Yours ({N})** row renders `… {why it needs the human} → ` followed by the command on the same line.
- `skills/tidy/step-6-interactive.md`, report template: the **Approve ({N})** row uses the same shape with `→ apply-all executes:` and the **Yours ({N})** row is identical to the auto surface's.
- The binding `### Report rules` section in `step-6-auto.md` (which the interactive surface cross-references rather than restates) requires every actionable line to carry a paste-ready command, but says nothing about placement — inline-after-prose currently satisfies it.

Sibling report surfaces vary: `skills/backlog/overview-mode.md`'s paste blocks already comply — commands render on their own line inside fenced blocks with `#`-comment annotations on the adjacent line above (its unjustified-annotation rule states "attaches immediately above the command line it annotates"). The `/help` skill's recommendation/report output has not been audited for the same pattern.

## Deliverables

- [ ] Rewrite the **Approve ({N})** and **Yours ({N})** row templates in `skills/tidy/step-6-auto.md` so the annotation (tag, record ref, one-line rationale) and the command render on separate adjacent lines — the command alone on its own line (fenced or plain code line), never appended after prose.
- [ ] Apply the same rewrite to the matching row templates in `skills/tidy/step-6-interactive.md`.
- [ ] Add a binding rule to `step-6-auto.md`'s `### Report rules` section: every paste-ready command renders on its own line, with any annotation on an adjacent line — a command never shares a line with prose. Both surfaces inherit it via the existing cross-reference.
- [ ] Sweep the other report surfaces for the same defect: confirm `skills/backlog/overview-mode.md`'s paste blocks comply (expected: already compliant — verify, do not rewrite), and audit `/help`'s rendered report/recommendation lines, fixing any same-line command render found.
- [ ] Update any conformance tests that pin the old row-template text; `npm test` passes.

## Acceptance Criteria

- [ ] No report row template under `skills/tidy/` renders a command in backticks on the same line as annotation prose — the `→ \`{command}\`` and `→ approve applies: \`…\`` / `→ apply-all executes: \`…\`` shapes are gone from both step-6 files.
- [ ] `step-6-auto.md`'s Report rules state the own-line requirement explicitly, and `step-6-interactive.md` still inherits the rules by cross-reference without restating them.
- [ ] Backlog overview and help surfaces were audited: overview's compliance is confirmed, and any non-compliant help line is fixed in the same change (or the audit result recorded in the PR description if fully compliant).
- [ ] `npm test` passes, including any updated conformance tests.

## Technical Approach

Markdown-only edit. Keep the row's identifying annotation (`[{tag}] #{N} "{title}" — {reason}`) as the first line and move the command to its own following line, matching the convention `skills/backlog/overview-mode.md` already uses (annotation line adjacent to a bare command line). State the rule once in `### Report rules` so future report authors inherit it; the interactive twin keeps its cross-reference-only posture.

## Gotchas

- Record #570 is in flight (PR #578) and edits `skills/tidy/step-6-auto.md`'s routing table — a different section of the same file. Expect merge-adjacent churn; rebase rather than hand-merging routing rows.
- Repo conformance tests pin skill prose repo-wide — run the full suite, not just filename-matched tests, before merging (an earlier markdown PR broke an unrelated conformance suite).
- The `→` arrow appears in legitimate non-template prose across these files — scope any verification grep to the report row templates, not the whole file.

## Original request

tidy report rules: paste-ready commands must be on their own line, never inline

**Related:** #506

Context: 2026-08-16 tidy run rendered action commands inline in prose and as same-line annotations; the operator copies whole lines and expects them to run as-is.

Scope: Report rules in tidy/step-6-auto.md (+ interactive twin) — require fenced/own-line commands with annotations on adjacent lines; likely the same sweep for other report surfaces (backlog overview, help).
