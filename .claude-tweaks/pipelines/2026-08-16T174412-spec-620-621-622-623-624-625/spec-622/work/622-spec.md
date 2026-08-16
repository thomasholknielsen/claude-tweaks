---
record: 622
origin: human
risk: medium
size: medium
ceremony: standard
grants: []
fingerprint: 2026-08-16-exhaust-deferral-gate-design:deferral-gate-enforcement-review-console-refuses-reason-less
blocked-by: [620, 621]
surface: backend
---
# 622: deferral gate enforcement: Review Console refuses reason-less proposals, audit lines carry the reason, eval scenarios

Surface: backend

## Overview

Make the deferral gate hard at the one place every staged work-record proposal converges: the Review Console's create step. `wrap-up/review-console.md`'s "On approval" step 7, `flow/multispec-review-console.md`'s step 2, and `wrap-up/ledger-narrowing-auto-file.md`'s pre-render auto-file all read `Title:`/`Type:`/`Labels:` off a staged file and create the record; after this sub-issue they also look up `Defer-reason:` in the same header block, and a proposal whose reason is missing or not one of `_shared/deferral-gate.md`'s six values (`tangential`, `needs-human-decision`, `pre-existing-outside-diff`, `genuinely-larger`, `blocked-external`, `blocked-dependency` — verified at runtime against `DEFER_REASONS`, never a hardcoded list) is **refused** — rendered under a new **Refused — no defer reason** row, never filed, never auto-resolved even under `consoleAutoResolve` at `unattended`. The reason then travels through the audit trail: ledger Phase 2's `AUTO` lines and `wrap-up/summary-template.md`'s "Routed to backlog" section render it per record with a per-run count, so a run that files six records reads as a signal. One eval scenario pins the refuse behavior end-to-end. Scope is `Q#` (work-record) proposals only — `M#` memory and `U#` upstream-feedback proposals are not work records and carry no `Defer-reason:`.

**Complexity:** Medium
**Estimated tasks:** 6

## Non-Goals

