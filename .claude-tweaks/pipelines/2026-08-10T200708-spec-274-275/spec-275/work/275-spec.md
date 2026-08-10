---
record: 275
origin: human
risk: medium
size: high
ceremony: standard
grants: [build]
fingerprint: 2026-08-09-self-maintaining-fleet-design:routine-fleet-on-one-action-provisioning-with-manifesto-stag
blocked-by: [271, 259, 260, 261, 219]
surface: backend
---
# 275: routine fleet on: one-action provisioning with Manifesto, staggered cadences, and daily grant cap

Surface: backend
Parent: #265

Blocked by #271: assumes the code-health routine template’s focus parameterization landed
Blocked by #259
Blocked by #260
Blocked by #261
Blocked by #219

## Overview

The fleet switch's provisioning half: `/claude-tweaks:routine fleet on` — one deliberate action that turns on the self-maintaining posture. It runs a single Manifesto-style block collecting the human-owned policy decisions (autonomy ceiling + whether the reserved opt-in is set, automerge caps, merge-sensitive paths, daily grant cap), then instantiates the fleet from the existing parameterized routine templates with **staggered cadences**: vertical finders + generalist sweeps early morning, the machine-grant unit mid-morning (only when the unattended keys are set), the dispatch drain after, tidy weekly. Idempotent: re-running `on` reconciles existing fleet routines (updates schedules/prompts) rather than duplicating. Also lands the fleet-level policy key the grant unit's cap check reads.

Decision rationale on parent #265: fleet is a `/routine` mode, not a dedicated skill.

**Complexity:** High
**Estimated tasks:** 8

## Non-Goals

- `fleet status` and `fleet off` (companion leaf).
- Creating routines for skills with no template, changing template contents (the templates are inputs), or any per-repo cadence auto-tuning beyond the stagger defaults.
- Setting the autonomy ceiling *for* the user — the Manifesto asks; silence defaults to today's `supervised`, and the fleet provisions a supervised-only fleet (no grant unit) in that case.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #271 | focus-mode + parameterized code-health template | this decomposition — what per-vertical instantiation consumes |
| #259/#260/#261 | Routine delivery reliability family | in flight — fleet `on` is worthless until scheduled firings reliably execute their skill; build against their landed state |
| #212 | One-off runs + daily cap | open — Related (the cap concept's original record); this leaf implements the fleet-level grant cap, #212's one-off-run half stays its own record |
| #219 | Model-profile policy keys (granted, undispatched) | file-overlap ordering only — #219 touches `bin/lib/policy-schema.js` + `skills/_shared/policy-schema.md`, the same files this leaf's cap key registers in; whichever builds second re-merges, and the Blocked-by link sequences it |

## Current State

- `skills/routine/SKILL.md` + `create-and-update.md`, `guided-environment-creation.md`, `schedule-resolution.md`, `record-freshness.md`, `status.md` — the create/update flow this mode composes over. **#259 is rewriting `guided-environment-creation.md` right now — build against the landed file (IL-109).**
- Templates: six existing `skills/*/routine-template.yml` + the grant-unit template (grant leaves) + code-health's focus parameter (E). Post-#260, all templates carry the self-heal preamble; the fleet inherits that guarantee per firing, it does not re-implement it.
- Manifesto/bookend pattern: `skills/_shared/auto-mode-contract.md` — the fleet's config block is a bookend-pattern instance (one structured block, all levers, one message), not a new mid-flow stop family.
- Policy: `bin/lib/policy-schema.js` + `skills/_shared/policy-schema.md` — where `fleet-daily-grant-cap` registers.
- Cloud parity: CLAUDE.md's Cloud parity section + IL-113/IL-117 — the environment Setup script is confirmed NOT to reach scheduled Routine sandboxes; the routine preamble's self-heal is what guarantees a firing ends in a real result or a diagnosable failure.

## Deliverables

