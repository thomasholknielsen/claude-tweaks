---
record: 533
origin: human
risk: low
size: medium
ceremony: standard
grants: []
fingerprint: policy-comprehension:policy-schema-human-facing-metadata-summary-category-tier-an
blocked-by: [519]
surface: backend
---
# 533: Policy schema human-facing metadata (summary/category/tier) and resolve-policy --all

Surface: backend

## Overview

Give every policy lever a human-facing identity in the schema-as-data home, and one CLI call that dumps the whole resolved config. Each `POLICY_KEYS` row in `bin/lib/policy-schema.js` gains three required fields — `summary` (plain-language, phrased as *what changes when you move this lever*, not what the key stores; style target ≤ ~120 chars, hard test ceiling 140), `category` (small fixed set), and `tier` (`core` | `advanced`) — pinned complete by a new test so a future lever cannot ship metadata-less. `bin/resolve-policy.js` gains `--all`, emitting every key's `{value, source}` envelope plus its metadata in one JSON object, so renderers (the `/help policy` mode this unblocks, and init's policy review) never enumerate 48 keys by hand.

This is the foundation of the policy-comprehension family (parent #532): every downstream surface renders from this metadata, and nothing else may restate it.

**Complexity:** Medium
**Estimated tasks:** 6

## Non-Goals

- No renderer or user-facing surface — the `/help policy` mode is its own sub-issue.
- No recommendation data. A per-classification recommended-value matrix was explicitly rejected (see Decision Rationale) — recommendations are downstream LLM judgment, not schema data.
- No key renames, no new levers, no changes to resolution/precedence semantics — `resolveValue`, the `--run` overlay, and `RENAMED_KEYS` behavior are untouched.
- No rewrite of `_shared/policy-schema.md`'s per-key Meaning prose — the summary is a different altitude, not a replacement.

## Prerequisites

| Spec | Title | Status |
|------|-------|--------|
| #519 | Tidy routing flips, moderate default, and the missing-routing-rule principle | Hard gate: do not start until #519 is closed — re-check `gh issue view 519 --json state` at pickup time (it touches `bin/resolve-policy.js` and `_shared/policy-schema.md`). Any lever #519 added needs authored metadata (category + tier judgment), not just the completeness test's presence check. |

## Current State

- Schema: `bin/lib/policy-schema.js` — `POLICY_KEYS` array (48 entries at design time; #519 may add one), each `{key, type, default, ...}` (enum entries carry their value list); exports `resolveValue(key, rawValue)` and `auditPolicy(repoRoot)`; `RENAMED_KEYS` alias map.
- CLI: `bin/resolve-policy.js` — resolves named keys to `{value, source}` envelopes with `source ∈ run-config | policy | default`; `--values` scalar mode; `--run` overlay; existing `fail()` helper for invocation errors; `model-profiles` carve-out returns `{value: null, source: "default"}` when absent and is an invocation error under `--values`.
- Docs: `skills/_shared/policy-schema.md` — canonical lever index. Its key-bearing section headers number about a dozen (Worktree & execution, Integration model, Project facts, Dispatch & merge, Review, Documentation, Harness-health budgets, Health-sweep filing, Code-health focus verticals, Auto-mode levers, Model profiles, Additional levers) — deliberately more granular than the category set below, so the mapping is many-sections-to-one-category and must be written down, not assumed 1:1. The file opens with "if this table and that file disagree, one of them has a bug — fix, don't fork".
- Tests: `tests/hooks-gate-coverage.test.js` — the existing pattern for pinning a prose block to an exported constant; resolver behavior tests exist under `tests/` (locate via `grep -rl resolve-policy tests/`).

## Deliverables

- [ ] `summary`, `category`, `tier` fields on every `POLICY_KEYS` row, authored for all existing keys. Summaries state the behavioral consequence ("Every covered edit/commit must happen inside a linked worktree — the hook denies it elsewhere"), never restate the key name or type, and carry no implementation citations. These content rules are review-enforced; the one machine-checkable slice (a summary must not contain its own key string verbatim) goes in the test below.
- [ ] The `category` value set, exported as `POLICY_CATEGORIES` (working list from the design: `autonomy-trust`, `pipeline-behavior`, `merge-safety`, `health-sweeps`, `models`, `housekeeping`), plus an explicit **section→category mapping table** in `_shared/policy-schema.md`'s new metadata contract section covering every key-bearing section header. The mapping is authored as part of this work — it is not 1:1 (e.g. "Project facts", "Review", "Documentation" need assignments; adjust the category list if a section genuinely fits nothing) — and the test pins `POLICY_CATEGORIES` to the categories named in that table, the same prose↔constant pattern as `hooks-gate-coverage.test.js`.
- [ ] `tier` assignments by decision rule: `core` = levers that change what the pipeline may *do without a human* — enforcement gates, autonomy/trust posture, merge/execution defaults, integration identity. Tuning caps, thresholds, retention, and cosmetic/reporting knobs are `advanced`. At minimum core: `worktree.always`, `autonomy`, `integration-model`, `execution-strategy`, `git-strategy`, `project.maturity`, `housekeeping-auto-merge`. Worked anchors: `automerge-max-lines` is core (it bounds unattended merges — a may-do lever) while `backlog-fetch-limit` and `health-open-cap` are advanced (tuning); `risk-floor`/`size-floor` are core by the rule.
- [ ] New `tests/policy-schema-metadata.test.js`: every row has all three fields; every `summary` is a non-empty string ≤ 140 chars not containing its own key verbatim; every `category` ∈ `POLICY_CATEGORIES`; `POLICY_CATEGORIES` matches the .md mapping table's category set; every `tier` ∈ {`core`,`advanced`}; core-tier count ≤ 12 (the cap is enforced, not advisory); and no `summary:` string literal from the JS file appears verbatim in `_shared/policy-schema.md` (the no-duplication rule, automated rather than a one-time grep).
- [ ] `--all` flag on `bin/resolve-policy.js`: no key arguments accepted alongside it; emits one JSON object keyed by every schema key → `{value, source, summary, category, tier, type, default}`; composes with `--run`; mutually exclusive with `--values`. Both conflict cases (`--all --values`, `--all <key>`) exit non-zero via the existing `fail()` helper with a purpose-written one-line message each (exact wording implementer's choice). `model-profiles` appears with its existing carve-out envelope plus metadata, `type: "map"`, `default: null`. Tests for each of these behaviors alongside the existing resolver tests.
- [ ] `skills/_shared/policy-schema.md`: a "Metadata fields" contract section (the three fields, the 120-target/140-ceiling rule, the section→category mapping table, the tier decision rule, the completeness/pin tests, the summary-vs-Meaning altitude rule) and a `--all` paragraph in the Canonical read path section.

## Acceptance Criteria

1. `node --test tests/policy-schema-metadata.test.js` passes, and temporarily deleting any one row's `summary`/`category`/`tier` makes it fail — as does re-tiering an advanced key to push core past 12, and editing one category name in the .md mapping table (verify each discrimination by reverting; don't trust that the test reads correctly).
2. `node bin/resolve-policy.js --all` on this repo exits 0 and outputs valid JSON whose key set equals the schema's key set exactly, each entry carrying all seven fields above; `source` values match a spot-check against individually-resolved keys. `default` is JSON `null` exactly when the schema row has no default — no current key has a legitimate `null` default, and the .md contract section states that consumers read `null` as "no default"; if that invariant ever changes the contract section must change with it.
3. `node bin/resolve-policy.js --all --values` and `node bin/resolve-policy.js --all some-key` both exit non-zero with a one-line usage error.
4. `node bin/resolve-policy.js --all --run <dir>` reflects a run-config override in the affected key's `{value, source: "run-config"}` (test with a fixture run dir).
5. `npm test` passes with no existing resolver/schema test modified to weaken an assertion.
6. `skills/_shared/policy-schema.md`'s metadata contract section contains the section→category mapping table and no per-key summary text (the no-duplication assertion in the new test covers this from now on).

## Technical Approach

Extend each `POLICY_KEYS` entry in place — same object literals, three new fields — and export `POLICY_CATEGORIES` from `bin/lib/policy-schema.js`. `--all` reuses the resolver's existing per-key resolution loop (including alias and invalid-value handling) rather than a parallel implementation; it iterates the schema, not the policy file, so unset keys appear with `source: "default"`.

### Data / API Surface

- `POLICY_KEYS[i]` gains: `summary: string`, `category: string` (∈ `POLICY_CATEGORIES`), `tier: 'core' | 'advanced'`.
- New export: `POLICY_CATEGORIES: string[]` from `bin/lib/policy-schema.js`.
- CLI: `resolve-policy.js --all [--run <dir>]` → `{ [key]: {value, source, summary, category, tier, type, default} }` on stdout. `default` is the schema default, JSON `null` when the row has none (see AC 2); `type` is the schema type string (`model-profiles`: `"map"`).

### Key Files

- `bin/lib/policy-schema.js` — metadata fields on every row + `POLICY_CATEGORIES` export
- `bin/resolve-policy.js` — `--all` flag, flag-conflict errors
- `tests/policy-schema-metadata.test.js` — new completeness/pin test
- existing resolver test file under `tests/` — `--all` behavior cases
- `skills/_shared/policy-schema.md` — metadata contract section (incl. section→category mapping) + `--all` documentation

### Package Dependencies

None — zero-runtime-deps constraint holds (plain Node, `node --test`).

## Gotchas

- **#519 gates the start** (see Prerequisites — hard gate with a pickup-time re-check, not a point-in-time label).
- The schema doc's own rule applies: `_shared/policy-schema.md` and `policy-schema.js` must agree — the metadata contract section describes the *fields* and the mapping, never duplicates per-key values (the drift the `[IL-93]`-style restatements caused elsewhere); the new test automates the no-duplication rule.
- `model-profiles` has no scalar value; `--all` must emit its carve-out envelope (`{value: null, source: "default"}`, `invalid: true` on fragment-reader failure) rather than crashing on the nested block.
- Summaries are user language: no key names, no "controls whether", no implementation citations ("read by pre-tool-use.js"). Write the consequence.
- Prefer describing list sizes by reference, not literal counts, in the .md ("every key" not "all 48") — the cardinality rule in CLAUDE.md's Don'ts; the key count will drift. (The core ≤ 12 cap is a deliberate exception: it's an enforced ceiling, not a description.)
- `npm test` failure counts that vary run-to-run on identical code track machine load — re-run the affected file in isolation before concluding breakage.

## Decision Rationale

From the parent design (see #532 for the full digest): metadata lives in schema-as-data so every renderer draws from one pinned source; the .md Meaning column survives at a different altitude (deep contract semantics for skill authors) rather than being merged — merging was rejected because the two audiences need different registers, and generation machinery for the table wasn't worth its complexity. A hard-coded recommendation matrix (per-project-classification recommended values as data) was rejected in favor of downstream judgment against live project signals: a matrix drifts as levers evolve and projects don't fit classifications cleanly. `--all` exists because the `/help policy` renderer would otherwise issue a 48-key argument list or N calls — both brittle against schema growth.

<!-- work-fingerprint: policy-comprehension:policy-schema-human-facing-metadata-summary-category-tier-an -->
