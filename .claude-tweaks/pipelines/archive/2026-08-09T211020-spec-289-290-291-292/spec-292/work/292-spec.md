---
record: 292
origin: human
risk: low
size: low
ceremony: fast-lane
grants: []
fingerprint: 2026-08-09-autonomy-unattended-tier-merge:init-question
blocked-by: [289]
surface: backend
---
# 292: Add init-time autonomy-level question and its update-mode migration offer

Surface: backend

## Overview

Neither `autonomy` nor the (now-retired) `unattended-tier` has ever had an init-time question —
both are discoverable only by reading plugin source, and both default to their most conservative
value on every project that never manually edits `.claude-tweaks/policy.yml`. This leaf adds a new
`/claude-tweaks:init` bootstrap step asking the degree-of-autonomy question directly, and wires
`/claude-tweaks:init --update`'s existing Config Home Drift check to also surface the blocking
leaf's new `renamedKeys` migration offer for projects that already set `unattended-tier: on` under
the old, now-retired lever.

`Trusted` is the recommended answer, not the system's conservative `supervised` default: every
capability it unlocks (`ledgerNarrowing`, `queueWriteAutoFile` — see the blocking leaf) is already
floor-gated to four narrow, reversible blocker-reason categories before it can act, and every
auto-resolution is logged. Recommending the more conservative `supervised` answer here would just
reproduce the friction this whole design exists to reduce, on every newly-initialized project by
default.

**Complexity:** Low
**Estimated tasks:** 5

## Non-Goals

- Exposing grant-origination's separate `grantOriginationEnabled` opt-in at init. That stays a
  deliberate, undocumented-at-init hand-edit per `_shared/autonomy-ceiling.md`'s existing stated
  intent — this leaf's question sets the `autonomy` ceiling only, never that second opt-in.
- Any change to `renamedKeys`' detection logic or the `RENAMED_KEYS` table itself — those ship in
  the blocking leaf. This leaf only wires `update-mode.md`'s existing Config Home Drift procedure
  to also read the new `renamedKeys` field alongside its existing `migratableKeys` read.
- A general project-config onboarding redesign. This is one new question, added at the next free
  step number, following the existing bootstrap step file/numbering convention exactly.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #289 | Merge unattended-tier into the autonomy ceiling — core lever code | this decomposition |

## Current State

