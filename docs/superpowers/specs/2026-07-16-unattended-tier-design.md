# unattended-tier — Design

**Goal:** Reduce how often `/claude-tweaks:flow` parks waiting for a human click — whether it was
fired headlessly by `/claude-tweaks:dispatch` or run locally and interactively under `auto` — by
letting three specific, narrowly-scoped decision points resolve themselves when they are
demonstrably low-stakes, without weakening any of the governance guarantees the rest of the
pipeline relies on.

**Architecture:** One new project/pipeline policy lever, `unattended-tier` (`off` default | `on`),
plugged into the same Manifesto → `config.yml` → CLAUDE.md/`policy.yml` → skill-default precedence
chain every other auto-mode lever already uses. It authorizes exactly three behaviors — a narrowed
ledger-resolve-gate disposition, direct queue-write record creation, and ops-item
auto-acknowledgment — each logged to `decisions.md` and rolled into one consolidated
`PushNotification` per run. A new shared reference file, `_shared/unattended-tier.md`, is the
single source of truth every consumer points to rather than restating.

**Tech Stack:** Markdown skill-file changes (prose procedure) plus one small pure Node module for
the one genuinely mechanical piece (the floor-check predicate), tested via `node --test` following
the existing `bin/lib/issues/` pattern. No new dependencies.

## Motivation

`/claude-tweaks:dispatch`'s headless firing already treats an unanswered Review Console prompt as
an expected "parked" resting state, not an error — but that means every headless run that reaches a
mandatory decision point simply stalls until a human resumes it. Three specific gates account for
nearly all of this stalling even on runs with nothing genuinely contested:

1. **Ledger resolve gate Phase 2** (`ledger/resolve-gate.md`) — every item Phase 1 couldn't
   auto-fix gets a mandatory per-item drill, explicitly "no safe default," regardless of `auto`
   state.
