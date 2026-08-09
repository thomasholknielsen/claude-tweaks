# Self-Maintaining Fleet — Design

**Date:** 2026-08-09
**Status:** Approved (brainstorm session)
**Consumes:** this doc is decomposed by `/claude-tweaks:specify`; phases below are the work units.

## Goal

Give plugin consumers the Anthropic-style self-maintaining-codebase posture: dedicated
maintenance sweeps (dead code, finished-experiment cleanup, test hygiene, abstraction
unification) running on schedule, whose findings flow to merged fixes without a per-item
human authorization click — while keeping everything that distinguishes this plugin from
"a routine just puts up a PR": the work-record audit trail, the trust ledger, blast-radius
gating, and instant revocability.

## Decisions already made (brainstorm outcomes)

1. **Records all the way.** No direct-fix routine archetype. Vertical finders file work
   records exactly as `code-health` does today; the loop closes by removing the human
   grant click, never by adding a second execution path. Dispatch/flow remain the only
   executors.
2. **Two-key entry, operational trust, automatic revocation.** Machine-granting a class
   requires the `autonomy` ceiling at `unattended` (plus its reserved second opt-in) AND
   that class's trust reading `clean` — with trust widened so it accrues from operational
   outcomes, not only `/demo` verdicts. Failure classifications and reverts revoke a
   class automatically regardless of entry path.
3. **Verticals are focus modes of `code-health`,** swapping slice-rotation scoping for
   candidate-driven scoping, reusing the judge/verify/dedup/filing machinery unchanged.
   One routine per vertical gives the "dedicated daily pass" shape.
4. **The fleet switch is a mode of `/routine`** (`fleet on|status|off`), not a new skill.

## External dependencies (referenced, not restated)

- **#155** (auto:merge can publish unreviewed sibling records, priority:high) —
  **HARD-GATES Phase 2.** No machine-granting ships while that hole is open.
- **#258 / #259 / #260 / #261** (routine delivery reliability — in flight) — gate
  Phase 4's usefulness; the fleet switch provisions routines that must actually fire.
- **#213** (`/routine` has no pause action) — Phase 4's `fleet off` wants pause-not-delete.
- **#212** (one-off runs, daily cap) — Phase 4's daily action cap is this territory,
  landed as a fleet-level policy key.

## Phase 1 — Trust ladder: operational evidence + automatic revocation

