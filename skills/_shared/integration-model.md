# Integration Model — Canonical Resolution

Which backend a project integrates through: **`pr-first`** (origin is truth — every merge happens on GitHub) or **`local-merge`** (today's model — merge into the integration branch locally, push separately). Canonical for every consumer that needs to know which model to route on, the way `_shared/integration-branch.md` is canonical for *which branch* — this file is canonical for *which mechanism*.

## Why this exists

Before this key, "does this project integrate through GitHub PRs or local merges" was answered ambiently — a skill inferred it per call site (is `gh` around? is there a remote?) rather than resolving one shared value once. Stating it once, here, is what lets the whole pr-first family (see the parent design record) cite one resolution instead of each sub-issue encoding its own backend assumption.

## The two values

- **`pr-first`** — origin is truth. A run is born public (branch pushed, draft PR opened) before work begins; every phase pushes; merge happens on GitHub (`gh pr merge --auto`, degrading to an immediate merge); a reconciler converges local state toward origin at every shared-state read point; the Review Console lives on the PR. Requires a reachable GitHub forge.
- **`local-merge`** — today's model. Work happens in a local worktree, merges locally into the integration branch, and that branch is pushed separately. The permanent no-forge fallback — not a compatibility shim scheduled for removal, since `local-files`-backed and no-remote projects have no forge to integrate through at all.

## Resolution ladder

Take the **first** source that yields a value; once one does, the rest are not consulted.

1. **An explicit `integration-model:` line in `.claude-tweaks/policy.yml`** — `pr-first` or `local-merge`, ordinary enum validation via `bin/lib/policy-schema.js`.
2. **Forge detection** — `_shared/forge-detection.md`'s ladder (reachable GitHub remote, `gh` installed, `gh repo view` succeeds) run as a computed default inside `bin/resolve-policy.js` (its code twin — see that file's `detectIntegrationModel`). Passes → `pr-first`. Fails at any check → `local-merge`, fail-open.

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/resolve-policy.js" --values integration-model
```

Detection is **gh-only** — a Node subprocess cannot see an agent session's MCP tools, so an MCP-only sandbox (no `gh` CLI, only the MCP GitHub connection) detects `local-merge` even though it could, in principle, integrate through GitHub via MCP. This is exactly why `/claude-tweaks:init`'s offer (Step 20) recommends setting the value explicitly for GitHub-backed projects: an explicit policy value resolves identically in every environment, while detection can differ between a local `gh` session and an MCP-only sandbox for the same repo.

## Run-scoped stability

A pipeline run resolves `integration-model` **once**, at run start, and pins the value into that run's `config.yml` (`leftover-default`'s sibling levers show the pattern — a run-config value takes precedence over `policy.yml` per `bin/resolve-policy.js`'s `--run` overlay). Every later read inside that run passes `--run "$PIPELINE_RUN_DIR"` and gets the pin, never a fresh detection — a transient `gh` failure mid-run (rate limit, network blip) must not flip a run between models partway through. Standalone (non-run) calls resolve fresh each time; the environment-divergence this permits (a local session says `pr-first`, an MCP-only cloud sandbox says `local-merge`, for the same repo) is accepted and made visible by the pin landing in each run's own `config.yml` rather than hidden behind a cached global value.

## What each model commits consumers to

| | `pr-first` | `local-merge` |
|---|---|---|
| Where merge happens | GitHub (`gh pr merge`) | Local checkout |
| When the branch is pushed | Every phase exit | Once, at finish |
| Where the Review Console lives | PR comment | Local prompt / ledger file |
| State convergence | Reconciler (idempotent, any time) | Sequenced cleanup |
| Requires | Reachable GitHub forge | Nothing — always available |

## Consumer table

Populated as each pr-first sub-issue lands; a consumer citing this file *and* routing on the `pr-first`/`local-merge` value belongs here. Never pre-seed an aspirational entry — `tests/integration-model.test.js`'s conformance check fails on any file that routes on the value without citing this section.

| Consumer | Uses it for |
|---|---|
| `/claude-tweaks:init` (Step 20 — `bootstrap/step-20-integration-model.md`) | Offering the explicit policy value to GitHub-backed projects at setup time |

## Anti-Patterns

| Pattern | Why It Fails |
|---------|--------------|
| Inferring `pr-first`/`local-merge` ad hoc at a call site instead of reading this key | Recreates the exact ambient-inference problem this file exists to replace |
| Re-detecting mid-run instead of reading the run's pin | A transient `gh` failure would flip an in-progress run between models partway through |
| Treating `local-merge` as deprecated or scheduled for removal | It is the permanent no-forge fallback, not a compatibility shim |
| Adding a consumer table row before the citing code actually ships | The conformance test seeds from files that exist at HEAD; an aspirational row fails it immediately |
