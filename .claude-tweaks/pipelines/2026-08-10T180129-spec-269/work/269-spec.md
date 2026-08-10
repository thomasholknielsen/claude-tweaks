---
record: 269
origin: human
risk: high
size: high
ceremony: standard
grants: [build]
fingerprint: 2026-08-09-self-maintaining-fleet-design:backlog-grant-mode-headless-machine-grant-unit-behind-the-un
blocked-by: [267, 268, 155]
surface: backend
---
# 269: backlog grant mode: headless machine-grant unit behind the unattended ceiling

Surface: backend
Parent: #265
Blocked by #267: assumes per-class trust verdicts incorporate operational outcomes and are readable at grant time
Blocked by #268: assumes negative evidence drops a class below clean and revocation semantics are live
Blocked by #155

## Overview

Open the `unattended` tier's deliberately-shut half: a **headless machine-grant unit** as a third mode of `/claude-tweaks:backlog` (`grant`), mirroring `dispatch next`'s headless-unit shape. Granting stays in backlog — the permission matrix's line holds (filing skills never grant; dispatch never grants) and is narrowed exactly once, here, behind the two-key entry the design fixed: policy ceiling at `unattended` (plus the reserved second opt-in `skills/_shared/autonomy-ceiling.md` already names) AND per-class trust reading `clean` under the widened ladder. Human-filed records always keep human grants. Every machine grant — and every skip — is audited.

This is the security boundary of the whole program: proving the unit *refuses* when any key is missing is as load-bearing as proving it grants. Decision rationale on parent #265.

**Complexity:** High
**Estimated tasks:** 8

## Non-Goals

- The routine template and eval scenarios (companion leaf, blocked on this one).
- Granting for human-filed records under any configuration — permanently out of scope, not deferred.
- Changing dispatch's auto-merge gate, `merge-check`, or `grant-check` themselves — this unit *consumes* `assess-agent-autonomy` verdicts, it never redefines them.
- Interactive `refine` mode's grant sub-stage — unchanged; this is a sibling mode, not a replacement.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #267 | Trust ladder: operational outcomes | this decomposition |
| #268 | Trust ladder: failure revocation | this decomposition |
| #155 | auto:merge publishes unreviewed sibling records | **HARD GATE** — open, priority:high; no machine-granting ships while this hole is open |

## Current State

- `skills/backlog/SKILL.md` + `skills/backlog/refine-mode.md` — modes `refine`/`overview`; refine's grant sub-stage is interactive-human-only with the Detection Ladder hard gate and the local-files full stop. The permission-matrix language here ("auto:* labels come only from a human session; the autonomy ceiling's unattended tier defines the one exception and keeps it shut behind a second opt-in nothing sets") is the exact sentence this leaf turns from "nothing sets" into "the fleet's Manifesto may set, and here is the one path that acts on it."
- `skills/_shared/autonomy-ceiling.md` — ceiling contract; **bind to the reserved second-opt-in key it already names — do not invent a new key** (check the premise against the live file first, IL-71).
- `skills/_shared/work-record.md` — permission matrix, canonical label taxonomy.
- `bin/lib/issues/autonomy.js` — `resolveCeiling`, `permittedGrants`.
- `skills/assess-agent-autonomy/` — `grant-check` mode (content-aware verdict the interactive sub-stage already uses).
- `skills/_shared/auto-decision-log.md` — audit-entry format.
- `skills/backlog/routine-template.yml` does not exist yet (companion leaf).

## Deliverables

- [ ] `skills/backlog/grant-mode.md` (new sub-file) + `SKILL.md` mode wiring: headless `grant` mode — enumerate candidate records (open, `by:*` origin, no grant labels, no `bot:*`, not `Blocked by` an open record), evaluate the gate chain per record, apply `auto:build` (+`auto:merge` when its own checks clear) or skip with a logged reason.
- [ ] Gate chain, ALL must hold, evaluated in this order with the first failure short-circuiting into a logged skip (**the order is fixed and load-bearing** — a multi-floor trip logs the first per this order, and the eval scenarios pin it): (1) ceiling resolves `unattended` AND the reserved opt-in is set; (2) record class trust reads `clean` — every non-`clean` verdict is one skip reason whose log line names the actual verdict string (`insufficient-evidence`, the conflicting-evidence state, etc.), no per-verdict branching; (3) record carries a `by:*` sweep origin; (4) `assess-agent-autonomy` `grant-check` clears; (5) no floor trips, sub-order fixed as: `merge-sensitive-paths` glob match **against the record's own `### Key Files` list** (grant time has no diff — the stated file list is the blast-radius proxy, and merge time re-checks the real diff), then `risk:high`, then the fleet daily grant cap spent. **Cap contract, pinned now so this leaf and the fleet leaf build against one shape: `fleet-daily-grant-cap`, positive integer in `.claude-tweaks/policy.yml`, counting machine grants issued today (audit-comment markers dated today, UTC); the key ships with the fleet leaves — absence means no cap, and the check treats it as optional-when-absent. Until the fleet leaf lands, an unattended deployment is deliberately uncapped: acceptable because the same human who set the two unattended keys chose that posture, and floors (1)-(4) still bound every grant.**
- [ ] `auto:merge` machine-grant permitted alongside `auto:build` — **"its own checks" means exactly `permittedGrants(ceiling, trustRow)` (`bin/lib/issues/autonomy.js`) returning merge permission for this class; no other criteria** — safe because dispatch's auto-merge gate independently re-runs `merge-check` at merge time (two-layer design); state this rationale in the mode doc. Build-time drift (trust or floors changing between grant and build) is accepted and documented: dispatch re-verifies each record's premise before its build (IL-109 discipline) and the merge gate re-judges the diff; the grant authorizes an attempt, it never promises a merge.
- [ ] Audit: every grant writes an auto-decision-log entry AND a record comment stamping the evidence snapshot (ceiling, opt-in, trust verdict, grant-check verdict, floors evaluated); every skip logs which key failed. No silent outcome in either direction.
- [ ] `skills/_shared/work-record.md` permission matrix updated: the one machine-origination path, its full key set, and the human-filed exclusion — replacing the "nothing sets it today" phrasing everywhere it occurs (sweep the whole file and `skills/backlog/refine-mode.md` for restatements, IL-17/IL-93).
- [ ] `docs/skill-graph.md` edges for the new mode's relationships (backlog→assess-agent-autonomy grant-check consumption; fleet→grant scheduling arrives with the fleet leaves).

