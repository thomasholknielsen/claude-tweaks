# Pipeline exhaust: defer less, shape what defers

Design doc. Written 2026-08-16.

Status: brainstormed — awaiting `/claude-tweaks:specify` decomposition.

## The gap

A `/claude-tweaks:backlog overview` run on 2026-08-16 rendered 99 `scored` records against 1
`shaped` — the funnel's bottleneck sits at shaping. The first reading ("nothing shapes records
automatically") was wrong. Classifying the 106 unshaped records (99 scored + 7 captured) by the
mechanism that filed them:

| Mechanism | Count | Shape at filing |
|---|---|---|
| `/capture` (`by:capture`) | 27 | 5-line stub, by design |
| Pipeline exhaust — wrap-up leftover routing, ledger narrowing/routing, reflect routing, residue sweep, review-console approvals, `Origin:` side-effect lines | 34 | Prose finding, almost never Acceptance Criteria |
| `/feedback` (Summary/Kind body) | 11 | Structured defect report, no spec sections |
| `parent-issue` design containers | 13 | Not shaping work — mis-bucketed (see Not doing) |
| Hand/agent-filed design records (`Surface:` + `## Overview`) | 6 | Design-level; decomposition, not shaping |
| Freeform `gh issue create` from a session | 10 | Varies |
| Already spec-shaped, never stamped `ready` | 5 | One label away |

Two-thirds of the pile is the plugin's own exhaust, filed by an agent that held the diff, the
ledger entry, and the review finding at the moment it filed. Every one of these producers filed a
stub anyway, because its contract says shaping is `/specify`'s job later — deferring shaping
from the moment of maximum context to a later moment of zero context. Health-sweep records are
the counter-example that proves the point: they file spec-shaped by construction
(`specShapedBody`, `bin/lib/issues/record.js`) and drain to merge with no human shaping step, and
zero of them are in the pile.

The pile is young (all < 30 days, median 5 days, 58 filed in the trailing week) and mostly gets
built (335 closed, 20 not-planned). It is a fill rate that outruns one human's shaping step, not
a pool to prune.

### Why the exhaust exists at all

The sharper question is why an agent with full context files a record instead of fixing the
thing in the branch it is standing in. The plugin already answers it — in one channel:

- `_shared/ledger-format.md` Phase 1: *"The default is fix; defer is the exception,"* fix-now
  criteria (≤5 files, no product decision, no external state, no material scope expansion), and
  a named list of **bad reasons to skip a fix** that includes *"Bundle of small items"* and
  *"Out of scope of this plan — if the file is in this build's diff, it is in scope."*
- Merge happens in `/wrap-up` Phase 4, *after* reflect and the ledger gate — at the moment
  these findings are deferred, the branch is still open and the fix could ride the same PR.

Yet #227 ("Four small items deferred from 6.69.0's reviews, grouped because each is a few
lines") and #229 are literally the named bad reason, filed anyway. Three real reasons and one
leak:

1. **Legit by design.** Reflect *tangential* findings (new features, alternative designs) do
   not belong in a bugfix PR. Hindsight findings that are genuinely larger. Anything needing a
   product decision (auto mode cannot ask mid-flow). Pre-existing defects in files outside the
   diff. These *should* be records — and they are the ones with real context.
2. **Structural.** Wrap-up runs after the review gate; a non-trivial fix at wrap-up time is
   unreviewed code riding an approved PR. That is why the fix-now criteria are bounded, and why
   any "fix more in-session" rule has to say what re-verifies.
3. **The leak.** The fix-now discipline lives in the ledger channel only. Review Step 3 routing
   (`review/step3-routing.md`) has its own two-bullet deferral gate; reflect (`full-mode.md`,
   `hindsight-mode.md`) has "Defer — bigger, not relevant now"; the residue sweep has a CLI
   `remedy: record` hint. None restates the bad-reasons list. And at `trusted`+/`unattended`,
   `ledgerNarrowing` + `ledgerRouteRemainder` + `queueWriteAutoFile` turn "not fixed" into
   "filed" with zero clicks — the contract's own phrase is *"'Nothing stays unresolved' is true
   at `unattended`"*, achieved by filing, not fixing. Phase 1 is silent and agent-judged, and
   the plugin names its own failure mode (*"Skipping Phase 1 … biases toward defer"*). CLAUDE.md's
   "no implicit deferrals → file a record" gives filing a virtuous framing. Filing is
   frictionless; fixing is judgment. The path of least resistance wins.