**Problem it closes:** the shipped `unattended` ceiling gates on per-class trust reading
`clean`. `trust.js` already samples closed records per class, but a record's *outcome*
becomes known only through `/demo`-descent evidence — an undemoed record counts as
"unknown outcome", and the known-outcome floor (deliberate, see trust.js's own header)
keeps such classes at `insufficient-evidence` forever. Consumers who rarely run `/demo`
can never unlock the tier — the ceiling shipped without its ladder.

**Changes:**

- `bin/lib/issues/trust.js` gains a second way for a closed record's outcome to become
  **known**: an operational-outcome signal alongside demo-descent evidence. A record
  (classed exactly as trust.js/provenance.js already class it — no new class key) counts
  as a known-good outcome when all of: it was granted, built, and
  merged; the merge is at least `trust-revert-window-days` old (new policy key, default 14);
  and no revert is detected. Evaluated **lazily at read time** — no new scheduled job.
  Outcomes younger than the window contribute nothing yet.
- **Revert detection** is deterministic: the record's closing commits checked against
  `git log --grep "This reverts commit"` (and the record's closed/reopened state). A
  detected revert writes *negative* evidence.
- **Failure revocation:** dispatch's existing `correctness`/`ambiguous` failure
  classifications (settle path) write negative evidence for the class, dropping it below
  `clean` at the next read. This is unconditional — it exists regardless of ceiling tier.
- **Retroactivity:** because closed records and closing commits already exist in the
  tracker and git history, the evidence scan credits history from before this feature
  shipped. A consumer who has been running the supervised loop starts with a real ledger.

**Spec-time constraint:** the implementing spec must read `trust.js`'s actual evidence
store shape first and extend it (expand-contract if the schema changes) rather than
assuming the shape described here; same for how dispatch's settle path can persist a
classification where trust.js can read it.

**Testing:** unit suites on frozen fixtures (never live repo history — IL-80) covering:
window boundary (merged exactly N days ago), revert detected inside/outside window,
classification-driven revocation, retroactive credit, and ceiling-lowering revoking
instantly. Verify discrimination by reverting the logic under test.

**Docs:** `policy-schema.md` row for `trust-revert-window-days`; `_shared/autonomy-ceiling.md`
updated to describe the widened evidence sources.

## Phase 2 — Machine-grant unit (the unattended tier's shut half opens)

**Placement:** granting stays in `/claude-tweaks:backlog` — the permission matrix's line
holds (filing skills never grant; dispatch never grants). Backlog gains a third mode,
**`grant`** — a headless unit mirroring `dispatch next`, scheduled by the fleet between
the finders and the dispatch drain.

**Per-record gate chain (ALL must hold, else skip with reason):**

1. `autonomy` ceiling resolves to `unattended` AND the reserved second opt-in is set
   (the opt-in `_shared/autonomy-ceiling.md` already names; the spec binds to that
   existing key, not a new one).
2. The record's class trust reads `clean` (Phase 1 semantics).
3. The record carries a `by:*` sweep origin. **Human-filed records always keep human
   grants** — machine origination is scoped to machine-filed work.
4. `assess-agent-autonomy` `grant-check` clears — same content-aware verdict the
   interactive grant sub-stage uses.
5. No floor trips: `merge-sensitive-paths` match, `risk:high`, or the fleet daily cap
   (Phase 4) already spent.

`auto:merge` may be machine-granted alongside `auto:build`: dispatch's auto-merge gate
independently re-runs `merge-check` at merge time — the existing two-layer design already
assumes grants can be wrong. (#155 must be fixed first; see dependencies.)

**Audit:** every machine grant writes an auto-decision-log entry AND stamps the record
(comment) with the evidence snapshot that justified it — ceiling, trust reading, grant-check
verdict — so "why did this merge itself" always has a durable answer. Every *skip* is
logged with which key failed.

**Testing:** the existing `backlog-refine-permission-matrix-compliance` eval gains the
unattended-path scenarios. Proving the unit **refuses** when any key is missing is as
load-bearing as proving it grants: one scenario per missing key, plus the
human-filed-record refusal. Unit-test the gate chain as a pure function where extractable.

**Docs:** `skill-graph.md` edges, backlog SKILL.md mode docs, `_shared/work-record.md`
permission matrix updated to name the one machine-origination path and its keys, routine
template for the grant unit (`skills/backlog/routine-template.yml` or equivalent).

## Phase 3 — Maintenance verticals (focus modes + candidate generators)

`code-health focus=<vertical>` swaps **scoping** only: instead of `next-slice` rotation,
a deterministic candidate generator scans the whole repo and feeds the LLM judge a
candidate list. Judge, verify gate, staleness re-check, fingerprint, dedup, wontfix
suppression, and filing are reused unchanged. Focus runs file records exactly like
today's sweeps — this phase is valuable standalone under full supervision, and ships
independently of Phases 1–2.

| Focus | Candidate generator (each: `bin/lib/code-health/candidates-*.js` + own unit suite) | Criteria catalog change |
|---|---|---|
| `dead-code` | unreferenced exports / orphaned files via reference analysis | `dead-code` exists |
| `test-hygiene` | coverage-gap areas AND assertion-free/tautological tests — covers both "write missing tests" and "delete useless tests" | new `missing-tests` fragment; `test-quality` exists |
| `abstraction-police` | cross-file signature/name similarity clusters | `architecture-depth` exists; gains cross-file calibration text |
| `experiment-cleanup` | matches of the repo's feature-flag idiom (new policy key `experiment-flag-patterns`, glob/regex list; LLM detection fallback when unset) | new `experiment-cleanup` fragment |

**Notes:**

- Candidate generators are the real engineering weight. Each is deterministic, testable
  in isolation, and honest about language coverage: v1 targets what a grep/AST pass can
  support (JS/TS first, per this plugin's own stack), and each generator states its
  coverage rather than implying totality (IL-110 — never let a lookup imply it can
  enumerate a domain it can't).
- Candidates are *input* to judgment, not findings — the LLM judge still applies the
  criterion holistically and the verify gate still runs. A zero-candidate run is a clean
  no-op, not an error.
- The two new fragments join the general catalog too, so slice rotation also picks them up.
- Routine templates: parameterized instantiation so the fleet creates one routine per
  focus with staggered cadence (template mechanics per `_shared/routine-template-schema.md`).
- New `bin/lib/code-health/tests/` additions must be covered by `package.json`'s existing
  glob — verify, don't assume (IL-84).

**Docs:** code-health SKILL.md focus-mode section, `criteria.js` catalog entries, two new
`skills/_shared/criteria-*.md` fragments, `policy-schema.md` row for
`experiment-flag-patterns`.

## Phase 4 — Fleet switch

`/claude-tweaks:routine fleet on|status|off`, documented in a `fleet.md` sub-file.

- **`on`:** one Manifesto-style block collecting the human-owned policy decisions —
  autonomy ceiling (and whether the second opt-in is set), automerge caps,
  merge-sensitive paths, daily action cap — then instantiates the fleet from existing
  parameterized templates with **staggered cadences**: vertical finders + generalist
  sweeps early morning, the machine-grant unit mid-morning, the dispatch drain after,
  tidy weekly. Idempotent: re-running `on` reconciles (updates schedules/templates)
  rather than duplicating routines.
- **`status`:** aggregates per-routine STATUS plus the trust table — one screen answering
  "what did my codebase do to itself this week": firings, findings filed, grants issued
  (and by whom — human vs machine), merges, revocations.
- **`off`:** pauses every fleet routine (depends on #213) rather than deleting, so
  rotation cursors, wontfix suppressions, and trust history survive a temporary shutdown.
- **Daily action cap:** fleet-level policy key counting **grants issued per day**, not
  firings — the brake sits at the choke point. Finders keep finding when the cap is
  spent; granting resumes tomorrow.
- Cloud parity: `on` verifies the Setup-script preconditions the #258 family establishes
  (per that family's outcome), and reports — not silently assumes — when the environment
  cannot actually fire routines (IL-113).

**Docs:** routine SKILL.md + `fleet.md`, `/help` placement (fleet status as a first-class
surface), README lifecycle diagram, `skill-graph.md` edges, `policy-schema.md` rows for
the cap key.

## Cross-cutting floors (hold in every phase)

Never machine-granted regardless of trust: `merge-sensitive-paths` matches, `risk:high`
records, human-filed records, anything `grant-check` flags. The auto-decision log receives
every machine decision (grant, skip, revocation) — silent automation stays forbidden.
Lowering the `autonomy` ceiling revokes everything instantly without destroying evidence
history.

## Sequencing

Phase 3 and Phase 1 are independent and can ship in either order (or parallel specs).
Phase 2 requires Phase 1 (the ladder it gates on) and #155 (hard). Phase 4 requires
Phases 2–3 for its full meaning and #213/#258-family for its mechanics; a supervised-only
fleet (finders + dispatch, no grant unit) is a legitimate intermediate ship if #155 lags.

## Out of scope

- Direct-fix routines (rejected — decision 1).
- A pure policy allowlist for machine-granting with no earned evidence (rejected —
  decision 2; the allowlist-to-enter variant was considered and folded down to just its
  failure-revocation half).
- A dedicated `/autopilot` skill (rejected — decision 4).
- Non-JS/TS candidate generator coverage in v1 (each generator states its coverage).