## Acceptance Criteria

1. With all keys satisfied (fixture policy: ceiling `unattended` + opt-in set; fixture class trust `clean`; `by:code-health` record; grant-check clear; no floors), the mode grants `auto:build`+`auto:merge`, writes the audit log entry, and comments the evidence snapshot.
2. Each of the following alone produces a refusal with that key named in the skip log: ceiling `trusted` (not `unattended`); opt-in unset; class trust `insufficient-evidence`; record with no `by:*` label; grant-check flagging; `merge-sensitive-paths` match; `risk:high`; cap spent. One scenario per key — a single combined scenario cannot attribute the refusal (IL-105: name what red looks like per claim).
3. A human-filed record (no `by:*`) is refused even with every other key satisfied — asserted as its own scenario, not folded into 2.
4. The cap check with no cap key configured passes (optional-when-absent) — asserted explicitly.
5. The mode never adds `ready`, `priority:*`, or `bot:*`, and never edits record bodies beyond the audit comment — consistent with the permission matrix.
6. Under `work-backend: local-files`, the mode stops completely with the same no-headless-consumer explanation refine's grant sub-stage documents — machine-granting is `github-issues`-only.

## Technical Approach

**The gate-chain extraction is required, not optional**: `evaluateGrantGate(record, policy, trustVerdicts)` lands in `bin/lib/issues/grant-gate.js` with its own unit suite covering the full refusal matrix; the mode's prose calls it, and the eval scenarios test the prose-to-function binding plus refusal *attribution* (which key failed) — units own logic, evals own attribution, no duplicated matrix. Candidate enumeration reuses dispatch's queue-pull conventions verbatim (`gh issue list --state open ... --limit 500` + `parseRecordFacets` + the at-cap stderr warning — the same pagination posture, documented there). Trust reads go through the landed Phase-1 API. The reserved opt-in key: read `autonomy-ceiling.md`'s current text and use exactly the key it reserves. On the `by:*` origin gate's trust model: a `by:*` label is repo-collaborator-writable, so a human *could* mislabel a hand-filed record into eligibility — accepted, because anyone with label-write access can already apply `auto:build` directly; the gate is a scoping boundary, not a privilege boundary, and the mode doc says so. Mechanical prerequisite enforcement needs no new machinery: this record's own `Blocked by` links keep it out of dispatch's queue (dispatch excludes records with open blockers) until #155 and the trust leaves close.

### Data / API Surface

- `evaluateGrantGate(record, policy, trustVerdicts) → {grant: boolean, autoMerge: boolean, failedKey?: string, snapshot: {...}}` (extraction preferred; exact shape settled at build).
- Audit comment marker: structured, line-anchored, consistent with existing marker conventions in `record.js`.

### Key Files

- `skills/backlog/grant-mode.md` — new
- `skills/backlog/SKILL.md` — mode wiring + description update
- `skills/_shared/work-record.md` — permission matrix
- `skills/_shared/autonomy-ceiling.md` — opt-in activation semantics
- `bin/lib/issues/grant-gate.js` + `bin/lib/issues/tests/grant-gate.test.js` — extracted gate (preferred path)
- `docs/skill-graph.md` — edges

### Package Dependencies

- None new.

## Gotchas

- **#155 is a hard gate, not a soft dependency** — machine-granting `auto:merge` into a dispatch pipeline that can publish unreviewed sibling records would automate the exact hole. Verify #155 is closed (and its fix released) before building; if it is not, this leaf must not be dispatched (IL-109 premise re-verification applies with teeth).
- The existing eval `evals/scenarios/backlog-refine-permission-matrix-compliance.yaml` encodes today's "no machinery path originates a grant" as compliance — this leaf makes that eval's premise conditionally false. The companion eval leaf updates it; until then, expect that eval to fail against a build of this leaf and coordinate the two (IL-95: the check is a hypothesis too — but here the *data* changes legitimately, so the check must change with it, in the companion leaf, same release).
- `permittedGrants` in `autonomy.js` maps (ceiling, trust row) → permission set — the gate chain must call it rather than reimplementing the mapping (IL-32: extract/reuse, don't duplicate the decision table).
- Skip logging goes to the auto-decision log only when a pipeline run dir exists; a standalone headless firing has none — the mode doc must state where skips land in that case (the run summary output), not leave it to enumeration-of-termination-paths (IL-14: state an unconditional rule).
- Label bootstrap: `auto:build`/`auto:merge` labels already exist in this repo, but the mode must bootstrap them per `_shared/label-bootstrap.md` for consumer repos where no human has ever granted.


<!-- work-fingerprint: 2026-08-09-self-maintaining-fleet-design:backlog-grant-mode-headless-machine-grant-unit-behind-the-un -->