## The decision

Fix upstream, in this order:

- **Layer 0 — defer less.** One deferral gate for every exhaust channel: the ledger's fix-now
  criteria and bad-reasons list, a closed `Defer-reason:` vocabulary, and a hard gate — no
  record proposal exists without a valid reason. Not advisory: an advisory field on a zero-click
  path gets filled with the least-effort value, which is how the pile formed.
- **Layer 1 — shape what defers.** What legitimately passes the gate files spec-shaped, scored,
  and born-`ready` via the composer health skills already use, with `needs:definition` as the
  only escape hatch. Exhaust lands in exactly two states — born-ready or needs-you — never a
  stub. The human's decision point moves from authoring each spec to the grant at
  `/backlog refine`'s batch console, looking at a shaped record.

Two calls made deliberately: `pre-existing-outside-diff` does **not** clear the auto-routing
floor (matches today — it stays a human-drill item at every tier), and `/feedback` is left alone
(its filer is a consumer who legitimately lacks the maintainer's context).

Rejected alternatives, so a later reader does not re-open them:

- **Headless `/specify` chained at filing (#575 generalized).** Shaping re-reads the record body,
  so the producer's richer context is lost unless the producer writes it into the body first —
  at which point Layer 1's work is done anyway; and each shaping run invokes ceremony-check and
  framing-check sub-skills, so a wrap-up filing five leftovers ends in five heavy runs. Right
  mechanism for the *human* stub case only (#575 owns it).
- **Shaped-not-ready.** Compose via `specShapedBody` but leave `ready` to `/specify`. Keeps a
  per-record human step, so throughput does not change; and a `specShapedBody`-composed record
  with scoring is structurally identical to a health-skill record, which the born-ready rule
  already trusts.
- **A downstream "shape the pile" unit** (`/backlog shape`). Treats the symptom; the producers
  keep filing stubs.

## Phase 1: `_shared/deferral-gate.md` — one gate, hard

### The contract

New shared file, stated once, consumed by `review/step3-routing.md`, `reflect/full-mode.md`,
`reflect/hindsight-mode.md`, `wrap-up/residue-sweep.md`, `wrap-up/leftover-routing.md`, and
`_shared/ledger-format.md` Phases 1–2. Expand-contract: the ledger file becomes a citation of
this file rather than the owner of the criteria; the review and reflect files replace their own
defer bullets with a citation. Content:

- **Fix-now criteria** — moved verbatim from ledger Phase 1 (≤5 files / no functionality not yet
  built / no product decision / no external state / no material scope expansion). Unchanged.
- **Bad reasons to skip a fix** — the existing six, plus one: *"minor / outside that scope / not
  load-bearing"* — severity is never a defer reason (review's severity floors decide what
  *blocks*, not what gets *fixed*; Step 3 routing already says Low and Medium default to Fix
  now).
- **Closed `Defer-reason:` vocabulary**, each with a one-line definition:
  `tangential` (new capability or alternative design — reflect's category), `needs-human-decision`
  (product/design decision), `pre-existing-outside-diff` (defect not introduced by this build, in
  a file the diff does not touch), `genuinely-larger` (scope expansion, long rebuild, >10 unrelated
  tests), `blocked-external` (third-party data, prod traffic, approvals), `blocked-dependency`
  (functionality not yet built). These are `clearsFloor`'s four regex categories made structural,
  plus the two the current gates already name in prose.
- **The hard gate.** No record proposal — staged *or* directly created — exists without a valid
  `Defer-reason:`. An item that fails fix-now and has no valid reason stays `open` and goes to the
  human drill (ledger Phase 2 / the Review Console). It is never filed. There is no advisory mode.
- **Re-verification.** After any fix-now change made after `/review` has passed, re-run
  `/claude-tweaks:test` (already the rule in `step3-routing.md` and `hindsight-mode.md`; the
  contract states it once and the consumers cite it).

### `clearsFloor`

`bin/lib/issues/autonomy.js`'s `clearsFloor` reads the structured `Defer-reason:` value first;
the free-prose regexes stay as a fallback for one release with a recorded removal condition (all
six producers migrated + the conformance test below green), then go. Semantics unchanged: only the
four floor categories (`needs-human-decision`, `genuinely-larger`, `blocked-external`,
`blocked-dependency`) auto-route at `trusted`+; `tangential` keeps reflect's existing routing;
`pre-existing-outside-diff` is not a floor category, so it falls through to the per-item human
drill at every tier — exactly what `ledger-format.md` does today with any reason `clearsFloor`
does not match ("the floor check fails closed"). Known limitation, kept on purpose: at
`unattended` with no human, such an item stays `open` rather than being filed by fiat.

### Enforcement points

- **Staged queue-write files** get a fourth header line: `Title:` / `Type:` / `Labels:` /
  `Defer-reason:` (`wrap-up/leftover-routing.md` step 3, `reflect/SKILL.md`'s tangential header,
  ledger Phase 3's `Keep` branch).
- **`review-console.md`'s create step and `ledger-narrowing-auto-file.md`** refuse a proposal
  whose header lacks a valid reason: it renders under a new **Refused — no defer reason** row
  (never silently dropped, never filed) and stays staged for the human. Under `consoleAutoResolve`
  at `unattended`, refused rows are the one thing the console does not auto-resolve — they are
  the gate's whole point.
- **Direct-create paths** (`step3-routing.md` Defer, `full-mode.md` Defer, standalone ledger
  resolve) go through `recordPayload`, which gains an optional `deferReason` validated against the
  vocabulary and rendered as the body's `Defer-reason:` line. The skill prose makes it required
  for every exhaust producer; conformance tests pin the prose.
- **Audit trail.** `decisions.md` entries for routed items carry the reason
  (`… auto-routed to backlog as {ref} (defer-reason: {value}) …`), and
  `wrap-up/summary-template.md`'s "Routed to backlog" section renders the reason per row plus a
  per-run count, so a run that files six records reads as a signal, not a success.

### Verification

- Unit: `clearsFloor` structured path + regex fallback; `recordPayload` rejects an unknown
  `deferReason`, renders a known one.
- Conformance (`tests/`): every listed consumer cites `_shared/deferral-gate.md`; no consumer
  restates the fix-now criteria; `ledger-format.md` no longer owns the bad-reasons list.
- Eval scenario (`evals/scenarios/`): a wrap-up run whose ledger holds "four small items, a few
  lines each" fixes them in-branch and files nothing; a second scenario with a `tangential`
  finding files exactly one record carrying `Defer-reason: tangential`.

## Phase 2: exhaust producers file spec-shaped, born-ready

Depends on Phase 1 (the `Defer-reason:` header is part of the composed body).

### Producers in scope

`wrap-up/leftover-routing.md`, ledger Phase 2/3 `Keep` branch (`_shared/ledger-format.md`),
`reflect/SKILL.md` Step 3 tangential routing, `wrap-up/residue-sweep.md` `remedy: record`,
`review/step3-routing.md` Defer and Capture, and `/capture` **when the caller supplies a shaped
body** (an agent filing under CLAUDE.md's "no implicit deferrals" rule — detection is by what is
supplied, never by who invoked).

Out of scope: human-typed `/capture` (5-line stub; #575's trusted+ path), `/feedback`, health
skills (already born-shaped), `/specify` decomposition (already born-ready).

### The composer

`specShapedBody` (`bin/lib/issues/record.js`) is extended, not forked:

- optional `header` prefix lines rendered above `## Current State` — the producer's `Origin:`
  line (kept: the trust ledger's `side-effect:*` classes read it) and the `Defer-reason:` line;
- a `footer` parameter — the current *"label `wontfix` to suppress future reports"* footer is
  health-suite-specific and stays their default; exhaust records get a plain provenance footer;
- the throw-on-empty guarantee is unchanged for `currentState` / `deliverables` /
  `acceptanceCriteria`.

Producers stamp `risk:*`/`size:*` using the criteria `/specify` cites today (referenced, not
restated), plus `ready`, via `recordPayload`. No `ceremony:*` — parity with health skills, which
do not stamp it; `/specify` remains ceremony's owner and re-stamps on any later touch.

### The escape hatch

If the producer cannot honestly write Acceptance Criteria, it files `needs:definition` and no
`ready` — the record lands in `/backlog overview`'s needs-you lane. This is the same content
judgment `/capture` and `/feedback` already make at filing time. Exhaust therefore has exactly
two landing states.

### Contract edits

- `_shared/work-record.md` permission matrix: new rows for `/wrap-up` (leftover, ledger,
  residue), `/reflect`, and `/review` as record producers — today they file with no row of their
  own; `/capture`'s row gains the shaped-body branch (`risk:*`/`size:*`/`ready` **only** when the
  caller supplied Current State / Deliverables / Acceptance Criteria; the 5-line stub branch is
  unchanged). The Born-ready rule paragraph names the `side-effect:*` classes alongside health
  skills; the "`/capture` is the only actor this covers" sentence is retired.
- `wrap-up/leftover-routing.md` step 2's sentence *"a leftover record starts exactly where a
  captured idea starts"* is retired.
- `_shared/autonomy-ceiling.md`: the trusted-row capability text for `queueWriteAutoFile` notes
  that auto-filed exhaust is born-shaped, so `refine`'s Step 3.5 spec-shape gate never
  flags it back (the #575 failure mode, prevented by construction here).
- CLAUDE.md template (`init`'s `claude-md-template.md`) "No implicit deferrals" clause: an agent
  filing a deferral supplies the spec-shaped body — a one-clause edit.

### Verification

- Unit: `specShapedBody` header/footer variants; the composed body passes `refine-mode.md` Step
  3.5's spec-shape check (present, non-empty, no placeholder markers).
- Conformance: every in-scope producer file names `specShapedBody` and the two landing states;
  the retired sentences are gone from `leftover-routing.md` and `work-record.md`.
- Live check after ship: the next three `/flow` runs' exhaust records are all `ready` or
  `needs:definition`; none is a stub.

## Files

Phase 1: `skills/_shared/deferral-gate.md` (new), `skills/_shared/ledger-format.md`,
`skills/review/step3-routing.md`, `skills/reflect/full-mode.md`, `skills/reflect/hindsight-mode.md`,
`skills/reflect/SKILL.md`, `skills/wrap-up/residue-sweep.md`, `skills/wrap-up/leftover-routing.md`,
`skills/wrap-up/review-console.md` (refused row — note it is already at the 40 KB ceiling; the row
text must be minimal or the section moves to a sub-file), `skills/wrap-up/ledger-narrowing-auto-file.md`,
`skills/wrap-up/summary-template.md`, `skills/_shared/auto-decision-log.md`,
`bin/lib/issues/autonomy.js`, `bin/lib/issues/record.js`, `tests/`, `evals/scenarios/`,
`docs/skill-graph.md`.

Phase 2: `bin/lib/issues/record.js`, `skills/_shared/work-record.md`,
`skills/_shared/autonomy-ceiling.md`, `skills/wrap-up/leftover-routing.md`,
`skills/wrap-up/residue-sweep.md`, `skills/reflect/SKILL.md`, `skills/review/step3-routing.md`,
`skills/capture/SKILL.md`, `skills/init/claude-md-template.md`, `tests/`.

## Not doing

- Shaping human-typed `/capture` stubs — #575 (in flight) chains trusted+ captures into headless
  `/specify`; this design does not touch that path.
- A headless `/specify` invocation for exhaust — rejected above.
- `/feedback` bodies — external filer, deliberately foreign shape.
- Filed separately from this brainstorm, not part of either phase: `funnelBuckets`
  (`bin/lib/issues/backlog.js`) does not check `isParentIssue`, so 13 decomposition parents render
  in overview as "scored → /specify"; and five parents (#532 #512 #506 #462 #365) have every
  sub-issue closed and are open only pending parent close-out.