- `skills/init/bootstrap-steps.md` — a numbered index table, one row per bootstrap step file,
  currently ending at row 17 (`step-17-work-record-backend.md`, "`work-backend` decision,
  capability probes, label bootstrap.").
- `skills/init/SKILL.md` — carries a one-paragraph summary for each numbered step (e.g. Step 16's
  and Step 17's summaries are inline prose ending with "Read `bootstrap/step-{N}-{name}.md` for the
  full procedure."), matching the same convention every other step follows.
- `skills/init/bootstrap/step-17-work-record-backend.md` — the most recent step file, useful as the
  formatting template for the new step file (question framing, `AskUserQuestion` call shape, what
  gets written to `.claude-tweaks/policy.yml` vs. CLAUDE.md).
- `skills/init/update-mode.md`'s "Config Home Drift" section (~line 119 onward) — detects stray
  recognized keys in CLAUDE.md via `auditPolicy(repoRoot).migratableKeys`, presents a batch table
  (Key | CLAUDE.md value | policy.yml value or "not set" | Recommended action), and calls
  `AskUserQuestion` to confirm the offered rewrite. This procedure reads `migratableKeys` only —
  it has no branch today for the blocking leaf's new `renamedKeys` field.
- `.claude-tweaks/policy.yml`'s "omitting a lever means default" convention — confirmed by
  `_shared/policy-schema.md`'s own note that `/claude-tweaks:init` does not generate every lever
  into CLAUDE.md/policy.yml; a lever is written only when its value differs from default.

## Deliverables

- [ ] New file `skills/init/bootstrap/step-18-autonomy-level.md`: presents one `AskUserQuestion`
      with three options — `Trusted (Recommended)` (skip asking about reversible ledger/queue-write
      bookkeeping; let evidenced record classes skip spec review; everything logged and
      reversible), `Supervised` (ask about every decision, today's default, unchanged), and
      `Unattended` (also skip acknowledging post-merge infrastructure follow-ups). On `Trusted` or
      `Unattended`, write `autonomy: {value}` to `.claude-tweaks/policy.yml`. On `Supervised`, write
      nothing (matches the "omitting means default" convention — `autonomy`'s own schema default is
      already `supervised`).
- [ ] `skills/init/bootstrap-steps.md`: add row 18 (`step-18-autonomy-level.md`, one-line summary).
- [ ] `skills/init/SKILL.md`: add Step 18's one-paragraph summary, following the exact prose
      convention Steps 16/17 use, ending "Read `bootstrap/step-18-autonomy-level.md` for the full
      procedure."
- [ ] Before writing this deliverable, re-read #289's shipped `auditPolicy()` return shape directly
      (`renamedKeys` entries' exact field names: `key`, `value`, `replacedBy`, `suggestedValue`,
      `currentReplacementValue`) — this record specifies them from #289's design-time shape; confirm
      they match what actually shipped rather than assuming this record's restatement is current.
      #289 also excludes any `RENAMED_KEYS`-matched key from `unrecognizedKeys` (its own fix, added
      during red-team), so this leaf's Drift Report never sees a stray `unattended-tier` reported
      twice under two different findings — nothing extra needed here for that.
- [ ] `skills/init/update-mode.md`'s Config Home Drift section: after the existing `migratableKeys`
      detection call, add a second call reading `auditPolicy(repoRoot).renamedKeys`. When non-empty,
      render each entry in the same batch-table shape the existing `migratableKeys` offer uses
      (adapted columns: Key | Current value | Suggested replacement | Current `autonomy` value or
      "not set"), then call `AskUserQuestion` offering the rewrite: remove `unattended-tier` from
      `policy.yml`, and set `autonomy` to the entry's `suggestedValue` — unless
      `currentReplacementValue` is already set to something, in which case surface both values and
      let the user pick which wins rather than silently overwriting an explicit existing setting.
      When `suggestedValue` is `null` (the `unattended-tier: off` case — see #289's own contract
      note on this), the offer is simply "remove this stray key," with no `autonomy` value to set.
      Each flagged `renamedKeys` entry counts toward the same Total drift count Phase 1u.6 already
      tracks for `migratableKeys` entries, so a project whose only drift is a stale
      `unattended-tier` key doesn't take the early-exit fast path.

## Acceptance Criteria

1. Running `/claude-tweaks:init` on a fresh project (no existing `.claude-tweaks/policy.yml`)
   presents the autonomy-level question at the next free step number (18 at design time — see
   Gotchas — re-verify against the live `bootstrap-steps.md` table at build time), after the
   previous step completes.
2. Selecting `Trusted` writes exactly one new line, `autonomy: trusted`, to
   `.claude-tweaks/policy.yml` — no other keys touched by this step.
3. Selecting `Supervised` writes nothing to `.claude-tweaks/policy.yml` — confirmed by diffing the
   file before and after the step.
4. `skills/init/bootstrap-steps.md`'s index table has a row for step 18 whose file reference
   (`step-18-autonomy-level.md`) matches an actual file at that path.
5. Running `/claude-tweaks:init --update` on a project whose `.claude-tweaks/policy.yml` contains
   `unattended-tier: on` and no `autonomy` key surfaces a Config Home Drift offer distinct from any
   `migratableKeys` offer, showing "unattended-tier: on → suggested: autonomy: unattended", and
   accepting it rewrites the file to remove `unattended-tier` and add `autonomy: unattended`.
6. The same scenario, but with `autonomy: trusted` already present alongside `unattended-tier: on`:
   the offer shows both values (`trusted` current, `unattended` suggested) rather than silently
   picking one — confirmed by reading the rendered batch table, not just the final written value.
7. A project with neither `unattended-tier` nor any `renamedKeys`-flagged key present shows no
   renamed-key drift offer at all — the Drift Report omits the check entirely rather than reporting
   a clean result (matching the existing `migratableKeys` convention: "An empty array means nothing
   to do — omit this check from the Drift Report entirely rather than reporting a clean result.").

## Technical Approach

Step 18 follows Step 17's exact file/prose shape — no new interaction pattern, just the next
numbered step. The update-mode wiring is additive: `renamedKeys` becomes a second read alongside
the existing `migratableKeys` read in the same Config Home Drift section, rendered as its own batch
table (distinct columns, since a renamed key's remedy — swap key name and value — differs from a
migrated key's remedy — move the same key from CLAUDE.md to policy.yml).

### Key Files

- `skills/init/bootstrap/step-18-autonomy-level.md` — new
- `skills/init/bootstrap-steps.md` — new row
- `skills/init/SKILL.md` — new step summary paragraph
- `skills/init/update-mode.md` — Config Home Drift section reads `renamedKeys`

### Package Dependencies

- None new. Consumes `auditPolicy()`'s new `renamedKeys` field from the blocking leaf.

## Gotchas

- Don't write `autonomy: supervised` explicitly when the user picks Supervised — that violates the
  "omitting a lever means default" convention every other lever in this table follows, and would
  make this project's `policy.yml` inconsistent with every other init-generated file.
- The `renamedKeys` reconciliation offer must never silently overwrite an already-set `autonomy`
  value — this mirrors `migratableKeys`' own `alsoInPolicy: true` differing-values handling (show
  both, let the user decide), not a blind rewrite. Re-read that existing handling in
  `update-mode.md` before writing this leaf's analogous branch, so the two offers read as one
  consistent pattern rather than two differently-behaved lookalikes.
- Step numbering is load-bearing: if another leaf or a concurrent session has already claimed step
  18 by build time, re-verify the live `bootstrap-steps.md` table and use the next actually-free
  number instead of assuming 18 — this record's own number was assigned at design time, before any
  build occurred.


<!-- work-fingerprint: 2026-08-09-autonomy-unattended-tier-merge:init-question -->


