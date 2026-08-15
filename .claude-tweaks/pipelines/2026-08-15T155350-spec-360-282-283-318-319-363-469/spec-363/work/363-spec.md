---
record: 363
origin: human
risk: low
size: low
ceremony: standard
grants: []
fingerprint: feedback-e34660fc
surface: backend
---
# 363: wrap-up cleanup: plans-retention should be a policy setting, not a hardcoded CLAUDE.md assumption

Surface: backend

## Current State

`skills/wrap-up/cleanup-procedures.md` item 1 ("Execution plans") currently reads:

> Delete ephemeral plan files in `~/.claude/plans/` related to this spec (Claude Code's own native plan-mode scratch output). **Do NOT delete `docs/superpowers/plans/*.md`** — per ADR-0007 (`docs/decisions/0007-historical-design-doc-archive-is-periodically-pruned.md`), a plan/spec file is kept at the time of its own build; the accumulated archive is only pruned in bulk, later, as a separate, deliberate maintenance action — never per-build.

This "never delete" instruction is unconditional. It applies regardless of whether the *current* project even has a CLAUDE.md, let alone one that documents ADR-0007's "permanent historical archive" convention — ADR-0007 is this plugin's own repo's decision record, not something every consuming project necessarily shares or states.

Confirmed in a private project (plugin version 6.79.0) with **no CLAUDE.md file at all**: `/claude-tweaks:wrap-up` still applied the unconditional retention rule at Phase 4's cleanup planning, item 1, even though the stated justification corresponds to nothing in that project.

`.claude-tweaks/policy.yml` is documented (`skills/_shared/policy-schema.md`) as "the canonical and only home" for every project-config lever the plugin reads — no lever in that file's index is read from a project's CLAUDE.md. Plan/spec retention currently isn't a lever in that table at all; it's hardcoded directly into `cleanup-procedures.md`'s prose with no config-driven backing.

## Deliverables

1. A new policy key, `superpowers-plans-retention`, registered in `bin/lib/policy-schema.js`'s `POLICY_KEYS` — enum-typed, values `keep-forever` / `prune-after-wrapup` / `ask`, default `keep-forever` (preserves today's unconditional-retention behavior for every project that never sets the key).
2. A corresponding row added to `skills/_shared/policy-schema.md`'s canonical lever index, in the same shape (Key / Canonical home / Owner skill(s) / Default / Meaning) as every other row in that file.
3. `skills/wrap-up/cleanup-procedures.md` item 1 rewritten to resolve this policy value (via `bin/resolve-policy.js`, the file's own canonical read path) and branch on it:
   - `keep-forever` — today's behavior, unchanged: never delete `docs/superpowers/plans/*.md`.
   - `prune-after-wrapup` — delete *this spec's own* plan/spec file(s) under `docs/superpowers/plans/` as part of this cleanup step (scoped per-build, not a bulk sweep of the whole archive).
   - `ask` — stage the decision for the Wrap-Up Review Console rather than blocking wrap-up with a mid-flow prompt, per the Auto-Mode Contract's "decision-worthy things get staged, not a new stop" rule.
4. Item 1's justification prose reworded so it states `keep-forever` as this plugin's own default (consistent with, but not dependent on, ADR-0007) rather than asserting the ADR-0007 convention as a fact true of every project.

## Acceptance Criteria

- `node bin/resolve-policy.js superpowers-plans-retention` returns `keep-forever` with `source: "default"` when the key is unset in a project's `policy.yml`, and returns the configured value with `source: "policy"` when set.
- An out-of-enum value degrades to the `keep-forever` default via the existing `resolveValue` coercion contract (no throw), matching the pattern already used by other enum-typed keys.
- `skills/_shared/policy-schema.md` documents the new key with the same column shape as every other row in that file's index.
- `skills/wrap-up/cleanup-procedures.md` item 1 describes distinct, correct behavior for all three enum values, and no longer states "Do NOT delete" as an unconditional rule.
- A project with no CLAUDE.md and no `superpowers-plans-retention` entry in `policy.yml` still gets `keep-forever` (today's behavior) — the fix adds configurability without silently changing the default for existing projects.
- `bin/lib/policy-schema.js`'s own test suite (`node --test`, per `docs/plugin-structure.md`) passes with the new key registered, including a new test case covering this key's default/valid/invalid resolution — mirroring how an existing enum key (e.g. `doc-convention.adr`) is already covered.

## Technical Approach

Follow the existing `doc-convention.adr` lever as the closest existing pattern — also an enum answering a "does this project's own convention differ from the plugin's default" question in a wrap-up-adjacent context:

- `bin/lib/policy-schema.js`: add `{ key: 'superpowers-plans-retention', type: 'enum', values: ['keep-forever', 'prune-after-wrapup', 'ask'], default: 'keep-forever' }` to `POLICY_KEYS`.
- `skills/_shared/policy-schema.md`: add a row alongside `doc-convention.adr` (or a small dedicated section if that one doesn't fit) — Canonical home `policy.yml`, Owner skill `/claude-tweaks:wrap-up`'s cleanup-planning step, Default `keep-forever`.
- `skills/wrap-up/cleanup-procedures.md`: item 1's table cell and inline prose — read the resolved value at Phase 4's execution step using the same `bin/resolve-policy.js` invocation convention every other lever in this file already follows, then branch three ways per Deliverables above.
- No hook or mechanical enforcement is implied by this change — it's a plain policy-value read at wrap-up time, not a `pre-tool-use.js` gate, so `bin/lib/hooks/` needs no change.
- Leave ADR-0007 itself (`docs/decisions/0007-historical-design-doc-archive-is-periodically-pruned.md`) untouched — it remains a true statement of this plugin's own repo's convention. The fix is that other projects are no longer forced onto it unconditionally, not that the ADR is wrong.

## Gotchas

- `keep-forever` MUST remain the default. Changing the default itself (rather than only adding configurability) would be a silent behavior change for every existing project — CLAUDE.md's expand-contract discipline for shipped contracts applies here, since `cleanup-procedures.md` is read by four call sites (wrap-up Phase 4's cleanup planning, its phase-trace report checklist, its execution step, and `review-console.md`'s Cleanup actions section).
- `prune-after-wrapup`'s scope must stay per-build (this spec's own plan/spec file only) — conflating it with a bulk sweep of the whole `docs/superpowers/plans/` archive would reproduce, under a different label, the exact "bulk pruning, later, as a separate deliberate action" behavior ADR-0007 already establishes for a different reason.
- The `ask` value must route through the Wrap-Up Review Console (staged, not an inline blocking prompt) — a raw mid-flow prompt here would violate the Auto-Mode Contract's "no new mid-flow stops in auto mode" rule.
- All four call sites that read `cleanup-procedures.md` item 1 need to reflect whichever of the three behaviors is configured consistently, not just the Phase-4 execution step in isolation.

## Original request

wrap-up cleanup: plans-retention should be a policy setting, not a hardcoded CLAUDE.md assumption

**Summary:** `wrap-up`'s `cleanup-procedures.md` item 1 unconditionally keeps `docs/superpowers/plans/*.md` forever, justified by "this project's CLAUDE.md documents it as a permanent historical archive" — but the skill applies this rule even in a project that has no CLAUDE.md at all, where that justification is simply false.

**Kind:** Defect

**Affected component:** `skills/wrap-up/cleanup-procedures.md` (item 1, Execution plans)

**Repro steps:**
1. Run `/claude-tweaks:wrap-up` in a project with no `CLAUDE.md` file.
2. Reach Phase 4's cleanup planning, item 1 (Execution plans).

**Expected vs. actual:**
Expected: either the rule's justification holds (a CLAUDE.md really documents this convention), or the behavior is configurable so a project without that convention can choose a different retention policy.
Actual: the "never delete" rule applies unconditionally regardless of whether a CLAUDE.md exists or says anything about it — confirmed in a private project with zero `CLAUDE.md` file, where the stated justification doesn't correspond to anything in the project.

**Suggested fix:** make plan/spec retention a policy setting (e.g. a `superpowers-plans-retention` value — `keep-forever` / `prune-after-wrapup` / `ask`) instead of an unconditional rule that assumes every project's CLAUDE.md documents the "permanent archive" convention.

**Plugin version:** 6.79.0

---
Filed via /claude-tweaks:feedback.
<!-- fingerprint: feedback-e34660fc -->