2. **Queue writes** (Review Console Step 8.6, and the equivalent in leftover routing /
   `/reflect`'s insight routing) — any new backlog/parked record proposal requires a live
   per-item approval, never bulk-resolved.
3. **Ops-item acknowledgment** (`wrap-up/SKILL.md` Step 8.5) — infrastructure follow-ups
   require an explicit "I've read every item" confirmation.

All three exist for good reasons and none of that reasoning is wrong — but in practice, a large
share of what lands in each of them is mechanically low-risk: a ledger item blocked on a known,
recognized reason (external state, a product decision, an unbuilt dependency) that's already going
to become a backlog record either way; a leftover-work or reflection idea that's already been
auto-classified as "keep, backlog" by existing auto-mode policy and just needs the record actually
created; an ops item that's purely informational. Today, none of that mechanical residue gets any
different treatment than a genuinely contested decision. This design carves out exactly that
mechanical residue.

## Non-Goals

- **Not** a change to `Fix anyway`, `Accept`, or `Drop` dispositions in the ledger drill. `Accept`
  requires inventing a stated reason and `Drop` discards work outright — the literal failure mode
  the resolve gate exists to prevent. Both stay fully human-gated regardless of the lever.
- **Not** a change to auto-selecting `Defer → parked` from the ledger drill specifically. A good
  `parked` trigger needs human judgment about future context the agent shouldn't presume from a
  ledger item alone. (Leftover routing's own `parked` proposals are different — see Architecture.)
- **Not** a change to HARD-GATEs, `BLOCKED`/`STOP` conditions, or merge-conflict resolution. These
  represent correctness or intent judgment, not mechanical routing, and are explicitly excluded
  from this design regardless of the lever's state.
- **Not** a new judgment agent or `assess-agent-autonomy` mode. The floor check here is a simple,
  deterministic category match (is the blocker reason one of the four already-required
  categories?), not a content-aware verdict — deliberately simpler than `merge-check`/`failure-check`
  because the stakes (filing a reversible backlog record) are much lower than merging code.
- **Not** a per-record grant label (an `auto:ledger`-style mechanism mirroring `auto:merge`).
  That model only covers record-based work under `work-backend: github-issues` and doesn't serve
  conversation-based or standalone local work, which this design also needs to cover. Worth
  revisiting later as an *additional*, finer-grained override — not the primary mechanism here.
- **Not** a change to what `auto` means by itself. `auto` mode's documented "does NOT silence"
  guarantees stay true for any project/run that leaves `unattended-tier` at its `off` default —
  this is an explicit opt-in escape hatch layered on top, not a redefinition.

## Architecture

### New shared reference: `_shared/unattended-tier.md`

Canonical definition, referenced (not restated) by every consumer below:

- **Precedence:** CLI arg > `config.yml` (Manifesto answer) > CLAUDE.md/`policy.yml` project
  default > skill default (`off`) — identical resolution order to every other lever in
  `_shared/auto-mode-contract.md`.
- **Floor rule:** an item is eligible for auto-routing only if its blocker/reason is one of the
  four categories `ledger/resolve-gate.md`'s Phase 1 already requires as legitimate: external
  state, user product/design decision, dependency on not-yet-built functionality, or scope
  expansion. Anything else — including an ambiguous or unrecognized reason — fails closed (ask,
  exactly as if the lever were off).
- **Restricted-disposition rule:** the lever only ever authorizes routing to a new **backlog**
  record (no `parked` stage, no trigger to invent) or, for leftover routing specifically, whatever
  disposition (`backlog` or `parked`) that skill's *existing* auto-mode policy
  (`leftover-default`) already decided — this design changes whether creating that record needs a
  click, never what disposition auto-mode policy already picked. It never authorizes `Fix anyway`,
  `Accept`, or `Drop`.
- **Logging:** one `decisions.md` entry per auto-resolved item, same `AUTO {time} — {what}.
  Reason: {policy-source}. Reversibility: high.` shape as every other auto-decision.
- **Notification:** one consolidated `PushNotification` per run summarizing everything the lever
  resolved, sent at the same point the existing auto-merge fast lane sends its FYI — not one
  notification per item.

### Manifesto lever (`flow/SKILL.md` Step 3, `_shared/auto-mode-contract.md`)

`unattended-tier` joins the existing list of policy levers the Pipeline Config Manifesto computes
(alongside `scope-creep`, `overlap`, `leftover-default`, etc.), defaulting `off`. In `auto` mode it
renders as a read-only FYI line like every other lever; `confirm`/`hybrid` gates it for real
approval. Available identically whether the run originates from `/claude-tweaks:dispatch` or a
human typing `/claude-tweaks:flow` locally — it's a config value, not conditioned on how the run
was fired.

### Ledger Phase 2 narrowing (`ledger/resolve-gate.md` — the only place disposition-narrowing lives)

When `unattended-tier: on` and an item's Phase 1 blocker reason clears the floor, Phase 2 skips the
two-step `AskUserQuestion` drill for that item, auto-selects `Route to a record → Keep (backlog)`,
composes the same staged-proposal body Phase 3 already writes, and logs the decision. Items that
don't clear the floor (ambiguous reason, or a reason outside the four categories) fall through to
the existing per-item drill unchanged.

### Queue-write auto-file (`wrap-up/review-console.md` Step 8.6 — the single canonical creation path)

This is the *only* place a queue-write proposal is turned into a real record without a click,
whether it originated from the ledger gate above, leftover routing (Step 4), or `/reflect`'s
tangential-idea routing specifically (Step 3) — all three run before Step 8.6, so a fully-on run
reaches the console with those proposals already resolved. Note the scoping: reflect's Step 3 also
stages convention-drift, pattern-observation, and skill-update findings under the same
`staged/reflect-{n}.md` naming — those are **not** queue writes and must not be swept up here; the
console already distinguishes a queue-write proposal from a plain staged patch by the `decisions.md`
`STAGED` entry's own phrasing ("— backlog candidate. Surface at Review Console" vs. a bare stage
path), which is how it builds the Queue writes (Section 7) list separately from Pending review
(Sections 1-6) today — this design reuses that existing distinction rather than inventing a new
one. Before rendering, if the lever is on, the console creates each queue-write proposal via the
exact same `gh issue create` / `local-store.js` path the manual "Apply" choice already uses, logs
it as `AUTO` rather than `STAGED`, and lists it in **Auto-applied** instead of **Queue writes** —
which, on a fully-on run, renders empty by construction. The one deliberate exception: standalone
`/claude-tweaks:ledger resolve` invoked with no pipeline run directory has no console to centralize
through, so its existing Phase 3 "no run directory resolves" branch gets the identical check
inline — already a precedented special case in that file, not new duplication.

### Ops-ack auto-select (`wrap-up/SKILL.md` Step 8.5 ops-acknowledgment block — its only home)

When the lever is on, auto-select "Acknowledge all" instead of presenting the
`AskUserQuestion`, log it, and continue. Ops items are read-only FYIs about post-merge actions;
nothing here approves a change or creates state.

### Cross-reference sweep

The following each assert today's "always asks, regardless of `auto`" guarantee in their own
words and each needs the precise "...unless `unattended-tier` is on — see
`_shared/unattended-tier.md`" caveat, not just the first one found:

- `_shared/auto-mode-contract.md` — "What auto does NOT silence" table (ledger-gate row,
  work-record-creation row), and its Anti-Patterns table ("Filing work records autonomously
  because a finding 'obviously belongs there'" needs the carve-out noted so it isn't misread as
  contradicting this design).
- `ledger/resolve-gate.md` — "`auto` mode does NOT silence this gate" line.
- `wrap-up/leftover-routing.md` — the auto-mode section's "never created directly" line.
- `wrap-up/review-console.md` — "Queue writes are per-item only... never grouped under 'Approve
  all'" line.
- Root `CLAUDE.md` — verified against the actual file (not assumed): there is no separate Don'ts
  bullet mirroring this; the real touch point is the Auto-Mode Contract section's summary line
  ("...and what `auto` never silences (ledger resolve Phase 2, work-record creation — new backlog
  or parked records, ...)"), which needs the same caveat.

## Testing

- New `bin/lib/issues/unattended-tier.js` — a pure `clearsFloor(blockerReason)` predicate
  implementing the four-category match, used by both `resolve-gate.md`'s Phase 2 check and the
  standalone-ledger Phase 3 fallback.
- New `bin/lib/issues/tests/unattended-tier.test.js` — the four approved categories each return
  `true`; an unrecognized/ambiguous reason returns `false`; case-insensitive matching.
- The rest of this design is skill-file prose executed by the agent, not unit-testable code, so
  verification is scenario-based (see Error Handling below for the specific scenarios to walk
  through before this ships).

## Error Handling

Every failure path here fails toward **asking**, the opposite of "fail toward autonomy" —
appropriate because the cost of asking one extra question is a click, while the cost of a wrongly
autonomous action is a spurious GitHub issue or an unacknowledged infrastructure change:

- **Record creation fails** (`gh issue create` / `local-store.js` error) during an auto-file: do
  not drop the proposal. Log the failure, leave it staged, and let it render as a normal Queue
  write at the console — falls back to needing a click, identical to the lever being off for that
  one item.
- **`PushNotification` fails or isn't configured:** non-blocking. `decisions.md` and the Wrap-Up
  summary remain the durable record regardless of notification delivery.
- **Floor check is ambiguous** (blocker reason doesn't cleanly match one of the four categories):
  fails closed — ask, exactly as if the lever were off for that item.

**Verification scenarios to walk through manually before this ships:** (1) lever `off` — confirm
zero behavior change; (2) lever `on`, one floor-clearing ledger item — confirm it lands in
Auto-applied with a real issue link, not Queue writes; (3) lever `on`, one item with an ambiguous
blocker reason — confirm it still asks; (4) simulate a failed `gh issue create` — confirm it falls
back to a staged Queue write rather than vanishing.

## Known Touch Points (not exhaustive — writing-plans owns the precise file-by-file breakdown)

- New: `skills/_shared/unattended-tier.md`, `bin/lib/issues/unattended-tier.js`,
  `bin/lib/issues/tests/unattended-tier.test.js`
- Modified: `skills/_shared/auto-mode-contract.md` (Manifesto lever list, "does NOT silence"
  table, Anti-Patterns table), `skills/flow/SKILL.md` (Manifesto Step 3), `skills/ledger/resolve-gate.md`
  (Phase 2 narrowing + Phase 3 standalone fallback), `skills/wrap-up/review-console.md` (Step 8.6
  auto-file path), `skills/wrap-up/SKILL.md` (Step 8.5 ops-ack block), `skills/wrap-up/leftover-routing.md`
  (caveat only — disposition logic unchanged), root `CLAUDE.md` (Auto-Mode Contract section's
  "what auto never silences" summary line gains the same caveat). Verified against the actual
  file: `_shared/work-record.md`'s "Config keys" table is scoped to the record/dispatch model
  specifically (`work-backend`, `dispatch-retry-ceiling`, `automerge-max-lines`, etc. — all
  "written by `/init`") and does not list the other Manifesto pipeline-policy levers
  (`scope-creep`, `leftover-default`, `review-severity-floor`, ...) either; `unattended-tier`
  belongs with those, documented in its own new `_shared/unattended-tier.md` and named in the
  Manifesto's lever list, not added to that table.
- Documentation: none of this changes the skill catalog count, so no README.md/`help/reference-card.md`
  catalog update is needed — only the cross-reference sweep above.
