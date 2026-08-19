# For agentic workers

Executed directly within `/claude-tweaks:build #916` (subagent strategy, single-task scope) — not handed to `/superpowers:subagent-driven-development`'s multi-task dispatch, since this plan is one cohesive extraction with no independently-parallelizable sub-tasks.

# Plan: Deduplicate policy-config resolution between resolve-policy.js and blast-radius-cli.js

Record: #916

## Scope keywords

resolvePolicyConfig, repoRoot, readFileSafe, resolvePolicyKeys, resolveConfig

## Problem

`plugin/bin/lib/blast-radius-cli.js`'s `resolveConfig()` reimplements the exact resolution pathway `plugin/bin/resolve-policy.js`'s `main()` already owns: resolve repo root via `git rev-parse --show-toplevel` (fallback `process.cwd()`), read `.claude-tweaks/policy.yml`, read an optional `{runDir}/config.yml` overlay, then call `resolvePolicyKeys`. The two callers deliberately differ in how they read files (`resolve-policy.js`'s `readFileSafe` swallows every read error; `blast-radius-cli.js`'s `defaultReadFile` swallows only ENOENT and rethrows everything else as a `BlastRadiusError`), so the shared helper must keep `readFile` (and `git`) as caller-injected dependencies rather than owning file-read semantics itself.

## Task 1: Extract `resolvePolicyConfig` into `bin/lib/policy-schema.js`

Files:
- Modify: `plugin/bin/lib/policy-schema.js`

Add, near `resolveIntegrationModel`:

```js
function resolvePolicyConfig({ git, readFile, runDir = null, keys }) {
  let root;
  try {
    root = git(['rev-parse', '--show-toplevel']).trim();
  } catch {
    root = process.cwd();
  }
  const policyRaw = readFile(path.join(root, '.claude-tweaks', 'policy.yml'));
  const runConfigRaw = runDir ? readFile(path.join(runDir, 'config.yml')) : null;
  const result = resolvePolicyKeys(keys, { policyRaw, runConfigRaw });
  return { root, policyRaw, runConfigRaw, result };
}
```

Export it from `module.exports`.

## Task 2: Wire `bin/resolve-policy.js`'s `main()` through the shared helper

Files:
- Modify: `plugin/bin/resolve-policy.js`

Replace the local `repoRoot()` function and the `root`/`policyRaw`/`runConfigRaw`/`result` block in `main()` with one `resolvePolicyConfig({ git, readFile: readFileSafe, runDir, keys })` call, where `git` is a thin wrapper around the existing `execFileSync('git', args, { stdio: ['ignore','pipe','ignore'], encoding: 'utf8' })` call (same stdio as the removed `repoRoot()`, so the CLI's own stdout/stderr/exit-code contract is unchanged). Keep `readFileSafe` local (its swallow-all behavior is intentionally its own, not shared). Import `resolvePolicyConfig` alongside the existing `resolvePolicyKeys`/`detectIntegrationModel`/`POLICY_KEYS` import.

## Task 3: Wire `blast-radius-cli.js`'s `resolveConfig()` through the shared helper

Files:
- Modify: `plugin/bin/lib/blast-radius-cli.js`

Replace `resolveConfig`'s inline root-resolution + file-read + `resolvePolicyKeys` call with one `resolvePolicyConfig({ git, readFile, runDir, keys: [...] })` call, keeping the existing try/catch around it so any thrown read error still surfaces as `BlastRadiusError` (preserving the fail-loud-on-non-ENOENT contract `defaultReadFile` already has). Keep the post-processing (`mergeSensitivePaths`/`autoMergeMaxLines`/`autoMergeMaxFiles` extraction) unchanged. Swap the `resolvePolicyKeys` import for `resolvePolicyConfig`.

## Acceptance Criteria

- [ ] `tests/resolve-policy-lib.test.js`, `tests/resolve-policy-cli.test.js`, `tests/bin-lib/blast-radius-cli.test.js`, `tests/blast-radius-cli-e2e.test.js` all pass unchanged.
- [ ] `git grep` for the root-resolution + policy.yml/config.yml read pattern shows exactly one orchestration implementation (`resolvePolicyConfig`), not two.
- [ ] No behavior change at either CLI's stdout/stderr/exit-code boundary.
