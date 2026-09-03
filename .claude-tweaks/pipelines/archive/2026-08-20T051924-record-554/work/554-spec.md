---
record: 554
origin: human
risk: low
size: low
ceremony: fast-lane
grants: [build, merge]
surface: backend
---
# 554: Deduplicate auto-decision-log entry-grammar copy in skills/research/verify-mode.md

Surface: backend

## Current State

`skills/research/verify-mode.md`'s `### Logging a drop` section (around line 113) carries a
verbatim copy of `skills/_shared/auto-decision-log.md`'s Entry schema grammar line:

```
- {STATUS} {HH:MM:SS} — {step or location}: {short action}. {detail line if needed}. Reversibility: {high|med|low}{; commit ref or stage path}.
```

`skills/_shared/auto-decision-log.md`'s own Entry schema section (line 70) is the canonical
definition. The two are already out of sync: `#535` added an optional trailing `[lever: {key}={value} ({source})]`
element to the shared schema (documented in `_shared/auto-decision-log.md`'s "Lever attribution"
subsection), and `verify-mode.md`'s copy never picked it up. This is harmless today — the field is
optional and no reader of `verify-mode.md` requires it — but it is the exact multi-copy drift
CLAUDE.md's "state once" cross-references rule exists to prevent (every relationship/definition
stated once, elsewhere restated only by citation).

Confirmed by direct inspection: `skills/research/verify-mode.md:113` matches
`skills/_shared/auto-decision-log.md:70` verbatim except for the missing `[lever: ...]` suffix.

Origin: `#535` final whole-branch review (a minor finding outside that record's own AC-5 file
list), routed to backlog by the wrap-up ledger gate.

## Deliverables

Replace the duplicated grammar-line copy in `skills/research/verify-mode.md`'s `### Logging a
drop` section with a citation of `skills/_shared/auto-decision-log.md`'s Entry schema, instead of
restating the grammar pattern. The file's existing worked example immediately below (the concrete
`AUTO 14:22:07 — verify filter: dropped ...` line) demonstrates the schema in context and should
stay — only the standalone abstract grammar-line copy is removed.

## Acceptance Criteria

- [ ] `skills/research/verify-mode.md` no longer contains a second copy of the literal grammar
  pattern `{STATUS} {HH:MM:SS} — {step or location}: {short action}. {detail line if needed}.
  Reversibility: {high|med|low}{; commit ref or stage path}` — the section instead cites
  `_shared/auto-decision-log.md`'s Entry schema by name/reference.
- [ ] The section still names `decisions.md`, still cites `auto-decision-log.md`, and still
  contains at least one `Reversibility:` occurrence (the worked example satisfies this) — these
  three are independently pinned by `tests/research/skill-md.test.js`'s existing
  `'verify-mode.md logs every filter drop to decisions.md in the shared entry format'` test.
- [ ] `tests/research/skill-md.test.js` and `tests/research/cross-refs.test.js` pass unchanged.
- [ ] `npm test` passes in full.
- [ ] The shared Entry schema (`_shared/auto-decision-log.md`) is left untouched — this record
  only removes the downstream copy, it doesn't change the canonical definition.

## Technical Approach

Read `skills/_shared/auto-decision-log.md`'s Entry schema section (`## Entry schema`, ~lines
59-90) and `skills/research/verify-mode.md`'s `### Logging a drop` section (~lines 111-124).
Remove the standalone grammar-line copy at line 113 and replace the surrounding prose so it cites
the shared file directly (a phrasing close to what's already partially there — "in the entry
schema `skills/_shared/auto-decision-log.md` defines" — just without also restating the pattern
underneath it). Leave the worked `AUTO 14:22:07 …` example that follows in place, since it already
satisfies the existing test's `Reversibility:` assertion on its own. Run
`node --test tests/research/skill-md.test.js tests/research/cross-refs.test.js` first for a fast
signal, then the full `npm test` before considering this done.

## Gotchas

- Don't delete the schema reference entirely while trimming the grammar line — the section still
  needs to point a reader at `_shared/auto-decision-log.md` by name, not just drop the citation
  along with the duplicate.
- Keep the worked example (`AUTO 14:22:07 — verify filter: dropped ...`) untouched — it's what
  keeps `tests/research/skill-md.test.js`'s `Reversibility:` assertion green after the abstract
  grammar line is removed.
- This record is scoped to `skills/research/verify-mode.md` only, per the issue's own Origin note
  (a single finding from `#535`'s review, outside that record's file list). A broader sweep for
  the same duplication pattern elsewhere in `skills/` is out of scope here — if one turns up during
  the fix, file it separately rather than expanding this record's diff.

## Original request

Deduplicate auto-decision-log entry-grammar copy in skills/research/verify-mode.md

`skills/research/verify-mode.md:113` carries a verbatim copy of `_shared/auto-decision-log.md`'s entry-schema grammar line — now missing the optional `[lever: …]` element #535 added. Harmless today (the field is optional and no reader may require it), but it is the exact multi-copy drift the state-once rule exists to prevent.

Proposed: replace the copy with a citation of the shared contract's Entry schema (or keep a deliberately-partial example explicitly labeled as such).

Origin: #535 final whole-branch review (minor finding, outside that record's AC-5 file list); routed to backlog by the wrap-up ledger gate.
