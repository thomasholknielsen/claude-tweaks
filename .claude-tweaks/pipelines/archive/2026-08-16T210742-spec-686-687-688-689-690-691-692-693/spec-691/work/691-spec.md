---
record: 691
origin: capture
risk: medium
size: medium
ceremony: standard
grants: []
surface: backend
---
# 691: flow: extend consoleAutoResolve to cover the Review Console's spec-edit and hindsight-filing class

Surface: backend

## Current State

- `_shared/autonomy-ceiling.md`: `consoleAutoResolve` is `unattended`-only and already resolves *every* console section (batch table, `Q#`, `M#`, `U#`) — at `unattended` nothing here is missing. At `trusted`, `queueWriteAutoFile` auto-creates proposed records (from ledger narrowing, leftover routing, `/reflect` tangential-idea routing) but the console's remaining classes still prompt.
- One `auto` run hit 3 `AskUserQuestion` stops (Manifesto, Review Console, plus the invented third stop #688 tracks); every one resolved to the pre-marked Recommended option with zero later reversion. The two console actions in play — editing spec/record bodies for accuracy, and filing staged hindsight findings (`/reflect hindsight` Capture-disposition records) — are additive, reversible GitHub writes.
- Second ask (model pin): the "whole-branch review" is `/superpowers:subagent-driven-development`'s final review, dispatched by that third-party skill from `/build` (`build/SKILL.md` Execution strategy) — it is **not** one of `_shared/subagent-output-contract.md`'s enumerated Frontier singleton slots. That contract also states that `CLAUDE_CODE_SUBAGENT_MODEL` and the session's `/model` are harness-level and always win — the plugin defers by design. "Pin so `/model` can't downgrade it" therefore contradicts current contract text and rests on an unmeasured premise (whether an explicit Agent `model` parameter beats session `/model`).
- **Related:** #642 (consoleAutoResolve report contradiction), #688, #670 (resolve-profile invocation form).

## Deliverables

1. Classify the Review Console's remaining prompt classes at `trusted`: enumerate every item kind the console can present (`wrap-up/review-console.md`, `flow/multispec-review-console.md`) and, for each additive + reversible class (record-body accuracy edits, hindsight-finding filings via `Q#`), add or extend a bookkeeping capability in `bin/lib/issues/autonomy.js`'s `bookkeepingPermissions` unlocked at `trusted` (e.g. widen `queueWriteAutoFile` to hindsight `Q#` rows; add `recordBodyEditAutoApply`), documented in `_shared/autonomy-ceiling.md`'s Bookkeeping table with the same logged / reversible guarantees. `consoleAutoResolve` stays `unattended`-only.
2. Model-pin decision, recorded rather than assumed: (a) probe whether an explicit `model` on the Agent tool call is honored when the session `/model` differs (empirical, throwaway dispatch); (b) if it is, have `/build`'s subagent-driven-development invocation instruct the final whole-branch review dispatch to resolve `[Use: Capable]` via `bin/resolve-profile.js` and pass it explicitly, logging the resolved model to `decisions.md`; if it is not, amend `_shared/subagent-output-contract.md`'s Overrides paragraph to say so explicitly and log the session model at review time so a downgrade is at least visible. Either way the outcome lands in the contract text.

## Acceptance Criteria

- `bookkeepingPermissions('trusted')` returns the new/widened capability and the tier below does not; unit test in `tests/bin-lib/` covers both.
- `_shared/autonomy-ceiling.md`'s Bookkeeping table has a row per new capability naming its caller file; `wrap-up/review-console.md` + `flow/multispec-review-console.md` gate the corresponding class on it and log one AUTO line per resolved item.
- `_shared/subagent-output-contract.md`'s Overrides paragraph states the measured `/model`-vs-explicit-`model` behavior with the probe date; `build/SKILL.md` names the whole-branch review's model resolution/log step.
- `npm test` green.

## Technical Approach

Node change in `autonomy.js` + tests, then prose. Do the model probe first — it decides deliverable 2's shape.

## Gotchas

- Assumes the three-stops-all-Recommended pattern generalizes from one run (unvalidated — n=1; the capability stays gated by ceiling + logging, so the cost of being wrong is a reversible write).
- Assumes session `/model` can silently downgrade the whole-branch review (unvalidated — the contract says harness wins; whether an explicit Agent `model` overrides it is unmeasured; probe before writing prose).
- Assumes the whole-branch review is a contract-enumerated Frontier singleton (false — it is a third-party dispatch; the Frontier slot table in `subagent-output-contract.md` does not list it; the fix is a Capable resolution + visibility, not a Frontier pin).
- `consoleAutoResolve` at `unattended` already covers everything; don't duplicate it at `trusted` — add narrow capabilities.

## Original request

flow: extend consoleAutoResolve to cover the Review Console's spec-edit and hindsight-filing class

**Related:** none

Context: In one run, all 3 AskUserQuestion stops (including the Review Console) resolved to the pre-marked Recommended option with zero later reversion -- both console actions (editing spec bodies for accuracy, filing staged hindsight findings) are additive and reversible GitHub writes.

Scope: Extend `_shared/autonomy-ceiling.md`'s `consoleAutoResolve` to cover this class at the appropriate ceiling; separately, pin the whole-branch-review dispatch's model explicitly so a session-level /model change can't silently downgrade a contract-enumerated Frontier singleton slot.

## Build note

Deliverable 2 (model-pin probe) done: an explicit per-invocation `model` on an Agent/Task dispatch overrides the session's ambient `/model` (probed 2026-08-17, single throwaway-dispatch observation — see `skills/_shared/subagent-output-contract.md`'s Overrides paragraph and `skills/build/SKILL.md`'s whole-branch-review model resolution step, commit `6524f956`).

Deliverable 1 BLOCKED, accepted as the correct outcome rather than reworked — independently verified both of the implementer's supporting claims:

- "Hindsight `Q#` filings" are already covered by the existing `queueWriteAutoFile` capability (`bin/lib/issues/autonomy.js:239`, `_shared/autonomy-ceiling.md`'s Bookkeeping table) — its detection is source-agnostic (keys on the `-- backlog candidate` decisions.md phrase, not on which pipeline phase produced it), so a hindsight-sourced tangential-idea proposal already auto-files at `trusted` with no code change needed.
- "Record-body accuracy edits" does not exist as a currently console-gated, additive+reversible class to attach a new capability to. The one place the codebase explicitly reasons about auto-editing an *existing* record's body — `skills/specify/decomposition-mode.md`'s `extend` disposition — states the opposite conclusion: "NEVER auto-modify an existing record's body — that's not reversible enough" (verified verbatim at line 62). The other body-editing site (`review/cross-spec-promise-check.md` Step 1.6) already runs unconditionally at every ceiling, with no console gate to widen.

Given `solution:unjustified` was already on this record, fabricating a `recordBodyEditAutoApply` capability with nothing real to gate would have reproduced exactly the failure mode the label flags. No changes to `bin/lib/issues/autonomy.js`, `_shared/autonomy-ceiling.md`, `wrap-up/review-console.md`, or `flow/multispec-review-console.md`. Deliverable 1's narrower recommendation (scope a future issue around an inspectable Pending-review subset signal, if the friction recurs) is left for a human decision, not auto-filed as a new record by this run — Q# auto-filing during wrap-up's own Phase 2 curation pass may still surface it if reflect judges it a fresh tangential idea.
