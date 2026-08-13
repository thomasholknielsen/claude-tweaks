---
record: 223
origin: human
risk: low
size: low
ceremony: standard
grants: [build]
fingerprint: 2026-08-08-model-profile-strategy:build-tier-frontier-human-typed-hardest-build-opt-in
blocked-by: [216, 217]
surface: skills
---
# 223: /build tier=frontier: human-typed hardest-build opt-in

Surface: skills
Parent: #215

Blocked by #216: assumes the frontier profile exists and resolves with singleton semantics and deterministic degradation
Blocked by #217: assumes the build bridge reads the renamed size: facet when mapping records to profiles

## Overview

Give `/build` the human-typed hardest-build opt-in: the existing `tier=` token gains `frontier`, running per-task implementer dispatches at Fable for one build. Two distinct bounds keep this safe, and they are separate arguments: **sequential dispatch** (SDD implementers run one at a time — IL-43's git-index discipline) satisfies the contract's no-*parallel*-fan-out rule, while the actual **cost bound** is `frontier-run-cap` (the policy key registered by #219, default 3, enforced by #216's resolver per run) — sequential-ness alone bounds nothing about spend. The flag is deliberately unreachable by automation: the `size:` → profile bridge tops out at Capable, and no label, policy value, stance, **or Manifesto option** can select Frontier for a build — only the `tier=frontier` token present in the human's own invocation text (a `/flow` run forwarding the user's typed token is compliant; a Manifesto question offering it is not, and none is added).

**Complexity:** Low
**Estimated tasks:** 5

## Non-Goals

- Auto-selecting Frontier from any record facet, policy value, or Manifesto lever — the guard is a deliverable, not an accident.
- Changing the bridge's Capable ceiling for unflagged builds.
- Frontier for `/flow`'s other phases.
- Runtime behavioral verification of dispatch-time resolution — this is a documentation/grammar leaf; AC4 below is satisfied by the instruction text landing, and the first `tier=frontier` build verifies behavior (its review notes say so explicitly).

## Current State

Resolver semantics cited below live in #216 (cap enforcement, `frontier-tally.log` in the run dir as the cap's storage, degrade-to-Capable with an `AUTO` decision-log line, run continues) and #219 (`frontier-run-cap` key, default 3) — **re-read both landed texts as the first task**; this leaf transcribes, it does not define.

- `skills/build/SKILL.md`: `argument-hint` (~4) and input grammar (~42) document `tier=<fast|standard|capable>`; ~184 maps the `size:` facet (post-#217) low→Fast / medium→Standard / high→Capable, `tier=` token winning per run.
- `skills/build/build-options.md`: the options matrix restates the `tier=` grammar.
- `skills/flow/materialize.md`: the reader table names the header field as `/build`'s profile signal.
- `/build` execution strategies: `subagent` (sequential SDD dispatches) and `batched` — the frontier guard binds to strategy (below).

## Deliverables

- [ ] **First task: re-read #216's and #219's landed text** for the cap mechanism, tally location, and degradation semantics this leaf's prose cites.
- [ ] `tier=frontier` accepted in `/build`'s grammar: `argument-hint` reads `tier=<fast|standard|capable|frontier>`; input-resolution prose (~42) updated; the ~184 paragraph gains the **canonical guard statement** (this file is canonical; build-options.md cites it): no facet, policy, stance, or Manifesto option selects Frontier — only the typed token — **and a strategy precondition step**: when the resolved execution strategy is not `subagent` (sequential), `/build` refuses `tier=frontier` at options-resolution time with a stated message, before any dispatch. Prose-step enforcement is this plugin's mechanism layer; the refusal is a numbered step with a named trigger, not a caveat (IL-57).
- [ ] `skills/build/build-options.md` matrix row for `frontier`: cites the guard from SKILL.md ~184 (IL-17 — cite, don't restate); states the two-bounds distinction (sequential ≠ cost bound; cap is the cost bound, citing `frontier-run-cap`/#219 and the resolver/#216); states mid-run degradation plainly — with cap 3 and 6 tasks, tasks 4-6 resolve Capable, each degradation logged `AUTO`, the build continues.
- [ ] `skills/flow/materialize.md` reader-table note: the size-derived signal caps at Capable; `tier=frontier` is invocation-only and never materialized into the header (the run dir's `frontier-tally.log` — not the header — carries cap state across the build's sequential dispatches, surviving interrupt/resume because the tally is append-only in the run dir).
- [ ] `README.md` and `skills/help/` updated wherever the `tier=` grammar appears — enumerate by grep for the old three-value form, not by assuming which file (both checked; AC2 is the enumerator).

## Acceptance Criteria

1. `argument-hint` and `## Input` agree on `tier=<fast|standard|capable|frontier>`.
2. Grep for `tier=<fast|standard|capable>` (the old three-value literal) returns zero matches across `skills/ README.md` (demonstrated red first per IL-105).
3. The guard statement appears canonically in `SKILL.md` ~184; `build-options.md`'s row cites it and adds no second full statement.
4. The strategy-precondition refusal step exists as a numbered step naming its trigger (non-sequential strategy + `tier=frontier`) and its message.
5. The dispatch instruction under `tier=frontier` names the resolver call with `--run-dir`; degradation and cap semantics are cited to #216/#219's landed text, not restated from memory.

## Technical Approach

### Key Files

- `skills/build/SKILL.md` — grammar + canonical guard + strategy precondition + argument-hint
- `skills/build/build-options.md` — matrix row (citing)
- `skills/flow/materialize.md` — reader-table note
- `README.md`, `skills/help/` — wherever the grammar-form grep hits

## Gotchas

- A long build can outlive its cap (6 tasks, cap 3 → tasks 4-6 at Capable) — the matrix row says this plainly so no one is surprised mid-build.
- Open record #179 touches `README.md`/`skills/help/` for unrelated edges — trivial merge risk; check at build start.


<!-- work-fingerprint: 2026-08-08-model-profile-strategy:build-tier-frontier-human-typed-hardest-build-opt-in -->
