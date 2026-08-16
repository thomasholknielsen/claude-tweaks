---
record: 535
origin: human
risk: low
size: low
ceremony: standard
grants: []
fingerprint: policy-comprehension:lever-attribution-field-in-the-auto-decision-log-and-review
surface: backend
---
# 535: Lever attribution field in the auto-decision log and Review Console

Surface: backend

## Overview

Make policy-driven pipeline decisions name their governing lever at the moment they're logged, so "which knob did that?" is answered by the artifact the user is already looking at. `_shared/auto-decision-log.md`'s line format gains an **optional** trailing field — `[lever: {key}={value} ({source})]` — written when a decision consulted a policy/config lever; the Review Console's row template carries the field through when present. This is the push half of the policy-comprehension family (parent #532): scenario "behavior→lever lookup" gets no dedicated surface, only this attribution.

Expand-only contract change: existing `decisions.md` files stay valid; absence of the field means "not lever-governed or not yet adopted", and no reader may require it. This sub-issue updates the contract, the console renderer, and two high-traffic logging sites; remaining sites adopt the convention as their prose is next touched.

**Complexity:** Low
**Estimated tasks:** 5

## Non-Goals

- No sweep of every decision-logging site in the repo — contract + console + the two named sites only. In particular, `skills/review/step3-routing.md` (review-severity-floor) and `skills/test/SKILL.md` (auto-fix-threshold) are known lever-consulting log sites deliberately left for adopt-when-touched.
- No new log file, no schema change to `events.jsonl` or `run-state.json`.
- No lookup command or explain surface — that's the pull design parent #532 rejected.
- No mandatory field: never make a reader or a hard gate depend on the lever field's presence.
- No decisiveness marking: the field cites levers consulted, not which one alone decided (see the "consulted" definition below).

## Prerequisites

None — independent of the family's other sub-issues (the field cites lever names as they exist today in `POLICY_KEYS` (`bin/lib/policy-schema.js`); #533's metadata is not consumed here).

## Current State

- `skills/_shared/auto-decision-log.md` — canonical entry format: one line per auto-resolution with status (`AUTO`/`STAGED`/`KEPT-PROMPT`/`SCANNED`), rationale, reversibility, and an existing optional trailing element (`{; commit ref or stage path}` after `Reversibility: {level}`); consumed by every pipeline skill that writes `decisions.md` and read by the Review Console.
- `skills/wrap-up/review-console.md` — renders `decisions.md` and `staged/` into the end-of-run batch table, delegating table shape to `console-template.md`'s uniform four-column table.
- Verified adoption sites (grep-confirmed at shaping time — the lever-consulting `AUTO`-row templates do **not** live in `skills/flow/`): `skills/dispatch/SKILL.md`'s auto-merge gate (reads `automerge-max-lines`/`automerge-max-files` as weighted inputs to the merge-check verdict) and `skills/build/plan-audit.md` (the `scope-creep` policy row template). At build time, confirm each edited log line is the one that actually reads the levers being cited.
- No known programmatic parser of `decisions.md` lines exists (the console reads it via prose-driven procedure, not a strict grammar) — re-verify with a grep for `decisions.md` consumers at build time and record the result in the PR, so "expand-only is safe" is a checked fact.
- Source-word precedent: `resolve-policy.js` envelopes use `source ∈ run-config | policy | default`.

## Deliverables

- [ ] `skills/_shared/auto-decision-log.md`: the optional `[lever: …]` trailing field — placement in the line grammar (always last, after the existing `{; commit ref or stage path}` element when that is present), the source vocabulary, multi-lever form, list-value rendering, and the in-table rendering rule (below), stated once. Include the literal sentence: "The lever field is optional; absence is valid and no reader may require its presence."
- [ ] Field semantics in the same contract section: **"consulted" means every lever whose value the logging site's own procedure read to make this decision** — a weighted or advisory input counts; a lever the procedure never read does not. Source words: `run-config | policy | default` (matching the resolver), plus `arg` for a value set by an explicit CLI/skill argument override. The field applies to **any status** (`AUTO`/`STAGED`/`KEPT-PROMPT`/`SCANNED`) whose decision consulted a lever; HARD-GATE stops and other non-policy decisions never carry it. List-valued levers render the configured comma-joined string truncated at 60 chars with `…`; an unset list renders `[]`. Include one worked example line for: single lever, multi-lever (`[lever: automerge-max-lines=40 (default); automerge-max-files=2 (policy)]`), a lever-checked-but-outcome-driven-elsewhere decision (still cited — it was consulted), and a non-policy decision (no field).
- [ ] Rendering rule: inside any markdown table cell the field renders as an inline code span (backticks), which neutralizes `|` and brackets — stated in the contract; `skills/wrap-up/review-console.md`'s row template adopts it as a suffix in the existing details cell (no new column — `console-template.md`'s four-column shape is unchanged), showing both the with-field and without-field rendering.
- [ ] `skills/dispatch/SKILL.md` auto-merge gate: its logged decision-line template gains the field, citing the lever keys that line's own procedure reads (verify the set at build; expected: the automerge caps, plus `merge-sensitive-paths`/`housekeeping-auto-merge` only if this line's procedure actually reads them).
- [ ] `skills/build/plan-audit.md`: the `scope-creep` policy row template gains the field.
- [ ] A one-line adoption note in `_shared/auto-decision-log.md`: sites not yet writing the field adopt it when next touched — no compatibility shim, no deadline.

