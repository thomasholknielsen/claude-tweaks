---
record: 219
origin: human
risk: low
size: medium
ceremony: standard
grants: [build]
blocked-by: [216]
surface: backend
---
# 219: Model-profile policy keys and Manifesto stance lever

Surface: skills
Parent: #215

Blocked by #216: assumes profiles.js exports POLICY_KEYS_READ naming exactly model-profiles, model-stance, model-ceiling, and frontier-run-cap

## Overview

Register the model-profile system's four policy levers in the plugin's config surface, add the run-level stance lever to the Pipeline Config Manifesto **across every file the lever-addition checklist requires**, and register the orphaned `research-mode` key while the schema is open. After this leaf, a project can express "my Standard is Opus low", "never above Standard", "no Fable", and a default stance in `.claude-tweaks/policy.yml` — and `auditPolicy()` recognizes all of it.

**Complexity:** Medium
**Estimated tasks:** 6

## Non-Goals

- The resolver's own parsing and deep validation of these keys (#216 owns both — including malformed-value rejection at resolve time; this leaf's schema validation is shallow, see Technical Approach).
- Any new mid-flow stop: the stance lever rides inside the Manifesto's existing single block.
- Moving `work-backend`/`work-types`/`record-staleness-weeks` into policy.yml (open record #159's separate decision).

## Current State

- Registry: `bin/lib/policy-schema.js` `POLICY_KEYS` (~lines 9-42; its type vocabulary is boolean/enum/string/integer/list/opaque — **no map/object type exists today**); prose index in `skills/_shared/policy-schema.md`.
- **Lever-addition checklist** (`skills/_shared/auto-mode-contract.md` ~lines 216-224, its own "Adding a new policy lever" section): a new Manifesto lever also touches `skills/flow/SKILL.md` Step 3, `skills/flow/manifesto.md` (numbering line, suppression table, example table, footer, Override Semantics table, Recommendation Defaults table, config.yml schema), `skills/help/reference-card.md`, and `skills/help/context-flow.md`. That checklist exists because a prior lever addition missed two of these files.
- Audit-trail shapes: `skills/_shared/auto-decision-log.md`.
- Known gap: `skills/research/SKILL.md` (~line 51) reads a `research-mode` policy value no schema file defines.
- After #216: `bin/lib/model-profiles/profiles.js` exports `POLICY_KEYS_READ` (the four names) and `PROFILES` (whose row names are the valid profile vocabulary).

## Deliverables

- [ ] **First task: re-read #216's landed `profiles.js`** and confirm the exported key names and profile names before registering anything — the blocker line above is an assumption until checked.
- [ ] Four keys registered in `bin/lib/policy-schema.js` + documented in `skills/_shared/policy-schema.md`: `model-stance` (enum `economy|default|max-rigor`, default `default`), `frontier-run-cap` (integer ≥ 0, default 3 — the per-pipeline-run ceiling on Frontier dispatches; 0 disables Frontier; semantics defined by #216's resolver and #215's Decision Rationale), `model-ceiling` (enum over the profile names imported from `PROFILES` — a dangling name fails audit), `model-profiles` (registered with a new shallow `map` handling: keys must be profile names from `PROFILES`; entry values are accepted as opaque objects — deep `{model, effort}` validation is #216's resolver's job and stated as such in the index)
- [ ] `research-mode` registered in both files — enum values read from `/claude-tweaks:research`'s own `## Input` at build time (IL-24: that file is authoritative, not this record)
- [ ] Manifesto stance lever landed across the full checklist: `auto-mode-contract.md`, `flow/SKILL.md` Step 3, every `flow/manifesto.md` location its checklist names, `help/reference-card.md`, `help/context-flow.md`; recorded to the run's `config.yml` as `model-stance`
- [ ] `skills/_shared/auto-decision-log.md` gains one example entry shape for a non-default profile resolution (`AUTO {time} — profile {p} resolved {model}/{effort} via {source}`)
- [ ] A test importing `POLICY_KEYS_READ` from `bin/lib/model-profiles/profiles.js` and asserting every name is registered in `POLICY_KEYS` (IL-68 shape; demonstrated red per IL-105)

## Acceptance Criteria

1. `auditPolicy()` accepts a policy.yml containing all five new keys with valid values; flags an invalid `model-stance` value; flags a `model-ceiling` naming a non-profile; flags a `model-profiles` entry keyed by a non-profile name; accepts any object shape as a `model-profiles` entry value (shallow by design).
2. The pinning test fails if any `POLICY_KEYS_READ` name is missing from `POLICY_KEYS`.
3. `policy-schema.md`'s Config Lever Index documents each key with values, default, and consumer, following the existing row format; defaults live in the schema, never restated as literals in Manifesto prose (IL-40).
4. Every file in the lever-addition checklist shows the stance lever; the checklist's own file list is the verification list (grep each named location).
5. `npm test` green.

## Technical Approach

### Key Files

- `bin/lib/policy-schema.js` — POLICY_KEYS entries + shallow map/enum handling (may import from `bin/lib/model-profiles/profiles.js`)
- `skills/_shared/policy-schema.md` — Config Lever Index rows
- `skills/_shared/auto-mode-contract.md`, `skills/flow/SKILL.md`, `skills/flow/manifesto.md`, `skills/help/reference-card.md`, `skills/help/context-flow.md` — the lever checklist set
- `skills/_shared/auto-decision-log.md` — example entry
- Test colocated with existing policy-schema coverage (follow the suite's current layout)

## Gotchas

- IL-93: `policy-schema.md` and `policy-schema.js` are a stated mirror pair — edit both in the same task.
- The `map`-shaped `model-profiles` key is the first non-scalar POLICY_KEYS entry — whether that's a new `type: 'map'` in the vocabulary or special-cased handling is an implementation choice, but the shallow/deep validation split above is fixed: schema checks key names, resolver checks values.
- #216 must land first — the pinning test imports from a file this leaf does not create.
