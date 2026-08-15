---
record: 406
origin: human
risk: low
size: medium
ceremony: standard
grants: []
blocked-by: []
surface: backend
---
# 406: Integration-model resolution: pr-first vs local-merge as a resolved policy property

Surface: backend

## Overview

Introduce `integration-model` as a resolved policy property with two values — `pr-first` (origin is truth; all integration through GitHub PRs) and `local-merge` (today's local merge into the integration branch; the permanent no-forge fallback) — stated once and routed on by every merge site. Resolution: an explicit `.claude-tweaks/policy.yml` value wins; otherwise `pr-first` when `_shared/forge-detection.md`'s ladder passes (reachable GitHub remote + working transport, `gh` or the MCP path), else `local-merge`. This is the fork the whole pr-first family (see parent record) hangs off; it ships first so later sub-issues can cite one canonical resolution instead of each encoding its own backend assumption.

**Complexity:** Medium
**Estimated tasks:** 5

## Non-Goals

- No merge-site behavior changes — this sub-issue only creates the lever and its documentation; conversion is the merge-path sub-issue's job.
- No new forge-detection logic — reuse `_shared/forge-detection.md` as-is.
- No deprecation of local-merge — it is permanent for no-forge projects, not a compatibility shim.

## Prerequisites

None.

## Current State

- `skills/_shared/forge-detection.md` — the three-check detection ladder (remote, install, auth) consumed by `_shared/github-pr-scan.md` and others.
- `bin/resolve-policy.js` — the policy resolver; keys and defaults defined in `skills/_shared/policy-schema.md`.
- `skills/_shared/integration-branch.md` — precedent for a `_shared` file defining one resolved value with a per-consumer table.
- `tests/` — `node --test`; `tests/hooks-gate-coverage.test.js` is the precedent for pinning prose claims to exported code constants.
- `skills/init/SKILL.md` + `skills/init/bootstrap/step-06-worktree-configuration.md` — init's existing configuration-offer pattern (worktree.baseRef offer), the shape the init offer here should follow.

## Deliverables

- [ ] `skills/_shared/integration-model.md` — canonical definition: the two values, the resolution ladder (explicit policy value > forge detection), what each model commits consumers to, and a consumer table (populated as later sub-issues land; seeded with the planned consumers).
- [ ] `integration-model` key in `bin/resolve-policy.js` with schema entry in `skills/_shared/policy-schema.md` — default is the detection-derived value, not a hardcoded literal; document that `--values integration-model` may therefore differ between environments for the same repo. Detection replicates `forge-detection.md`'s three checks in code — remote present, `gh` installed, `gh repo view --json owner,name` succeeds (the ladder's actual check 3; the bare `gh auth status` check is retired there) — each under a 5s timeout, fail-open to `local-merge`. The resolver is deliberately gh-only: a Node subprocess cannot see an agent session's MCP tools, so an MCP-only sandbox detects `local-merge` — which is exactly why the init offer below recommends the explicit policy value (explicit wins in every environment). `forge-detection.md` gets a one-line note naming the resolver as its code twin so the two can't silently drift.
- [ ] Run-scoped stability: a pipeline run resolves `integration-model` once at run start and pins the value in the run's `config.yml`; every later read inside that run uses the pin, never a fresh detection — a transient `gh` failure mid-run must not flip a run between models. Standalone (non-run) calls resolve fresh; the environment-divergence this permits is accepted and made visible by the pin landing in each run's config.
- [ ] `/claude-tweaks:init` offers the lever: one item in its policy.yml review step recommending explicit `integration-model: pr-first` for GitHub-backed projects (explicit beats re-detection per session).
- [ ] Conformance test: scans `skills/**` for the resolution tokens (`--values integration-model`; a `pr-first`/`local-merge` routing branch) and requires each hit to cite `_shared/integration-model.md` — the integration-branch test's regex-plus-allowlist shape, with the token list defined in the test itself. The consumer table in the `_shared` file lists only consumers that exist at HEAD (initially just the init offer); each later sub-issue adds itself — never pre-seed aspirational entries the test would immediately fail on.
- [ ] `docs/skill-graph.md` edges for the new `_shared` file.

## Acceptance Criteria

1. `node bin/resolve-policy.js --values integration-model` prints `pr-first` in this repo (GitHub remote, gh authenticated) with no policy.yml key set, and prints the policy.yml value verbatim when one is set. In a gh-absent environment the detected default is `local-merge` (by design — see the resolver deliverable); the explicit value overrides everywhere.
2. In a fixture directory with no git remote, resolution returns `local-merge`.
3. The conformance test fails when a file listed in `_shared/integration-model.md`'s consumer table drops its citation, and passes on current HEAD.
4. `npm test` passes.

## Technical Approach

Resolver: the key's resolution needs forge detection at resolve time — implement as a computed default in `resolve-policy.js` (explicit value short-circuits; otherwise run the same remote/gh checks forge-detection.md describes, in code). Keep the detection cheap and cache-free: one `git remote get-url origin` + one `gh auth status` equivalent, fail-open to `local-merge` on any error — a wrongly-detected `local-merge` degrades to today's behavior, never to a broken push.

### Data / API Surface

- Policy key: `integration-model: pr-first | local-merge` (optional; absent = detect).
- Resolver output: one line, `pr-first` or `local-merge`, never empty.

### Key Files

- `skills/_shared/integration-model.md` — new canonical file.
- `bin/resolve-policy.js` — key + computed default.
- `skills/_shared/policy-schema.md` — schema entry.
- `skills/init/SKILL.md` — policy review offer.
- `tests/integration-model.test.js` — resolver behavior + consumer conformance.
- `docs/skill-graph.md` — edges.

## Gotchas

- Relationships between skills are stated once, in `docs/skill-graph.md` — do not restate edges inside SKILL.md files.
- `_shared/policy-schema.md`'s `worktree.always` coverage block is pinned by `tests/hooks-gate-coverage.test.js` — adding the new key must not disturb that block.
- CLAUDE.md cardinality rule: describe the consumer list by reference to the table, never as a literal count.
- The resolver must not shell out to `gh` on every call for `local-files`-only projects with no remote — check `git remote` first (no subprocess to gh when there is no remote at all).
- This project's policy.yml has strict key validation (#354 exists because of an unrecognized key) — update the schema and validation together. Validation of an explicit value is ordinary enum validation and runs regardless of detection; detection runs only when the key is absent — state that ordering in the schema entry.

<!-- work-fingerprint: pr-first-integration-model:integration-model-resolution-pr-first-vs-local-merge-as-a-re -->