- [ ] `skills/routine/fleet.md` (new sub-file, `on` sections) + `SKILL.md` mode wiring: fleet composition table naming both buckets explicitly — **vertical finders** = the code-health focus routines (`dead-code`, `test-hygiene`, `abstraction-police`, `experiment-cleanup`); **generalist sweeps** = generalist code-health, docs-health, journey-health, harness-health — plus the grant unit (conditional), the dispatch drain, and tidy; stagger defaults (finders 05:00-07:00 repo-local, grant unit 09:00, dispatch drain 10:00, tidy weekly — exact defaults settled at build against `schedule-resolution.md`'s conventions), and the reconcile rule. **A repo with only a subset of templates present gets a partial fleet: provision what exists, and the summary names each missing template and the skill it belongs to — never a refusal, never silence.** Throughout this record, "the unattended keys" means exactly two policy fields: `autonomy: unattended` and the reserved second opt-in `_shared/autonomy-ceiling.md` names — no third key, no paraphrase.
- [ ] Manifesto block: one structured message collecting ceiling+opt-in, automerge caps, merge-sensitive paths, `fleet-daily-grant-cap` — writing answers to `.claude-tweaks/policy.yml` per the policy-schema's shapes; every value it writes echoes in the summary (no silent config writes). **The automerge caps and merge-sensitive paths are persisted only** — their consumers are `assess-agent-autonomy`/`dispatch`/the grant gate, and this leaf neither validates their semantics beyond schema shape nor applies them itself.
- [ ] Conditional grant-unit provisioning: instantiate the grant routine ONLY when both unattended keys are true (just set, or already); a supervised answer provisions finders + drain + tidy only, and the summary names exactly what was and wasn't provisioned and why. **Downgrade on re-run** (a prior fleet had the grant routine, this Manifesto answers supervised): the grant routine is paused when the pause verb exists (#213), else surfaced prominently for manual removal — and either way the lingering routine is harmless-by-construction, because the grant mode's own gate chain re-checks the ceiling every firing and skips every candidate at `supervised`; the summary states this.
- [ ] Idempotent reconcile: `fleet on` re-run detects existing fleet-created routines and reconciles. **Marker decision rule, fixed now: a metadata field on the routine when the routine API carries one; a deterministic name-prefix only as fallback when it doesn't — and under the fallback, a hand-created routine colliding with the prefix is detected and reported, never adopted.** Drift detection: re-render each fleet routine's prompt from the current template and compare against the stored prompt — re-render-and-compare, not a version-string check (IL-89's lesson: version strings prove nothing about content). Updates schedule/prompt drift, creates missing ones, never duplicates; routines the user created by hand are never touched.
- [ ] Policy key `fleet-daily-grant-cap` (integer, default unset = no cap) registered + documented; the grant mode's gate chain already treats absence as no-cap.
- [ ] Cloud-parity honesty: `fleet on` runs the same environment verification the routine skill's landed #259/#260 flow uses and **reports** any gap (Setup-script line missing, plugin absent) — it never silently assumes firings will work (IL-113/IL-117; the self-heal preamble is the per-firing guarantee, the fleet's job is only to not hide a known-broken environment at provisioning time).

## Acceptance Criteria

1. `fleet on` in a repo with all templates present and a fully-answered Manifesto (both unattended keys set) creates the full fleet — verified by `/claude-tweaks:routine` STATUS listing each expected routine with its expected schedule; re-running `fleet on` immediately after creates zero new routines and reports "reconciled, no drift". (Schedule values assert against the fleet.md composition table's landed defaults; the marker mechanism asserts against the decision rule above — both are spec-anchored, not implementer-invented.)
1b. `fleet on` against an environment failing the cloud-parity verification presents the specific gap and an explicit proceed-or-abort choice — it neither refuses unconditionally nor creates silently; choosing proceed records the acknowledged gap in the summary.
2. A supervised-ceiling answer provisions no grant routine, and the summary states the grant unit was withheld and which policy change would enable it.
3. `fleet-daily-grant-cap` registers and validates (positive integer; malformed → schema validation failure named to the user, not a silent default).
4. The Manifesto block renders every lever it will write BEFORE writing (the render-then-write binding is explicit prose with a pre-write check — IL-114: never trust a render instruction to bind itself).
5. Fleet-created routines carry the deterministic fleet marker; a hand-created routine with a colliding name is detected and reported, never adopted or overwritten.
6. The daily grant cap counts **grants issued per day** (consumed in the grant mode's gate) — the fleet doc states the choke-point rationale: finders keep finding when the cap is spent; granting resumes next day.

## Technical Approach

Fleet.md drives the existing create/update path per routine — a loop of the same procedure `create-and-update.md` documents, parameterized by the composition table, with the reconcile check before each create. No new Node module expected; if the reconcile diff logic (existing-routine list vs composition table) wants extraction, it goes in `bin/lib/` per the flat-module convention with its own suite.

### Data / API Surface

- Policy key: `fleet-daily-grant-cap` — integer ≥ 1 or unset.
- Fleet marker: deterministic routine-name prefix or metadata marker (settled at build against the routine API's actual fields; the naming must survive the update path).

### Key Files

- `skills/routine/fleet.md` — new (on/reconcile sections)
- `skills/routine/SKILL.md` — mode wiring
- `bin/lib/policy-schema.js` + `skills/_shared/policy-schema.md` — cap key
- `docs/skill-graph.md` — fleet→{code-health, docs-health, journey-health, harness-health, backlog grant, dispatch, tidy} provisioning edges

### Package Dependencies

- None new.

## Gotchas

- **Real, billed infrastructure**: fleet `on` creates cloud routines — the procedure must decide at design level what cleanup owns each artifact (IL-69); the answer is: fleet-created routines are deliverables owned by `fleet off` (companion leaf), and `on`'s summary lists every created routine so nothing is orphaned-by-silence.
- The daily cap key is read by the grant mode as `fleet-daily-grant-cap` (contract pinned in #269: positive integer, grants-issued-per-day, absence = no cap) — landing the key here without breaking that contract is the cross-leaf promise **recorded as row F10 of parent #265's Cross-Spec Promises register** (deliberately no Blocked-by edge: #269 ships first and treats the key as optional). Before building, grep #269's landed gate code to confirm the absence-means-no-cap handling exists as pinned (IL-71: measure the premise against live files).
- Routine creation caps exist (#212 notes a daily cap concept for *runs*) — do not conflate the platform's run cap with this grants-issued cap; name both distinctly in fleet.md.
- Cadence prose must bind to `schedule-resolution.md`'s actual resolution rules (timezones, cron grammar) — don't restate its rules, cite them (stated-once discipline).
- Re-verify the #259/#260/#261 landed state immediately before building — this leaf's Current State was written mid-flight (IL-109, and the CLAUDE.md Cloud-parity section was already updated once during this very decomposition).


<!-- work-fingerprint: 2026-08-09-self-maintaining-fleet-design:routine-fleet-on-one-action-provisioning-with-manifesto-stag -->