- Producers stamping the `Defer-reason:` header — #621. **Ship ordering:** this sub-issue merges after #621; landing it first would refuse every proposal from a not-yet-migrated producer.
- Changing what body a proposal carries — Phase 2 (#623–#625).
- Slimming `review-console.md` (#552) — this sub-issue must not grow that file by more than the budget below; the refuse-row text lives in a sub-file.
- `M#`/`U#` proposals; a `/tidy` reaper for refused proposals (see Gotchas — accepted, not filed).

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #620 | deferral gate contract + `DEFER_REASONS` | must be merged first (this sub-issue validates against its export and its "where the reason lives" rule) |
| #621 | consumers cite the gate and stamp `Defer-reason:` | must be merged first (see ship ordering above) |

## Current State

- `skills/wrap-up/review-console.md` (40,899 B on 2026-08-16 — over the 40 KB soft ceiling; #552 tracks slimming it; re-measure with `wc -c` at build time and use that number as the baseline): "On approval" step 7 — for each `Q#`, "create the record — `gh issue create` … reading `Title:`/`Type:`/`Labels:` and the body from the item's staged file"; `Skip (Override only) drops the proposal — log the decline to decisions.md`; the named batch sections and the `Q#`/`M#`/`U#` prefixed sequences (Queue writes → Memory updates → Upstream feedback); the `consoleAutoResolve` informational-report mode ("resolve every item per its own stated default, with zero `AskUserQuestion` calls"); `--dry-run` prints previews instead of executing.
- `skills/wrap-up/ledger-narrowing-auto-file.md` (1,850 B): when `queueWriteAutoFile` is unlocked, creates every staged queue-write proposal directly before rendering, logs `AUTO`, lists it under **Auto-applied**; "If record creation fails for one proposal, leave that one staged and let it render normally in Queue writes below."
- `skills/flow/multispec-review-console.md` step 2 / "Queue writes" section: same read-header-and-create mechanism, aggregated across specs; identifies a queue write as "any staged file carrying a `Title:`/`Type:`/`Labels:` header".
- `skills/_shared/ledger-format.md` Phase 2: `AUTO {time} — Ledger Phase 2: item #{N} auto-routed to backlog as {ref} (blocker: {category}) — "{one-line description}". Reversibility: high.` (the `ledgerRouteRemainder` line) and the `ledgerNarrowing` line `… (blocker: {category}) …`; Phase 3 stages `ledger-record-{slug}.md` from a ledger item whose status is set to `deferred (→ backlog)`.
- `skills/wrap-up/summary-template.md` "#### Routed to backlog": table `| Record | Description | Blocker |` parsed from those `AUTO … (blocker: {category}) …` lines.
- `skills/_shared/auto-decision-log.md`: canonical entry schema (`AUTO`/`STAGED`) and examples (`AUTO 15:02:18 — Leftover routing: 2 sections routed to defer per policy …`).
- `bin/lib/issues/record.js` (#620): `DEFER_REASONS`; `_shared/deferral-gate.md` (#620): "where the reason lives" — header block, keyed lookup.
- `evals/scenarios/*.yaml` — 13 scenarios; validated by `cd evals && npm test`.

## Deliverables

- [ ] `skills/wrap-up/refused-proposals.md` (new sub-file, ≤3 KB): the refuse rule — before creating any `Q#` proposal (console step 7, multispec step 2, narrowing auto-file), read the staged file's header block (the lines before the first blank line) and locate the line matching `^Defer-reason: ` **by key**; missing, or a value not in `DEFER_REASONS` (`node -e "process.exit(require('${CLAUDE_PLUGIN_ROOT}/bin/lib/issues/record.js').DEFER_REASONS.includes(process.argv[1])?0:1)" -- "$VALUE"`), → do not create; render the item under **Refused — no defer reason** (positioned immediately after the Queue writes section, before Memory updates, in both consoles) with the staged path and the offending value (or "absent"); log `REFUSED {time} — Queue write {Q#}: no valid Defer-reason on {staged path}; kept staged.`; the row has **no default** and is excluded from Approve all, from `consoleAutoResolve`, and from `queueWriteAutoFile` — the only ways out are the human editing the staged file's header and re-running the console for that run, or dropping it via Override → Skip. **Ledger origin:** when the refused proposal came from a ledger item (`staged/ledger-record-*.md`), also set that item's status back to `open` with note `proposal refused — no defer reason`, so the ledger's own nothing-left-behind gate resurfaces it on the next resolve; the staged file is deleted (the ledger item is the durable trace). A refused proposal with no ledger origin (a leftover section, a reflect tangential) stays staged in its run dir and dies with it at `close-run` unless a human rescues it — by design: the summary's refused-count line is the signal.
- [ ] `skills/wrap-up/review-console.md`: step 7 gains one sentence citing `refused-proposals.md` (read before creating); the section list gains **Refused — no defer reason** (renders only when non-empty, outside the global sequence like `Q#`, positioned as above); the `consoleAutoResolve` paragraph gains one clause: refused rows have no default and are never auto-resolved. Net growth of this file ≤ 400 bytes over the build-time baseline; if the edit cannot fit, trim step 7's own wording — do not move sections around.
- [ ] `skills/wrap-up/ledger-narrowing-auto-file.md`: apply `refused-proposals.md` before auto-filing; a refused proposal is listed under the refused row, not under Queue writes (a *failed* create still renders under Queue writes as today — two different outcomes).
- [ ] `skills/flow/multispec-review-console.md` step 2 + Queue writes section: same citation and refused row, aggregated across specs; the queue-write *detection* rule (presence of `Title:`/`Type:`/`Labels:`) is unchanged — a proposal without `Defer-reason:` is still a queue write, a refused one.
- [ ] `skills/_shared/ledger-format.md` Phase 2: both `AUTO` log lines carry `(defer-reason: {value})` in place of `(blocker: {category})`, and `skills/wrap-up/summary-template.md` "Routed to backlog" is updated in the same commit: column `Blocker` → `Defer-reason`, parsed from `(defer-reason: {value})`; a trailing `{N} record(s) filed by this run` line whenever N > 0; a `{M} proposal(s) refused — no defer reason` line whenever M > 0 (from `REFUSED` entries).
- [ ] `skills/_shared/auto-decision-log.md`: add the `REFUSED` entry kind to the schema (same line shape as `AUTO`/`STAGED`), and update the leftover-routing example line to carry `(defer-reason: {value})`.
- [ ] `evals/scenarios/wrap-up-refuses-reasonless-proposal.yaml`: a run dir with three staged proposals — `leftover-a.md` with no `Defer-reason:`, `ledger-record-b.md` with `Defer-reason: tangential`, and a third file `reflect-staged-1.md` (a non-leftover-named queue write) with `Defer-reason: bogus` — expected, mechanically checkable: exactly one `gh issue create`; two entries under Refused; `leftover-a.md` and `reflect-staged-1.md` still present in `staged/` after the console; the `REFUSED` lines present in `decisions.md`.
- [ ] `tests/deferral-gate-conformance.test.js`: assert `review-console.md`, `multispec-review-console.md`, and `ledger-narrowing-auto-file.md` cite `refused-proposals.md`; `summary-template.md` contains `Defer-reason` and `(blocker: {category})` appears nowhere under `skills/`; `auto-decision-log.md` contains `REFUSED`; `refused-proposals.md` ≤ 3,072 bytes.

## Acceptance Criteria

1. `node --test tests/deferral-gate-conformance.test.js` passes; reverting `refused-proposals.md`'s citation in `review-console.md` makes it fail.
2. `wc -c skills/wrap-up/review-console.md` ≤ (build-time baseline + 400); the baseline and result are both stated in the PR body.
3. `grep -rn "(blocker: {category})" skills/` returns no matches; `grep -n "Defer-reason" skills/wrap-up/summary-template.md` matches the Routed-to-backlog table header.
4. `cd evals && npm test` passes with the new scenario present, and its expected outcomes are stated in the file, not left to the grader's judgment.
5. `npm test` passes in full.

## Technical Approach

The refuse check is a keyed header read plus a runtime `DEFER_REASONS.includes` — no new module and no literal value list anywhere in the prose. It lives in a sub-file because `review-console.md` is at its ceiling and three consumers need identical wording; each cites the sub-file in one sentence. Refused rows deliberately sit outside the global sequence and outside every auto-resolve path: the gate is only hard if no policy lever can bypass it. Flipping a ledger-origin item back to `open` is what keeps "nothing left behind" true after a refusal.

### Data / API Surface

- Staged-file header lookup: within the header block, the line matching `^Defer-reason: (\S+)$`; value validated against `DEFER_REASONS` at runtime.
- New `decisions.md` entry kind: `REFUSED {HH:MM:SS} — Queue write {Q#}: no valid Defer-reason on {path}; kept staged.`
- Summary "Routed to backlog" table: `| Record | Description | Defer-reason |` + the two count lines.

### Key Files

- `skills/wrap-up/refused-proposals.md` — new sub-file, the refuse rule + ledger-origin flip
- `skills/wrap-up/review-console.md` — step 7 citation, section list, `consoleAutoResolve` clause
- `skills/wrap-up/ledger-narrowing-auto-file.md` — refuse before auto-file
- `skills/flow/multispec-review-console.md` — step 2 citation + refused row
- `skills/_shared/ledger-format.md` — Phase 2 log lines
- `skills/wrap-up/summary-template.md` — Routed to backlog columns + counts
- `skills/_shared/auto-decision-log.md` — `REFUSED` kind, updated example
- `evals/scenarios/wrap-up-refuses-reasonless-proposal.yaml` — new scenario
- `tests/deferral-gate-conformance.test.js` — console/summary/log assertions

### Package Dependencies

None.

## Gotchas

- `review-console.md` is already over the 40 KB soft ceiling that `bin/lib/skill-audit` measures — a conformance test may already flag it; do not make it worse. #552 (open, unbuilt) is the slimming record; coordinate by keeping this diff tiny, not by absorbing #552.
- `consoleAutoResolve` at `unattended` resolves "every item per its own stated default" — the refused row must have **no** default, said in the row's own definition, not only in the `consoleAutoResolve` paragraph.
- Under `--dry-run` the console prints previews; the refuse check still runs (it is a read, not a write) and the ledger status flip is previewed, not applied.
- Accepted limitation, not filed: a refused non-ledger proposal that no human rescues dies with its run dir. A `/tidy` reaper for stale refused proposals is deliberately not part of this record — the reasonless deferral should have been a fix, and the summary count is the human's signal.
- Eval scenarios: read `evals/README.md` and the 13 existing files for the schema; expected outcomes must be mechanically checkable.


<!-- work-fingerprint: 2026-08-16-exhaust-deferral-gate-design:deferral-gate-enforcement-review-console-refuses-reason-less -->