## Acceptance Criteria

1. `_shared/auto-decision-log.md` documents the field with the four worked example lines (single, multi, consulted-but-not-decisive, non-policy), using only `run-config`/`policy`/`default`/`arg` as source words, and states the always-last placement relative to the existing optional suffix.
2. The contract contains the literal sentence "The lever field is optional; absence is valid and no reader may require its presence."
3. `skills/dispatch/SKILL.md`'s auto-merge gate log-line template and `skills/build/plan-audit.md`'s scope-creep row template include the field with the lever keys each procedure actually reads (verified against the surrounding prose, not assumed).
4. `review-console.md`'s row template shows both renderings, as an inline-code suffix in an existing cell; `console-template.md` is unmodified.
5. Only these files change: `skills/_shared/auto-decision-log.md`, `skills/wrap-up/review-console.md`, `skills/dispatch/SKILL.md`, `skills/build/plan-audit.md` (plus `docs/skill-graph.md` only if a genuinely new edge appears — expected: none). `npm test` passes.
6. The PR description records the decisions.md-consumer grep result (the expand-only safety check from Current State).

## Technical Approach

Pure prose/contract work following the expand-contract discipline CLAUDE.md mandates for `_shared/*.md` conventions: add the new field to the canonical home first, then migrate the named consumers, and record the adoption rule instead of leaving an implicit deferral. The lever names written into templates are literal policy keys — copy them from `POLICY_KEYS` in `bin/lib/policy-schema.js`, don't paraphrase.

### Data / API Surface

Line grammar addition (canonical home `_shared/auto-decision-log.md`):
`{STATUS} {time} — {step}: {decision}. {rationale}. Reversibility: {level}{; commit ref or stage path}. [lever: {key}={value} ({source})]` — the bracketed field optional, always last, semicolon-separated inside the brackets when multiple levers were consulted.

### Key Files

- `skills/_shared/auto-decision-log.md` — field definition (canonical, stated once)
- `skills/wrap-up/review-console.md` — row rendering (suffix, no new column)
- `skills/dispatch/SKILL.md` — auto-merge gate adoption
- `skills/build/plan-audit.md` — scope-creep row adoption

## Gotchas

- State the format once, in `_shared/auto-decision-log.md` — consumers cite it. Restating the grammar in dispatch/build prose recreates the multi-copy drift the shared file exists to prevent.
- The flow skill itself hosts no lever-consulting `AUTO` templates (grep-verified) — don't go hunting there; the pipeline's policy-consulting rows live in build/review/test, and only build's is in this sub-issue's scope.
- Don't stamp the field on decisions that consulted no lever (e.g. HARD-GATE stops) — attribution on a non-policy decision is noise that erodes the signal.

## Decision Rationale

See parent #532 — push-over-pull for behavior→lever lookup, and the optional-field/expand-only shape chosen so a contract consumed by many skills never breaks mid-migration.

## Build Deviations (recorded at build time, 2026-08-16)

- **AC 3/5 file target:** the dispatch auto-merge gate's logged decision-line template lives in `skills/dispatch/settle-and-merge.md:228`, not `skills/dispatch/SKILL.md` (which carries only a lever-description table, no log-line template — grep-verified; the spec's own "verified against the surrounding prose, not assumed" clause governs). The adoption landed in `settle-and-merge.md`; the AC's file list should read that file.
- **AC 4 renderings:** `review-console.md` states both renderings in prose (with-field: inline-code suffix in the detail cell; without-field: cell unchanged, absence never annotated) and cites the contract's worked example rather than carrying its own — the file sat 349 bytes under the 40KB sub-file test ceiling at base, leaving no headroom for an in-file example (final review Critical finding, fixed in 8048cfb9).

<!-- work-fingerprint: policy-comprehension:lever-attribution-field-in-the-auto-decision-log-and-review -->
